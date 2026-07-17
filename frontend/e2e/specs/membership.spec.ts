import {
  test,
  expect,
  openModule,
  chooseFieldOption,
  patientListRow,
  selectBranch,
} from "../support/fixtures";
import { authFile } from "../support/paths";
import { expectApi } from "../support/api";

test.describe("patient membership", () => {
  test.use({ storageState: authFile("tenant-admin") });

  test("@critical enroll through patient UI and apply benefit from billing", async ({
    page,
    seed,
    adminApi,
    adminHeaders,
  }) => {
    await page.goto("/");
    await selectBranch(page, seed.branchName);
    await openModule(page, "EMR / Patient Management");
    await page.getByPlaceholder("Name, mobile, area").fill(seed.patientName);
    const patientRow = patientListRow(page, seed.patientName);
    await expect(patientRow).toBeVisible();
    await patientRow.click();
    await expect(page.getByText("Membership Plan Enrollment")).toBeVisible();
    await chooseFieldOption(
      page,
      "Plan",
      new RegExp(`Frontend Membership ${seed.runId}`),
    );
    await page.getByRole("button", { name: "Enroll & Create Invoice" }).click();
    await expect(page.getByText(/membership enrolled/i)).toBeVisible();

    const enrollments = await expectApi<any[]>(
      await adminApi.get("/patient-subscriptions/enrollments", {
        headers: adminHeaders,
        params: { patient_id: seed.patientId },
      }),
      200,
    );
    expect(enrollments[0].paid_amount).toBe(500);

    const booking = await expectApi<any>(
      await adminApi.post("/appointments", {
        headers: adminHeaders,
        data: {
          branch_id: seed.branchId,
          patient_id: seed.patientId,
          department_id: seed.departmentId,
          practitioner_id: seed.practitionerId,
          appointment_type: "emergency",
          appointment_date: new Date().toISOString().slice(0, 10),
          custom_fee_amount: 1000,
          emergency_reason: "Membership benefit browser E2E",
          reason: "Membership benefit browser E2E",
        },
      }),
      201,
    );
    const consultation = await expectApi<any>(
      await adminApi.post("/consultations", {
        headers: adminHeaders,
        data: {
          appointment_id: booking.appointment.id,
          treatment_type: "general_consultation",
          chief_complaint: "Membership E2E",
          diagnosis: "Routine review",
          clinical_notes: "Membership benefit verification",
        },
      }),
      201,
    );
    await expectApi(
      await adminApi.post(`/consultations/${consultation.id}/sign`, {
        headers: adminHeaders,
        data: {},
      }),
      200,
    );
    const invoice = await expectApi<any>(
      await adminApi.post("/billing/invoices/from-consultation", {
        headers: adminHeaders,
        data: { consultation_id: consultation.id },
      }),
      201,
    );

    await openModule(page, "Invoices");
    await page.getByRole("button", { name: "Refresh" }).click();
    await page
      .getByPlaceholder("Invoice, patient, source")
      .fill(invoice.invoice.invoice_number);
    await page.getByText(invoice.invoice.invoice_number, { exact: true }).click();
    const applyBenefit = page.getByRole("button", { name: /Apply ₹/ });
    if (await applyBenefit.isVisible().catch(() => false)) {
      await applyBenefit.click();
    }
    await expect(
      page.locator("span").filter({ hasText: /^Membership benefit applied$/ }),
    ).toBeVisible();
    await expect(page.getByText(/Balance due/i)).toBeVisible();

    const benefited = await expectApi<any>(
      await adminApi.get(`/billing/invoices/${invoice.invoice.id}`, {
        headers: adminHeaders,
      }),
      200,
    );
    expect(benefited.invoice.membership_discount_amount).toBe(1000);
    expect(benefited.invoice.balance_amount).toBe(0);
  });
});
