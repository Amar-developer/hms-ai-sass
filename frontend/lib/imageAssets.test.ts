import { describe, expect, it } from "vitest";

import { invoiceLogoCandidates } from "./imageAssets";

describe("invoice logo resolution", () => {
  const tenantLogo = {
    id: "tenant-logo",
    file_url: "/uploads/tenant.png",
    file_name: "tenant.png",
    content_type: "image/png",
    category: "logo",
    attached_to_doctype: "Tenant",
    attached_to_field: "logo_url",
    is_active: true,
  };
  const invoiceLogo = {
    ...tenantLogo,
    id: "invoice-logo",
    file_url: "/uploads/invoice.png",
    attached_to_field: "invoice.logo_url",
  };

  it("prefers the file referenced by the saved setting", () => {
    expect(invoiceLogoCandidates(tenantLogo.file_url, [invoiceLogo, tenantLogo]).map((file) => file.id))
      .toEqual(["tenant-logo", "invoice-logo"]);
  });

  it("falls back from a stale setting to invoice and tenant logos", () => {
    expect(invoiceLogoCandidates("/uploads/missing.png", [tenantLogo, invoiceLogo]).map((file) => file.id))
      .toEqual(["invoice-logo", "tenant-logo"]);
  });

  it("ignores inactive and non-image records", () => {
    expect(invoiceLogoCandidates("", [
      { ...invoiceLogo, is_active: false },
      { ...tenantLogo, id: "pdf", file_name: "logo.pdf", content_type: "application/pdf" },
    ])).toEqual([]);
  });
});
