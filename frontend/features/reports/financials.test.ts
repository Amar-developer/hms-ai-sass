import { describe, expect, it } from "vitest";

import {
  membershipBenefitUsage,
  realizedGrossProfit,
  recognizedInvoiceRevenue,
  reportPaymentMode,
  reportedInvoiceTotal,
} from "./financials";

describe("membership report accounting", () => {
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
