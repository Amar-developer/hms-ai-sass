'use client';

import {useEffect,useMemo,useState} from 'react';
import {ActionButton,ActionGroup,Badge,Button,Card,Field,Input,Select} from '@/components/ui';
import {apiBlob,apiFetch} from '@/lib/api';

const pageSize=10;

function invoiceSourceKey(invoice:any){
  if(invoice.lab_order_id) return 'lab_scan';
  if(invoice.pharmacy_issue_id) return 'pharmacy';
  if(invoice.physiotherapy_case_id) return 'physiotherapy';
  if(invoice.ip_admission_id) return 'ip_billing';
  if(invoice.consultation_id||invoice.appointment_id) return 'consultation';
  return 'direct';
}

function invoiceSource(invoice:any){
  const sources:Record<string,{label:string,tone:'slate'|'blue'|'amber'|'purple'}>={
    lab_scan:{label:'Lab / Scan',tone:'blue'},
    pharmacy:{label:'Pharmacy',tone:'amber'},
    physiotherapy:{label:'Physiotherapy',tone:'purple'},
    ip_billing:{label:'IP Billing',tone:'blue'},
    consultation:{label:'Consultation',tone:'slate'},
    direct:{label:'Direct',tone:'amber'},
  };
  return sources[invoiceSourceKey(invoice)]||sources.direct;
}

function invoiceLinkedRecord(invoice:any){
  if(invoice.ip_admission_id) return 'IP admission';
  if(invoice.physiotherapy_case_id) return 'Physiotherapy case';
  if(invoice.pharmacy_issue_id) return 'Pharmacy issue';
  if(invoice.lab_order_id) return 'Lab / Scan order';
  if(invoice.consultation_id) return 'Consultation';
  if(invoice.appointment_id) return 'Appointment';
  return 'Direct invoice';
}

function money(value:any){
  return `₹${Number(value||0).toLocaleString('en-IN')}`;
}

function invoiceDateKey(invoice:any){
  const raw=invoice.invoice_date||invoice.created_at||invoice.updated_at||invoice.paid_at;
  if(!raw)return '';
  if(typeof raw==='string')return raw.slice(0,10);
  const date=new Date(raw);
  return Number.isNaN(date.getTime())?'':date.toISOString().slice(0,10);
}

function formatInvoiceDate(invoice:any){
  const key=invoiceDateKey(invoice);
  if(!key)return '-';
  const date=new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime())?key:date.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});
}

