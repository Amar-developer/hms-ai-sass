import { money, numberValue } from "@/features/reports/utils";
import { claimedDetail, invoiceDiscountParts, invoiceLinkedRecord, invoiceMembershipLabel, invoiceSource, invoiceTaxAdjustedDiscount, itemTypeLabel } from "@/utils/billing/helpers";
import { useEffect, useState } from "react";
import { Badge,ActionButton,ActionGroup,Select,Card,Input } from "../common/ui";
import { displayDateTime } from "@/utils/helper";

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
  downloadReceipt,
  issueCreditNote,
  cancelInvoice,
  amendInvoice,
  requestAdjustment,
  approveAdjustment,
  rejectAdjustment,
  executeAdjustment,
  userPermissions=[],
  currentUser,
  supplierOptions={},
  updateInvoiceItemSupplier,
  updateInvoiceAmount,
}:any){
  const invoice=detail.invoice||{};
  const items=detail.items||[];
  const payments=detail.payments||[];
  const creditNotes=detail.credit_notes||[];
  const ledgerEntries=detail.ledger_entries||[];
  const adjustmentRequests=detail.adjustment_requests||[];
  const source=invoiceSource(invoice);
  const showItemVendor=items.some(
    (item:any)=>Boolean(item.vendor_name)||numberValue(item.vendor_amount)>0,
  );
  const showSupplierPicker=Boolean(invoice.lab_order_id);
  const showItemPricing=showItemVendor||items.some(
    (item:any)=>numberValue(item.mrp_amount)>0||numberValue(item.buying_amount)>0,
  );
  const linkedRecord=invoiceLinkedRecord(invoice);
  const discountParts=invoiceDiscountParts(invoice);
  const membershipLabel=invoiceMembershipLabel(invoice);
  const membershipBenefit=detail.membership_benefit;
  const membershipEffectiveSaving=invoiceTaxAdjustedDiscount(invoice,discountParts.membershipDiscount);
  const membershipTaxSaving=Math.max(membershipEffectiveSaving-discountParts.membershipDiscount,0);
  const membershipBenefitNote=
    discountParts.membershipDiscount>0&&invoice.lab_order_id
      ? `${membershipLabel} · ${money(discountParts.membershipDiscount)} free lab membership benefit`
      : discountParts.membershipDiscount>0
        ? `${membershipLabel} · ${
            membershipTaxSaving > 0
              ? `${claimedDetail(membershipEffectiveSaving, invoice.subtotal_amount)} effective saving (${money(discountParts.membershipDiscount)} benefit + ${money(membershipTaxSaving)} tax saved)`
              : claimedDetail(discountParts.membershipDiscount, invoice.subtotal_amount)
          }`
        : membershipBenefit?.reason || "No membership benefit applied";
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
  // Lab bills cannot be paid until every lab line that has supplier options has a
  // supplier chosen (items without any supplier option are left as-is).
  const labSupplierMissing=items.some((item:any)=>
    item.item_type==='lab'&&
    (supplierOptions[item.id]?.length||0)>0&&
    !item.supplier_id,
  );
  // Non-OP consultation bills are custom-priced, so allow editing the amount on
  // the bill until a payment is recorded. OP and service invoices are fixed.
  const canEditAmount=Boolean(
    updateInvoiceAmount&&
    invoice.consultation_id&&
    !invoice.lab_order_id&&!invoice.pharmacy_issue_id&&!invoice.ip_admission_id&&
    !invoice.physiotherapy_case_id&&!invoice.home_care_booking_id&&
    invoice.appointment_type&&invoice.appointment_type!=='op'&&
    numberValue(invoice.paid_amount)<=0&&
    !['cancelled','refunded'].includes(String(invoice.status)),
  );
  const [editingAmount,setEditingAmount]=useState(false);
  const [amountDraft,setAmountDraft]=useState("");
  function updatePayRow(index:number,key:string,value:any){
    setPayRows((rows)=>rows.map((row,i)=>i===index?{...row,[key]:value}:row));
  }
  function addPayRow(){
    setPayRows((rows)=>[...rows,{method:defaultPaymentMethod,amount:remaining>0?String(remaining):"",reference:""}]);
  }
  function removePayRow(index:number){
    setPayRows((rows)=>rows.length>1?rows.filter((_,i)=>i!==index):rows);
  }
  function signedMoney(value:any,mode:"delta"|"debit"|"credit"="delta"){
    const amount=numberValue(value);
    if(amount===0)return money(0);
    if(mode==="credit")return `-${money(Math.abs(amount))}`;
    if(mode==="debit")return `+${money(Math.abs(amount))}`;
    return `${amount>0?"+":"-"}${money(Math.abs(amount))}`;
  }
  function amountTone(value:any,mode:"delta"|"debit"|"credit"="delta"){
    const amount=numberValue(value);
    if(amount===0)return "text-slate-500";
    if(mode==="credit"||amount<0)return "text-rose-700";
    return "text-emerald-700";
  }
  function itemMrp(item:any){
    return numberValue(item.mrp_amount);
  }
  function itemRate(item:any){
    return numberValue(item.selling_amount)||numberValue(item.unit_amount);
  }
  const itemTableColSpan=5+(showItemVendor?2:0)+(showItemPricing?1:0);
  const currentUserRoles=Array.isArray(currentUser?.roles)?currentUser.roles:[];
  const isTenantBillingAdmin=
    currentUser?.user_type==="tenant_admin"||
    currentUser?.user_type==="super_admin"||
    currentUserRoles.includes("tenant_admin")||
    currentUserRoles.includes("super_admin");
  const canApproveAdjustments=
    isTenantBillingAdmin||
    userPermissions.includes("*")||
    userPermissions.includes("billing.manage");
  const hasOpenAdjustment=adjustmentRequests.some((row:any)=>["pending","approved"].includes(String(row.status)));
  const adjustmentClosed=["cancelled","refunded"].includes(String(invoice.status));
  const canRequestAdjustment=!hasOpenAdjustment&&!adjustmentClosed;
  const canRequestCancel=canRequestAdjustment&&numberValue(invoice.paid_amount)<=0;
  const canRequestRefund=canRequestAdjustment&&numberValue(invoice.paid_amount)>0;
  const financialLedgerEntries=ledgerEntries.filter((entry:any)=>
    numberValue(entry.debit_amount)!==0||
    numberValue(entry.credit_amount)!==0||
    numberValue(entry.invoice_total_delta)!==0||
    numberValue(entry.paid_amount_delta)!==0||
    numberValue(entry.balance_amount_delta)!==0
  );
  const settlementRows=[
    ...payments.map((payment:any)=>({
      id:`payment-${payment.id}`,
      date:payment.collected_at,
      type:"Payment",
      method:String(payment.method||"payment").replaceAll("_"," "),
      reference:payment.reference_number||"-",
      status:payment.status||"recorded",
      amount:numberValue(payment.amount),
      tone:"green" as const,
    })),
    ...creditNotes.map((credit:any)=>({
      id:`credit-${credit.id}`,
      date:credit.created_at,
      type:"Credit Note",
      method:credit.credit_note_number||"-",
      reference:credit.reason||"-",
      status:credit.status||"issued",
      amount:-Math.abs(numberValue(credit.amount)),
      tone:"amber" as const,
    })),
  ].sort((a:any,b:any)=>new Date(a.date||0).getTime()-new Date(b.date||0).getTime());
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
                      : invoice.status === "partially_refunded" || invoice.status === "refunded"
                        ? "blue"
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
                <table className={`w-full text-left text-sm ${showItemVendor||showItemPricing?'min-w-[980px]':'min-w-[720px]'}`}>
                  <thead className="bg-slate-100 text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="w-12 px-4 py-3 text-center">No.</th>
                      <th className="px-3 py-3">Item</th>
                      <th className="px-3 py-3 text-right">Quantity</th>
                      {showItemVendor&&<th className="px-3 py-3">Vendor</th>}
                      {showItemVendor&&<th className="px-3 py-3 text-right">Vendor Price</th>}
                      {showItemPricing&&<th className="px-3 py-3 text-right">MRP</th>}
                      <th className="px-3 py-3 text-right">Rate (INR)</th>
                      <th className="px-4 py-3 text-right">Amount (INR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={itemTableColSpan} className="px-4 py-5 text-sm font-semibold text-slate-500">No bill items found.</td>
                      </tr>
                    )}
                    {items.map((item:any,index:number)=>{
                      const itemSupplierOptions=supplierOptions[item.id]||[];
                      const vendorName=item.vendor_name||item.supplier_id||'';
                      const canPickSupplier=showSupplierPicker&&item.item_type==='lab'&&itemSupplierOptions.length>0;
                      return (
                      <tr key={item.id} className="align-middle">
                        <td className="px-4 py-4 text-center table-data tabular-nums">{index+1}</td>
                        <td className="px-3 py-4">
                          <span
                            className="block max-w-[420px] table-data break-words font-bold text-slate-950"
                            title={
                              item.description || itemTypeLabel(item.item_type)
                            }
                          >
                            {item.description || itemTypeLabel(item.item_type)}
                          </span>
                          <span className="mt-1 inline-flex rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                            {itemTypeLabel(item.item_type)}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-right table-data font-bold tabular-nums">{item.quantity}</td>
                        {showItemVendor&&(
                          <td className="px-3 py-4">
                            {canPickSupplier ? (
                              <Select
                                value={item.supplier_id||''}
                                onChange={(event:any)=>updateInvoiceItemSupplier?.(invoice,item,event.target.value)}
                                disabled={busy===`supplier-${item.id}`}
                              >
                                <option value="">No supplier</option>
                                {itemSupplierOptions.map((supplier:any)=>(
                                  <option key={supplier.supplier} value={supplier.supplier}>{supplier.supplier_name} · {money(supplier.buying_price)}</option>
                                ))}
                              </Select>
                            ) : (
                              <span className="table-data font-semibold text-slate-800">
                                {vendorName || "-"}
                              </span>
                            )}
                          </td>
                        )}
                        {showItemVendor&&<td className="px-3 py-4 text-right table-data tabular-nums">{numberValue(item.vendor_amount)>0?money(item.vendor_amount):"-"}</td>}
                        {showItemPricing&&<td className="px-3 py-4 text-right table-data tabular-nums">{money(itemMrp(item))}</td>}
                        <td className="px-3 py-4 text-right table-data font-bold tabular-nums">{money(itemRate(item))}</td>
                        <td className="px-4 py-4 text-right table-data font-black tabular-nums text-slate-950">{money(item.total_amount)}</td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
              {canEditAmount && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
                  {editingAmount ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        autoFocus
                        value={amountDraft}
                        onChange={(e:any)=>setAmountDraft(e.target.value)}
                        className="w-32"
                      />
                      <button
                        type="button"
                        disabled={busy===`amount-${invoice.id}`||amountDraft===""||Number(amountDraft)<0}
                        onClick={()=>{updateInvoiceAmount(invoice,Number(amountDraft));setEditingAmount(false);}}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                      >
                        {busy===`amount-${invoice.id}`?"Saving...":"Save"}
                      </button>
                      <button
                        type="button"
                        onClick={()=>setEditingAmount(false)}
                        className="rounded-lg border px-3 py-2 text-xs font-bold"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs font-bold text-slate-500">
                        Consultation price is editable for this visit type until payment.
                      </span>
                      <button
                        type="button"
                        onClick={()=>{setAmountDraft(String(numberValue(invoice.subtotal_amount)));setEditingAmount(true);}}
                        className="rounded-lg border px-3 py-2 text-xs font-bold hover:bg-white"
                      >
                        Edit amount
                      </button>
                    </>
                  )}
                </div>
              )}
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
                      membershipBenefitNote
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
                      {labSupplierMissing && (
                        <p className="mt-1 text-xs font-bold text-rose-600">
                          Select a supplier for every lab item before collecting payment.
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={busy === invoice.id || enteredTotal <= 0 || remaining < 0 || labSupplierMissing}
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
                    <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
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
                    {downloadReceipt && (
                      <ActionButton
                        onClick={() => downloadReceipt(invoice)}
                        disabled={busy === `download-${invoice.id}`}
                      >
                        {busy === `download-${invoice.id}`
                          ? "Downloading..."
                          : "Download"}
                      </ActionButton>
                    )}
                    {canApproveAdjustments && (
                      <ActionButton onClick={() => issueCreditNote(invoice)}>
                        Credit Note
                      </ActionButton>
                    )}
                    {String(invoice.status) !== "cancelled" ? (
                      <ActionButton
                        onClick={() => cancelInvoice?.(invoice)}
                        disabled={busy === `cancel-${invoice.id}`||numberValue(invoice.paid_amount)>0}
                      >
                        {busy === `cancel-${invoice.id}` ? "Cancelling..." : "Cancel"}
                      </ActionButton>
                    ) : (
                      <ActionButton
                        onClick={() => amendInvoice?.(invoice)}
                        disabled={busy === `amend-${invoice.id}`}
                      >
                        {busy === `amend-${invoice.id}` ? "Amending..." : "Amend"}
                      </ActionButton>
                    )}
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
                    {settlementRows.map((row:any)=>(
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
                        <td className="truncate px-3 py-3 text-slate-600" title={row.reference}>
                          {row.reference}
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={row.tone} className="normal-badge">
                            {row.status}
                          </Badge>
                        </td>
                        <td className={`px-4 py-3 text-right font-black tabular-nums ${amountTone(row.amount)}`}>
                          {signedMoney(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-slate-200">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="card-title font-bold">Refund & Cancellation Requests</h4>
                <p className="table-data text-slate-500">
                  Request, approve, and execute invoice reversals.
                </p>
              </div>
              <ActionGroup className="justify-start">
                <ActionButton
                  onClick={()=>requestAdjustment?.(invoice,"cancel")}
                  disabled={!canRequestCancel}
                >
                  Request Cancel
                </ActionButton>
                <ActionButton
                  onClick={()=>requestAdjustment?.(invoice,"full_refund")}
                  disabled={!canRequestRefund}
                >
                  Request Full Refund
                </ActionButton>
                <ActionButton
                  onClick={()=>requestAdjustment?.(invoice,"partial_refund")}
                  disabled={!canRequestRefund}
                >
                  Request Partial Refund
                </ActionButton>
              </ActionGroup>
            </div>
            <div className="overflow-auto">
              {adjustmentRequests.length===0 ? (
                <p className="p-4 table-data text-slate-500">
                  No refund or cancellation requests yet.
                </p>
              ) : (
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3">Requested</th>
                      <th className="whitespace-nowrap px-4 py-3">Type</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">Amount</th>
                      <th className="whitespace-nowrap px-4 py-3">Reason</th>
                      <th className="whitespace-nowrap px-4 py-3">Requested By</th>
                      <th className="whitespace-nowrap px-4 py-3">Status</th>
                      <th className="whitespace-nowrap px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {adjustmentRequests.map((row:any)=>(
                      <tr key={row.id} className="whitespace-nowrap align-middle">
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          {displayDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-3 font-bold capitalize">
                          {String(row.request_type||"").replaceAll("_"," ")}
                        </td>
                        <td className="px-4 py-3 text-right font-black tabular-nums">
                          {money(row.amount)}
                        </td>
                        <td className="max-w-[260px] truncate px-4 py-3 font-semibold text-slate-600" title={row.reason}>
                          {row.reason}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          {row.requested_by_user_name||"Unknown user"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              row.status==="executed"?"green":
                              row.status==="rejected"?"red":
                              row.status==="approved"?"blue":"amber"
                            }
                            className="normal-badge"
                          >
                            {row.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {canApproveAdjustments&&row.status==="pending" ? (
                            <ActionGroup>
                              <ActionButton onClick={()=>approveAdjustment?.(row)}>Approve</ActionButton>
                              <ActionButton tone="danger" onClick={()=>rejectAdjustment?.(row)}>Reject</ActionButton>
                            </ActionGroup>
                          ) : canApproveAdjustments&&row.status==="approved"&&!adjustmentClosed ? (
                            <ActionButton onClick={()=>executeAdjustment?.(row)}>
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

          {canApproveAdjustments && (
            <div className="mt-5 rounded-lg border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h4 className="card-title font-bold">Billing Ledger</h4>
                <p className="table-data text-slate-500">
                  Financial impact from invoice, payment, cancellation, and refund activity.
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
                        <th className="whitespace-nowrap px-4 py-3">Date & Time</th>
                        <th className="whitespace-nowrap px-4 py-3">Activity</th>
                        <th className="whitespace-nowrap px-4 py-3">User</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">Debit</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">Credit</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">Invoice</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">Paid</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">Balance</th>
                        <th className="whitespace-nowrap px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {financialLedgerEntries.map((entry:any)=>(
                        <tr key={entry.id} className="whitespace-nowrap align-middle">
                          <td className="px-4 py-3 font-semibold text-slate-700">
                            {displayDateTime(entry.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold capitalize text-slate-950">
                              {String(entry.entry_type||"").replaceAll("_"," ")}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-700">
                            {entry.actor_user_name||"Unknown user"}
                          </td>
                          <td className={`px-4 py-3 text-right font-black tabular-nums ${amountTone(entry.debit_amount,"debit")}`}>
                            {signedMoney(entry.debit_amount,"debit")}
                          </td>
                          <td className={`px-4 py-3 text-right font-black tabular-nums ${amountTone(entry.credit_amount,"credit")}`}>
                            {signedMoney(entry.credit_amount,"credit")}
                          </td>
                          <td className={`px-4 py-3 text-right font-black tabular-nums ${amountTone(entry.invoice_total_delta)}`}>
                            {signedMoney(entry.invoice_total_delta)}
                          </td>
                          <td className={`px-4 py-3 text-right font-black tabular-nums ${amountTone(entry.paid_amount_delta)}`}>
                            {signedMoney(entry.paid_amount_delta)}
                          </td>
                          <td className={`px-4 py-3 text-right font-black tabular-nums ${amountTone(entry.balance_amount_delta)}`}>
                            {signedMoney(entry.balance_amount_delta)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              tone={entry.status_after==="cancelled"?"amber":"slate"}
                              className="normal-badge"
                            >
                              {entry.status_after}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
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
