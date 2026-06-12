import { money, numberValue } from "@/features/reports/utils";
import { claimedDetail, invoiceDiscountParts, invoiceLinkedRecord, invoiceMembershipLabel, invoiceSource, itemTypeLabel } from "@/utils/billing/helpers";
import { useEffect, useState } from "react";
import { Badge,ActionButton,Select,Card,Input } from "../common/ui";

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
  refreshConsultationInvoice,
  applyMembershipBenefit,
  openReceipt,
  issueCreditNote,
  supplierOptions={},
  updateInvoiceItemSupplier,
}:any){
  const invoice=detail.invoice||{};
  const items=detail.items||[];
  const payments=detail.payments||[];
  const source=invoiceSource(invoice);
  const showInternalLabPrices=Boolean(invoice.lab_order_id);
  const linkedRecord=invoiceLinkedRecord(invoice);
  const discountParts=invoiceDiscountParts(invoice);
  const membershipLabel=invoiceMembershipLabel(invoice);
  const membershipBenefit=detail.membership_benefit;
  const taxableAmount=numberValue(invoice.taxable_amount);
  const taxAmount=numberValue(invoice.tax_amount);
  const canRefresh=invoice.consultation_id&&!invoice.lab_order_id&&!invoice.pharmacy_issue_id&&!invoice.ip_admission_id&&!invoice.physiotherapy_case_id;
  const balanceDue=numberValue(invoice.balance_amount);
  const [payRows,setPayRows]=useState<any[]>([{method:defaultPaymentMethod,amount:"",reference:""}]);
  useEffect(()=>{
    setPayRows([{method:defaultPaymentMethod,amount:String(balanceDue||""),reference:""}]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[invoice.id,invoice.balance_amount,defaultPaymentMethod]);
  const enteredTotal=payRows.reduce((sum,row)=>sum+Number(row.amount||0),0);
  const remaining=balanceDue-enteredTotal;
  function updatePayRow(index:number,key:string,value:any){
    setPayRows((rows)=>rows.map((row,i)=>i===index?{...row,[key]:value}:row));
  }
  function addPayRow(){
    setPayRows((rows)=>[...rows,{method:defaultPaymentMethod,amount:remaining>0?String(remaining):"",reference:""}]);
  }
  function removePayRow(index:number){
    setPayRows((rows)=>rows.length>1?rows.filter((_,i)=>i!==index):rows);
  }
  return (
    <div className="space-y-5">
      <Card>
        <div className="-mx-6 -mt-6 border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base lg:text-xl font-bold">{source.label} Invoice</h3>
                <Badge
                  tone={
                    invoice.status === "paid"
                      ? "green"
                      : invoice.status === "partially_paid"
                        ? "amber"
                        : "slate"
                  }
                  className="normal-badge"
                >
                  {invoice.status}
                </Badge>
                {membershipLabel && (
                  <Badge tone="green" className="normal-badge">{membershipLabel}</Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <b className="table-data">{invoice.invoice_number}</b>
                <span className="text-slate-500">
                  {patient?.name || patient?.full_name || "Patient"}
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
                value={patient?.name || patient?.full_name || "Patient"}
              />
              <InvoiceMeta
                label="Status"
                value={String(invoice.status || "issued").replaceAll("_", " ")}
              />
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="card-title font-bold">{source.label} Bill Items</h4>
                  <p className="table-data text-slate-500">
                    Line items linked to this invoice.
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2 flex justify-between w-16">
                  <p className="text-[11px] font-bold uppercase text-slate-500">
                    Items
                  </p>
                  <p className="text-xs lg:text-sm font-black tabular-nums text-slate-950">
                    {items.length}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className={`w-full text-left text-sm ${showInternalLabPrices?'min-w-[1080px]':'min-w-[760px]'}`}>
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-3 py-3">Description</th>
                      {showInternalLabPrices&&<th className="px-3 py-3 text-right">MRP</th>}
                      {showInternalLabPrices&&<th className="px-3 py-3">Supplier</th>}
                      {showInternalLabPrices&&<th className="px-3 py-3 text-right">Buying</th>}
                      {showInternalLabPrices&&<th className="px-3 py-3 text-right">Selling</th>}
                      <th className="px-3 py-3 text-right">Qty</th>
                      <th className="px-3 py-3 text-right">Rate</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={showInternalLabPrices?9:5} className="px-4 py-5 text-sm font-semibold text-slate-500">No bill items found.</td>
                      </tr>
                    )}
                    {items.map((item:any)=>{
                      const itemSupplierOptions=supplierOptions[item.id]||[];
                      return (
                      <tr key={item.id} className="align-middle">
                        <td className="px-4 py-4">
                          <Badge tone={source.tone as any} className="normal-badge">
                            {itemTypeLabel(item.item_type)}
                          </Badge>
                        </td>
                        <td className="px-3 py-4">
                          <span
                            className="block max-w-[520px] table-data break-words font-semibold text-slate-950"
                            title={
                              item.description || itemTypeLabel(item.item_type)
                            }
                          >
                            {item.description || itemTypeLabel(item.item_type)}
                          </span>
                          {showInternalLabPrices&&item.external_item_code&&<span className="mt-1 block text-xs text-slate-500">{item.external_item_code}</span>}
                        </td>
                        {showInternalLabPrices&&<td className="px-3 py-4 text-right tabular-nums">{money(item.mrp_amount||0)}</td>}
                        {showInternalLabPrices&&(
                          <td className="px-3 py-4">
                            <Select
                              value={item.supplier_id||''}
                              onChange={(event:any)=>updateInvoiceItemSupplier?.(invoice,item,event.target.value)}
                              disabled={busy===`supplier-${item.id}`}
                              className="min-w-[170px]"
                            >
                              <option value="">No supplier</option>
                              {itemSupplierOptions.map((supplier:any)=>(
                                <option key={supplier.supplier} value={supplier.supplier}>{supplier.supplier_name} · {money(supplier.buying_price)}</option>
                              ))}
                            </Select>
                          </td>
                        )}
                        {showInternalLabPrices&&<td className="px-3 py-4 text-right tabular-nums">{money(item.buying_amount||0)}</td>}
                        {showInternalLabPrices&&<td className="px-3 py-4 text-right tabular-nums">{money(item.selling_amount||item.unit_amount||0)}</td>}
                        <td className="px-3 py-4 text-right table-data font-bold tabular-nums">{item.quantity}</td>
                        <td className="px-3 py-4 text-right table-data tabular-nums">{money(item.unit_amount)}</td>
                        <td className="px-4 py-4 text-right table-data font-black tabular-nums text-slate-950">{money(item.total_amount)}</td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-4">
                <h4 className="card-title font-bold">Payment Summary</h4>
                <p className="table-data text-slate-500">Staff collection view</p>
              </div>
              <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="divide-y">
                  <BillLine
                    label="Item total"
                    value={money(invoice.subtotal_amount)}
                  />
                  <BillLine
                    label="Offer discount"
                    value={`-${money(discountParts.offerDiscount)}`}
                    muted={discountParts.offerDiscount <= 0}
                    savings={discountParts.offerDiscount > 0}
                    note={
                      discountParts.offerDiscount > 0
                        ? claimedDetail(
                            discountParts.offerDiscount,
                            invoice.subtotal_amount,
                          )
                        : "No offer discount applied"
                    }
                  />
                  <BillLine
                    label="Membership benefit"
                    value={`-${money(discountParts.membershipDiscount)}`}
                    muted={discountParts.membershipDiscount <= 0}
                    savings={discountParts.membershipDiscount > 0}
                    note={
                      discountParts.membershipDiscount > 0
                        ? `${membershipLabel} · ${claimedDetail(discountParts.membershipDiscount, invoice.subtotal_amount)}`
                        : membershipBenefit?.reason ||
                          "No membership benefit applied"
                    }
                    action={
                      membershipBenefit?.is_applied ? (
                        <ActionButton disabled>Applied</ActionButton>
                      ) : !membershipBenefit?.is_applied &&
                        membershipBenefit?.can_apply ? (
                        <ActionButton
                          onClick={() => applyMembershipBenefit(invoice)}
                          disabled={busy === `membership-${invoice.id}`}
                        >
                          {busy === `membership-${invoice.id}`
                            ? "Applying..."
                            : `Apply ${money(membershipBenefit.discount_amount)}`}
                        </ActionButton>
                      ) : null
                    }
                  />
                  <BillLine label="Subtotal" value={money(taxableAmount)} />
                  <BillLine
                    label="Tax"
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
                <div className="space-y-3">
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
                  {numberValue(invoice.balance_amount) > 0 ? (
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
                      <div className="mt-3 space-y-3">
                        {payRows.map((row, index) => (
                          <div
                            key={index}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                          >
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Select
                                value={row.method}
                                onChange={(e: any) =>
                                  updatePayRow(index, "method", e.target.value)
                                }
                              >
                                {invoicePaymentOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                              <Input
                                className="text-right tabular-nums"
                                type="number"
                                min="0"
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
                                  updatePayRow(index, "reference", e.target.value)
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
                      <button
                        type="button"
                        disabled={busy === invoice.id || enteredTotal <= 0 || remaining < 0}
                        onClick={() => collectSplitPayment(invoice, payRows)}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-slate-900 to-slate-700 px-4 py-3.5 text-sm lg:text-base   font-black tracking-wide text-white shadow-lg shadow-slate-900/20 transition hover:from-slate-800 hover:to-slate-600 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                      >
                        {busy === invoice.id ? (
                          "Saving Payment..."
                        ) : (
                          <>
                            <span>
                              {payRows.filter((r) => Number(r.amount) > 0).length > 1
                                ? "Pay (Split)"
                                : "Pay"}
                            </span>
                            <span className="tabular-nums">{money(enteredTotal)}</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                      <span>Payment settled</span>
                      <span>{money(invoice.paid_amount)}</span>
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                    {canRefresh && (
                      <ActionButton
                        onClick={() => refreshConsultationInvoice(invoice)}
                        disabled={busy === `refresh-${invoice.id}`}
                      >
                        {busy === `refresh-${invoice.id}`
                          ? "Refreshing..."
                          : "Refresh"}
                      </ActionButton>
                    )}
                    <ActionButton onClick={() => openReceipt(invoice)}>
                      Receipt
                    </ActionButton>
                    <ActionButton onClick={() => issueCreditNote(invoice)}>
                      Credit Note
                    </ActionButton>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <div className="mt-5 rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h4 className="card-title font-bold">Payments</h4>
            </div>
            <div className="grid gap-2 p-4">
              {payments.length === 0 && (
                <p className="table-data text-slate-500">
                  No payments recorded yet.
                </p>
              )}
              {payments.map((payment: any) => (
                <div
                  key={payment.id}
                  className="flex flex-col justify-between gap-2 rounded-2xl bg-slate-50 p-3 text-sm md:flex-row md:items-center"
                >
                  <div>
                    <b className="capitalize">
                      {String(payment.method || "payment").replaceAll("_", " ")}
                    </b>
                    {payment.reference_number && (
                      <p className="text-xs text-slate-500">
                        {payment.reference_number}
                      </p>
                    )}
                  </div>
                  <Badge
                    tone={payment.status === "recorded" ? "green" : "amber"}
                  >
                    {payment.status}
                  </Badge>
                  <b>{money(payment.amount)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function BillLine({
  label,
  value,
  note,
  muted = false,
  savings = false,
  strong = false,
  danger = false,
  action = null,
}: any) {
  const valueClass = danger
    ? "text-rose-700"
    : savings
      ? "text-emerald-700"
      : "text-slate-950";
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm">
      <div>
        <p
          className={
            muted
              ? "font-semibold text-slate-400"
              : "font-semibold text-slate-700"
          }
        >
          {label}
        </p>
        {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <p
          className={`${strong ? "text-base font-black" : "font-bold"} ${muted ? "text-slate-400" : valueClass} tabular-nums`}
        >
          {value}
        </p>
        {action}
      </div>
    </div>
  );
}


export function InvoiceMeta({ label, value }: any) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words font-bold capitalize text-slate-950">
        {value}
      </p>
    </div>
  );
}
