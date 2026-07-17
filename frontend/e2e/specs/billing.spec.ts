import { test, expect, openModule } from "../support/fixtures";
import { authFile } from "../support/paths";
import { expectApi } from "../support/api";

test.describe("billing workflow", () => {
  test.use({
    storageState: authFile("tenant-admin"),
    permissions: ["clipboard-read", "clipboard-write"],
  });

  test("@critical collect partial and final payment and retain administrator copy control", async ({
    page,
    seed,
    adminApi,
    adminHeaders,
  }) => {
    await page.goto("/");
    await openModule(page, "Invoices");
    await page.getByPlaceholder("Invoice, patient, source").fill(seed.invoiceNumber);
    await page.getByText(seed.invoiceNumber, { exact: true }).click();
    await expect(page.getByText("Payment Summary")).toBeVisible();
    await expect(page.getByLabel("Copy Invoice ID")).toBeVisible();

    const amount = page.getByPlaceholder("Amount").first();
    await amount.fill("400");
    await page.getByRole("button", { name: /Pay ₹400/ }).click();
    await expect(page.getByText(/Payment recorded/i)).toBeVisible();
    await expect(page.getByText(/Partially Paid/i).first()).toBeVisible();

    await page.getByPlaceholder("Amount").first().fill("600");
    await page.getByRole("button", { name: /Pay ₹600/ }).click();
    await expect(page.getByText(/Payment recorded/i)).toBeVisible();
    await expect(page.getByText("Payment settled")).toBeVisible();

    const invoice = await expectApi<any>(
      await adminApi.get(`/billing/invoices/${seed.invoiceId}`, {
        headers: adminHeaders,
      }),
      200,
    );
    expect(invoice.invoice.status).toBe("paid");
    expect(invoice.invoice.balance_amount).toBe(0);
    expect(invoice.payments).toHaveLength(2);
  });
});
