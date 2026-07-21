import { test, expect } from "../support/fixtures";
import { authFile } from "../support/paths";

test.describe("authentication", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("@critical invalid credentials show a safe backend error", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("name@clinic.com").fill("missing@example.com");
    await page.getByPlaceholder("Enter password").fill("WrongPassword123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText("Invalid login", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("@critical login, refresh, logout, and session revocation", async ({
    page,
    seed,
  }) => {
    const actor = seed.actors["tenant-admin"];
    await page.goto("/");
    await page.getByPlaceholder("name@clinic.com").fill(actor.email);
    await page.getByPlaceholder("Enter password").fill(actor.password);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByTitle("Profile")).toBeVisible();

    await page.reload();
    await expect(page.getByTitle("Profile")).toBeVisible();
    await expect(page.getByText(seed.tenantName, { exact: true })).toBeVisible();

    await page.getByTitle("Profile").click();
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});

test.describe("expired session", () => {
  test.use({ storageState: authFile("tenant-admin") });

  test("@critical a missing server cookie clears restored local state", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTitle("Profile")).toBeVisible();
    await page.context().clearCookies();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});
