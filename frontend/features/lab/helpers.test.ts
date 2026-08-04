import { describe, expect, it } from "vitest";

import { invoicedLabOrderIds } from "./helpers";

describe("lab invoice state", () => {
  it("uses the authoritative invoice reference returned with each order", () => {
    const orderIds = invoicedLabOrderIds([
      { id: "invoiced-order", billing_invoice_id: "invoice-1" },
      { id: "available-order", billing_invoice_id: null },
      { id: "legacy-order" },
    ]);

    expect([...orderIds]).toEqual(["invoiced-order"]);
  });
});