function invoicePaidStatus(invoice:any){
  const paid=Number(invoice.paid_amount||0);
  const balance=Number(invoice.balance_amount||0);
  const status=String(invoice.status||'').toLowerCase();
  if(status==='paid'||balance<=0)return 'paid';
  if(status==='partially_paid'||paid>0)return 'partially_paid';
  return 'unpaid';
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
  const [filters,setFilters]=useState({
    query:'',
    source:'all',
    paidStatus:'all',
    fromDate:'',
    toDate:'',
  });
  const [page,setPage]=useState(1);

  const patientMap=useMemo(()=>new Map(patients.map((p:any)=>[p.id,p])),[patients]);
  const invoices=useMemo(
    ()=>
      [...(liveInvoices||[])].sort(
        (a:any,b:any)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime(),
      ),
    [liveInvoices],
  );
  const sourceOptions=useMemo(()=>{
    const seen=new Set<string>();
    return invoices
      .map((invoice:any)=>({key:invoiceSourceKey(invoice),...invoiceSource(invoice)}))
      .filter((source:any)=>{
        if(seen.has(source.key))return false;
        seen.add(source.key);
        return true;
      });
  },[invoices]);
  const filteredInvoices=useMemo(()=>invoices.filter((invoice:any)=>{
    const source=invoiceSource(invoice);
    const patient:any=patientMap.get(invoice.patient_id);
    const haystack=[
      invoice.invoice_number,
      patient?.name,
      patient?.full_name,
      patient?.patient_number,
      source.label,
      invoice.status,
    ].filter(Boolean).join(' ').toLowerCase();
    const query=filters.query.trim().toLowerCase();
    if(query&&!haystack.includes(query))return false;
    if(filters.source!=='all'&&invoiceSourceKey(invoice)!==filters.source)return false;
    if(filters.paidStatus==='due'){
      if(Number(invoice.balance_amount||0)<=0)return false;
    }else if(filters.paidStatus!=='all'&&invoicePaidStatus(invoice)!==filters.paidStatus)return false;
    const dateKey=invoiceDateKey(invoice);
    if(filters.fromDate&&(!dateKey||dateKey<filters.fromDate))return false;
    if(filters.toDate&&(!dateKey||dateKey>filters.toDate))return false;
    return true;
  }),[filters,invoices,patientMap]);
  const totalPages=Math.max(1,Math.ceil(filteredInvoices.length/pageSize));
  const safePage=Math.min(page,totalPages);
  const invoicePageRows=filteredInvoices.slice((safePage-1)*pageSize,safePage*pageSize);
  const invoicedConsultations=new Set(invoices.map((i:any)=>i.consultation_id).filter(Boolean));
  const signedReady=appointments.filter((a:any)=>a.consultationId&&a.consultationStatus==='signed'&&!invoicedConsultations.has(a.consultationId));
  const payableSettlement=Number(settlement?.payable_settlement_amount??settlement?.doctor_share_paid_basis??settlement?.settlement_amount??0);
  const finalizedSettlement=Number(settlement?.finalized_settlement_amount??0);
  const canFinalizeSettlement=Boolean(settlement?.can_finalize??payableSettlement>0);

  useEffect(()=>{if(apiSession)loadReports()},[apiSession?.token,apiSession?.tenantId,invoices.length]);
  useEffect(()=>{setPage(1)},[filters.query,filters.source,filters.paidStatus,filters.fromDate,filters.toDate]);
  useEffect(()=>{if(page!==safePage)setPage(safePage)},[page,safePage]);

  function updateFilter(key:string,value:string){
    setFilters((current)=>({...current,[key]:value}));
  }

  function clearFilters(){
    setFilters({query:'',source:'all',paidStatus:'all',fromDate:'',toDate:''});
  }

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
      await loadReports();
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
        <Card><p className="text-sm text-slate-500">Revenue</p><p className="mt-1 text-2xl font-bold">{money(revenueReport?.total_invoice_amount)}</p><p className="text-xs text-slate-500">Collected invoice value</p></Card>
        <Card><p className="text-sm text-slate-500">Paid</p><p className="mt-1 text-2xl font-bold">{money(revenueReport?.total_paid_amount)}</p><p className="text-xs text-slate-500">Settlement {money(revenueReport?.total_doctor_share)}</p></Card>
        <Card>
          <p className="text-sm text-slate-500">Settlement</p>
          <p className="mt-1 text-2xl font-bold">{money(payableSettlement)}</p>
          <p className="text-xs text-slate-500">
            {finalizedSettlement>0?`Finalized ${money(finalizedSettlement)}`:'No finalized settlement yet'}
          </p>
          {canFinalizeSettlement?(
            <button type="button" onClick={finalizeSettlement} className="mt-2 rounded-xl border px-3 py-2 text-xs font-bold" disabled={busy==='settlement'}>
              {busy==='settlement'?'Finalizing...':'Finalize'}
            </button>
          ):(
            <Badge tone="green">Finalized</Badge>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="text-lg font-bold">Invoice Generation</h3>
        <p className="text-sm text-slate-500">Signed consultations ready for billing. Lab, prescription, IP, and physiotherapy invoices appear in the invoice list after their module creates or links billing.</p>
        {message&&<div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
        <div className="mt-4 grid gap-3">
          {signedReady.length===0&&<div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No signed consultations waiting for invoice.</div>}
          {signedReady.map((a:any)=>(
            <div key={a.id} className="flex flex-col justify-between gap-3 rounded-2xl border p-4 md:flex-row md:items-center">
              <div><b>{a.token} · {a.patient}</b><p className="text-sm text-slate-500">Signed consultation ready for billing</p></div>
              <Button disabled={busy===a.id} onClick={()=>generateInvoice(a)}>{busy===a.id?'Generating...':'Generate Invoice'}</Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-end">
          <div>
            <h3 className="text-lg font-bold">Invoices & Payments</h3>
            <p className="text-sm text-slate-500">Track invoice source, patient dues, settlement share, and payment collection in one list.</p>
          </div>
          <Badge tone="slate">{filteredInvoices.length} of {invoices.length} invoices</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.2fr_.85fr_.85fr_.75fr_.75fr_auto] xl:items-end">
          <Field label="Search">
            <Input value={filters.query} onChange={(e:any)=>updateFilter('query',e.target.value)} placeholder="Invoice, patient, source"/>
          </Field>
          <Field label="Source">
            <Select value={filters.source} onChange={(e:any)=>updateFilter('source',e.target.value)}>
              <option value="all">All sources</option>
              {sourceOptions.map((source:any)=><option key={source.key} value={source.key}>{source.label}</option>)}
            </Select>
          </Field>
          <Field label="Paid Status">
            <Select value={filters.paidStatus} onChange={(e:any)=>updateFilter('paidStatus',e.target.value)}>
              <option value="all">All payments</option>
              <option value="paid">Paid</option>
              <option value="due">Due</option>
              <option value="partially_paid">Partially paid</option>
              <option value="unpaid">Unpaid</option>
            </Select>
          </Field>
          <Field label="From Date">
            <Input type="date" value={filters.fromDate} onChange={(e:any)=>updateFilter('fromDate',e.target.value)}/>
          </Field>
          <Field label="To Date">
            <Input type="date" value={filters.toDate} onChange={(e:any)=>updateFilter('toDate',e.target.value)}/>
          </Field>
          <button type="button" onClick={clearFilters} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
            Clear
          </button>
        </div>
        <div className="scrollbar-hidden mt-4 overflow-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[1740px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[80px]" />
              <col className="w-[170px]" />
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
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Patient</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3 text-right">Paid</th>
                <th className="px-3 py-3 text-right">Settlement</th>
                <th className="px-3 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredInvoices.length===0&&<tr><td colSpan={10} className="px-4 py-4 text-slate-500">{invoices.length===0?'No invoices yet.':'No invoices match the selected filters.'}</td></tr>}
              {invoicePageRows.map((invoice:any,index:number)=>{
                const p:any=patientMap.get(invoice.patient_id);
                const source=invoiceSource(invoice);
                const rowNumber=(safePage-1)*pageSize+index+1;
                return (
                  <tr key={invoice.id} onClick={()=>openInvoiceDetail(invoice)} className="group cursor-pointer align-middle hover:bg-slate-50">
                    <td className="px-4 py-4 font-semibold text-slate-500">{rowNumber}</td>
                    <td className="px-4 py-4"><b>{invoice.invoice_number}</b><p className="mt-1 text-xs font-semibold text-slate-400">{formatInvoiceDate(invoice)}</p></td>
                    <td className="px-3 py-4"><Badge tone={source.tone as any}>{source.label}</Badge></td>
                    <td className="px-3 py-4 font-medium">{p?.name||p?.full_name||'Patient'}</td>
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
        <Pagination page={safePage} totalPages={totalPages} total={filteredInvoices.length} onPage={setPage}/>
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
                <span className="text-slate-500">{patient?.name||patient?.full_name||'Patient'}</span>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-2xl border px-4 py-3 text-sm font-bold hover:bg-slate-50">Close</button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <DetailStat title="Invoice Type" value={source.label}/>
          <DetailStat title="Source Record" value={linkedRecord}/>
          <DetailStat title="Patient" value={patient?.name||patient?.full_name||'Patient'}/>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <DetailStat title="Subtotal" value={money(invoice.subtotal_amount)}/>
          <DetailStat title="Discount" value={money(invoice.discount_amount)}/>
          <DetailStat title="Membership Benefit" value={money(invoice.membership_discount_amount)}/>
          <DetailStat title="Total" value={money(invoice.total_amount)}/>
          <DetailStat title="Paid" value={money(invoice.paid_amount)}/>
          <DetailStat title="Balance" value={money(invoice.balance_amount)}/>
          <DetailStat title="Settlement" value={money(invoice.doctor_share_amount)}/>
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
                  {payment.reference_number&&<p className="text-xs text-slate-500">{payment.reference_number}</p>}
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

function Pagination({page,totalPages,total,onPage}:any){
  const start=total===0?0:(page-1)*pageSize+1;
  const end=Math.min(page*pageSize,total);
  return <div className="mt-4 flex flex-col justify-between gap-3 text-sm text-slate-500 sm:flex-row sm:items-center"><span>Showing {start}-{end} of {total}</span><div className="flex gap-2"><button type="button" onClick={()=>onPage(Math.max(1,page-1))} disabled={page<=1} className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300">Previous</button><span className="rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-700">Page {page} / {totalPages}</span><button type="button" onClick={()=>onPage(Math.min(totalPages,page+1))} disabled={page>=totalPages} className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300">Next</button></div></div>;
}
