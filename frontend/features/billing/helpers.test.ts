import { describe, expect, it } from "vitest";

import { invoiceHasAppliedMembershipBenefit } from "./helpers";

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
