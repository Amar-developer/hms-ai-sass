import { describe, expect, it } from "vitest";

import {
  allocateReportValues,
  membershipBenefitUsage,
  realizedGrossProfit,
  recognizedInvoiceTax,
  recognizedInvoiceRevenue,
  reportPaymentMode,
  reportedInvoiceTotal,
} from "./financials";

describe("membership report accounting", () => {
  it("allocates every rupee across multiple invoice lines", () => {
    const allocated = allocateReportValues([1, 1, 1], 3, 100);

    expect(allocated).toEqual([34, 33, 33]);
    expect(allocated.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it("shows a fully covered item as benefit usage, not revenue or profit", () => {
    const invoice = {
      subtotal_amount: 500,
      membership_discount_amount: 500,
      paid_amount: 0,
    };

    expect(membershipBenefitUsage(invoice)).toBe(500);
    expect(reportedInvoiceTotal(invoice)).toBe(500);
    expect(recognizedInvoiceRevenue(invoice)).toBe(0);
    expect(realizedGrossProfit(invoice, 0)).toBe(0);
  });

  it("uses only the patient-paid portion for a mixed membership invoice", () => {
    const invoice = {
      subtotal_amount: 1200,
      membership_discount_amount: 500,
      total_amount: 700,
      paid_amount: 700,
    };

    expect(membershipBenefitUsage(invoice)).toBe(500);
    expect(reportedInvoiceTotal(invoice)).toBe(1200);
    expect(recognizedInvoiceRevenue(invoice)).toBe(700);
    expect(realizedGrossProfit(invoice, 200)).toBe(500);
  });

  it("preserves a real loss instead of changing it to zero", () => {
    expect(realizedGrossProfit({ paid_amount: 1000 }, 1200)).toBe(-200);
  });

  it("does not count collected GST as clinic profit", () => {
    const invoice = { total_amount: 1180, paid_amount: 590, tax_amount: 180 };

    expect(recognizedInvoiceTax(invoice)).toBe(90);
    expect(realizedGrossProfit(invoice, 200)).toBe(300);
  });

  it("shows split payment and membership modes without refunded payments", () => {
    const invoice = {
      payment_methods: ["cash"],
      membership_discount_amount: 500,
    };
    const payments = [
      { status: "recorded", method: "upi", amount: 200, refunded_amount: 0 },
      { status: "refunded", method: "card", amount: 300, refunded_amount: 300 },
    ];

    expect(reportPaymentMode(invoice, payments, (value) => value)).toBe(
      "cash + upi + membership_benefit",
    );
  });
});
