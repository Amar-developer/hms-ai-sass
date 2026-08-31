import { money } from "@/utils/helper";
import {
  claimedDetail,
  formatPercentage,
  invoiceDiscountParts,
  invoiceHasAppliedMembershipBenefit,
  invoicePatientDueAmount,
  invoiceLinkedRecord,
  invoiceMembershipLabel,
  invoiceSource,
  invoiceTaxAdjustedDiscount,
  isMembershipPlanInvoice,
  numberValue,
} from "../helpers";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ClipboardList,
  CreditCard,
  Landmark,
  Package,
  ReceiptText,
} from "lucide-react";
import { humanizeOptionLabel } from "@/lib/options";
import { Input, SearchableSelect } from "@/app/components/common/ui";
import { BillLine } from "./BillLine";
import { InvoiceMeta } from "./InvoiceMeta";
import { Badge, ActionButton, ActionGroup } from "@/app/components/common/ui";
import { ActivityLog } from "@/app/components/common/ActivityLog";
import {
  canCopyDatabaseIds,
  CopyIdButton,
} from "@/app/components/common/CopyIdButton";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { DataTable } from "@/app/components/common/DataTable";
import {
  getAdjustmentRequestColumns,
  getHospitalLedgerColumns,
  getInvoiceItemColumns,
  getSettlementHistoryColumns,
} from "../Column";

