import {
  test,
  expect,
  visibleNavButton,
} from "../support/fixtures";
import { authFile } from "../support/paths";
import { apiBaseUrl } from "../support/api";

test.describe("tenant administrator navigation and profile", () => {
  test.use({
    storageState: authFile("tenant-admin"),
    permissions: ["clipboard-read", "clipboard-write"],
  });

  test("@critical modules follow permissions and Error Logs stays search-only", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(visibleNavButton(page, "EMR / Patient Management")).toBeVisible();
    await expect(visibleNavButton(page, "Invoices")).toBeVisible();
    await expect(
      page.locator("aside").getByRole("button", { name: "Error Logs" }),
    ).toHaveCount(0);

    await page.getByPlaceholder("Search a modules").fill("Error Logs");
    await expect(
      page.getByRole("button", { name: "Error Logs", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Error Logs", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Error Logs" })).toBeVisible();
  });

  test("@critical user and tenant IDs copy without rendering raw IDs", async ({
    page,
    seed,
  }) => {
    await page.goto("/");
    await page.getByTitle("Profile").click();
    await expect(page.getByLabel("Copy User ID")).toBeVisible();
    await expect(page.getByLabel("Copy Tenant ID")).toBeVisible();
    await expect(page.getByText(seed.actors["tenant-admin"].userId)).toHaveCount(0);
    await expect(page.getByText(seed.tenantId)).toHaveCount(0);

    await page.getByLabel("Copy User ID").click();
    await expect(page.getByLabel("User ID copied")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(seed.actors["tenant-admin"].userId);
  });

  test("@critical tenant administration sections are available to tenant admin", async ({
    page,
  }) => {
    await page.goto("/");
    for (const section of ["Users", "Roles", "Medical Departments"]) {
      await page.getByPlaceholder("Search a modules").fill(section);
      await expect(
        page
          .getByRole("button", { name: section, exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
    }
  });
});

test.describe("restricted navigation", () => {
  test.use({ storageState: authFile("reader") });

  test("@critical read-only role sees only assigned modules and no mutation controls", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(visibleNavButton(page, "EMR / Patient Management")).toBeVisible();
    await expect(
      page.locator("nav").getByRole("button", { name: "Invoices" }),
    ).toHaveCount(0);
    await expect(
      page.locator("nav").getByRole("button", { name: "Tenant Admin" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create Patient" })).toHaveCount(0);

    await page.getByPlaceholder("Search a modules").fill("Error Logs");
    await page.getByRole("button", { name: "Error Logs", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Error Logs" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark Resolved" })).toHaveCount(0);
  });

  test("@critical denied API actions return a friendly permission message", async ({
    page,
    seed,
  }) => {
    await page.goto("/");
    const denied = await page.evaluate(
      async ({ tenantId, apiUrl }) => {
        const response = await fetch(`${apiUrl}/patients`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenantId,
          },
          body: JSON.stringify({
            branch_id: "forbidden",
            full_name: "Forbidden browser mutation",
            mobile: "9000000000",
          }),
        });
        return { status: response.status, body: await response.json() };
      },
      { tenantId: seed.tenantId, apiUrl: apiBaseUrl },
    );
    expect(denied.status).toBe(403);
    const message = JSON.stringify(denied.body);
    expect(message).toMatch(/permission|not allowed|forbidden/i);
    expect(message).not.toMatch(/request.?id|\/patients/i);
  });
});

test.describe("doctor profile", () => {
  test.use({ storageState: authFile("doctor") });

  test("@critical doctor shows every assigned department without copy controls", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTitle("Profile").click();
    await expect(page.getByText("Medical Department", { exact: true })).toBeVisible();
    await expect(page.getByText(/General Medicine.*Internal Medicine/)).toBeVisible();
    await expect(page.getByLabel(/Copy (User|Tenant) ID/)).toHaveCount(0);
  });
});

test.describe("super administrator workspace", () => {
  test.use({
    storageState: authFile("super-admin"),
    permissions: ["clipboard-read", "clipboard-write"],
  });

  test("@critical super admin has platform search sections and copy controls", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByPlaceholder("Search a modules").fill("Tenants");
    await expect(
      page.getByRole("button", { name: "Tenants", exact: true }).last(),
    ).toBeVisible();

    await page.getByTitle("Profile").click();
    await expect(page.getByLabel("Copy User ID")).toBeVisible();
    await expect(page.getByLabel("Copy Tenant ID")).toBeVisible();
    await expect(
      page.getByText("Medical Department", { exact: true }),
    ).toHaveCount(0);
  });
});
