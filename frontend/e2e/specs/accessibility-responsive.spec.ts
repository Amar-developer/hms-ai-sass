import AxeBuilder from "@axe-core/playwright";

import { test, expect, openModule } from "../support/fixtures";
import { authFile } from "../support/paths";

test.describe("accessibility smoke", () => {
  test("@extended login has no serious or critical accessibility violations", async ({
    page,
  }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact || ""),
      ),
    ).toEqual([]);
  });

  test.describe("authenticated pages", () => {
    test.use({ storageState: authFile("tenant-admin") });

    for (const [moduleLabel, landmarkText] of [
      ["Dashboard", "Tenant Operations Analysis"],
      ["EMR / Patient Management", "EMR / Patient Management"],
      ["Appointments", "Appointments"],
      ["Invoices", "Invoices & Payments"],
    ] as const) {
      test(`@extended ${moduleLabel} has no serious accessibility violations`, async ({
        page,
      }) => {
        await page.goto("/");
        await openModule(page, moduleLabel);
        await expect(page.getByText(landmarkText, { exact: false }).first()).toBeVisible();
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa"])
          .analyze();
        expect(
          results.violations.filter((violation) =>
            ["serious", "critical"].includes(violation.impact || ""),
          ),
        ).toEqual([]);
      });
    }
  });
});

test.describe("responsive application shell", () => {
  test.use({ storageState: authFile("tenant-admin") });

  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 820, height: 1180 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    test(`@extended ${viewport.name} viewport keeps global navigation usable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");
      await expect(page.getByTitle("Profile")).toBeVisible();
      await expect(page.getByPlaceholder("Search a modules")).toBeVisible();
      await page.getByPlaceholder("Search a modules").fill("Invoices");
      await page.getByRole("button", { name: "Invoices", exact: true }).last().click();
      await expect(page.getByText("Invoices & Payments")).toBeVisible();
    });
  }
});
