import { describe, expect, it } from "vitest";

import {
  invoiceHasAppliedMembershipBenefit,
  invoiceLinkedRecord,
  invoiceMembershipLabel,
  invoiceSource,
  invoiceSourceKey,
  isMembershipPlanInvoice,
} from "./helpers";

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
