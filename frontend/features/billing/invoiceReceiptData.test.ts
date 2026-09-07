import { describe, expect, it } from "vitest";

import {
  invoiceReceiptLineItem,
  toInvoiceProps,
} from "./invoiceReceiptData";

describe("invoice receipt line pricing", () => {
  it("uses the same API price fields and MRP markdown as the billing view", () => {
    const line = invoiceReceiptLineItem(
      {
        description: "Dressing Minor - Home Visit",
        quantity: 1,
        mrp_amount: 500,
        selling_amount: 300,
        unit_amount: 300,
        total_amount: 300,
        discount_amount: 0,
      },
      { subtotal_amount: 1200, discount_amount: 0 },
      0,
    );

    expect(line).toEqual({
      srNo: 1,
      name: "Dressing Minor - Home Visit",
      qty: 1,
      mrp: 500,
      discPercent: 40,
      rate: 300,
    });
  });

  it("includes an allocated approved discount in receipt pricing", () => {
    const line = invoiceReceiptLineItem(
      {
        description: "Bathing",
        quantity: 2,
        mrp_amount: 250,
        selling_amount: 250,
        unit_amount: 250,
        total_amount: 500,
        discount_amount: 100,
      },
      { subtotal_amount: 500, discount_amount: 100 },
      0,
    );

    expect(line).toMatchObject({
      mrp: 250,
      discPercent: 20,
      rate: 400,
    });
  });

  it("preserves partial and split-payment totals in receipt props", () => {
    const props = toInvoiceProps(
      {
        invoice: {
          invoice_number: "MHB-INV-00057",
          status: "partially_paid",
          subtotal_amount: 1200,
          total_amount: 1200,
          paid_amount: 700,
          balance_amount: 500,
        },
        items: [],
      },
      { full_name: "Patient" },
      { name: "MedizinHub", address: "Chennai" },
      "",
      { qr_image_url: "/uploads/tenant-upi-qr.png" },
    );

    expect(props).toMatchObject({
      isPaid: false,
      total: 1200,
      paidAmount: 700,
      balanceAmount: 500,
      bank: { qrImageUrl: expect.stringContaining("/uploads/tenant-upi-qr.png") },
    });
  });

  it("does not restore a stale branding logo after resolution fails", () => {
    const props = toInvoiceProps(
      { invoice: {}, items: [] },
      null,
      {
        name: "MedizinHub",
        logo_url: "http://localhost:8080/uploads/missing-logo.png",
      },
      "",
      null,
    );

    expect(props.company.logoUrl).toBe("");
  });
});