export function InvoiceDetailPage({
  detail,
  patient,
  onClose,
  methods,
  setMethods,
  amounts,
  setAmounts,
  references,
  setReferences,
  invoicePaymentOptions,
  defaultPaymentMethod,
  busy,
  collectPayment,
  collectSplitPayment,
  sendInvoice,
  regenerateInvoice,
  applyMembershipBenefit,
  applyOffer,
  removeOffer,
  openReceipt,
  issueCreditNote,
  cancelInvoice,
  amendInvoice,
  requestAdjustment,
  approveAdjustment,
  rejectAdjustment,
  executeAdjustment,
  userPermissions = [],
  currentUser,
  supplierOptions = {},
  updateInvoiceItemSupplier,
  apiSession,
}: any) {
  const invoice = detail.invoice || {};
  const canCopyIds = canCopyDatabaseIds(currentUser);
  const items = detail.items || [];
  const payments = detail.payments || [];
  const creditNotes = detail.credit_notes || [];
  const ledgerEntries = detail.ledger_entries || [];
  const adjustmentRequests = detail.adjustment_requests || [];
  const hasPermission = (...keys: string[]) =>
    Boolean(
      currentUser?.is_super_admin ||
      userPermissions.includes("*") ||
      keys.some((key) => userPermissions.includes(key)),
    );
  const currentUserRoles = Array.isArray(currentUser?.roles)
    ? currentUser.roles
    : [];
  const isTenantBillingAdmin =
    currentUser?.user_type === "tenant_admin" ||
    currentUser?.user_type === "super_admin" ||
    currentUserRoles.includes("tenant_admin") ||
    currentUserRoles.includes("super_admin");
  const canEditInvoices = hasPermission("billing.manage", "invoices.edit");
  const canRequestDiscountPermission =
    hasPermission("billing.discounts.request") || isTenantBillingAdmin;
  const canRequestRefundPermission =
    hasPermission("billing.refunds.request") || isTenantBillingAdmin;
  const canRequestCancelPermission =
    hasPermission("invoices.cancel_request") || isTenantBillingAdmin;
  const canRecordPayments = hasPermission("payments.manage", "payments.create");
  const source = invoiceSource(invoice);
  const isMembershipInvoice = isMembershipPlanInvoice(invoice);
  const sourceUsesVendor = Boolean(
    invoice.consultation_id ||
    invoice.appointment_id ||
    invoice.home_care_booking_id ||
    invoice.lab_order_id ||
    invoice.pharmacy_issue_id,
  );
  const showItemVendor =
    !isMembershipInvoice &&
    (sourceUsesVendor ||
      items.some(
        (item: any) =>
          Boolean(item.vendor_name) || numberValue(item.vendor_amount) > 0,
      ));
  const showSupplierPicker = canEditInvoices && Boolean(invoice.lab_order_id);
  const showItemPricing =
    showItemVendor ||
    items.some(
      (item: any) =>
        numberValue(item.mrp_amount) > 0 || numberValue(item.buying_amount) > 0,
    );
  const isConsultationInvoice = Boolean(
    (invoice.consultation_id || invoice.appointment_id) &&
    !invoice.lab_order_id &&
    !invoice.pharmacy_issue_id &&
    !invoice.home_care_booking_id,
  );
  const vendorLabel = isConsultationInvoice ? "Doctor" : "Vendor";
  const vendorPriceLabel = isConsultationInvoice
    ? "Doctor Settlement"
    : "Vendor Price";
  const linkedRecord = invoiceLinkedRecord(invoice);
  const discountParts = invoiceDiscountParts(invoice);
  const membershipLabel = invoiceMembershipLabel(invoice);
  const membershipBenefit = detail.membership_benefit;
  const membershipFreeItems = numberValue(
    membershipBenefit?.is_applied
      ? invoice.membership_free_items_amount
      : membershipBenefit?.free_items_amount,
  );
  const membershipItemDiscount = numberValue(
    membershipBenefit?.is_applied
      ? invoice.membership_item_discount_amount
      : membershipBenefit?.item_discount_amount,
  );
  const membershipEffectiveSaving = invoiceTaxAdjustedDiscount(
    invoice,
    discountParts.membershipDiscount,
  );
  const membershipTaxSaving = Math.max(
    membershipEffectiveSaving - discountParts.membershipDiscount,
    0,
  );
  const itemBenefitParts = [
    membershipFreeItems > 0
      ? `${money(membershipFreeItems)} eligible free items`
      : "",
    membershipItemDiscount > 0
      ? `${money(membershipItemDiscount)} eligible-item discount`
      : "",
  ].filter(Boolean);
  const membershipBenefitNote =
    discountParts.membershipDiscount > 0 && itemBenefitParts.length > 0
      ? `${membershipLabel} · ${itemBenefitParts.join(" + ")}`
      : discountParts.membershipDiscount > 0
        ? `${membershipLabel} · ${
            membershipTaxSaving > 0
              ? `${claimedDetail(membershipEffectiveSaving, invoice.subtotal_amount)} effective saving (${money(discountParts.membershipDiscount)} benefit + ${money(membershipTaxSaving)} tax saved)`
              : claimedDetail(
                  discountParts.membershipDiscount,
                  invoice.subtotal_amount,
                )
          }`
        : membershipBenefit?.reason || "No membership benefit applied";
  const offerBenefit = detail.offer_benefit;
  const offerBusy = busy === `offer-${invoice.id}`;
  const offerNote =
    discountParts.offerDiscount > 0
      ? claimedDetail(discountParts.offerDiscount, invoice.subtotal_amount)
      : offerBenefit?.can_apply
        ? `${offerBenefit.offer_name} available · saves ${money(
            offerBenefit.discount_amount,
          )}${
            offerBenefit.eligible_count > 1
              ? ` (best of ${offerBenefit.eligible_count} eligible offers)`
              : ""
          }`
        : offerBenefit?.reason || "No Offer & Discount Applied";
  const taxableAmount = numberValue(invoice.taxable_amount);
  const taxAmount = numberValue(invoice.tax_amount);
  const balanceDue = invoicePatientDueAmount(invoice);
  const invoiceDelivery = detail.invoice_delivery || {};
  const invoiceDeliveries = Array.isArray(detail.invoice_deliveries)
    ? detail.invoice_deliveries
    : [];
  const invoiceDocument = detail.invoice_document || {};
  const invoiceDeliveryStatus = String(
    invoiceDelivery.status || "not_sent",
  ).toLowerCase();
  const invoiceDeliveryPending = ["queued", "processing"].includes(
    invoiceDeliveryStatus,
  );
  const invoiceDeliveryLabel =
    {
      not_sent: "Not sent",
      queued: "Queued",
      processing: "Sending",
      sent: "Sent",
      failed: "Failed",
      cancelled: "Cancelled",
    }[invoiceDeliveryStatus] || humanizeOptionLabel(invoiceDeliveryStatus);
  const canSendInvoice =
    canEditInvoices &&
    String(invoice.status || "").toLowerCase() === "paid" &&
    balanceDue <= 0;
  const canEmailInvoice = canSendInvoice && Boolean(patient?.email);
  const [payRows, setPayRows] = useState<any[]>([
    { method: defaultPaymentMethod, amount: "", reference: "" },
  ]);
  const [activeWorkspaceSection, setActiveWorkspaceSection] =
    useState("invoice-items");
  useEffect(() => {
    const requestedSection =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("medizinhub.billingInvoiceSection")
        : null;
    setActiveWorkspaceSection(
      requestedSection === "invoice-payment"
        ? requestedSection
        : "invoice-items",
    );
    if (requestedSection && typeof window !== "undefined") {
      window.sessionStorage.removeItem("medizinhub.billingInvoiceSection");
    }
    setPayRows([
      {
        method: defaultPaymentMethod,
        amount: String(balanceDue || ""),
        reference: "",
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.id, invoice.balance_amount, defaultPaymentMethod]);
  const enteredTotal = payRows.reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0,
  );
  const remaining = balanceDue - enteredTotal;
  // Lab bills cannot be paid until every lab line that has supplier options has a
  // supplier chosen (items without any supplier option are left as-is).
  const labSupplierMissing = items.some(
    (item: any) =>
      item.item_type === "lab" &&
      (supplierOptions[item.id]?.length || 0) > 0 &&
      !item.supplier_id,
  );
  // Any invoice type without a membership benefit can carry a discount
  // request until payment. Membership savings are exclusive so the patient
  // cannot receive a second request-based or promotional reduction.
  const canRequestDiscountBase = Boolean(
    canRequestDiscountPermission &&
    numberValue(invoice.paid_amount) <= 0 &&
    !invoiceHasAppliedMembershipBenefit(invoice) &&
    !["cancelled", "refunded"].includes(String(invoice.status)),
  );
  const membershipLocksAdditionalDiscounts =
    invoiceHasAppliedMembershipBenefit(invoice);
  function updatePayRow(index: number, key: string, value: any) {
    setPayRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  }
  function addPayRow() {
    setPayRows((rows) => [
      ...rows,
      {
        method: defaultPaymentMethod,
        amount: remaining > 0 ? String(remaining) : "",
        reference: "",
      },
    ]);
  }
  function removePayRow(index: number) {
    setPayRows((rows) =>
      rows.length > 1 ? rows.filter((_, i) => i !== index) : rows,
    );
  }
  const canApproveDiscounts =
    isTenantBillingAdmin || hasPermission("billing.discounts.approve");
  const canManageRefunds =
    isTenantBillingAdmin ||
    hasPermission("billing.refunds.approve", "billing.refunds.manage");
  const canApproveCancellations =
    isTenantBillingAdmin ||
    hasPermission("invoices.cancel_approve", "billing.refunds.manage");
  const canReviewAnyAdjustment =
    canApproveDiscounts || canManageRefunds || canApproveCancellations;
  const canIssueCreditNote =
    isTenantBillingAdmin || hasPermission("payments.manage");
  function canDecideAdjustment(row: any) {
    if (row.request_type === "discount") return canApproveDiscounts;
    if (row.request_type === "cancel") return canApproveCancellations;
    return canManageRefunds;
  }
  const hasOpenAdjustment = adjustmentRequests.some((row: any) =>
    ["pending", "approved"].includes(String(row.status)),
  );
  const adjustmentClosed = ["cancelled", "refunded"].includes(
    String(invoice.status),
  );
  const canRequestAdjustment = !hasOpenAdjustment && !adjustmentClosed;
  const canRequestCancel =
    canRequestAdjustment &&
    canRequestCancelPermission &&
    numberValue(invoice.paid_amount) <= 0;
  const canRequestRefund =
    canRequestAdjustment &&
    canRequestRefundPermission &&
    numberValue(invoice.paid_amount) > 0;
  const canRequestDiscount = canRequestAdjustment && canRequestDiscountBase;
  const paymentClosedStatuses = ["cancelled", "refunded", "partially_refunded"];
  const isPaymentClosed = paymentClosedStatuses.includes(
    String(invoice.status || "").toLowerCase(),
  );
  const canCollectPayment =
    canRecordPayments && balanceDue > 0 && !isPaymentClosed;
  function ledgerCreditAmount(entry: any) {
    if (
      entry.entry_type === "credit_note_issued" ||
      entry.entry_type === "invoice_submitted"
    )
      return 0;
    const explicitCredit = numberValue(entry.credit_amount);
    if (explicitCredit > 0) {
      return explicitCredit;
    }
    return Math.max(numberValue(entry.paid_amount_delta), 0);
  }
  function ledgerDebitAmount(entry: any) {
    if (
      entry.entry_type === "credit_note_issued" ||
      entry.entry_type === "invoice_submitted"
    )
      return 0;
    const explicitDebit = numberValue(entry.debit_amount);
    if (explicitDebit > 0) {
      return explicitDebit;
    }
    return Math.max(-numberValue(entry.paid_amount_delta), 0);
  }
  const paymentById = new Map<string, any>(
    payments.map((payment: any) => [payment.id, payment]),
  );
  function paymentAccount(entry: any) {
    const payment = paymentById.get(entry.related_payment_id);
    const method = String(payment?.method || "").toLowerCase();
    if (method.includes("cash")) return "Cash";
    if (method.includes("upi") || method.includes("gpay") || method.includes("paytm")) {
      return "UPI / Bank";
    }
    if (method.includes("card")) return "Card Settlement";
    if (method.includes("bank")) return "Bank";
    return "Cash / Bank";
  }
  function hospitalLedgerLine(entry: any) {
    const entryType = String(entry.entry_type || "");
    const invoiceDelta = numberValue(entry.invoice_total_delta);
    const paidDelta = numberValue(entry.paid_amount_delta);
    const balanceDelta = numberValue(entry.balance_amount_delta);
    const explicitCredit = numberValue(entry.credit_amount);
    const explicitDebit = numberValue(entry.debit_amount);
    const movementAmount = Math.max(
      Math.abs(explicitCredit),
      Math.abs(explicitDebit),
      Math.abs(invoiceDelta),
      Math.abs(paidDelta),
      Math.abs(balanceDelta),
    );

    if (entryType === "invoice_submitted") {
      const amount = Math.abs(invoiceDelta || balanceDelta || explicitDebit);
      return {
        debitAccount: "Accounts Receivable",
        debitAmount: amount,
        creditAccount: "Service Revenue",
        creditAmount: amount,
      };
    }
    if (entryType === "payment_recorded") {
      const amount = Math.abs(explicitCredit || paidDelta || balanceDelta);
      return {
        debitAccount: paymentAccount(entry),
        debitAmount: amount,
        creditAccount: "Accounts Receivable",
        creditAmount: amount,
      };
    }
    if (
      entryType === "invoice_offer_applied" ||
      entryType === "discount_applied"
    ) {
      const amount = Math.abs(explicitCredit || invoiceDelta || balanceDelta);
      return {
        debitAccount: "Discount / Concession",
        debitAmount: amount,
        creditAccount: "Accounts Receivable",
        creditAmount: amount,
      };
    }
    if (entryType === "membership_benefit_applied") {
      const amount = Math.abs(explicitCredit || invoiceDelta || balanceDelta);
      return {
        debitAccount: "Membership Benefit",
        debitAmount: amount,
        creditAccount: "Accounts Receivable",
        creditAmount: amount,
      };
    }
    if (
      entryType === "invoice_offer_removed" ||
      entryType === "discount_removed"
    ) {
      const amount = Math.abs(explicitDebit || invoiceDelta || balanceDelta);
      return {
        debitAccount: "Accounts Receivable",
        debitAmount: amount,
        creditAccount: "Discount Reversal",
        creditAmount: amount,
      };
    }
    if (entryType.includes("refund")) {
      const amount = Math.abs(explicitDebit || paidDelta || balanceDelta || movementAmount);
      return {
        debitAccount: "Refund / Patient Payable",
        debitAmount: amount,
        creditAccount: paymentAccount(entry),
        creditAmount: amount,
      };
    }
    if (balanceDelta > 0 || invoiceDelta > 0 || explicitDebit > 0) {
      const amount = Math.abs(explicitDebit || invoiceDelta || balanceDelta);
      return {
        debitAccount: "Accounts Receivable",
        debitAmount: amount,
        creditAccount: "Adjustment Income",
        creditAmount: amount,
      };
    }
    if (balanceDelta < 0 || invoiceDelta < 0 || explicitCredit > 0) {
      const amount = Math.abs(explicitCredit || invoiceDelta || balanceDelta);
      return {
        debitAccount: "Adjustment / Write-off",
        debitAmount: amount,
        creditAccount: "Accounts Receivable",
        creditAmount: amount,
      };
    }
    return {
      debitAccount: "-",
      debitAmount: 0,
      creditAccount: "-",
      creditAmount: 0,
    };
  }
  const financialLedgerEntries = ledgerEntries.filter(
    (entry: any) =>
      entry.entry_type !== "credit_note_issued" &&
      (numberValue(entry.debit_amount) !== 0 ||
        numberValue(entry.credit_amount) !== 0 ||
        numberValue(entry.invoice_total_delta) !== 0 ||
        numberValue(entry.paid_amount_delta) !== 0 ||
        numberValue(entry.balance_amount_delta) !== 0),
  );
  const ledgerRunningById = new Map<string, any>();
  [...financialLedgerEntries]
    .sort(
      (a: any, b: any) =>
        new Date(a.created_at || 0).getTime() -
        new Date(b.created_at || 0).getTime(),
    )
    .reduce(
      (running: any, entry: any) => {
        const next = {
          invoiceTotal: Math.max(
            0,
            running.invoiceTotal + numberValue(entry.invoice_total_delta),
          ),
          paidAmount: Math.max(
            0,
            running.paidAmount + numberValue(entry.paid_amount_delta),
          ),
          balanceAmount: Math.max(
            0,
            running.balanceAmount + numberValue(entry.balance_amount_delta),
          ),
        };
        ledgerRunningById.set(entry.id, next);
        return next;
      },
      { invoiceTotal: 0, paidAmount: 0, balanceAmount: 0 },
    );
  const settlementRows = [
    ...payments.map((payment: any) => ({
      id: `payment-${payment.id}`,
      date: payment.collected_at,
      type: "Payment",
      method: humanizeOptionLabel(payment.method || "payment"),
      reference: payment.reference_number || "-",
      status: payment.status || "recorded",
      amount: numberValue(payment.amount),
      tone: "green" as const,
    })),
    ...ledgerEntries
      .filter((entry: any) => entry.entry_type === "membership_benefit_applied")
      .map((entry: any) => ({
        id: `membership-${entry.id}`,
        date: entry.created_at,
        type: "Membership Benefit",
        method: membershipLabel,
        reference:
          entry.reason || entry.description || "Membership benefit applied",
        status: "applied",
        amount: numberValue(entry.credit_amount),
        tone: "green" as const,
      })),
    ...creditNotes.map((credit: any) => ({
      id: `credit-${credit.id}`,
      date: credit.created_at,
      type: "Credit Note",
      method: credit.credit_note_number || "-",
      reference: credit.reason || "-",
      status: credit.status || "issued",
      amount: Math.abs(numberValue(credit.amount)),
      informational: true,
      tone: "amber" as const,
    })),
  ].sort(
    (a: any, b: any) =>
      new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime(),
  );
  const workspaceSections = [
    { id: "invoice-items", label: "Bill Items", icon: Package, count: items.length },
    { id: "invoice-payment", label: "Payment", icon: CreditCard },
    {
      id: "invoice-settlements",
      label: "Settlements",
      icon: Landmark,
      count: settlementRows.length,
    },
    {
      id: "invoice-adjustments",
      label: "Adjustments",
      icon: ReceiptText,
      count: adjustmentRequests.length,
    },
    ...(canReviewAnyAdjustment
      ? [{ id: "invoice-ledger", label: "Ledger", icon: BookOpen }]
      : []),
  ];
  function openWorkspaceSection(sectionId: string) {
    setActiveWorkspaceSection(sectionId);
  }
  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-brand">
              <ClipboardList className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-slate-950">
                  Invoice Workspace
                </h2>
                <Badge
                  tone={
                    invoice.status === "paid"
                      ? "green"
                      : invoice.status === "partially_refunded" ||
                          invoice.status === "refunded"
                        ? "blue"
                        : invoice.status === "partially_paid"
                          ? "amber"
                          : invoice.status == "cancelled"
                            ? "red"
                            : "slate"
                  }
                  className="normal-label"
                >
                  {humanizeOptionLabel(invoice.status)}
                </Badge>
                {membershipLabel && (
                  <Badge tone="green" className="normal-badge">
                  {membershipLabel}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {source.label} billing, collection, adjustments and accounting in one workspace
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <b className="font-black text-slate-900">{invoice.invoice_number}</b>
                  <CopyIdButton
                    value={invoice.id}
                    label="Invoice ID"
                    allowed={canCopyIds}
                  />
                </div>
                <span className="text-slate-500">
                  {invoice.patient_name ||
                    patient?.name ||
                    patient?.full_name ||
                    invoice.patient_number ||
                    "Patient"}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">{linkedRecord}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <div className="hidden rounded-lg bg-slate-50 px-3 py-2 text-right sm:block">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Grand total
              </p>
              <p className="text-sm font-black tabular-nums text-slate-950">
                {money(invoice.total_amount)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="close-button inline-flex h-9 flex-1 items-center justify-center gap-2 whitespace-nowrap px-3 text-xs font-bold hover:bg-slate-50 sm:flex-none"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Invoices
            </button>
          </div>
        </div>

        <nav
          className="scrollbar-hidden flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 py-1.5"
          aria-label="Invoice workspace sections"
        >
          {workspaceSections.map((section) => {
            const Icon = section.icon;
            const active = activeWorkspaceSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => openWorkspaceSection(section.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition-colors ${
                  active
                    ? "bg-brand text-brand-fg"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{section.label}</span>
                {Boolean(section.count) && (
                  <span
                    className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] ${
                      active
                        ? "bg-white/20 text-brand-fg"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {section.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </section>

        <div>
          <section
            id="invoice-items"
            className={
              activeWorkspaceSection === "invoice-items" ? "block" : "hidden"
            }
          >
              <div>
                <DataTable
                  columns={getInvoiceItemColumns({
                    invoice,
                    showItemVendor,
                    showItemPricing,
                    vendorLabel,
                    vendorPriceLabel,
                    showSupplierPicker,
                    supplierOptions,
                    busy,
                    updateInvoiceItemSupplier,
                  })}
                  data={items}
                  emptyMessage="No bill items found."
                  emptyDescription="Line items billed for this invoice will show up here."
                  emptyIcon={Package}
                  minBodyHeight={`${items.length > 0 ?'':'220px'}`}
                  className="[&>div]:border-slate-200"
                  tableClassName="border-collapse [&_thead]:border-b [&_thead]:border-slate-200 [&_th]:border-r [&_th]:border-slate-200 [&_th]:text-xs [&_th:last-child]:border-r-0 [&_td]:border-r [&_td]:border-slate-100 [&_td:last-child]:border-r-0"
                />
              </div>
              {canRequestDiscountBase ? (
                <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
                  <span className="text-xs font-bold text-slate-500">
                    Need a lower price on this bill? Use "Request Discount" in
                    Refund &amp; Cancellation Requests below — it applies once
                    approved.
                  </span>
                </div>
              ) : membershipLocksAdditionalDiscounts ? (
                <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3">
                  <span className="text-xs font-bold text-purple-800">
                    Additional discounts and promotional offers are unavailable
                    because a patient membership benefit is applied.
                  </span>
                </div>
              ) : null}
          </section>

          <section
            id="invoice-payment"
            className={`overflow-hidden rounded-lg border border-slate-200 bg-slate-50/50 ${
              activeWorkspaceSection === "invoice-payment" ? "block" : "hidden"
            }`}
          >
              <div className="border-b border-slate-200 bg-white px-4 py-3">
                <h4 className="card-title font-bold">Payment Summary</h4>
                <p className="card-desc text-slate-500">
                  Totals, collection and invoice delivery.
                </p>
              </div>
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white px-4">
                  <BillLine
                    label="Item total"
                    value={money(invoice.subtotal_amount)}
                  />
                  <BillLine
                    label={
                      invoice.offer_discount_name
                        ? `Offer: ${invoice.offer_discount_name}${
                            invoice.offer_discount_type === "percentage"
                              ? ` (${formatPercentage(invoice.offer_discount_value)}%)`
                              : ""
                          }`
                        : "Offer & Discount"
                    }
                    value={
                      discountParts.offerDiscount > 0
                        ? `-${money(discountParts.offerDiscount)}`
                        : "-"
                    }
                    muted={discountParts.offerDiscount <= 0}
                    savings={discountParts.offerDiscount > 0}
                    note={offerNote}
                    action={
                      offerBenefit?.is_applied ? (
                        offerBenefit.can_remove ? (
                          <ActionButton
                            onClick={() => removeOffer(invoice)}
                            disabled={offerBusy}
                          >
                            <ButtonLoader loading={offerBusy}>
                              {offerBusy ? "Removing..." : "Remove"}
                            </ButtonLoader>
                          </ActionButton>
                        ) : (
                          <ActionButton disabled>Applied</ActionButton>
                        )
                      ) : offerBenefit?.can_apply ? (
                        <ActionButton
                          onClick={() =>
                            applyOffer(invoice, offerBenefit.offer_id)
                          }
                          disabled={offerBusy}
                        >
                          <ButtonLoader loading={offerBusy}>
                            {offerBusy
                              ? "Applying..."
                              : `Apply ${money(offerBenefit.discount_amount)}`}
                          </ButtonLoader>
                        </ActionButton>
                      ) : null
                    }
                  />
                  <BillLine
                    label="Admin Approved Discount"
                    value={
                      discountParts.approvedDiscount > 0
                        ? `-${money(discountParts.approvedDiscount)}`
                        : "-"
                    }
                    muted={discountParts.approvedDiscount <= 0}
                    savings={discountParts.approvedDiscount > 0}
                    note={
                      discountParts.approvedDiscount > 0
                        ? claimedDetail(
                            discountParts.approvedDiscount,
                            invoice.subtotal_amount,
                            "approved",
                          )
                        : "No request-based discount approved"
                    }
                  />
                  <BillLine
                    label="Membership benefit"
                    value={
                      discountParts.membershipDiscount > 0
                        ? `-${money(discountParts.membershipDiscount)}`
                        : "-"
                    }
                    muted={discountParts.membershipDiscount <= 0}
                    savings={discountParts.membershipDiscount > 0}
                    note={membershipBenefitNote}
                    action={
                      membershipBenefit?.is_applied ? (
                        <ActionButton disabled>Applied</ActionButton>
                      ) : !membershipBenefit?.is_applied &&
                        membershipBenefit?.can_apply ? (
                        <ActionButton
                          onClick={() => applyMembershipBenefit(invoice)}
                          disabled={busy === `membership-${invoice.id}`}
                        >
                          <ButtonLoader
                            loading={busy === `membership-${invoice.id}`}
                          >
                            {busy === `membership-${invoice.id}`
                              ? "Applying..."
                              : `Apply ${money(membershipBenefit.discount_amount)}`}
                          </ButtonLoader>
                        </ActionButton>
                      ) : null
                    }
                  />
                  <BillLine label="Subtotal" value={money(taxableAmount)} />
                  <BillLine
                    label={`${invoice.tax_label || "Tax"}${
                      numberValue(invoice.tax_percentage) > 0
                        ? ` (${formatPercentage(invoice.tax_percentage)}%)`
                        : ""
                    }`}
                    value={money(taxAmount)}
                    muted={taxAmount <= 0}
                    note={
                      taxAmount > 0
                        ? claimedDetail(taxAmount, taxableAmount, "applied")
                        : "No tax applied"
                    }
                  />
                  <BillLine
                    label="Grand total"
                    value={money(invoice.total_amount)}
                    strong
                  />
                  <BillLine
                    label="Paid amount"
                    value={money(invoice.paid_amount)}
                    savings={numberValue(invoice.paid_amount) > 0}
                  />
                  <BillLine
                    label="Balance due"
                    value={money(balanceDue)}
                    strong
                    danger={balanceDue > 0}
                  />
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <InvoiceMeta
                        label="Tax rule"
                        value={invoice.tax_rule_id ? "Applied" : "Not applied"}
                      />
                      <InvoiceMeta
                        label="Offer"
                        value={
                          invoice.discount_offer_id ? "Applied" : "Not applied"
                        }
                      />
                    </div>
                  </div>
                  {canCollectPayment ? (
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            Collect Payment
                          </p>
                          <p className="text-xs text-slate-500">
                            Split across multiple modes if needed
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={addPayRow}
                          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-brand hover:text-brand"
                        >
                          + Add mode
                        </button>
                      </div>
                      <div className="mt-3 ">
                        {payRows.map((row, index) => (
                          <div
                            key={index}
                            className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"
                          >
                            <div className="grid gap-2 sm:grid-cols-2">
                              <SearchableSelect
                                value={row.method}
                                onChange={(value) =>
                                  updatePayRow(index, "method", value)
                                }
                                searchable={false}
                                options={invoicePaymentOptions}
                              />
                              <Input
                                className="text-right tabular-nums"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Amount"
                                value={row.amount}
                                onChange={(e: any) =>
                                  updatePayRow(index, "amount", e.target.value)
                                }
                              />
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <Input
                                placeholder="Reference number (optional)"
                                value={row.reference}
                                onChange={(e: any) =>
                                  updatePayRow(
                                    index,
                                    "reference",
                                    e.target.value,
                                  )
                                }
                              />
                              {payRows.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removePayRow(index)}
                                  className="shrink-0 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold">
                        <span className="text-slate-500">Entering</span>
                        <span className="tabular-nums text-slate-900">
                          {money(enteredTotal)} / {money(balanceDue)}
                        </span>
                      </div>
                      {remaining < 0 && (
                        <p className="mt-1 text-xs font-bold text-rose-600">
                          Exceeds balance by {money(Math.abs(remaining))}
                        </p>
                      )}
                      {remaining > 0 && enteredTotal > 0 && (
                        <p className="mt-1 text-xs font-bold text-amber-600">
                          {money(remaining)} will remain due (partial payment)
                        </p>
                      )}
                      {labSupplierMissing && (
                        <p className="mt-1 text-xs font-bold text-rose-600">
                          Select a supplier for every lab item before collecting
                          payment.
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={
                          busy === invoice.id ||
                          enteredTotal <= 0 ||
                          remaining < 0 ||
                          labSupplierMissing
                        }
                        onClick={() => collectSplitPayment(invoice, payRows)}
                        className="primary-action mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ButtonLoader loading={busy === invoice.id}>
                          {busy === invoice.id ? (
                            "Saving Payment..."
                          ) : (
                            <>
                              <span>
                                {payRows.filter((r) => Number(r.amount) > 0)
                                  .length > 1
                                  ? "Pay (Split)"
                                  : "Pay"}
                              </span>
                              <span className="tabular-nums">
                                {money(enteredTotal)}
                              </span>
                            </>
                          )}
                        </ButtonLoader>
                      </button>
                    </div>
                  ) : isPaymentClosed ? (
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700">
                      <span>{humanizeOptionLabel(invoice.status)} invoice</span>
                      <span>Payment locked</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-800">
                      <span>Payment settled</span>
                      <span>{money(invoice.paid_amount)}</span>
                    </div>
                  )}
                  {String(invoice.status || "").toLowerCase() === "paid" && (
                    <div
                      className={`rounded-lg border bg-white p-3 text-xs ${
                        invoiceDeliveryStatus === "sent"
                          ? "border-emerald-200 text-emerald-900"
                          : ["failed", "cancelled"].includes(
                                invoiceDeliveryStatus,
                              )
                            ? "border-red-200 text-red-900"
                            : "border-amber-200 text-amber-900"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold">
                          WhatsApp invoice
                        </span>
                        <Badge
                          tone={
                            invoiceDeliveryStatus === "sent"
                              ? "green"
                              : ["failed", "cancelled"].includes(
                                    invoiceDeliveryStatus,
                                  )
                                ? "red"
                                : "amber"
                          }
                          className="normal-badge"
                        >
                          {invoiceDeliveryLabel}
                        </Badge>
                      </div>
                      {invoiceDelivery.failure_reason && (
                        <p className="mt-2 whitespace-pre-wrap break-words font-semibold">
                          {invoiceDelivery.failure_reason}
                        </p>
                      )}
                      {Number(invoiceDelivery.attempt_count || 0) > 0 && (
                        <p className="mt-1 opacity-80">
                          Attempt {invoiceDelivery.attempt_count} of{" "}
                          {invoiceDelivery.max_attempts}
                        </p>
                      )}
                      {invoiceDeliveries.length > 0 && (
                        <div className="mt-2 border-t border-slate-100 pt-2">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Recent
                          </p>
                          {invoiceDeliveries
                            .slice(0, 3)
                            .map((delivery: any, index: number) => (
                              <div
                                key={
                                  delivery.delivery_id || delivery.id || index
                                }
                                className="flex justify-between gap-3 py-1 text-slate-600"
                              >
                                <span>
                                  {humanizeOptionLabel(
                                    delivery.channel || "whatsapp",
                                  )}
                                  {delivery.artifact_version
                                    ? ` · PDF v${delivery.artifact_version}`
                                    : ""}
                                </span>
                                <span className="font-bold text-slate-800">
                                  {humanizeOptionLabel(
                                    delivery.status || "queued",
                                  )}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                    {canSendInvoice && (
                      <ActionButton
                        onClick={() => sendInvoice(invoice)}
                        disabled={
                          busy === `send-invoice-whatsapp-${invoice.id}` ||
                          invoiceDeliveryPending
                        }
                        className="rounded-lg border px-3 text-xs"
                      >
                        <ButtonLoader
                          loading={
                            busy === `send-invoice-whatsapp-${invoice.id}`
                          }
                        >
                          {busy === `send-invoice-whatsapp-${invoice.id}`
                            ? "Sending Invoice..."
                            : invoiceDeliveryPending
                              ? "Invoice Queued"
                              : invoiceDeliveryStatus === "sent"
                                ? "Resend Invoice"
                                : ["failed", "cancelled"].includes(
                                      invoiceDeliveryStatus,
                                    )
                                  ? "Retry Send Invoice"
                                  : "Send Invoice"}
                        </ButtonLoader>
                      </ActionButton>
                    )}
                    {canEmailInvoice && (
                      <ActionButton
                        onClick={() => sendInvoice(invoice, false, "email")}
                        disabled={busy === `send-invoice-email-${invoice.id}`}
                      >
                        <ButtonLoader
                          loading={busy === `send-invoice-email-${invoice.id}`}
                        >
                          {busy === `send-invoice-email-${invoice.id}`
                            ? "Queueing Email..."
                            : "Send Invoice by Email"}
                        </ButtonLoader>
                      </ActionButton>
                    )}
                    {canSendInvoice && invoiceDocument.exists && (
                      <ActionButton
                        onClick={() => regenerateInvoice(invoice)}
                        disabled={busy === `regenerate-invoice-${invoice.id}`}
                      >
                        <ButtonLoader
                          loading={busy === `regenerate-invoice-${invoice.id}`}
                        >
                          {busy === `regenerate-invoice-${invoice.id}`
                            ? "Regenerating PDF..."
                            : `Regenerate PDF (v${invoiceDocument.version || 1})`}
                        </ButtonLoader>
                      </ActionButton>
                    )}
                    <ActionButton
                      onClick={() => openReceipt(invoice)}
                      disabled={busy === `receipt-${invoice.id}`}
                    >
                      <ButtonLoader loading={busy === `receipt-${invoice.id}`}>
                        {busy === `receipt-${invoice.id}`
                          ? "Generating PDF..."
                          : "Print Invoice"}
                      </ButtonLoader>
                    </ActionButton>
                    {canIssueCreditNote && (
                      <ActionButton onClick={() => issueCreditNote(invoice)}>
                        Credit Note
                      </ActionButton>
                    )}
                    {isTenantBillingAdmin &&
                      (String(invoice.status) !== "cancelled" ? (
                        <ActionButton
                          onClick={() => cancelInvoice?.(invoice)}
                          disabled={
                            busy === `cancel-${invoice.id}` ||
                            numberValue(invoice.paid_amount) > 0
                          }
                        >
                          <ButtonLoader
                            loading={busy === `cancel-${invoice.id}`}
                          >
                            {busy === `cancel-${invoice.id}`
                              ? "Cancelling..."
                              : "Cancel"}
                          </ButtonLoader>
                        </ActionButton>
                      ) : (
                        <ActionButton
                          onClick={() => amendInvoice?.(invoice)}
                          disabled={busy === `amend-${invoice.id}`}
                        >
                          <ButtonLoader
                            loading={busy === `amend-${invoice.id}`}
                          >
                            {busy === `amend-${invoice.id}`
                              ? "Amending..."
                              : "Amend"}
                          </ButtonLoader>
                        </ActionButton>
                      ))}
                  </div>
                </div>
              </div>
          </section>

          <section
            id="invoice-settlements"
            className={`rounded-lg  ${
              activeWorkspaceSection === "invoice-settlements"
                ? "block"
                : "hidden"
            }`}
          >
            <div className=" rounded-lg border-slate-200 bg-white px-4 py-3 mb-2">
              <h4 className="card-title font-bold">Settlement History</h4>
            </div>
            <div className="overflow-auto">
              <DataTable
                columns={getSettlementHistoryColumns()}
                data={settlementRows}
                emptyMessage="No payments or credit notes recorded yet."
                emptyDescription="Payments collected and credit notes issued against this invoice will show up here."
                emptyIcon={Landmark}
                minBodyHeight={`${settlementRows.length > 0 ?'':'220px'}`}
              />
            </div>
          </section>

          <section
            id="invoice-adjustments"
            className={`rounded-lg  ${
              activeWorkspaceSection === "invoice-adjustments"
                ? "block"
                : "hidden"
            }`}
          >
            <div className="rounded-lg flex flex-col gap-3 border-slate-200 bg-white px-4 py-3 lg:flex-row lg:items-center sm:justify-between mb-2">
              <div>
                <h4 className="card-title font-bold">
                  Discount, Refund & Cancellation Requests
                </h4>
                <p className="card-desc text-slate-500">
                  Request, approve, and execute invoice adjustments.
                </p>
              </div>
              <ActionGroup className="justify-start">
                <ActionButton
                  onClick={() => requestAdjustment?.(invoice, "cancel")}
                  disabled={!canRequestCancel}
                >
                  Request Cancel
                </ActionButton>
                <ActionButton
                  onClick={() => requestAdjustment?.(invoice, "full_refund")}
                  disabled={!canRequestRefund}
                >
                  Request Full Refund
                </ActionButton>
                <ActionButton
                  onClick={() => requestAdjustment?.(invoice, "partial_refund")}
                  disabled={!canRequestRefund}
                >
                  Request Partial Refund
                </ActionButton>
                {canRequestDiscountBase && (
                  <ActionButton
                    onClick={() => requestAdjustment?.(invoice, "discount")}
                    disabled={!canRequestDiscount}
                  >
                    Request Discount
                  </ActionButton>
                )}
              </ActionGroup>
            </div>
            <div className="overflow-auto">
              <DataTable
                columns={getAdjustmentRequestColumns({
                  canDecideAdjustment,
                  adjustmentClosed,
                  approveAdjustment,
                  rejectAdjustment,
                  executeAdjustment,
                })}
                data={adjustmentRequests}
                className="rounded-none"
                emptyMessage="No refund or cancellation requests yet."
                emptyDescription="Discount, refund, and cancellation requests raised on this invoice will show up here."
                emptyIcon={ClipboardList}
                minBodyHeight={`${adjustmentRequests.length > 0 ?'':'220px'}`}
              />
            </div>
          </section>

          {canReviewAnyAdjustment && (
            <section
              id="invoice-ledger"
              className={`rounded-lg  ${
                activeWorkspaceSection === "invoice-ledger" ? "block" : "hidden"
              }`}
            >
              <div className="rounded-lg border-slate-200 bg-white px-4 py-3 mb-2 ">
                <h4 className="card-title font-bold">
                  Hospital Accounting Ledger
                </h4>
                <p className="card-desc text-slate-500">
                  Company point-of-view journal view for this invoice. Debits
                  and credits show the hospital accounts affected by each event.
                </p>
              </div>
              <div className="table-wrapper-width">
                <DataTable
                  columns={getHospitalLedgerColumns({
                    ledgerRunningById,
                    hospitalLedgerLine,
                  })}
                  data={financialLedgerEntries}
                  emptyMessage="No financial ledger entries recorded yet."
                  emptyDescription="Debit and credit journal entries generated for this invoice will show up here."
                  emptyIcon={BookOpen}
                  minBodyHeight={`${financialLedgerEntries.length > 0 ?'':'220px'}`}
                  className="table-width"
                  tableClassName="min-w-[1480px]"
                  rowClassName="odd:bg-white even:bg-slate-50/40 hover:bg-emerald-50/30"
                />
              </div>
            </section>
          )}
        </div>
      <section id="invoice-activity">
        <ActivityLog
          resourceType="invoice"
          resourceId={invoice?.id}
          apiSession={apiSession}
        />
      </section>
    </div>
  );
}
