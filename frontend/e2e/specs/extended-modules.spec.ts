import { test, expect, openModule } from "../support/fixtures";
import { authFile } from "../support/paths";
import { actorApi, expectApi, uniqueValue } from "../support/api";

test.describe("extended tenant modules", () => {
  test.use({ storageState: authFile("tenant-admin") });

  const modules = [
    ["Doctors", "Doctor Management"],
    ["Scheduling", "Doctor Scheduling & Availability"],
    ["Items", "Item List"],
    ["Lab & Service", "Lab / Service Worklist"],
    ["Prescription", "Pharmacy Worklist"],
    ["Home Care  Visit Booking", "Home Care / Visit Booking"],
    ["IP Admission", "IP Management"],
    ["Physiotherapy", "Physiotherapy Cases"],
    ["Reports", "Metrics Report"],
  ] as const;

  for (const [moduleLabel, visibleText] of modules) {
    test(`@extended ${moduleLabel} renders live tenant data`, async ({
      page,
      adminApi,
      adminHeaders,
    }) => {
      await page.goto("/");
      await openModule(page, moduleLabel);
      await expect(page.getByText(visibleText, { exact: false }).first()).toBeVisible();
      const health = await expectApi<any>(
        await adminApi.get("/auth/me", { headers: adminHeaders }),
        200,
      );
      expect(health.tenant_id).toBeTruthy();
    });
  }

  test("@extended tenant admin creates a membership plan through the UI", async ({
    page,
    seed,
    adminApi,
    adminHeaders,
  }) => {
    const name = uniqueValue("Browser Membership");
    await page.goto("/");
    await openModule(page, "Tenant Admin");
    await page.getByRole("button", { name: "Patient Membership" }).click();
    await page.getByRole("button", { name: "Create Plan" }).click();
    await page.getByPlaceholder("Membership plan name").fill(name);
    await page.locator('input[name="priceAmount"]').fill("750");
    await page.locator('input[name="durationDays"]').fill("30");
    await page.locator('input[name="activationAfterDays"]').fill("1");
    await page.locator('input[name="freeConsultations"]').fill("2");
    await page.locator('input[name="minDiscountAmount"]').fill("1");
    await page.getByRole("button", { name: "Create Plan" }).last().click();
    await expect(page.getByText(/Plan created/i)).toBeVisible();

    const plans = await expectApi<any[]>(
      await adminApi.get("/patient-subscriptions/plans", {
        headers: adminHeaders,
      }),
      200,
    );
    expect(plans.some((plan) => plan.name === name && plan.tenant_id === seed.tenantId)).toBe(true);
  });

  test("@extended resolve an error without removing it from the log", async ({
    page,
    seed,
    adminApi,
    adminHeaders,
  }) => {
    await page.goto("/");
    await page.getByPlaceholder("Search or type a command (Ctrl + G)").fill("Error Logs");
    await page.getByRole("button", { name: "Error Logs", exact: true }).click();
    await page
      .getByPlaceholder("Message, event, route, request ID")
      .fill(seed.errorRoute);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("row").filter({ hasText: seed.errorRoute }).click();
    await page
      .getByPlaceholder("What was fixed, ignored, or investigated?")
      .fill("Resolved by frontend Playwright E2E");
    await page.getByRole("button", { name: "Mark Resolved" }).click();
    await expect(page.getByText("Error log resolved.")).toBeVisible();
    await page.getByRole("button", { name: "Back to Error Logs", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: seed.errorRoute })).toContainText(
      "Resolved",
    );

    const detail = await expectApi<any>(
      await adminApi.get(`/error-logs/${seed.errorLogId}`, {
        headers: adminHeaders,
      }),
      200,
    );
    expect(detail.is_resolved).toBe(true);
  });
});

test.describe("super administrator and entitlements", () => {
  test("@extended super admin can switch into the seeded tenant", async ({
    browser,
    seed,
  }) => {
    const context = await browser.newContext({
      storageState: authFile("super-admin"),
    });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByText("Super Admin", { exact: true }).first()).toBeVisible();
    const tenantSelector = page
      .locator("header > div > div")
      .first()
      .getByRole("button");
    await expect(tenantSelector).not.toHaveText("Select...");
    await tenantSelector.click();
    await page.getByRole("button", { name: seed.tenantName, exact: true }).last().click();
    await expect(page.getByText(seed.tenantName, { exact: true })).toBeVisible();
    await context.close();
  });

  test("@extended a plan upgrade makes Lab appear after refresh", async ({
    browser,
    seed,
  }) => {
    const context = await browser.newContext({
      storageState: authFile("limited-admin"),
    });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Lab & Service" })).toHaveCount(0);

    const superActor = await actorApi("super-admin");
    await expectApi(
      await superActor.context.post("/subscription-plans/tenant-subscriptions", {
        headers: { "X-Tenant-ID": seed.limitedTenantId },
        data: {
          plan_id: seed.fullPlanId,
          starts_on: new Date().toISOString().slice(0, 10),
          is_trial: false,
        },
      }),
      201,
    );
    await superActor.context.dispose();

    await page.reload();
    await expect(page.getByRole("button", { name: "Lab & Service" })).toBeVisible();
    await context.close();
  });
});
