import { test, expect, openModule } from "../support/fixtures";
import { authFile } from "../support/paths";

test.describe("debug schedule row click", () => {
  test.use({ storageState: authFile("tenant-admin") });

  test("@extended click a schedule row opens edit form", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(String(err)));

    await page.goto("/");
    await openModule(page, "Scheduling");
    await expect(page.getByText("Doctor Scheduling & Availability").first()).toBeVisible();

    const row = page.getByRole("row").nth(1);
    await expect(row).toBeVisible();
    await row.click();

    await page.waitForTimeout(1000);
    console.log("URL after click:", page.url());
    console.log("Console/page errors:", JSON.stringify(errors, null, 2));
    await expect(page.getByText("Edit Doctor Schedule")).toBeVisible({ timeout: 5000 });
  });
});
