import { describe, expect, it } from "vitest";

import {
  invoiceHasAppliedMembershipBenefit,
  invoiceLinkedRecord,
  invoiceMembershipLabel,
  invoiceSource,
  invoiceSourceKey,
  isMembershipPlanInvoice,
  invoiceItemPriceBreakdown,
  formatMoney,
  formatDiscountPercentage,
  formatPercentage,
  invoicePatientDueAmount,
} from "./helpers";

describe("billing precision formatting", () => {
  it("shows billing prices as rounded whole values", () => {
    expect(formatMoney(180, "₹")).toBe("₹180");
    expect(formatMoney(160.98, "₹")).toBe("₹161");
    expect(formatMoney(205.7, "₹")).toBe("₹206");
  });

  it("shows all billing percentages as rounded whole values", () => {
    expect(formatPercentage(10)).toBe("10");
    expect(formatPercentage(10.57)).toBe("11");
    expect(formatPercentage(31.43)).toBe("31");
  });

  it("shows discount percentages as rounded whole values", () => {
    expect(formatDiscountPercentage(10.57)).toBe("11");
    expect(formatDiscountPercentage(31.43)).toBe("31");
  });

  it("allocates legacy line discounts to paise", () => {
    expect(
      invoiceItemPriceBreakdown(
        { quantity: 1, mrp_amount: 180, total_amount: 180 },
        { subtotal_amount: 180, discount_amount: 18.54 },
      ),
    ).toMatchObject({
      allocatedInvoiceDiscount: 18.54,
      discountPercent: 10.3,
      payableAmount: 161.46,
    });
  });
});

describe("invoice item price breakdown", () => {
  it("includes the selling-price markdown from MRP", () => {
    expect(
      invoiceItemPriceBreakdown(
        {
          quantity: 1,
          mrp_amount: 500,
          selling_amount: 300,
          total_amount: 300,
          discount_amount: null,
        },
        { subtotal_amount: 1200, discount_amount: 0 },
      ),
    ).toMatchObject({
      mrpTotal: 500,
      mrpMarkdown: 200,
      allocatedInvoiceDiscount: 0,
      effectiveDiscount: 200,
      discountPercent: 40,
      payableAmount: 300,
    });
  });

  it("does not invent MRP markdown for service lines without MRP", () => {
    expect(
      invoiceItemPriceBreakdown(
        {
          quantity: 1,
          unit_amount: 500,
          selling_amount: 500,
          total_amount: 500,
          discount_amount: null,
        },
        { subtotal_amount: 500, discount_amount: 0 },
      ),
    ).toMatchObject({
      hasMrp: false,
      mrpUnit: 0,
      rateUnit: 500,
      mrpTotal: 0,
      mrpMarkdown: 0,
      discountPercent: 0,
      payableAmount: 500,
    });
  });

  it("combines MRP markdown with an allocated invoice discount", () => {
    expect(
      invoiceItemPriceBreakdown(
        {
          quantity: 2,
          mrp_amount: 500,
          total_amount: 800,
          discount_amount: 80,
        },
        { subtotal_amount: 800, discount_amount: 80 },
      ),
    ).toMatchObject({
      mrpTotal: 1000,
      mrpMarkdown: 200,
      allocatedInvoiceDiscount: 80,
      effectiveDiscount: 280,
      discountPercent: 28,
      payableAmount: 720,
    });
  });

  it("falls back to proportional allocation for legacy lines", () => {
    expect(
      invoiceItemPriceBreakdown(
        { quantity: 1, mrp_amount: 500, total_amount: 400 },
        { subtotal_amount: 800, discount_amount: 80 },
      ),
    ).toMatchObject({
      mrpMarkdown: 100,
      allocatedInvoiceDiscount: 40,
      discountPercent: 28,
      payableAmount: 360,
    });
  });
});

describe("membership discount exclusivity", () => {
  it("locks separate discounts for membership savings and free items", () => {
    expect(
      invoiceHasAppliedMembershipBenefit({ membership_discount_amount: 100 }),
    ).toBe(true);
    expect(
      invoiceHasAppliedMembershipBenefit({ membership_free_items_amount: 500 }),
    ).toBe(true);
    expect(
      invoiceHasAppliedMembershipBenefit({
        membership_item_discount_amount: 50,
      }),
    ).toBe(true);
  });

  it("does not lock invoices without an applied membership benefit", () => {
    expect(
      invoiceHasAppliedMembershipBenefit({
        membership_discount_amount: 0,
        membership_free_items_amount: 0,
      }),
    ).toBe(false);
  });
});

describe("invoice source classification", () => {
  const membershipReferences = {
    patient_subscription_enrollment_id: "enrollment-1",
    patient_subscription_plan_id: "plan-1",
  };

  it("uses Membership only for the plan purchase invoice", () => {
    const invoice = { ...membershipReferences };

    expect(isMembershipPlanInvoice(invoice)).toBe(true);
    expect(invoiceSourceKey(invoice)).toBe("membership");
    expect(invoiceSource(invoice).label).toBe("Membership");
    expect(invoiceLinkedRecord(invoice)).toBe("Membership plan purchase");
    expect(invoiceMembershipLabel(invoice)).toBe("Membership plan invoice");
  });

  it("keeps a membership-covered consultation as Consultation", () => {
    const invoice = {
      ...membershipReferences,
      appointment_id: "appointment-1",
      consultation_id: "consultation-1",
      membership_discount_amount: 600,
    };

    expect(isMembershipPlanInvoice(invoice)).toBe(false);
    expect(invoiceSourceKey(invoice)).toBe("consultation");
    expect(invoiceSource(invoice).label).toBe("Consultation");
    expect(invoiceLinkedRecord(invoice)).toBe("Consultation");
    expect(invoiceMembershipLabel(invoice)).toBe("Membership benefit applied");
  });

  it("keeps a membership-covered lab invoice as Lab & Service", () => {
    const invoice = {
      ...membershipReferences,
      appointment_id: "appointment-1",
      consultation_id: "consultation-1",
      lab_order_id: "lab-order-1",
      membership_free_items_amount: 500,
    };

    expect(isMembershipPlanInvoice(invoice)).toBe(false);
    expect(invoiceSourceKey(invoice)).toBe("lab_scan");
    expect(invoiceSource(invoice).label).toBe("Lab & Service");
    expect(invoiceLinkedRecord(invoice)).toBe("Lab & Service order");
    expect(invoiceMembershipLabel(invoice)).toBe("Membership benefit applied");
  });

  it("does not relabel a direct invoice as Membership", () => {
    expect(invoiceSource({}).label).toBe("Direct");
  });
});

describe("invoice patient due amount", () => {
  it("does not show refunded money as patient due", () => {
    expect(
      invoicePatientDueAmount({
        status: "partially_refunded",
        total_amount: 350,
        paid_amount: 15,
        balance_amount: 335,
      }),
    ).toBe(0);
    expect(
      invoicePatientDueAmount({
        status: "refunded",
        total_amount: 350,
        paid_amount: 0,
        balance_amount: 350,
      }),
    ).toBe(0);
  });

  it("keeps normal issued and partially paid balances as patient due", () => {
    expect(invoicePatientDueAmount({ status: "issued", balance_amount: 335 })).toBe(
      335,
    );
    expect(
      invoicePatientDueAmount({ status: "partially_paid", balance_amount: 20 }),
    ).toBe(20);
  });
});
