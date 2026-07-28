import { displayDateTime, money } from "@/utils/helper";
import { claimedDetail, formatPercentage, invoiceDiscountParts, invoiceHasAppliedMembershipBenefit, invoiceItemPriceBreakdown, invoiceLinkedRecord, invoiceMembershipLabel, invoiceSource, invoiceTaxAdjustedDiscount, isMembershipPlanInvoice, itemTypeLabel, numberValue, percentLabel } from "../helpers";
import { useEffect, useState } from "react";
import { humanizeOptionLabel } from "@/lib/options";
import { Input, SearchableSelect } from "@/app/components/common/ui";
import { BillLine } from "./BillLine";
import { InvoiceMeta } from "./InvoiceMeta";
import { Badge,ActionButton,ActionGroup,Card } from "@/app/components/common/ui";
import { ActivityLog } from "@/app/components/common/ActivityLog";
import {
  canCopyDatabaseIds,
  CopyIdButton,
} from "@/app/components/common/CopyIdButton";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";

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
  applyMembershipBenefit,
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
  const canRequestDiscountPermission = hasPermission(
    "billing.discounts.request",
  ) || isTenantBillingAdmin;
  const canRequestRefundPermission = hasPermission(
    "billing.refunds.request",
  ) || isTenantBillingAdmin;
  const canRequestCancelPermission = hasPermission(
    "invoices.cancel_request",
  ) || isTenantBillingAdmin;
  const canRecordPayments = hasPermission(
    "payments.manage",
    "payments.create",
  );
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
  const taxableAmount = numberValue(invoice.taxable_amount);
  const taxAmount = numberValue(invoice.tax_amount);
  const balanceDue = numberValue(invoice.balance_amount);
  const invoiceDelivery = detail.invoice_delivery || {};
  const invoiceDeliveryStatus = String(
    invoiceDelivery.status || "not_sent",
  ).toLowerCase();
  const invoiceDeliveryPending = ["queued", "processing"].includes(
    invoiceDeliveryStatus,
  );
  const invoiceDeliveryLabel = {
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
  const [payRows, setPayRows] = useState<any[]>([
    { method: defaultPaymentMethod, amount: "", reference: "" },
  ]);
  useEffect(() => {
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
  function signedMoney(
    value: any,
    mode: "delta" | "debit" | "credit" = "delta",
  ) {
    const amount = numberValue(value);
    if (amount === 0) return money(0);
    if (mode === "credit") return `+${money(Math.abs(amount))}`;
    if (mode === "debit") return `-${money(Math.abs(amount))}`;
    return `${amount > 0 ? "+" : "-"}${money(Math.abs(amount))}`;
  }
  function amountTone(
    value: any,
    mode: "delta" | "debit" | "credit" = "delta",
  ) {
    const amount = numberValue(value);
    if (amount === 0) return "text-slate-500";
    if (mode === "debit" || amount < 0) return "text-rose-700";
    return "text-emerald-700";
  }
  function itemMrp(item: any) {
    return numberValue(item.mrp_amount);
  }
  function itemRate(item: any) {
    const pricing = invoiceItemPriceBreakdown(item, invoice);
    return pricing.rateUnit;
  }
  const itemTableColSpan =
    7 + (showItemVendor ? 2 : 0) + (showItemPricing ? 1 : 0);
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
          invoiceTotal:
            running.invoiceTotal + numberValue(entry.invoice_total_delta),
          paidAmount: running.paidAmount + numberValue(entry.paid_amount_delta),
          balanceAmount:
            running.balanceAmount + numberValue(entry.balance_amount_delta),
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
  return (
    <div className="">
      <Card>
        <div className="-mx-6 -mt-6 border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base lg:text-xl font-bold">
                  {source.label} Invoice
                </h3>
                <Badge
                  tone={
                    invoice.status === "paid"
                      ? "green"
                      : invoice.status === "partially_refunded" ||
                          invoice.status === "refunded"
                        ? "blue"
                        : invoice.status === "partially_paid"
                          ? "amber"
                          : "slate"
                  }
                  className="normal-badge"
                >
                  {humanizeOptionLabel(invoice.status)}
                </Badge>
                {membershipLabel && (
                  <Badge tone="green" className="normal-badge">
                    {membershipLabel}
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <b className="table-data">{invoice.invoice_number}</b>
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
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="close-button font-bold hover:bg-slate-50"
            >
              Back to Invoices
            </button>
          </div>
        </div>

        <div className="pt-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="grid gap-3 text-sm md:grid-cols-4">
              <InvoiceMeta label="Type" value={source.label} />
              <InvoiceMeta label="Source" value={linkedRecord} />
              <InvoiceMeta
                label="Patient"
                value={
                  invoice.patient_name ||
                  patient?.name ||
                  patient?.full_name ||
                  invoice.patient_number ||
                  "Patient"
                }
              />
              <InvoiceMeta
                label="Status"
                value={humanizeOptionLabel(invoice.status || "issued")}
              />
            </div>
          </div>

          <div className="mt-5 ">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="card-title font-bold">
                    {source.label} Bill Items
                  </h4>
                  <p className="table-data text-slate-500">
                    Line items linked to this invoice.
                  </p>
                </div>
                <div className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2.5 py-2">
                  <span className="text-[10px] font-bold uppercase text-slate-500">
                    Items
                  </span>
                  <span className="text-xs font-black tabular-nums text-slate-950">
                    {items.length}
                  </span>
                </div>
              </div>
              <div className="m-3 overflow-x-auto rounded-xl border border-slate-200">
                <table
                  className={`w-full border-separate border-spacing-0 text-left text-xs ${showItemVendor || showItemPricing ? "min-w-[980px]" : "min-w-[760px]"}`}
                >
                  <thead className="bg-slate-100 text-[11px] font-medium text-slate-500">
                    <tr>
                      <th className="w-12 border-r border-slate-200 px-3 py-2 text-center">No.</th>
                      <th className="min-w-52 border-r border-slate-200 px-3 py-2">Item</th>
                      <th className="border-r border-slate-200 px-3 py-2 text-right">Quantity</th>
                      {showItemVendor && (
                        <th className="min-w-36 border-r border-slate-200 px-3 py-2">{vendorLabel}</th>
                      )}
                      {showItemVendor && (
                        <th className="border-r border-slate-200 px-3 py-2 text-right">
                          {vendorPriceLabel}
                        </th>
                      )}
                      {showItemPricing && (
                        <th className="border-r border-slate-200 px-3 py-2 text-right">MRP</th>
                      )}
                      <th className="border-r border-slate-200 px-3 py-2 text-right">Rate (INR)</th>
                      <th className="border-r border-slate-200 px-3 py-2 text-right">Discount %</th>
                      <th className="border-r border-slate-200 px-3 py-2 text-right">
                        Discount amount
                      </th>
                      <th className="px-3 py-2 text-right">Payable (INR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr>
                        <td
                          colSpan={itemTableColSpan}
                          className="border-t border-slate-200 px-4 py-5 text-sm font-semibold text-slate-500"
                        >
                          No bill items found.
                        </td>
                      </tr>
                    )}
                    {items.map((item: any, index: number) => {
                      const pricing = invoiceItemPriceBreakdown(item, invoice);
                      const displayDiscount = pricing.effectiveDiscount;
                      const discountBase =
                        pricing.mrpTotal > 0
                          ? pricing.mrpTotal
                          : pricing.lineAmount;
                      const itemSupplierOptions =
                        supplierOptions[item.id] || [];
                      const vendorName =
                        item.vendor_name || item.supplier_id || "";
                      const canPickSupplier =
                        showSupplierPicker &&
                        item.item_type === "lab" &&
                        itemSupplierOptions.length > 0;
                      const vendorAmount =
                        numberValue(item.vendor_amount) ||
                        (canPickSupplier && itemSupplierOptions.length === 1
                          ? numberValue(itemSupplierOptions[0].buying_price)
                          : 0);
                      return (
                        <tr key={item.id} className="align-middle hover:bg-slate-50/70">
                          <td className="border-r border-t border-slate-200 px-3 py-2.5 text-center tabular-nums text-slate-600">
                            {index + 1}
                          </td>
                          <td className="border-r border-t border-slate-200 px-3 py-2.5">
                            <span
                              className="block max-w-64 truncate font-bold text-slate-900"
                              title={
                                item.description ||
                                itemTypeLabel(item.item_type)
                              }
                            >
                              {item.description ||
                                itemTypeLabel(item.item_type)}
                            </span>
                          </td>
                          <td className="border-r border-t border-slate-200 px-3 py-2.5 text-right font-semibold tabular-nums text-slate-700">
                            {item.quantity}
                          </td>
                          {showItemVendor && (
                            <td className="border-r border-t border-slate-200 px-3 py-2.5">
                              {canPickSupplier ? (
                                <SearchableSelect
                                  value={item.supplier_id || ""}
                                  onChange={(value) =>
                                    updateInvoiceItemSupplier?.(
                                      invoice,
                                      item,
                                      value,
                                    )
                                  }
                                  disabled={busy === `supplier-${item.id}`}
                                  searchable={itemSupplierOptions.length > 8}
                                  placeholder="No supplier"
                                  options={[
                                    {
                                      value: "",
                                      label: "No supplier",
                                    },
                                    ...itemSupplierOptions.map(
                                      (supplier: any) => ({
                                        value: supplier.supplier,
                                        label: supplier.supplier_name,
                                        sublabel: money(supplier.buying_price),
                                      }),
                                    ),
                                  ]}
                                />
                              ) : (
                                <span className="font-medium text-slate-800">
                                  {vendorName || "-"}
                                </span>
                              )}
                            </td>
                          )}
                          {showItemVendor && (
                            <td className="border-r border-t border-slate-200 px-3 py-2.5 text-right tabular-nums text-slate-700">
                              {vendorAmount > 0 ? money(vendorAmount) : "-"}
                            </td>
                          )}
                          {showItemPricing && (
                            <td className="border-r border-t border-slate-200 px-3 py-2.5 text-right tabular-nums text-slate-700">
                              {itemMrp(item) > 0 ? money(itemMrp(item)) : "-"}
                            </td>
                          )}
                          <td className="border-r border-t border-slate-200 px-3 py-2.5 text-right font-bold tabular-nums text-slate-800">
                            {money(itemRate(item))}
                          </td>
                          <td className="border-r border-t border-slate-200 px-3 py-2.5 text-right tabular-nums text-slate-700">
                            {displayDiscount > 0
                              ? percentLabel(displayDiscount, discountBase)
                              : "-"}
                          </td>
                          <td className="border-r border-t border-slate-200 px-3 py-2.5 text-right font-bold tabular-nums text-emerald-700">
                            {displayDiscount > 0
                              ? `-${money(displayDiscount)}`
                              : "-"}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-2.5 text-right font-black tabular-nums text-slate-900">
                            {money(pricing.payableAmount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {canRequestDiscountBase ? (
                <div className="mx-3 mb-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
                  <span className="text-xs font-bold text-slate-500">
                    Need a lower price on this bill? Use "Request Discount" in
                    Refund &amp; Cancellation Requests below — it applies once
                    approved.
                  </span>
                </div>
              ) : membershipLocksAdditionalDiscounts ? (
                <div className="mx-3 mb-3 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3">
                  <span className="text-xs font-bold text-purple-800">
                    Additional discounts and promotional offers are unavailable
                    because a patient membership benefit is applied.
                  </span>
                </div>
              ) : null}
            </div>

            <aside className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-4">
                <h4 className="card-title font-bold">Payment Summary</h4>
                <p className="card-desc text-slate-500">
                  Staff collection view
                </p>
              </div>
              <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="divide-y">
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
                    note={
                      discountParts.offerDiscount > 0
                        ? claimedDetail(
                            discountParts.offerDiscount,
                            invoice.subtotal_amount,
                          )
                        : "No Offer & Discount Applied"
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
                    value={money(invoice.balance_amount)}
                    strong
                    danger={numberValue(invoice.balance_amount) > 0}
                  />
                </div>
                <div className="">
                  <div className="rounded-2xl bg-slate-50 p-4">
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
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
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
                          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-900 hover:bg-slate-50"
                        >
                          + Add mode
                        </button>
                      </div>
                      <div className="mt-3 ">
                        {payRows.map((row, index) => (
                          <div
                            key={index}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
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
                      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold">
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
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-slate-900 to-slate-700 px-4 py-3.5 text-sm lg:text-base   font-black tracking-wide text-white shadow-lg shadow-slate-900/20 transition hover:from-slate-800 hover:to-slate-600 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
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
                    <div className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
                      <span>{humanizeOptionLabel(invoice.status)} invoice</span>
                      <span>Payment locked</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                      <span>Payment settled</span>
                      <span>{money(invoice.paid_amount)}</span>
                    </div>
                  )}
                  {String(invoice.status || "").toLowerCase() === "paid" && (
                    <div
                      className={`rounded-lg border p-3 text-xs ${
                        invoiceDeliveryStatus === "sent"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : ["failed", "cancelled"].includes(invoiceDeliveryStatus)
                            ? "border-red-200 bg-red-50 text-red-900"
                            : "border-amber-200 bg-amber-50 text-amber-900"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold">Patient invoice delivery</span>
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
                          Attempt {invoiceDelivery.attempt_count} of {invoiceDelivery.max_attempts}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                    {canSendInvoice && (
                      <ActionButton
                        onClick={() => sendInvoice(invoice)}
                        disabled={
                          busy === `send-invoice-${invoice.id}` ||
                          invoiceDeliveryPending
                        }
                      >
                        <ButtonLoader
                          loading={busy === `send-invoice-${invoice.id}`}
                        >
                          {busy === `send-invoice-${invoice.id}`
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
                          <ButtonLoader loading={busy === `cancel-${invoice.id}`}>
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
                          <ButtonLoader loading={busy === `amend-${invoice.id}`}>
                            {busy === `amend-${invoice.id}`
                              ? "Amending..."
                              : "Amend"}
                          </ButtonLoader>
                        </ActionButton>
                      ))}
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <div className="mt-5 rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h4 className="card-title font-bold">Settlement History</h4>
            </div>
            <div className="overflow-auto">
              {settlementRows.length === 0 ? (
                <p className="p-4 table-data text-slate-500">
                  No payments or credit notes recorded yet.
                </p>
              ) : (
                <table className="w-full min-w-[820px] table-fixed text-left text-xs">
                  <thead className="bg-slate-50 font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="w-[180px] px-4 py-3">Date & Time</th>
                      <th className="w-[120px] px-3 py-3">Type</th>
                      <th className="w-[170px] px-3 py-3">Method / No.</th>
                      <th className="px-3 py-3">Reference / Reason</th>
                      <th className="w-[120px] px-3 py-3">Status</th>
                      <th className="w-[130px] px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {settlementRows.map((row: any) => (
                      <tr key={row.id} className="align-middle">
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          {displayDateTime(row.date)}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-900">
                          {row.type}
                        </td>
                        <td className="px-3 py-3 capitalize text-slate-700">
                          {row.method}
                        </td>
                        <td
                          className="truncate px-3 py-3 text-slate-600"
                          title={row.reference}
                        >
                          {row.reference}
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={row.tone} className="normal-badge">
                            {humanizeOptionLabel(row.status)}
                          </Badge>
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-black tabular-nums ${row.informational ? "text-slate-700" : amountTone(row.amount)}`}
                        >
                          {row.informational
                            ? money(row.amount)
                            : signedMoney(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-slate-200">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center sm:justify-between">
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
              {adjustmentRequests.length === 0 ? (
                <p className="p-4 table-data text-slate-500">
                  No refund or cancellation requests yet.
                </p>
              ) : (
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3">Requested</th>
                      <th className="whitespace-nowrap px-4 py-3">Type</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">
                        Amount
                      </th>
                      <th className="whitespace-nowrap px-4 py-3">Reason</th>
                      <th className="whitespace-nowrap px-4 py-3">
                        Requested By
                      </th>
                      <th className="whitespace-nowrap px-4 py-3">Status</th>
                      <th className="whitespace-nowrap px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {adjustmentRequests.map((row: any) => (
                      <tr
                        key={row.id}
                        className="whitespace-nowrap align-middle"
                      >
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          {displayDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-3 font-bold capitalize">
                          {humanizeOptionLabel(row.request_type)}
                        </td>
                        <td className="px-4 py-3 text-right font-black tabular-nums">
                          {money(row.amount)}
                        </td>
                        <td
                          className="max-w-[260px] truncate px-4 py-3 font-semibold text-slate-600"
                          title={row.reason}
                        >
                          {row.reason}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          {row.requested_by_user_name || "Unknown user"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              row.status === "executed"
                                ? "green"
                                : row.status === "rejected"
                                  ? "red"
                                  : row.status === "approved"
                                    ? "blue"
                                    : "amber"
                            }
                            className="normal-badge"
                          >
                            {humanizeOptionLabel(row.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {canDecideAdjustment(row) && row.status === "pending" ? (
                            <ActionGroup>
                              <ActionButton
                                onClick={() => approveAdjustment?.(row)}
                              >
                                Approve
                              </ActionButton>
                              <ActionButton
                                tone="danger"
                                onClick={() => rejectAdjustment?.(row)}
                              >
                                Reject
                              </ActionButton>
                            </ActionGroup>
                          ) : canDecideAdjustment(row) &&
                            row.status === "approved" &&
                            !adjustmentClosed ? (
                            <ActionButton
                              onClick={() => executeAdjustment?.(row)}
                            >
                              Execute
                            </ActionButton>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {canReviewAnyAdjustment && (
            <div className="mt-5 rounded-lg border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h4 className="card-title font-bold">Billing Ledger</h4>
                <p className="card-desc text-slate-500">
                  Invoice lifecycle is tracked for audit. Credit and debit show
                  only payment, refund, or membership benefit movement.
                </p>
              </div>
              <div className="overflow-auto">
                {financialLedgerEntries.length === 0 && (
                  <p className="p-4 table-data text-slate-500">
                    No financial ledger entries recorded yet.
                  </p>
                )}
                {financialLedgerEntries.length > 0 && (
                  <table className="w-full min-w-[1040px] text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-3">
                          Date & Time
                        </th>
                        <th className="whitespace-nowrap px-4 py-3">
                          Activity
                        </th>
                        <th className="whitespace-nowrap px-4 py-3">User</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">
                          Credit
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">
                          Debit
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">
                          Bill Amount
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">
                          Paid
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">
                          Balance
                        </th>
                        <th className="whitespace-nowrap px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {financialLedgerEntries.map((entry: any) => {
                        const running = ledgerRunningById.get(entry.id) || {
                          invoiceTotal: 0,
                          paidAmount: 0,
                          balanceAmount: 0,
                        };
                        const creditAmount = ledgerCreditAmount(entry);
                        const debitAmount = ledgerDebitAmount(entry);
                        return (
                          <tr
                            key={entry.id}
                            className="whitespace-nowrap align-middle"
                          >
                            <td className="px-4 py-3 font-semibold text-slate-700">
                              {displayDateTime(entry.created_at)}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-bold capitalize text-slate-950">
                                {humanizeOptionLabel(entry.entry_type)}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-700">
                              {entry.actor_user_name || "Unknown user"}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-black tabular-nums ${amountTone(creditAmount, "credit")}`}
                            >
                              {signedMoney(creditAmount, "credit")}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-black tabular-nums ${amountTone(debitAmount, "debit")}`}
                            >
                              {signedMoney(debitAmount, "debit")}
                            </td>
                            <td className="px-4 py-3 text-right font-black tabular-nums text-slate-700">
                              {money(running.invoiceTotal)}
                            </td>
                            <td className="px-4 py-3 text-right font-black tabular-nums text-slate-700">
                              {money(running.paidAmount)}
                            </td>
                            <td className="px-4 py-3 text-right font-black tabular-nums text-slate-700">
                              {money(running.balanceAmount)}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                tone={
                                  entry.status_after === "cancelled"
                                    ? "amber"
                                    : "slate"
                                }
                                className="normal-badge"
                              >
                                {humanizeOptionLabel(entry.status_after)}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
      <ActivityLog resourceType="invoice" resourceId={invoice?.id} apiSession={apiSession} />
    </div>
  );
}
