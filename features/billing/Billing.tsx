'use client';

import {useEffect,useMemo,useState} from 'react';
import {ActionButton,ActionGroup,Badge,Button,Card,Input,Select} from '@/components/ui';
import {apiBlob,apiFetch} from '@/lib/api';

function invoiceSource(invoice:any){
  if(invoice.lab_order_id) return {label:'Lab / Scan',tone:'blue'};
  if(invoice.pharmacy_issue_id) return {label:'Pharmacy',tone:'amber'};
  if(invoice.physiotherapy_case_id) return {label:'Physiotherapy',tone:'purple'};
  if(invoice.ip_admission_id) return {label:'IP Billing',tone:'blue'};
  if(invoice.consultation_id||invoice.appointment_id) return {label:'Consultation',tone:'slate'};
  return {label:'Direct',tone:'amber'};
}

function invoiceLinkedRecord(invoice:any){
  if(invoice.ip_admission_id) return {label:'IP Admission',value:invoice.ip_admission_id};
  if(invoice.physiotherapy_case_id) return {label:'Physiotherapy Case',value:invoice.physiotherapy_case_id};
  if(invoice.pharmacy_issue_id) return {label:'Pharmacy Issue',value:invoice.pharmacy_issue_id};
  if(invoice.lab_order_id) return {label:'Lab / Scan Order',value:invoice.lab_order_id};
  if(invoice.consultation_id) return {label:'Consultation',value:invoice.consultation_id};
  if(invoice.appointment_id) return {label:'Appointment',value:invoice.appointment_id};
  return {label:'Invoice Record',value:invoice.id};
}

function money(value:any){
  return `₹${Number(value||0).toLocaleString('en-IN')}`;
}

function itemTypeLabel(type:any){
  const labels:Record<string,string>={
    consultation:'Consultation',
    lab:'Lab / Scan',
    pharmacy:'Medicine',
    ip_room:'IP Room',
    ip_consultation:'IP Doctor',
    ip_medication:'IP Medicine',
    ip_lab:'IP Lab / Scan',
    ip_charge:'IP Charge',
    physiotherapy:'Physiotherapy',
  };
  return labels[String(type||'')]||String(type||'Service').replaceAll('_',' ');
}

