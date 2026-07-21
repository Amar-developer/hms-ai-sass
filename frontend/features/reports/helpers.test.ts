import { describe, expect, it, vi } from "vitest";

import { aggregateInvoiceMetrics, toInputDate } from "./helpers";

describe("report cost accounting", () => {
  it("formats report boundaries from the local calendar date", () => {
    expect(toInputDate(new Date(2026, 6, 1, 0, 15))).toBe("2026-07-01");
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
});
