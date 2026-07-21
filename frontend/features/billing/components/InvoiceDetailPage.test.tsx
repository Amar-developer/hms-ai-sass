// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InvoiceDetailPage } from "./InvoiceDetailPage";

describe("invoice payment summary", () => {
  afterEach(cleanup);

  it("combines free and percentage membership savings into one summary row", () => {
    render(
      <InvoiceDetailPage
        detail={{
          invoice: {
            id: "invoice-1",
            invoice_number: "MHB-INV-00001",
            status: "issued",
            lab_order_id: "lab-order-1",
            subtotal_amount: 1700,
            taxable_amount: 1150,
            tax_amount: 35,
            total_amount: 1185,
            paid_amount: 0,
            balance_amount: 1185,
            discount_amount: 550,
            membership_discount_amount: 550,
            membership_free_items_amount: 500,
            membership_item_discount_amount: 50,
          },
          items: [],
          payments: [],
          credit_notes: [],
          ledger_entries: [],
          adjustment_requests: [],
          membership_benefit: { is_applied: true },
        }}
        patient={{}}
        methods={{}}
        setMethods={vi.fn()}
        amounts={{}}
        setAmounts={vi.fn()}
        references={{}}
        setReferences={vi.fn()}
        invoicePaymentOptions={[{ value: "cash", label: "Cash" }]}
        defaultPaymentMethod="cash"
        collectPayment={vi.fn()}
        collectSplitPayment={vi.fn()}
        refreshConsultationInvoice={vi.fn()}
        applyMembershipBenefit={vi.fn()}
        openReceipt={vi.fn()}
        issueCreditNote={vi.fn()}
        cancelInvoice={vi.fn()}
        amendInvoice={vi.fn()}
        requestAdjustment={vi.fn()}
        approveAdjustment={vi.fn()}
        rejectAdjustment={vi.fn()}
        executeAdjustment={vi.fn()}
        currentUser={{}}
        userPermissions={["invoices.read"]}
      />,
    );

    expect(screen.getAllByText("Membership benefit")).toHaveLength(1);
    expect(
      screen.getByText(
        /₹500 eligible free items \+ ₹50 eligible-item discount/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Membership free items")).toBeNull();
    expect(screen.queryByText("Membership discount")).toBeNull();
    expect(screen.queryByText("Total membership benefit")).toBeNull();
    expect(screen.queryByText("Regular chargeable items")).toBeNull();
  });
});
