import { describe, expect, it } from "vitest";

import {
  approvedDiscountUsage,
  aggregatePaymentModeTotals,
  allocateReportValues,
  billingDiscountUsage,
  dashboardProfitSummary,
  membershipBenefitUsage,
  membershipDiscountUsage,
  membershipFreeItemUsage,
  offerDiscountUsage,
  realizedGrossProfit,
  recognizedInvoiceTax,
  recognizedInvoiceRevenue,
  reportPaymentMode,
  reportedInvoiceTotal,
} from "./financials";

describe("invoice-level discount reporting", () => {
  it("separates approved, offer, and membership discounts", () => {
    const invoice = {
      discount_amount: 175,
      approved_discount_amount: 100,
      offer_discount_amount: 25,
      membership_discount_amount: 50,
    };

    expect(approvedDiscountUsage(invoice)).toBe(100);
    expect(offerDiscountUsage(invoice)).toBe(25);
    expect(membershipBenefitUsage(invoice)).toBe(50);
    expect(membershipDiscountUsage(invoice)).toBe(50);
    expect(membershipFreeItemUsage(invoice)).toBe(0);
    expect(billingDiscountUsage(invoice)).toBe(175);
  });

  it("reports membership free items separately from other membership discounts", () => {
    const invoice = {
      membership_discount_amount: 650,
      membership_free_items_amount: 500,
    };

    expect(membershipBenefitUsage(invoice)).toBe(650);
    expect(membershipFreeItemUsage(invoice)).toBe(500);
    expect(membershipDiscountUsage(invoice)).toBe(150);
  });

  it("calculates paid-basis profit without subtracting invoice discounts twice", () => {
    expect(
      dashboardProfitSummary({
        paidRevenue: 10000,
        paidTax: 300,
        doctorFee: 1000,
        supplierSettlement: 1500,
        membershipStandardDiscount: 300,
        membershipFreeItems: 200,
        approvedDiscount: 100,
        offerDiscount: 250,
        homeCareStaffSettlement: 400,
        monthlyExpenses: 500,
      }),
    ).toMatchObject({
      paidRevenue: 10000,
      paidTax: 300,
      recognizedRevenue: 9700,
      manualDiscount: 100,
      offerDiscount: 250,
      monthlyExpenses: 500,
      revenueAdjustments: 850,
      profitDeductions: 3700,
      grossProfit: 6300,
      incomeMargin: 6300 / 97,
    });
  });

  it("does not infer MRP markdown from invoice totals", () => {
    const invoice = {
      subtotal_amount: 400,
      total_amount: 400,
      mrp_amount: 500,
      selling_amount: 400,
      discount_amount: 0,
    };

    expect(billingDiscountUsage(invoice)).toBe(0);
  });
});

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

describe("payment mode reporting", () => {
  it("groups split payments and reconciles them to paid invoice revenue", () => {
    const invoices = [
      { id: "invoice-1", paid_amount: 1000, payment_methods: ["cash", "upi"] },
      { id: "invoice-2", paid_amount: 500, payment_methods: ["bank_transfer"] },
    ];
    const details = new Map([
      [
        "invoice-1",
        {
          payments: [
            { status: "recorded", method: "cash", amount: 400 },
            { status: "recorded", method: "gpay", amount: 600 },
          ],
        },
      ],
    ]);

    expect(aggregatePaymentModeTotals(invoices, details)).toEqual({
      cash: 400,
      upi: 600,
      card: 0,
      others: 500,
    });
  });

  it("uses the net payment split after partial refunds", () => {
    const invoices = [{ id: "invoice-1", paid_amount: 800 }];
    const details = new Map([
      [
        "invoice-1",
        {
          payments: [
            {
              status: "recorded",
              method: "credit_card",
              amount: 1000,
              refunded_amount: 200,
            },
          ],
        },
      ],
    ]);

    expect(aggregatePaymentModeTotals(invoices, details)).toEqual({
      cash: 0,
      upi: 0,
      card: 800,
      others: 0,
    });
  });
});
