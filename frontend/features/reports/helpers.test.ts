import { describe, expect, it, vi } from "vitest";

import {
  aggregateInvoiceMetrics,
  currentRange,
  dashboardPeriodRanges,
  isPaidInvoice,
  labReportItemKind,
  percent,
  toInputDate,
} from "./helpers";

describe("report cost accounting", () => {
  it("formats report boundaries from the local calendar date", () => {
    expect(toInputDate(new Date(2026, 6, 1, 0, 15))).toBe("2026-07-01");
  });

  it("builds calendar quarter, half-year, and year ranges", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 27, 12));

    expect(currentRange("quarterly")).toEqual(["2026-07-01", "2026-09-30"]);
    expect(currentRange("half_yearly")).toEqual(["2026-07-01", "2026-12-31"]);
    expect(currentRange("yearly")).toEqual(["2026-01-01", "2026-12-31"]);

    vi.useRealTimers();
  });

  it("builds dashboard month and week ranges with prior comparisons", () => {
    const today = new Date(2026, 8, 3, 12);

    expect(dashboardPeriodRanges("current_month", today)).toEqual({
      range: ["2026-09-01", "2026-09-30"],
      comparison: ["2026-08-01", "2026-08-31"],
    });
    expect(dashboardPeriodRanges("last_month", today)).toEqual({
      range: ["2026-08-01", "2026-08-31"],
      comparison: ["2026-07-01", "2026-07-31"],
    });
    expect(dashboardPeriodRanges("current_week", today)).toEqual({
      range: ["2026-08-31", "2026-09-06"],
      comparison: ["2026-08-24", "2026-08-30"],
    });
    expect(dashboardPeriodRanges("last_week", today)).toEqual({
      range: ["2026-08-24", "2026-08-30"],
      comparison: ["2026-08-17", "2026-08-23"],
    });
  });

  it("classifies Lab Tests and Services with the Item List taxonomy", () => {
    expect(labReportItemKind({ test_id: "test-1", item_type: "lab_test" })).toBe(
      "lab",
    );
    expect(
      labReportItemKind({ package_id: "package-1", item_type: "lab" }),
    ).toBe("service");
    expect(labReportItemKind({ item_type: "lab_service" })).toBe("service");
  });

  it("keeps partially refunded invoices while clearing their false due balance", () => {
    const invoice = {
      status: "partially_refunded",
      total_amount: 1000,
      paid_amount: 800,
      balance_amount: 200,
    };

    expect(isPaidInvoice(invoice)).toBe(true);
    expect(aggregateInvoiceMetrics([invoice]).balance).toBe(0);
  });

  it("keeps consultation doctor fee separate from other settlements", () => {
    const settlementFor = vi.fn((invoice: any) =>
      invoice.lab_order_id ? 200 : 100,
    );
    const totals = aggregateInvoiceMetrics(
      [
        {
          appointment_id: "appointment-1",
          total_amount: 1000,
          paid_amount: 1000,
          doctor_share_amount: 600,
        },
        {
          lab_order_id: "lab-1",
          total_amount: 500,
          paid_amount: 500,
        },
        {
          home_care_booking_id: "home-1",
          total_amount: 400,
          paid_amount: 400,
          doctor_share_amount: 100,
        },
      ],
      new Set(),
      new Set(),
      settlementFor,
    );

    expect(totals.doctorFee).toBe(600);
    expect(totals.settlement).toBe(300);
    expect(settlementFor).toHaveBeenCalledTimes(2);
    expect(
      totals.paidRevenue -
        totals.paidTax -
        totals.doctorFee -
        totals.settlement,
    ).toBe(1000);
  });

  it("keeps doctor cost on a fully covered membership consultation", () => {
    const totals = aggregateInvoiceMetrics([
      {
        appointment_id: "appointment-free",
        subtotal_amount: 1000,
        total_amount: 0,
        paid_amount: 0,
        balance_amount: 0,
        discount_amount: 1000,
        membership_discount_amount: 1000,
        doctor_share_amount: 600,
      },
    ]);

    expect(totals.grossRevenue).toBe(1000);
    expect(totals.paidRevenue).toBe(0);
    expect(totals.membershipDiscount).toBe(1000);
    expect(totals.doctorFee).toBe(600);
    expect(
      totals.paidRevenue -
        totals.paidTax -
        totals.doctorFee -
        totals.settlement,
    ).toBe(-600);
    expect(percent(-600, 0, totals.grossRevenue)).toBe("-60%");
  });

  it("uses delivered value for a free lab loss percentage", () => {
    const totals = aggregateInvoiceMetrics(
      [
        {
          lab_order_id: "lab-free",
          subtotal_amount: 500,
          total_amount: 0,
          paid_amount: 0,
          balance_amount: 0,
          discount_amount: 500,
          membership_discount_amount: 500,
        },
      ],
      new Set(),
      new Set(),
      () => 200,
    );

    expect(totals.settlement).toBe(200);
    expect(percent(-200, 0, totals.grossRevenue)).toBe("-40%");
  });

  it("aggregates approved and offer discounts without MRP markdown", () => {
    const totals = aggregateInvoiceMetrics([
      {
        total_amount: 400,
        paid_amount: 400,
        approved_discount_amount: 100,
        offer_discount_amount: 0,
        membership_discount_amount: 0,
        mrp_amount: 600,
        selling_amount: 500,
      },
      {
        total_amount: 450,
        paid_amount: 450,
        approved_discount_amount: 0,
        offer_discount_amount: 25,
        membership_discount_amount: 25,
      },
    ]);

    expect(totals.approvedDiscount).toBe(100);
    expect(totals.offerDiscount).toBe(25);
    expect(totals.membershipDiscount).toBe(25);
    expect(totals.billingDiscount).toBe(150);
  });

  it("splits profit deductions into dashboard card totals", () => {
    const totals = aggregateInvoiceMetrics(
      [
        {
          appointment_id: "appointment-1",
          total_amount: 1000,
          paid_amount: 1000,
          doctor_share_amount: 200,
          approved_discount_amount: 50,
          membership_discount_amount: 250,
          membership_free_items_amount: 150,
        },
        {
          lab_order_id: "lab-1",
          total_amount: 500,
          paid_amount: 500,
        },
        {
          home_care_booking_id: "home-1",
          total_amount: 300,
          paid_amount: 300,
        },
      ],
      new Set(),
      new Set(),
      (invoice: any) => (invoice.lab_order_id ? 125 : 75),
    );

    expect(totals.supplierSettlement).toBe(125);
    expect(totals.homeCareStaffSettlement).toBe(75);
    expect(totals.membershipStandardDiscount).toBe(100);
    expect(totals.membershipFreeItems).toBe(150);
    expect(totals.approvedDiscount).toBe(50);
  });
});
