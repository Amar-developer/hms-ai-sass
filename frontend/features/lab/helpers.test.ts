import { describe, expect, it } from "vitest";

import { activeLabInvoiceOrderIds } from "./helpers";

describe("lab invoice state", () => {
  it("locks orders only while they have an active invoice", () => {
    const orderIds = activeLabInvoiceOrderIds([
      { lab_order_id: "issued-order", status: "issued" },
      { lab_order_id: "paid-order", status: "paid" },
      { lab_order_id: "cancelled-order", status: "cancelled" },
      { lab_order_id: "refunded-order", status: "refunded" },
      { lab_order_id: null, status: "issued" },
    ]);

    expect([...orderIds]).toEqual(["issued-order", "paid-order"]);
  });
});
