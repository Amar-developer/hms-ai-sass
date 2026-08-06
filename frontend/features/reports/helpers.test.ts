import { describe, expect, it, vi } from "vitest";

import {
  aggregateInvoiceMetrics,
  currentRange,
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
});
