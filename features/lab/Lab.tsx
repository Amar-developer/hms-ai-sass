'use client';

import {useEffect,useMemo,useState} from 'react';
import {ActionButton,ActionGroup,Badge,Button,Card,Field,Input,Select} from '@/components/ui';
import {apiBlob,apiFetch} from '@/lib/api';

const pageSize=10;

export function Lab({apiSession,branchId,patients,appointments}:any){
 const [orders,setOrders]=useState<any[]>([]);
 const [tests,setTests]=useState<any[]>([]);
 const [packages,setPackages]=useState<any[]>([]);
 const [templates,setTemplates]=useState<any[]>([]);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState('');
 const [patientId,setPatientId]=useState(patients[0]?.id||'');
 const [source,setSource]=useState('op_direct');
 const [externalReferrer,setExternalReferrer]=useState('');
 const [manualTests,setManualTests]=useState('CBC');
 const [selectedTestIds,setSelectedTestIds]=useState<string[]>([]);
 const [orderTestId,setOrderTestId]=useState('');
 const [orderTestIds,setOrderTestIds]=useState<string[]>([]);
 const [selectedPackageId,setSelectedPackageId]=useState('');
 const [testName,setTestName]=useState('Complete Blood Count');
 const [testCode,setTestCode]=useState('CBC');
 const [sampleType,setSampleType]=useState('Blood');
 const [price,setPrice]=useState('350');
 const [templateName,setTemplateName]=useState('Standard Result Template');
 const [resultText,setResultText]=useState<Record<string,string>>({});
 const [reportUrl,setReportUrl]=useState<Record<string,string>>({});
 const [selectedOrder,setSelectedOrder]=useState<any>(null);
 const [viewConsult,setViewConsult]=useState<any>(null);
 const [consultDetail,setConsultDetail]=useState<any>(null);
 const [loadingDetail,setLoadingDetail]=useState(false);
 const [page,setPage]=useState(1);
 const orderedConsultationIds=useMemo(()=>new Set(orders.map((order:any)=>order.consultation_id).filter(Boolean)),[orders]);
 const labReady=useMemo(()=>appointments.filter((a:any)=>a.consultationId&&a.consultationStatus==='signed'&&!orderedConsultationIds.has(a.consultationId)),[appointments,orderedConsultationIds]);
 const totalPages=Math.max(1,Math.ceil(orders.length/pageSize));
 const safePage=Math.min(page,totalPages);
 const labPageRows=orders.slice((safePage-1)*pageSize,safePage*pageSize);
 const patientMap=useMemo(()=>new Map(patients.map((p:any)=>[p.id,p])),[patients]);

 useEffect(()=>{if(!patientId&&patients[0]?.id)setPatientId(patients[0].id)},[patients,patientId]);
 useEffect(()=>{load()},[apiSession?.token,apiSession?.tenantId]);
 useEffect(()=>{if(!orderTestId&&tests[0]?.id)setOrderTestId(tests[0].id)},[tests,orderTestId]);
 useEffect(()=>{if(page!==safePage)setPage(safePage)},[page,safePage]);

 async function load(){
  if(!apiSession){setOrders([]);return}
  try{
   const [orderRows,testRows,packageRows,templateRows]=await Promise.all([
    apiFetch('/lab/orders',apiSession),
    apiFetch('/lab/catalog/tests',apiSession),
    apiFetch('/lab/catalog/packages',apiSession),
    apiFetch('/lab/result-templates',apiSession),
   ]);
   setOrders(orderRows);setTests(testRows);setPackages(packageRows);setTemplates(templateRows);
  }catch(err:any){setMessage(err.message||'Could not load lab workspace.')}
 }

 async function createTest(e:any){
  e.preventDefault();if(!apiSession)return;setBusy('test');setMessage('');
  try{
   await apiFetch('/lab/catalog/tests',apiSession,{method:'POST',body:JSON.stringify({branch_id:branchId,code:testCode,name:testName,sample_type:sampleType,default_price:Number(price||0),created_by_user_id:apiSession.user?.id})});
   await load();setMessage('Lab test added to catalog.');
  }catch(err:any){setMessage(err.message||'Could not create lab test.')}finally{setBusy('')}
 }

 async function createPackage(){
  if(!apiSession||selectedTestIds.length===0)return;setBusy('package');setMessage('');
  try{
   await apiFetch('/lab/catalog/packages',apiSession,{method:'POST',body:JSON.stringify({code:`PKG-${Date.now().toString().slice(-4)}`,name:`Package ${selectedTestIds.length} Tests`,package_price:selectedTestIds.reduce((sum,id)=>sum+Number(tests.find((t:any)=>t.id===id)?.default_price||0),0),test_ids:selectedTestIds,created_by_user_id:apiSession.user?.id})});
   setSelectedTestIds([]);await load();setMessage('Lab package created.');
  }catch(err:any){setMessage(err.message||'Could not create package.')}finally{setBusy('')}
 }

 async function createTemplate(){
  if(!apiSession)return;setBusy('template');setMessage('');
  try{
   await apiFetch('/lab/result-templates',apiSession,{method:'POST',body:JSON.stringify({test_id:selectedTestIds[0]||null,name:templateName,content:{fields:['Observed value','Reference range','Remarks']},created_by_user_id:apiSession.user?.id})});
   await load();setMessage('Result template created.');
  }catch(err:any){setMessage(err.message||'Could not create result template.')}finally{setBusy('')}
 }

 async function createDirect(e:any){
  e.preventDefault();if(!apiSession)return;setBusy('create');setMessage('');
  const selectedNames=orderTestIds.map(id=>tests.find((test:any)=>test.id===id)?.name).filter(Boolean);
  const packageName=packages.find((pkg:any)=>pkg.id===selectedPackageId)?.name;
  const testsText=[manualTests,...selectedNames,packageName].filter(Boolean).join(', ');
  if(!testsText){setMessage('Select at least one lab test, package, or manual test.');setBusy('');return}
  try{
   await apiFetch('/lab/orders',apiSession,{method:'POST',body:JSON.stringify({branch_id:branchId,patient_id:patientId,source,tests:testsText,test_ids:orderTestIds,package_ids:selectedPackageId?[selectedPackageId]:[],external_referrer:source==='external_referral'?externalReferrer:null,amount:0,ordered_by_user_id:apiSession.user?.id})});
   setOrderTestIds([]);setManualTests('');setSelectedPackageId('');await load();setMessage('Lab order created.');
  }catch(err:any){setMessage(err.message||'Could not create lab order.')}finally{setBusy('')}
 }

 function addOrderTest(){
  if(!orderTestId)return;
  setOrderTestIds(ids=>ids.includes(orderTestId)?ids:[...ids,orderTestId]);
 }

 function removeOrderTest(testId:string){
  setOrderTestIds(ids=>ids.filter(id=>id!==testId));
 }

 async function createFromConsultation(a:any){
  setBusy(a.consultationId);setMessage('');
  try{
   const order=await apiFetch(`/lab/orders/from-consultation/${a.consultationId}`,apiSession,{method:'POST',body:JSON.stringify({amount:0,priority:a.tokenType==='Emergency'?'urgent':'routine',ordered_by_user_id:apiSession.user?.id})});
   try{
    const detail=await apiFetch('/billing/invoices/from-lab-order',apiSession,{method:'POST',body:JSON.stringify({lab_order_id:order.id,created_by_user_id:apiSession.user?.id})});
    await load();setMessage(`Lab order created and invoice ${detail.invoice?.invoice_number||''} linked.`);
   }catch(invoiceErr:any){
    await load();setMessage(`Lab order created. ${invoiceErr.message||'Invoice can be generated from the worklist.'}`);
   }
  }catch(err:any){setMessage(err.message||'Could not create referral order.')}finally{setBusy('')}
 }

 async function collectSample(order:any){
  setBusy(order.id);setMessage('');
  try{
   await apiFetch(`/lab/orders/${order.id}/samples`,apiSession,{method:'POST',body:JSON.stringify({barcode:`${order.id}-S1`,sample_type:'Blood',collected_by_user_id:apiSession.user?.id})});
   await load();setMessage('Sample collected.');
  }catch(err:any){setMessage(err.message||'Could not collect sample.')}finally{setBusy('')}
 }

 async function updateStatus(order:any,status:string){
  setBusy(order.id);setMessage('');
  try{
   await apiFetch(`/lab/orders/${order.id}/status`,apiSession,{method:'PATCH',body:JSON.stringify({status,actor_user_id:apiSession.user?.id,reason:status==='cancelled'?'Cancelled from lab screen':undefined})});
   await load();
  }catch(err:any){setMessage(err.message||'Could not update lab order.')}finally{setBusy('')}
 }

 async function releaseResult(order:any){
  setBusy(order.id);setMessage('');
  try{
   await apiFetch(`/lab/orders/${order.id}/results`,apiSession,{method:'POST',body:JSON.stringify({template_id:templates[0]?.id||null,result_summary:resultText[order.id]||'Result entered from MedizinHub lab screen.',abnormal_flag:false,report_url:reportUrl[order.id]||null,report_file_name:reportUrl[order.id]?'uploaded-report.pdf':null,released_by_user_id:apiSession.user?.id})});
   await load();setMessage('Lab result released and notification queued when provider settings allow.');
  }catch(err:any){setMessage(err.message||'Could not release result.')}finally{setBusy('')}
 }

 async function openReport(order:any){
  setBusy(order.id);
  try{
   const blob=await apiBlob(`/lab/orders/${order.id}/report.pdf`,apiSession);
   const url=URL.createObjectURL(blob);window.open(url,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(err:any){setMessage(err.message||'Could not open report.')}finally{setBusy('')}
 }

 async function generateInvoice(order:any){
  setBusy(`invoice-${order.id}`);setMessage('');
  try{
   const detail=await apiFetch('/billing/invoices/from-lab-order',apiSession,{method:'POST',body:JSON.stringify({lab_order_id:order.id,created_by_user_id:apiSession.user?.id})});
   await load();setMessage(`Lab invoice ${detail.invoice?.invoice_number||''} generated.`);
  }catch(err:any){setMessage(err.message||'Could not generate lab invoice.')}finally{setBusy('')}
 }

 async function loadConsultDetail(a:any){
  setViewConsult(a);setConsultDetail(null);setLoadingDetail(true);
  try{const detail=await apiFetch(`/consultations/${a.consultationId}`,apiSession);setConsultDetail(detail);}
  catch(err:any){setMessage(err.message||'Could not load consultation.');}
  finally{setLoadingDetail(false)}
 }


 if(!apiSession)return <Card><h3 className="text-lg font-bold">Lab & Diagnostic Integration</h3><p className="mt-2 text-sm text-slate-500">Backend login is required to view lab data.</p></Card>;
 return <div className="space-y-6">
  {selectedOrder&&<WorklistDetailModal title="Lab Test List" id={selectedOrder.id} patient={(patientMap.get(selectedOrder.patient_id) as any)?.name||selectedOrder.patient_id} createdAt={selectedOrder.created_at} items={splitList(selectedOrder.tests)} onClose={()=>setSelectedOrder(null)}/>}
  {viewConsult&&<ConsultReferralModal a={viewConsult} detail={consultDetail} loading={loadingDetail} busy={busy} onClose={()=>setViewConsult(null)} onCreate={(a:any)=>{setViewConsult(null);createFromConsultation(a);}}/>}
  {message&&<div className="rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
  <Card><h3 className="text-lg font-bold">Create Lab Order</h3><form onSubmit={createDirect} className="mt-4 grid gap-3 md:grid-cols-4"><Field label="Patient"><Select value={patientId} onChange={(e:any)=>setPatientId(e.target.value)}>{patients.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field><Field label="Source"><Select value={source} onChange={(e:any)=>setSource(e.target.value)}><option value="op_direct">OP Direct</option><option value="external_referral">External Referral</option></Select></Field><Field label="Lab Test"><Select value={orderTestId} onChange={(e:any)=>setOrderTestId(e.target.value)}><option value="">Select test</option>{tests.map((test:any)=><option key={test.id} value={test.id}>{test.name} · ₹{test.default_price}</option>)}</Select></Field><div className="flex items-end"><ActionButton type="button" onClick={addOrderTest}>Add</ActionButton></div><Field label="Package"><Select value={selectedPackageId} onChange={(e:any)=>setSelectedPackageId(e.target.value)}><option value="">No package</option>{packages.map((pkg:any)=><option key={pkg.id} value={pkg.id}>{pkg.name} · ₹{pkg.package_price}</option>)}</Select></Field><Field label="Manual Tests"><Input value={manualTests} onChange={(e:any)=>setManualTests(e.target.value)} placeholder="Optional external test"/></Field><Field label="External Referrer"><Input value={externalReferrer} onChange={(e:any)=>setExternalReferrer(e.target.value)} disabled={source!=='external_referral'}/></Field><div className="flex items-end"><Button disabled={busy==='create'}>{busy==='create'?'Saving...':'Create Order'}</Button></div>{orderTestIds.length>0&&<div className="md:col-span-4 flex flex-wrap gap-2">{orderTestIds.map((id:string)=>{const test:any=tests.find((row:any)=>row.id===id);return <button key={id} type="button" onClick={()=>removeOrderTest(id)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">{test?.name||id} · ₹{test?.default_price||0} ×</button>})}</div>}</form></Card>
  <Card><h3 className="text-lg font-bold">Consultation Referrals</h3><div className="mt-4 grid gap-3">{labReady.length===0&&<div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No signed consultation referrals ready.</div>}{labReady.slice(0,6).map((a:any)=><div key={a.id} className="flex flex-col justify-between gap-3 rounded-2xl border p-4 md:flex-row md:items-center"><div><b>{a.token} · {a.patient}</b><p className="text-sm text-slate-500">Consultation: {a.consultationId}</p></div><div className="flex gap-2"><ActionButton onClick={()=>loadConsultDetail(a)}>View Tests</ActionButton><Button disabled={busy===a.consultationId} onClick={()=>createFromConsultation(a)}>{busy===a.consultationId?'Creating...':'Create Lab Order'}</Button></div></div>)}</div></Card>
  <Card><h3 className="text-lg font-bold">Lab Worklist</h3><div className="mt-4 overflow-auto rounded-2xl border"><table className="w-full min-w-[1580px] table-fixed text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="w-[190px] px-4 py-3">Order</th><th className="w-[150px]">Patient</th><th className="w-[280px]">Tests</th><th className="w-[150px]">Source</th><th className="w-[150px]">Status</th><th className="w-[90px]">Amount</th><th className="w-[560px]">Result Entry</th><th className="w-[360px] pr-4 text-right">Actions</th></tr></thead><tbody className="divide-y">{orders.length===0&&<tr><td colSpan={8} className="px-4 py-4 text-slate-500">No lab orders yet.</td></tr>}{labPageRows.map((o:any)=>{const p:any=patientMap.get(o.patient_id);const selected=selectedOrder?.id===o.id;return <tr key={o.id} onClick={()=>setSelectedOrder(o)} className={`cursor-pointer transition hover:bg-slate-50 ${selected?'bg-slate-50':''}`}><td className="px-4 py-4"><b>{o.id}</b><p className="text-xs text-slate-500">{new Date(o.created_at).toLocaleString()}</p></td><td>{p?.name||o.patient_id}</td><td><p className="truncate" title={o.tests}>{o.tests}</p></td><td><Badge>{o.source}</Badge></td><td><Badge tone={o.status==='result_ready'?'green':o.status==='cancelled'?'red':'amber'}>{o.status}</Badge></td><td>₹{o.amount}</td><td onClick={(event)=>event.stopPropagation()}><div className="flex min-w-[520px] items-center gap-2"><Input placeholder="Result summary" value={resultText[o.id]||''} onChange={(e:any)=>setResultText({...resultText,[o.id]:e.target.value})}/><Input placeholder="Report file URL" value={reportUrl[o.id]||''} onChange={(e:any)=>setReportUrl({...reportUrl,[o.id]:e.target.value})}/></div></td><td className="pr-4" onClick={(event)=>event.stopPropagation()}><ActionGroup><ActionButton disabled={busy===o.id} onClick={()=>collectSample(o)}>Sample</ActionButton><ActionButton tone="primary" disabled={busy===o.id} onClick={()=>releaseResult(o)}>Release</ActionButton><ActionButton disabled={busy===`invoice-${o.id}`} onClick={()=>generateInvoice(o)}>{busy===`invoice-${o.id}`?'Billing...':'Invoice'}</ActionButton><ActionButton disabled={busy===o.id} onClick={()=>openReport(o)}>PDF</ActionButton><ActionButton tone="danger" disabled={busy===o.id} onClick={()=>updateStatus(o,'cancelled')}>Cancel</ActionButton></ActionGroup></td></tr>})}</tbody></table></div><Pagination page={safePage} totalPages={totalPages} total={orders.length} onPage={setPage}/></Card>
 </div>
}

function splitList(value:any){
 return String(value||'').split(/\n|,(?=\s*[A-Za-z0-9])|\s+\|\s+/).map(item=>item.trim()).filter(Boolean);
}

function WorklistDetailModal({title,id,patient,createdAt,items,onClose}:any){
 return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"><Card className="w-full max-w-2xl"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-bold">{title}</h3><p className="mt-1 text-sm text-slate-500">{patient} · {id}</p><p className="text-xs text-slate-500">{createdAt?new Date(createdAt).toLocaleString():''}</p></div><ActionButton onClick={onClose}>Close</ActionButton></div><div className="mt-5 grid gap-2">{items.length===0?<p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No items found.</p>:items.map((item:string,index:number)=><div key={`${item}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold">{index+1}. {item}</div>)}</div></Card></div>
}

function ConsultReferralModal({a,detail,loading,busy,onClose,onCreate}:any){
 const referrals:any[]=detail?.referrals||[];
 const labOnly=referrals.filter((r:any)=>r.referral_type==='lab'||r.referral_type==='scan'||!r.referral_type);
 const display=labOnly.length>0?labOnly:referrals;
 return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"><Card className="w-full max-w-3xl"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-bold">Referral Detail</h3><p className="mt-1 text-sm text-slate-500">{a.token} · {a.patient}</p><p className="text-xs text-slate-500">Consultation: {a.consultationId}</p></div><ActionButton onClick={onClose}>Close</ActionButton></div>{loading&&<p className="mt-4 text-sm text-slate-500">Loading...</p>}{detail&&display.length>0&&<div className="mt-4 overflow-auto rounded-2xl border"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Type</th><th>Test / Item</th><th>Priority</th><th>Instructions</th></tr></thead><tbody className="divide-y">{display.map((r:any,i:number)=><tr key={i}><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold uppercase">{r.referral_type||'lab'}</span></td><td className="font-semibold">{r.item_name||'-'}</td><td>{r.priority||'-'}</td><td className="pr-4 text-slate-500">{r.instructions||'-'}</td></tr>)}</tbody></table></div>}{detail&&referrals.length===0&&<p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No referrals in this consultation.</p>}<div className="mt-4 flex gap-2"><Button disabled={busy===a.consultationId||loading} onClick={()=>onCreate(a)}>{busy===a.consultationId?'Creating...':'Create Lab Order'}</Button><ActionButton onClick={onClose}>Cancel</ActionButton></div></Card></div>
}

function Pagination({page,totalPages,total,onPage}:any){
 const start=total===0?0:(page-1)*pageSize+1;
 const end=Math.min(page*pageSize,total);
 return <div className="mt-4 flex flex-col justify-between gap-3 text-sm text-slate-500 sm:flex-row sm:items-center"><span>Showing {start}-{end} of {total}</span><div className="flex gap-2"><button type="button" onClick={()=>onPage(Math.max(1,page-1))} disabled={page<=1} className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300">Previous</button><span className="rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-700">Page {page} / {totalPages}</span><button type="button" onClick={()=>onPage(Math.min(totalPages,page+1))} disabled={page>=totalPages} className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300">Next</button></div></div>
}
