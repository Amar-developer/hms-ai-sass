import {
  test,
  expect,
  openModule,
  chooseFieldOption,
  fieldContainer,
  patientListRow,
  selectBranch,
} from "../support/fixtures";
import { authFile } from "../support/paths";
import { expectApi, uniqueValue } from "../support/api";

test.describe("patient and appointment workflow", () => {
  test.use({ storageState: authFile("tenant-admin") });

  test("@critical create, search, open, and edit a patient", async ({
    page,
    seed,
    adminApi,
    adminHeaders,
  }) => {
    const patientName = uniqueValue("Browser Patient");
    const mobile = `8${String(Date.now()).slice(-9)}`;
    await page.goto("/");
    await selectBranch(page, seed.branchName);
    await openModule(page, "EMR / Patient Management");
    await page.getByRole("button", { name: "Create Patient" }).click();
    await expect(page.getByRole("heading", { name: "Create Patient" })).toBeVisible();
    await page.getByPlaceholder("Enter patient full name").fill(patientName);
    await page.getByPlaceholder("Enter patient mobile number").fill(mobile);
    await page.getByPlaceholder("Age").fill("29");
    await page.getByPlaceholder("Enter patient Address").fill("Browser E2E Address");
    await chooseFieldOption(page, "Gender", "Female");
    await page.getByRole("button", { name: "Create Patient" }).last().click();
    await expect(page.getByText(/Patient created/i)).toBeVisible();

    const patients = await expectApi<any[]>(
      await adminApi.get("/patients", {
        headers: adminHeaders,
        params: { q: patientName },
      }),
      200,
    );
    const created = patients.find((row) => row.full_name === patientName);
    expect(created).toBeTruthy();
    expect(created.branch_id).toBe(seed.branchId);

    await page.getByRole("button", { name: "Back to Patients" }).click();
    await page.getByPlaceholder("Name, mobile, area").fill(patientName);
    const patientRow = patientListRow(page, patientName);
    await expect(patientRow).toBeVisible();
    await patientRow.click();
    await expect(page.getByText(mobile, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit Patient" }).click();
    await page
      .getByPlaceholder("Enter patient Address")
      .fill("Updated Browser Address");
    await page.getByRole("button", { name: "Save Patient" }).click();
    await expect(page.getByText(/Patient updated/i)).toBeVisible();

    const detail = await expectApi<any>(
      await adminApi.get(`/patients/${created.id}`, { headers: adminHeaders }),
      200,
    );
    expect(detail.address).toBe("Updated Browser Address");
  });

  test("@critical book an appointment and persist the generated token", async ({
    page,
    seed,
    adminApi,
    adminHeaders,
  }) => {
    const before = await expectApi<any[]>(
      await adminApi.get("/appointments", { headers: adminHeaders }),
      200,
    );

    // seed.patientName already has an active OP appointment with the sole
    // seeded doctor today (booked by global-setup for the queue-workflow
    // tests), so booking through it here would hit a genuine 409 same-session
    // duplicate-booking conflict. Use a fresh patient instead.
    const patientName = uniqueValue("Appointment Browser Patient");
    await expectApi<any>(
      await adminApi.post("/patients", {
        headers: adminHeaders,
        data: {
          branch_id: seed.branchId,
          full_name: patientName,
          mobile: `8${String(Date.now()).slice(-9)}`,
          age_years: 31,
          gender: "female",
          address: "Appointment Browser E2E Address",
        },
      }),
      201,
    );

    await page.goto("/");
    await selectBranch(page, seed.branchName);
    await openModule(page, "Appointments");
    await page.getByRole("button", { name: /New Appointment/ }).click();
    await page
      .getByPlaceholder("Search patient name, mobile, or patient ID")
      .fill(patientName);
    await page
      .getByRole("button", { name: new RegExp(patientName) })
      .first()
      .click();

    const doctorButton = fieldContainer(page, "Doctor").getByRole("button").first();
    if ((await doctorButton.innerText()).includes("Select doctor")) {
      await doctorButton.click();
      await page
        .getByRole("button", { name: "Dr Frontend E2E", exact: true })
        .last()
        .click();
    }
    const departmentButton = fieldContainer(page, "Department")
      .getByRole("button")
      .first();
    if ((await departmentButton.innerText()).includes("Select department")) {
      await departmentButton.click();
      await page
        .getByRole("button", { name: "General Medicine", exact: true })
        .last()
        .click();
    }
    await page.getByRole("button", { name: "Save & Generate Token" }).click();

    // A booking failure shows a StatusToast (role="status") instead of the
    // success heading, and it auto-dismisses after a few seconds. Waiting
    // on the heading alone risks a generic "element not found" timeout
    // that hides the real server error once the toast has disappeared, so
    // race both and surface the toast's message immediately on failure.
    const successHeading = page.getByRole("heading", {
      name: "Appointment Booked",
    });
    const errorToast = page.getByRole("status").filter({ hasText: "Error:" });
    await Promise.race([
      successHeading.waitFor({ state: "visible", timeout: 15_000 }),
      errorToast.waitFor({ state: "visible", timeout: 15_000 }).then(
        async () => {
          throw new Error(
            `Appointment booking failed: ${await errorToast.innerText()}`,
          );
        },
      ),
    ]);
    await expect(successHeading).toBeVisible();
    await expect(page.getByText("Token Slip")).toBeVisible();

    await expect
      .poll(async () => {
        const appointments = await expectApi<any[]>(
          await adminApi.get("/appointments", { headers: adminHeaders }),
          200,
        );
        return appointments.length;
      })
      .toBe(before.length + 1);
  });
});
