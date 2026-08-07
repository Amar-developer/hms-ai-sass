import {
  test,
  expect,
  openModule,
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
    await openModule(page, "Token Queue");
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

    await clickTargetAction("Call");
    await expect
      .poll(async () => {
        const rows = await expectApi<any[]>(
          await adminApi.get("/queue", {
            headers: adminHeaders,
            params: { include_completed: true },
          }),
          200,
        );
        return rows.find((row) => row.id === seed.queueEntryId)?.status;
      })
      .toBe("called");

    await clickTargetAction("Skip");
    await expect
      .poll(async () => {
        const rows = await expectApi<any[]>(
          await adminApi.get("/queue", {
            headers: adminHeaders,
            params: { include_completed: true },
          }),
          200,
        );
        return rows.find((row) => row.id === seed.queueEntryId)?.status;
      })
      .toBe("patient_not_available");

    await clickTargetAction("Requeue");
    // Wait for the requeue to land before opening the row menu again, the same
    // way Call and Skip above do. Every queue action triggers a burst of
    // refetches, and each one re-renders the row — clicking straight into the
    // menu races that render and Playwright loses the item mid-click
    // ("element was detached from the DOM").
    await expect
      .poll(async () => {
        const rows = await expectApi<any[]>(
          await adminApi.get("/queue", {
            headers: adminHeaders,
            params: { include_completed: true },
          }),
          200,
        );
        return rows.find((row) => row.id === seed.queueEntryId)?.status;
      })
      .toBe("requeued");

    await clickTargetAction("Details");
    await expect(
      page.getByRole("heading", { name: "Consultation Workspace" }),
    ).toBeVisible();
    await page.getByPlaceholder("Fever | 2 days | medium").fill("Cough | 2 days | mild");
    await page
      .getByPlaceholder("Viral fever | primary | optional notes")
      .fill("Upper respiratory infection | primary");
    await page
      .getByPlaceholder("Clinical notes, advice...")
      .fill("Hydration, rest, and review advised");
    await page.getByRole("button", { name: "Complete", exact: true }).click();
    await expect(page.getByText(/Consultation Completed and locked/i)).toBeVisible();
    await expect(page.getByText("Completed consultation")).toBeVisible();

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
  });
});
