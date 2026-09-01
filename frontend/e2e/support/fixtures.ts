import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

import { actorApi, readSeed } from "./api";
import type { FrontendSeed } from "./types";

type Fixtures = {
  seed: FrontendSeed;
  adminApi: APIRequestContext;
  adminHeaders: Record<string, string>;
};

export const test = base.extend<Fixtures>({
  seed: async ({}, use) => {
    await use(readSeed());
  },
  adminApi: async ({}, use) => {
    const actor = await actorApi("tenant-admin");
    await use(actor.context);
    await actor.context.dispose();
  },
  adminHeaders: async ({ seed }, use) => {
    await use({ "X-Tenant-ID": seed.tenantId });
  },
});

export { expect };

export async function openModule(page: Page, label: string) {
  const sidebarButton = page
    .locator("nav")
    .getByRole("button", { name: label, exact: true })
    .filter({ visible: true })
    .first();
  if (await sidebarButton.isVisible().catch(() => false)) {
    await sidebarButton.click();
    return;
  }
  const search = page.getByPlaceholder("Search or type a command (Ctrl + G)");
  await search.fill(label);
  await page
    .getByRole("button", { name: label, exact: true })
    .filter({ visible: true })
    .and(page.locator(":not([disabled])"))
    .last()
    .click();
}

export function fieldContainer(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page
    .getByText(new RegExp(`^${escaped}\\s*\\*?$`))
    .filter({ visible: true })
    .first()
    .locator("..");
}

export async function chooseFieldOption(
  page: Page,
  label: string,
  option: string | RegExp,
) {
  await fieldContainer(page, label).getByRole("button").first().click();
  await page
    .getByRole("button", {
      name: option,
      exact: typeof option === "string",
    })
    .last()
    .click();
}

export async function selectBranch(page: Page, branchName: string) {
  const branchControl = page
    .getByText("Branch", { exact: true })
    .filter({ visible: true })
    .first()
    .locator("..")
    .getByRole("button")
    .first();
  if (!(await branchControl.isVisible().catch(() => false))) return;
  if ((await branchControl.innerText()).includes(branchName)) return;
  await branchControl.click();
  await page
    .getByRole("button", { name: branchName, exact: true })
    .filter({ visible: true })
    .last()
    .click();
  await expect(branchControl).toContainText(branchName);
}

export async function selectDepartment(page: Page, departmentName: string) {
  const departmentControl = page
    .getByText("Department", { exact: true })
    .filter({ visible: true })
    .first()
    .locator("..")
    .getByRole("button")
    .first();
  if (!(await departmentControl.isVisible().catch(() => false))) return;
  if ((await departmentControl.innerText()).includes(departmentName)) return;
  await departmentControl.click();
  await page
    .getByRole("button", { name: departmentName, exact: true })
    .filter({ visible: true })
    .last()
    .click();
  await expect(departmentControl).toContainText(departmentName);
}

export function visibleNavButton(page: Page, label: string) {
  return page
    .locator("nav")
    .getByRole("button", { name: label })
    .filter({ visible: true })
    .first();
}

export function patientListRow(page: Page, patientName: string) {
  return page
    .getByTestId("patient-row")
    .filter({ hasText: patientName })
    .filter({ visible: true })
    .first();
}