export function Billing({apiSession,loadLiveData,appointments,patients,liveInvoices}:any){
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const [amounts,setAmounts]=useState<Record<string,string>>({});
  const [methods,setMethods]=useState<Record<string,string>>({});
  const [references,setReferences]=useState<Record<string,string>>({});
  const [dueReport,setDueReport]=useState<any>(null);
  const [revenueReport,setRevenueReport]=useState<any>(null);
  const [settlement,setSettlement]=useState<any>(null);
  const [detail,setDetail]=useState<any>(null);
  const [detailLoading,setDetailLoading]=useState('');

  const patientMap=useMemo(()=>new Map(patients.map((p:any)=>[p.id,p])),[patients]);
  const invoices=useMemo(
    ()=>
      [...(liveInvoices||[])].sort(
        (a:any,b:any)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime(),
      ),
    [liveInvoices],
  );
  const invoicedConsultations=new Set(invoices.map((i:any)=>i.consultation_id).filter(Boolean));
  const signedReady=appointments.filter((a:any)=>a.consultationId&&a.consultationStatus==='signed'&&!invoicedConsultations.has(a.consultationId));

  useEffect(()=>{if(apiSession)loadReports()},[apiSession?.token,apiSession?.tenantId,invoices.length]);

  async function loadReports(){
    if(!apiSession)return;
    try{
      const [due,revenue,summary]=await Promise.all([
        apiFetch('/billing/reports/due-collection',apiSession),
        apiFetch('/billing/reports/revenue?group_by=doctor',apiSession),
        apiFetch('/billing/doctor-settlements/summary',apiSession),
      ]);
      setDueReport(due);
      setRevenueReport(revenue);
      setSettlement(summary);
    }catch{}
  }

  async function generateInvoice(a:any){
    if(!apiSession)return;
    setBusy(a.id);
    setMessage('');
    try{
      await apiFetch('/billing/invoices/from-consultation',apiSession,{
        method:'POST',
        body:JSON.stringify({consultation_id:a.consultationId,discount_amount:0,created_by_user_id:apiSession.user?.id}),
      });
      await loadLiveData(apiSession);
      await loadReports();
      setMessage(`Invoice generated for ${a.patient}.`);
    }catch(err:any){setMessage(err.message||'Could not generate invoice.')}
    finally{setBusy('')}
  }

  async function refreshConsultationInvoice(invoice:any){
    if(!apiSession||!invoice.consultation_id)return;
    setBusy(`refresh-${invoice.id}`);
    setMessage('');
    try{
      await apiFetch('/billing/invoices/from-consultation',apiSession,{
        method:'POST',
        body:JSON.stringify({
          consultation_id:invoice.consultation_id,
          discount_amount:invoice.discount_amount||0,
          created_by_user_id:apiSession.user?.id,
        }),
      });
      await loadLiveData(apiSession);
      await loadReports();
      setMessage(`Invoice refreshed for ${invoice.invoice_number}.`);
    }catch(err:any){setMessage(err.message||'Could not refresh invoice items.')}
    finally{setBusy('')}
  }

  async function openInvoiceDetail(invoice:any){
    if(!apiSession)return;
    setDetailLoading(invoice.id);
    setMessage('');
    try{
      const row=await apiFetch(`/billing/invoices/${invoice.id}`,apiSession);
      setDetail(row);
    }catch(err:any){setMessage(err.message||'Could not load invoice details.')}
    finally{setDetailLoading('')}
  }

  async function collectPayment(invoice:any){
    if(!apiSession)return;
    const amount=Number(amounts[invoice.id]||invoice.balance_amount||0);
    if(!amount){setMessage('Enter payment amount.');return}
    setBusy(invoice.id);
    setMessage('');
    try{
      await apiFetch(`/billing/invoices/${invoice.id}/payments`,apiSession,{
        method:'POST',
        body:JSON.stringify({
          method:methods[invoice.id]||'cash',
          amount,
          reference_number:references[invoice.id]||null,
          collected_by_user_id:apiSession.user?.id,
        }),
      });
      await loadLiveData(apiSession);
      await loadReports();
      setAmounts({...amounts,[invoice.id]:''});
      setReferences({...references,[invoice.id]:''});
      setMessage(`Payment recorded for ${invoice.invoice_number}.`);
    }catch(err:any){setMessage(err.message||'Could not record payment.')}
    finally{setBusy('')}
  }

  async function issueCreditNote(invoice:any){
    if(!apiSession)return;
    const reason=window.prompt(`Credit note reason for ${invoice.invoice_number}`);
    if(!reason)return;
    setBusy(invoice.id);
    try{
      await apiFetch(`/billing/invoices/${invoice.id}/credit-notes`,apiSession,{
        method:'POST',
        body:JSON.stringify({
          amount:Math.max(1,invoice.balance_amount||invoice.total_amount),
          reason,
          created_by_user_id:apiSession.user?.id,
        }),
      });
      setMessage(`Credit note issued for ${invoice.invoice_number}.`);
    }catch(err:any){setMessage(err.message||'Could not issue credit note.')}
    finally{setBusy('')}
  }

  async function openReceipt(invoice:any){
    if(!apiSession)return;
    setBusy(invoice.id);
    try{
      const blob=await apiBlob(`/billing/invoices/${invoice.id}/receipt.pdf`,apiSession);
      const url=URL.createObjectURL(blob);
      window.open(url,'_blank','noopener,noreferrer');
      setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch(err:any){setMessage(err.message||'Could not open receipt.')}
    finally{setBusy('')}
  }

  async function finalizeSettlement(){
    if(!apiSession)return;
    setBusy('settlement');
    try{
      const saved=await apiFetch('/billing/doctor-settlements/finalize',apiSession,{
        method:'POST',
        body:JSON.stringify({finalized_by_user_id:apiSession.user?.id}),
      });
      setSettlement(saved);
      setMessage(`Doctor settlement finalized for ${money(saved.settlement_amount)}.`);
    }catch(err:any){setMessage(err.message||'Could not finalize settlement.')}
    finally{setBusy('')}
  }

  if(!apiSession){
    return <Card><h3 className="text-lg font-bold">Invoices / Billing</h3><p className="mt-2 text-sm text-slate-500">Backend login is required to view billing data.</p></Card>;
  }

  return (
    <div className="space-y-6">
      {detail&&(
        <InvoiceDetailModal
          detail={detail}
          patient={patientMap.get(detail.invoice?.patient_id)}
          onClose={()=>setDetail(null)}
        />
      )}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-slate-500">Due Collection</p><p className="mt-1 text-2xl font-bold">{money(dueReport?.total_due_amount)}</p><p className="text-xs text-slate-500">{dueReport?.invoice_count??0} invoices</p></Card>
        <Card><p className="text-sm text-slate-500">Revenue</p><p className="mt-1 text-2xl font-bold">{money(revenueReport?.total_invoice_amount)}</p><p className="text-xs text-slate-500">Tax {money(revenueReport?.total_tax_amount)}</p></Card>
        <Card><p className="text-sm text-slate-500">Paid</p><p className="mt-1 text-2xl font-bold">{money(revenueReport?.total_paid_amount)}</p><p className="text-xs text-slate-500">Doctor share {money(revenueReport?.total_doctor_share)}</p></Card>
        <Card><p className="text-sm text-slate-500">Settlement</p><p className="mt-1 text-2xl font-bold">{money(settlement?.doctor_share_paid_basis??settlement?.settlement_amount)}</p><button type="button" onClick={finalizeSettlement} className="mt-2 rounded-xl border px-3 py-2 text-xs font-bold" disabled={busy==='settlement'}>Finalize</button></Card>
      </div>

      <Card>
        <h3 className="text-lg font-bold">Invoice Generation</h3>
        <p className="text-sm text-slate-500">Signed consultations ready for billing. Lab, prescription, IP, and physiotherapy invoices appear in the invoice list after their module creates or links billing.</p>
        {message&&<div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
        <div className="mt-4 grid gap-3">
          {signedReady.length===0&&<div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No signed consultations waiting for invoice.</div>}
          {signedReady.map((a:any)=>(
            <div key={a.id} className="flex flex-col justify-between gap-3 rounded-2xl border p-4 md:flex-row md:items-center">
              <div><b>{a.token} · {a.patient}</b><p className="text-sm text-slate-500">Consultation: {a.consultationId}</p></div>
              <Button disabled={busy===a.id} onClick={()=>generateInvoice(a)}>{busy===a.id?'Generating...':'Generate Invoice'}</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <div>
            <h3 className="text-lg font-bold">Invoices & Payments</h3>
            <p className="text-sm text-slate-500">Track invoice source, patient dues, doctor share, and payment collection in one list.</p>
          </div>
          <Badge tone="slate">{invoices.length} invoices</Badge>
        </div>
        <div className="scrollbar-hidden mt-4 overflow-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[1740px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[180px]" />
              <col className="w-[170px]" />
              <col className="w-[170px]" />
              <col className="w-[120px]" />
              <col className="w-[105px]" />
              <col className="w-[105px]" />
              <col className="w-[130px]" />
              <col className="w-[560px]" />
              <col className="w-[420px]" />
            </colgroup>
            <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Patient</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3 text-right">Paid</th>
                <th className="px-3 py-3 text-right">Doctor Share</th>
                <th className="px-3 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.length===0&&<tr><td colSpan={9} className="px-4 py-4 text-slate-500">No invoices yet.</td></tr>}
              {invoices.map((invoice:any)=>{
                const p:any=patientMap.get(invoice.patient_id);
                const source=invoiceSource(invoice);
                return (
                  <tr key={invoice.id} onClick={()=>openInvoiceDetail(invoice)} className="group cursor-pointer align-middle hover:bg-slate-50">
                    <td className="px-4 py-4"><b>{invoice.invoice_number}</b><p className="text-xs text-slate-500">{invoice.id}</p></td>
                    <td className="px-3 py-4"><Badge tone={source.tone as any}>{source.label}</Badge>{invoice.physiotherapy_case_id&&<p className="mt-1 truncate text-xs text-slate-500">{invoice.physiotherapy_case_id}</p>}</td>
                    <td className="px-3 py-4 font-medium">{p?.name||invoice.patient_id}</td>
                    <td className="px-3 py-4"><Badge tone={invoice.status==='paid'?'green':invoice.status==='partially_paid'?'amber':'slate'}>{invoice.status}</Badge></td>
                    <td className="px-3 py-4 text-right font-semibold tabular-nums">{money(invoice.total_amount)}</td>
                    <td className="px-3 py-4 text-right tabular-nums">{money(invoice.paid_amount)}</td>
                    <td className="px-3 py-4 text-right tabular-nums">{money(invoice.doctor_share_amount)}</td>
                    <td className="px-3 py-3 pr-10" onClick={(event)=>event.stopPropagation()}>
                      {invoice.balance_amount>0?(
                        <div className="grid w-[440px] grid-cols-[108px_108px_132px_68px] items-center gap-2">
                          <Select value={methods[invoice.id]||'cash'} onChange={(e:any)=>setMethods({...methods,[invoice.id]:e.target.value})}><option value="cash">Cash</option><option value="upi">UPI</option><option value="gpay">GPay</option><option value="paytm">Paytm</option><option value="credit_card">Credit Card</option><option value="debit_card">Debit Card</option><option value="bank_transfer">Bank</option></Select>
                          <Input className="text-right tabular-nums" type="number" min="1" max={invoice.balance_amount} value={amounts[invoice.id]??invoice.balance_amount} onChange={(e:any)=>setAmounts({...amounts,[invoice.id]:e.target.value})}/>
                          <Input placeholder="Reference" value={references[invoice.id]||''} onChange={(e:any)=>setReferences({...references,[invoice.id]:e.target.value})}/>
                          <Button className="px-3" disabled={busy===invoice.id} onClick={()=>collectPayment(invoice)}>{busy===invoice.id?'Saving...':'Pay'}</Button>
                        </div>
                      ):<div className="flex items-center"><Badge tone="green">Settled</Badge></div>}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(event)=>event.stopPropagation()}>
                      <ActionGroup className="min-w-[380px]">
                        <ActionButton onClick={()=>openInvoiceDetail(invoice)} disabled={detailLoading===invoice.id}>{detailLoading===invoice.id?'Loading...':'View'}</ActionButton>
                        {invoice.consultation_id&&!invoice.lab_order_id&&!invoice.pharmacy_issue_id&&!invoice.ip_admission_id&&!invoice.physiotherapy_case_id&&(
                          <ActionButton
                            onClick={()=>refreshConsultationInvoice(invoice)}
                            disabled={busy===`refresh-${invoice.id}`}
                          >
                            {busy===`refresh-${invoice.id}`?'Refreshing...':'Refresh Items'}
                          </ActionButton>
                        )}
                        <ActionButton onClick={()=>openReceipt(invoice)}>Receipt</ActionButton>
                        <ActionButton onClick={()=>issueCreditNote(invoice)}>Credit Note</ActionButton>
                      </ActionGroup>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function InvoiceDetailModal({detail,patient,onClose}:any){
  const invoice=detail.invoice||{};
  const items=detail.items||[];
  const payments=detail.payments||[];
  const source=invoiceSource(invoice);
  const linkedRecord=invoiceLinkedRecord(invoice);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <Card className="scrollbar-hidden max-h-[90vh] w-full max-w-6xl overflow-auto">
        <div className="sticky top-0 z-10 -mx-6 -mt-6 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-bold">{source.label} Invoice</h3>
                <Badge tone={invoice.status==='paid'?'green':invoice.status==='partially_paid'?'amber':'slate'}>{invoice.status}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <b>{invoice.invoice_number}</b>
                <span className="text-slate-500">{patient?.name||patient?.full_name||invoice.patient_id}</span>
                <span className="text-slate-500">{invoice.id}</span>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-2xl border px-4 py-3 text-sm font-bold hover:bg-slate-50">Close</button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <DetailStat title="Invoice Type" value={source.label}/>
          <DetailStat title={linkedRecord.label} value={linkedRecord.value}/>
          <DetailStat title="Patient" value={patient?.name||patient?.full_name||invoice.patient_id}/>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <DetailStat title="Subtotal" value={money(invoice.subtotal_amount)}/>
          <DetailStat title="Discount" value={money(invoice.discount_amount)}/>
          <DetailStat title="Tax" value={money(invoice.tax_amount)}/>
          <DetailStat title="Total" value={money(invoice.total_amount)}/>
          <DetailStat title="Paid" value={money(invoice.paid_amount)}/>
          <DetailStat title="Balance" value={money(invoice.balance_amount)}/>
          <DetailStat title="Doctor Share" value={money(invoice.doctor_share_amount)}/>
          <DetailStat title="Clinic Share" value={money(invoice.clinic_share_amount)}/>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h4 className="font-bold">{source.label} Bill Items</h4>
            <p className="text-xs text-slate-500">Items are shown only for this invoice source and linked record.</p>
          </div>
          <div className="scrollbar-hidden overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-3 py-3">Description</th>
                  <th className="px-3 py-3 text-right">Qty</th>
                  <th className="px-3 py-3 text-right">Rate</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.length===0&&<tr><td colSpan={5} className="px-4 py-4 text-slate-500">No bill items found.</td></tr>}
                {items.map((item:any)=>(
                  <tr key={item.id}>
                    <td className="px-4 py-4"><Badge tone="slate">{itemTypeLabel(item.item_type)}</Badge></td>
                    <td className="max-w-[520px] px-3 py-4">{item.description}</td>
                    <td className="px-3 py-4 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-3 py-4 text-right tabular-nums">{money(item.unit_amount)}</td>
                    <td className="px-4 py-4 text-right font-bold tabular-nums">{money(item.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h4 className="font-bold">Payments</h4>
          </div>
          <div className="grid gap-2 p-4">
            {payments.length===0&&<p className="text-sm text-slate-500">No payments recorded yet.</p>}
            {payments.map((payment:any)=>(
              <div key={payment.id} className="flex flex-col justify-between gap-2 rounded-2xl bg-slate-50 p-3 text-sm md:flex-row md:items-center">
                <div>
                  <b className="capitalize">{String(payment.method||'payment').replaceAll('_',' ')}</b>
                  <p className="text-xs text-slate-500">{payment.reference_number||payment.id}</p>
                </div>
                <Badge tone={payment.status==='recorded'?'green':'amber'}>{payment.status}</Badge>
                <b>{money(payment.amount)}</b>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function DetailStat({title,value}:any){
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{title}</p><p className="mt-1 break-words text-lg font-bold">{value}</p></div>;
}
