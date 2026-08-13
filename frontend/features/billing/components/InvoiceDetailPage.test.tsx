// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
        sendInvoice={vi.fn()}
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

  it("offers an Apply button instead of applying an eligible offer itself", () => {
    const applyOffer = vi.fn();
    render(
      <InvoiceDetailPage
        detail={{
          invoice: {
            id: "invoice-offer",
            invoice_number: "MHB-INV-OFFER",
            status: "issued",
            consultation_id: "consultation-1",
            subtotal_amount: 600,
            taxable_amount: 600,
            tax_amount: 0,
            total_amount: 600,
            paid_amount: 0,
            balance_amount: 600,
            discount_amount: 0,
          },
          items: [],
          payments: [],
          credit_notes: [],
          ledger_entries: [],
          adjustment_requests: [],
          offer_benefit: {
            is_applied: false,
            can_apply: true,
            eligible_count: 2,
            offer_id: "offer-1",
            offer_name: "Diwali Offer",
            discount_amount: 120,
          },
        }}
        patient={{}}
        invoicePaymentOptions={[{ value: "cash", label: "Cash" }]}
        defaultPaymentMethod="cash"
        collectPayment={vi.fn()}
        collectSplitPayment={vi.fn()}
        sendInvoice={vi.fn()}
        applyMembershipBenefit={vi.fn()}
        applyOffer={applyOffer}
        removeOffer={vi.fn()}
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

    // The offer is only a suggestion until staff act on it: the invoice still
    // bills the full ₹600 and the summary shows no offer deduction.
    expect(screen.getByText("Offer & Discount")).toBeTruthy();
    expect(
      screen.getByText(
        /Diwali Offer available · saves ₹120 \(best of 2 eligible offers\)/,
      ),
    ).toBeTruthy();

    const apply = screen.getByRole("button", { name: /Apply ₹120/ });
    fireEvent.click(apply);
    expect(applyOffer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "invoice-offer" }),
      "offer-1",
    );
  });

  it("lets staff remove an applied offer before payment", () => {
    const removeOffer = vi.fn();
    render(
      <InvoiceDetailPage
        detail={{
          invoice: {
            id: "invoice-applied-offer",
            invoice_number: "MHB-INV-APPLIED",
            status: "issued",
            consultation_id: "consultation-2",
            subtotal_amount: 600,
            taxable_amount: 480,
            tax_amount: 0,
            total_amount: 480,
            paid_amount: 0,
            balance_amount: 480,
            discount_amount: 120,
            discount_offer_id: "offer-1",
            offer_discount_amount: 120,
            offer_discount_name: "Diwali Offer",
          },
          items: [],
          payments: [],
          credit_notes: [],
          ledger_entries: [],
          adjustment_requests: [],
          offer_benefit: {
            is_applied: true,
            can_apply: false,
            can_remove: true,
            offer_id: "offer-1",
            offer_name: "Diwali Offer",
            discount_amount: 120,
          },
        }}
        patient={{}}
        invoicePaymentOptions={[{ value: "cash", label: "Cash" }]}
        defaultPaymentMethod="cash"
        collectPayment={vi.fn()}
        collectSplitPayment={vi.fn()}
        sendInvoice={vi.fn()}
        applyMembershipBenefit={vi.fn()}
        applyOffer={vi.fn()}
        removeOffer={removeOffer}
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

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(removeOffer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "invoice-applied-offer" }),
    );
  });

  it("shows the actual payable amount as the last billing item column", () => {
    render(
      <InvoiceDetailPage
        detail={{
          invoice: {
            id: "invoice-payable",
            invoice_number: "MHB-INV-PAYABLE",
            status: "issued",
            lab_order_id: "lab-order-payable",
            subtotal_amount: 200,
            taxable_amount: 190,
            tax_amount: 0,
            total_amount: 190,
            paid_amount: 0,
            balance_amount: 190,
            discount_amount: 10,
            membership_discount_amount: 10,
          },
          items: [
            {
              id: "item-1",
              item_type: "lab",
              description: "12-Lead ECG",
              quantity: 1,
              mrp_amount: 350,
              selling_amount: 200,
              unit_amount: 200,
              total_amount: 200,
              discount_amount: 10,
            },
          ],
          payments: [],
          credit_notes: [],
          ledger_entries: [],
          adjustment_requests: [],
        }}
        patient={{}}
        invoicePaymentOptions={[{ value: "cash", label: "Cash" }]}
        defaultPaymentMethod="cash"
        collectPayment={vi.fn()}
        collectSplitPayment={vi.fn()}
        sendInvoice={vi.fn()}
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

    expect(screen.getByText("Payable (INR)")).toBeTruthy();
    expect(screen.getByText("Rate (INR)")).toBeTruthy();
    expect(screen.queryByText("Amount (INR)")).toBeNull();
    const itemsTable = screen.getByText("Rate (INR)").closest("table");
    expect(
      within(itemsTable as HTMLElement).getAllByRole("columnheader").at(-1)
        ?.textContent,
    ).toBe("Payable (INR)");
    expect(screen.getAllByText("₹200").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹190").length).toBeGreaterThan(0);
  });

  it("uses quantity-adjusted line totals as payable amount when no bill discount applies", () => {
    render(
      <InvoiceDetailPage
        detail={{
          invoice: {
            id: "invoice-quantity",
            invoice_number: "MHB-INV-QTY",
            status: "issued",
            lab_order_id: "lab-order-quantity",
            subtotal_amount: 700,
            taxable_amount: 700,
            tax_amount: 0,
            total_amount: 700,
            paid_amount: 0,
            balance_amount: 700,
            discount_amount: 0,
          },
          items: [
            {
              id: "item-qty",
              item_type: "lab",
              description: "Beta HCG",
              quantity: 2,
              mrp_amount: 770,
              selling_amount: 350,
              unit_amount: 350,
              total_amount: 700,
              discount_amount: 0,
            },
          ],
          payments: [],
          credit_notes: [],
          ledger_entries: [],
          adjustment_requests: [],
        }}
        patient={{}}
        invoicePaymentOptions={[{ value: "cash", label: "Cash" }]}
        defaultPaymentMethod="cash"
        collectPayment={vi.fn()}
        collectSplitPayment={vi.fn()}
        sendInvoice={vi.fn()}
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

    expect(screen.getByText("Payable (INR)")).toBeTruthy();
    expect(screen.getByText("Rate (INR)")).toBeTruthy();
    expect(screen.queryByText("Amount (INR)")).toBeNull();
    expect(screen.getAllByText("₹350").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹700").length).toBeGreaterThan(0);
  });

  it("shows dashes for zero optional MRP and discount values", () => {
    render(
      <InvoiceDetailPage
        detail={{
          invoice: {
            id: "invoice-no-discount",
            invoice_number: "MHB-INV-NO-DISCOUNT",
            status: "paid",
            subtotal_amount: 650,
            taxable_amount: 650,
            tax_amount: 0,
            total_amount: 650,
            paid_amount: 650,
            balance_amount: 0,
            discount_amount: 0,
          },
          items: [
            {
              id: "item-no-discount",
              item_type: "consultation",
              description: "General Medicine Consultation",
              quantity: 1,
              mrp_amount: 0,
              selling_amount: 650,
              unit_amount: 650,
              total_amount: 650,
              discount_amount: 0,
            },
          ],
          payments: [],
          credit_notes: [],
          ledger_entries: [],
          adjustment_requests: [],
        }}
        patient={{}}
        invoicePaymentOptions={[{ value: "cash", label: "Cash" }]}
        defaultPaymentMethod="cash"
        collectPayment={vi.fn()}
        collectSplitPayment={vi.fn()}
        sendInvoice={vi.fn()}
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

    expect(screen.queryByText("0%")).toBeNull();
    expect(screen.queryByText("-₹0")).toBeNull();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(5);
  });
});

function renderAdjustmentRequest(
  userPermissions: string[],
  currentUser: any,
  requestType = "full_refund",
  invoiceDelivery: any = undefined,
) {
  render(
    <InvoiceDetailPage
      detail={{
        invoice: {
          id: "invoice-adjustment",
          invoice_number: "MHB-INV-ADJUSTMENT",
          status: "paid",
          subtotal_amount: 1000,
          taxable_amount: 1000,
          tax_amount: 0,
          total_amount: 1000,
          paid_amount: 1000,
          balance_amount: 0,
          discount_amount: 0,
        },
        items: [],
        payments: [],
        credit_notes: [],
        ledger_entries: [],
        adjustment_requests: [
          {
            id: "adjustment-1",
            request_type: requestType,
            amount: 250,
            reason: "Patient request",
            status: "pending",
            requested_by_user_name: "QA Receptionist",
            created_at: "2026-07-22T10:00:00Z",
          },
        ],
        invoice_delivery: invoiceDelivery,
      }}
      patient={{}}
      invoicePaymentOptions={[{ value: "cash", label: "Cash" }]}
      defaultPaymentMethod="cash"
      collectPayment={vi.fn()}
      collectSplitPayment={vi.fn()}
      sendInvoice={vi.fn()}
      applyMembershipBenefit={vi.fn()}
      openReceipt={vi.fn()}
      issueCreditNote={vi.fn()}
      cancelInvoice={vi.fn()}
      amendInvoice={vi.fn()}
      requestAdjustment={vi.fn()}
      approveAdjustment={vi.fn()}
      rejectAdjustment={vi.fn()}
      executeAdjustment={vi.fn()}
      currentUser={currentUser}
      userPermissions={userPermissions}
    />,
  );
}

describe("adjustment approval permissions", () => {
  afterEach(cleanup);

  it("keeps approval actions hidden from a receptionist with request and broad billing access", () => {
    renderAdjustmentRequest(
      ["billing.manage", "billing.refunds.request"],
      { user_type: "receptionist", roles: ["receptionist"] },
    );

    expect(screen.getByText("Request Full Refund")).toBeTruthy();
    expect(screen.getByText("Send Invoice")).toBeTruthy();
    expect(screen.queryByText("Refresh")).toBeNull();
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Reject")).toBeNull();
  });

  it("shows refund decisions only with refund management permission", () => {
    renderAdjustmentRequest(
      ["billing.refunds.manage"],
      { user_type: "billing", roles: ["billing"] },
    );

    expect(screen.getByText("Approve")).toBeTruthy();
    expect(screen.getByText("Reject")).toBeTruthy();
  });

  it("does not let a discount approver decide a refund request", () => {
    renderAdjustmentRequest(
      ["billing.discounts.approve"],
      { user_type: "billing", roles: ["billing"] },
    );

    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Reject")).toBeNull();
  });

  it("shows the complete failed invoice delivery reason and retry action", () => {
    renderAdjustmentRequest(
      ["billing.manage"],
      { user_type: "billing", roles: ["billing"] },
      "full_refund",
      {
        status: "failed",
        failure_reason:
          "The printed invoice PDF could not be fetched by the messaging service.",
        attempt_count: 3,
        max_attempts: 5,
      },
    );

    expect(screen.getByText("Failed")).toBeTruthy();
    expect(
      screen.getByText(
        "The printed invoice PDF could not be fetched by the messaging service.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Attempt 3 of 5")).toBeTruthy();
    expect(screen.getByText("Retry Send Invoice")).toBeTruthy();
  });
});
