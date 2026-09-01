import {
  test,
  expect,
  openModule,
  fieldContainer,
  selectBranch,
  selectDepartment,
} from "../support/fixtures";
import { authFile } from "../support/paths";
import { expectApi } from "../support/api";

test.describe("queue and consultation workflow", () => {
  test.use({ storageState: authFile("tenant-admin") });

  test("@critical call, mark unavailable, requeue, start, and complete consultation", async ({
    page,
    seed,
    adminApi,
    adminHeaders,
  }) => {
    const queueRows = await expectApi<any[]>(
      await adminApi.get("/queue", {
        headers: adminHeaders,
        params: { include_completed: true },
      }),
      200,
    );
    const target = queueRows.find((row) => row.id === seed.queueEntryId);
    expect(target).toBeTruthy();
    const departments = await expectApi<any[]>(
      await adminApi.get(`/tenants/${seed.tenantId}/departments`, {
        headers: adminHeaders,
      }),
      200,
    );
    const targetDepartment = departments.find(
      (row) => row.id === seed.departmentId,
    );
    expect(targetDepartment).toBeTruthy();
    await page.goto("/");
    await selectBranch(page, seed.branchName);
    await selectDepartment(page, targetDepartment.name);
    await openModule(page, "OPD Workspace");
    await page.getByRole("button", { name: "Templates", exact: true }).click();
    await page.getByRole("button", { name: "New Template", exact: true }).click();
    await fieldContainer(page, "Template Name").getByRole("textbox").fill("E2E Fever Plan");
    await page.getByPlaceholder("One complaint per line").fill("Fever | 2 days | medium");
    await page.getByPlaceholder("One diagnosis per line").fill("Viral fever | primary");
    await page.getByPlaceholder("Default clinical notes or advice").fill("Hydration and rest");
    await page.getByPlaceholder("Name", { exact: true }).fill("Template Medicine");
    await page.getByPlaceholder("Dosage", { exact: true }).fill("500mg");
    await page.getByRole("button", { name: "Add Medicine", exact: true }).click();
    await page.getByPlaceholder("Lab or service name").fill("Template Lab");
    await page.getByRole("button", { name: "Add Lab", exact: true }).click();
    await page.getByRole("button", { name: "Create Template", exact: true }).click();
    await expect(page.getByText("Template E2E Fever Plan created.")).toBeVisible();
    await openModule(page, "Token Queue");
    await page.waitForURL(/\/queue(?:\?|$)/);
    await expect(
      page.getByRole("heading", { name: "Patient Queue & Token Priority" }),
    ).toBeVisible();
    const targetRow = () =>
      page
        .getByRole("row")
        .filter({ hasText: String(target.token_number || target.token) })
        .filter({ hasText: seed.patientName })
        .first();
    const clickTargetAction = async (name: string) => {
      const row = targetRow();
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Open actions" }).click();
      await page.getByRole("menuitem", { name, exact: true }).click();
    };

    const queueStatus = async () => {
      const rows = await expectApi<any[]>(
        await adminApi.get("/queue", {
          headers: adminHeaders,
          params: { include_completed: true },
        }),
        200,
      );
      return rows.find((row) => row.id === seed.queueEntryId)?.status;
    };

    // Drive a row action until the server actually reports the new status.
    //
    // A single click is not reliable here because the queue screen disables
    // every row action while any transition is in flight (`busyId`) and does
    // not refetch when one finishes — it waits for the next poll. So a click
    // issued between "the API already moved" and "the row re-rendered" can
    // land on a disabled item, or on a row that is about to be replaced, and
    // quietly do nothing. Re-opening the menu and clicking again is safe: the
    // status is re-read first, so an action that already succeeded is never
    // repeated.
    const applyAction = async (name: string, expected: string) => {
      await expect(async () => {
        if ((await queueStatus()) === expected) return;
        await clickTargetAction(name);
        expect(await queueStatus()).toBe(expected);
      }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] });
    };

    await applyAction("Call", "called");
    await applyAction("Skip", "patient_not_available");
    await applyAction("Requeue", "requeued");

    await clickTargetAction("Details");
    await expect(
      page.getByRole("heading", { name: "Consultation Workspace" }),
    ).toBeVisible();
    await fieldContainer(page, "Clinical Template").getByRole("button").click();
    await page.getByRole("button", { name: "E2E Fever Plan", exact: true }).click();
    await page.getByRole("button", { name: "Apply Template", exact: true }).click();
    await expect(page.getByPlaceholder("Fever | 2 days | medium")).toHaveValue(
      "Fever | 2 days | medium",
    );
    const templateMedicineRow = page.getByRole("row").filter({ hasText: "Template Medicine" });
    await expect(templateMedicineRow).toBeVisible();
    await templateMedicineRow.getByRole("button", { name: "Remove" }).click();
    const templateLabRow = page.getByRole("row").filter({ hasText: "Template Lab" });
    await expect(templateLabRow).toBeVisible();
    await templateLabRow.getByRole("button", { name: "Remove" }).click();
    await page.getByPlaceholder("Fever | 2 days | medium").fill("Cough | 2 days | mild");
    await page
      .getByPlaceholder("Viral fever | primary | optional notes")
      .fill("Upper respiratory infection | primary");
    await page
      .getByPlaceholder("Clinical notes, advice...")
      .fill("Hydration, rest, and review advised");

    const medicineInput = page.getByPlaceholder("Type medicine name");
    await medicineInput.fill(seed.medicineName);
    await fieldContainer(page, "Medicine")
      .getByRole("button", { name: seed.medicineName, exact: true })
      .click();
    await fieldContainer(page, "Dosage").getByRole("textbox").fill("500mg");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      page.getByRole("row").filter({ hasText: seed.medicineName }),
    ).toBeVisible();

    const labInput = page.getByPlaceholder("Type lab test name");
    await labInput.fill(seed.labTestName);
    await fieldContainer(page, "Lab/Service")
      .getByRole("button", { name: seed.labTestName, exact: true })
      .click();
    await page.getByRole("button", { name: "Add Lab Test", exact: true }).click();
    await expect(
      page.getByRole("row").filter({ hasText: seed.labTestName }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Complete", exact: true }).click();
    await expect(page.getByText(/Consultation Completed and locked/i)).toBeVisible();
    await expect(page.getByText("Completed consultation")).toBeVisible();

    await page.getByRole("button", { name: "Generate Invoice", exact: true }).click();
    await page.waitForURL(/\/opd\/invoices(?:\?|$)/);
    await expect(
      page.getByRole("heading", { name: "Consultation Invoices" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Generate Invoice", exact: true }).click();
    await expect(page.getByText(/Invoice .* generated for/i)).toBeVisible();

    const finalQueue = await expectApi<any[]>(
      await adminApi.get("/queue", {
        headers: adminHeaders,
        params: { include_completed: true },
      }),
      200,
    );
    expect(
      ["in_consultation", "completed", "consultation_completed"].includes(
        finalQueue.find((row) => row.id === seed.queueEntryId)?.status,
      ),
    ).toBe(true);

    const consultations = await expectApi<any[]>(
      await adminApi.get("/consultations", {
        headers: adminHeaders,
        params: { appointment_id: target.appointment_id },
      }),
      200,
    );
    expect(consultations).toHaveLength(1);
    const consultationDetail = await expectApi<any>(
      await adminApi.get(`/consultations/${consultations[0].id}`, {
        headers: adminHeaders,
      }),
      200,
    );
    expect(consultationDetail.consultation.prescription_text).toContain(
      seed.medicineName,
    );
    expect(consultationDetail.consultation.lab_referral_text).toContain(
      seed.labTestName,
    );
    expect(
      consultationDetail.medicines.some(
        (row: any) => row.medicine_name === seed.medicineName,
      ),
    ).toBe(true);
    expect(
      consultationDetail.referrals.some(
        (row: any) =>
          row.referral_type === "lab" && row.item_name === seed.labTestName,
      ),
    ).toBe(true);
  });
});
