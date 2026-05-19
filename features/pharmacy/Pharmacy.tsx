'use client';

import {useEffect,useMemo,useState} from 'react';
import {ActionButton,ActionGroup,Badge,Button,Card,Field,Input,Select} from '@/components/ui';
import {apiFetch} from '@/lib/api';

const pageSize=10;

export function Pharmacy({apiSession,branchId,patients,appointments}:any){
 const [issues,setIssues]=useState<any[]>([]);
 const [medicines,setMedicines]=useState<any[]>([]);
 const [batches,setBatches]=useState<any[]>([]);
 const [suppliers,setSuppliers]=useState<any[]>([]);
 const [lowStock,setLowStock]=useState<any[]>([]);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState('');
 const [patientId,setPatientId]=useState(patients[0]?.id||'');
 const [source,setSource]=useState('op_direct');
 const [externalPrescriber,setExternalPrescriber]=useState('');
 const [medicineText,setMedicineText]=useState('Paracetamol 500mg');
 const [medicineId,setMedicineId]=useState('');
 const [batchId,setBatchId]=useState('');
 const [quantity,setQuantity]=useState('1');
 const [issueItems,setIssueItems]=useState<any[]>([]);
 const [code,setCode]=useState('PCM500');
 const [name,setName]=useState('Paracetamol 500mg');
 const [generic,setGeneric]=useState('Paracetamol');
 const [salePrice,setSalePrice]=useState('5');
 const [reorder,setReorder]=useState('10');
 const [supplierName,setSupplierName]=useState('Demo Pharma Supplier');
 const [purchaseQty,setPurchaseQty]=useState('50');
 const [purchaseOrderId,setPurchaseOrderId]=useState('PO-001');
 const [purchaseDate,setPurchaseDate]=useState(()=>new Date().toISOString().slice(0,10));
 const [purchaseDiscount,setPurchaseDiscount]=useState('0');
 const [lineDiscount,setLineDiscount]=useState('0');
 const [cgst,setCgst]=useState('6');
 const [sgst,setSgst]=useState('6');
 const [returnQty,setReturnQty]=useState('1');
 const [invoiceRef,setInvoiceRef]=useState<Record<string,string>>({});
 const [selectedIssue,setSelectedIssue]=useState<any>(null);
 const [viewConsult,setViewConsult]=useState<any>(null);
 const [consultDetail,setConsultDetail]=useState<any>(null);
 const [loadingDetail,setLoadingDetail]=useState(false);
 const [page,setPage]=useState(1);
 const issuedConsultationIds=useMemo(()=>new Set(issues.map((issue:any)=>issue.consultation_id).filter(Boolean)),[issues]);
 const prescriptionReady=useMemo(()=>appointments.filter((a:any)=>a.consultationId&&a.consultationStatus==='signed'&&!issuedConsultationIds.has(a.consultationId)),[appointments,issuedConsultationIds]);
 const totalPages=Math.max(1,Math.ceil(issues.length/pageSize));
 const safePage=Math.min(page,totalPages);
 const pharmacyPageRows=issues.slice((safePage-1)*pageSize,safePage*pageSize);
 const patientMap=useMemo(()=>new Map(patients.map((p:any)=>[p.id,p])),[patients]);

 useEffect(()=>{if(!patientId&&patients[0]?.id)setPatientId(patients[0].id)},[patients,patientId]);
 useEffect(()=>{load()},[apiSession?.token,apiSession?.tenantId]);
 useEffect(()=>{if(!medicineId&&medicines[0]?.id)setMedicineId(medicines[0].id)},[medicines,medicineId]);
 useEffect(()=>{const first=batches.find((b:any)=>b.medicine_id===medicineId);setBatchId(first?.id||'')},[medicineId,batches]);
 useEffect(()=>{if(page!==safePage)setPage(safePage)},[page,safePage]);

 async function load(){
  if(!apiSession){setIssues([]);return}
  try{
   const [issueRows,medicineRows,batchRows,supplierRows,lowRows]=await Promise.all([
    apiFetch('/pharmacy/issues',apiSession),
    apiFetch('/pharmacy/medicines',apiSession),
    apiFetch('/pharmacy/batches',apiSession),
    apiFetch('/pharmacy/suppliers',apiSession),
    apiFetch(`/pharmacy/low-stock?branch_id=${branchId}`,apiSession),
   ]);
   setIssues(issueRows);setMedicines(medicineRows);setBatches(batchRows);setSuppliers(supplierRows);setLowStock(lowRows);
  }catch(err:any){setMessage(err.message||'Could not load pharmacy workspace.')}
 }

 async function createMedicine(e:any){
  e.preventDefault();if(!apiSession)return;setBusy('medicine');setMessage('');
  try{
   await apiFetch('/pharmacy/medicines',apiSession,{method:'POST',body:JSON.stringify({branch_id:branchId,code,name,generic_name:generic,form:'Tablet',default_sale_price:Number(salePrice||0),reorder_level:Number(reorder||0),created_by_user_id:apiSession.user?.id})});
   await load();setMessage('Medicine added to catalog.');
  }catch(err:any){setMessage(err.message||'Could not create medicine.')}finally{setBusy('')}
 }

 async function createSupplier(){
  if(!apiSession)return;setBusy('supplier');setMessage('');
  try{
   await apiFetch('/pharmacy/suppliers',apiSession,{method:'POST',body:JSON.stringify({name:supplierName,created_by_user_id:apiSession.user?.id})});
   await load();setMessage('Supplier created.');
  }catch(err:any){setMessage(err.message||'Could not create supplier.')}finally{setBusy('')}
 }

 async function createPurchase(){
  if(!apiSession||!medicineId)return;setBusy('purchase');setMessage('');
  try{
   const med=medicines.find((m:any)=>m.id===medicineId);
   await apiFetch('/pharmacy/purchases',apiSession,{method:'POST',body:JSON.stringify({branch_id:branchId,supplier_id:suppliers[0]?.id||null,purchase_order_id:purchaseOrderId,invoice_number:`PINV-${Date.now().toString().slice(-5)}`,purchase_date:new Date(`${purchaseDate}T00:00:00`).toISOString(),discount_percentage:Number(purchaseDiscount||0),items:[{medicine_id:medicineId,batch_number:`B-${Date.now().toString().slice(-4)}`,quantity:Number(purchaseQty||0),cost_price:Math.max(1,Number(med?.default_sale_price||0)-2),sale_price:Number(med?.default_sale_price||0),discount_percentage:Number(lineDiscount||0),cgst_percentage:Number(cgst||0),sgst_percentage:Number(sgst||0)}],purchased_by_user_id:apiSession.user?.id})});
   await load();setMessage('Purchase added with discount/GST and stock ledger updated.');
  }catch(err:any){setMessage(err.message||'Could not create purchase.')}finally{setBusy('')}
 }

 async function returnExpiredStock(){
  if(!apiSession||!medicineId||!batchId)return;setBusy('return');setMessage('');
  try{
   const batch=batches.find((b:any)=>b.id===batchId);
   await apiFetch('/pharmacy/returns',apiSession,{method:'POST',body:JSON.stringify({branch_id:branchId,supplier_id:suppliers[0]?.id||null,purchase_id:batch?.purchase_id||null,reason:'Expired medicine returned to supplier',items:[{medicine_id:medicineId,batch_id:batchId,quantity:Number(returnQty||1),amount:Number(returnQty||1)*Number(batch?.cost_price||0)}],returned_by_user_id:apiSession.user?.id})});
   await load();setMessage('Expired medicine returned and stock ledger updated.');
  }catch(err:any){setMessage(err.message||'Could not return expired stock.')}finally{setBusy('')}
 }

 async function createDirect(e:any){
  e.preventDefault();if(!apiSession)return;setBusy('create');setMessage('');
  const med=medicines.find((m:any)=>m.id===medicineId);
  const itemRows=issueItems.length?issueItems:(medicineId?[{medicine_id:medicineId,batch_id:batchId||null,medicine_name:med?.name||medicineText,quantity:Number(quantity||1),unit_price:Number(med?.default_sale_price||0)}]:[]);
  const names=itemRows.map((item:any)=>item.medicine_name).filter(Boolean);
  try{
   await apiFetch('/pharmacy/issues',apiSession,{method:'POST',body:JSON.stringify({branch_id:branchId,patient_id:patientId,source,medicine_text:names.join(', ')||medicineText,external_prescriber:source==='external_prescription'?externalPrescriber:null,items:itemRows,issued_by_user_id:apiSession.user?.id})});
   setIssueItems([]);await load();setMessage('Pharmacy issue created.');
  }catch(err:any){setMessage(err.message||'Could not create pharmacy issue.')}finally{setBusy('')}
 }

 function addIssueItem(){
  const med=medicines.find((m:any)=>m.id===medicineId);
  if(!med)return;
  setIssueItems((rows:any[])=>[
   ...rows,
   {medicine_id:medicineId,batch_id:batchId||null,medicine_name:med.name,quantity:Number(quantity||1),unit_price:Number(med.default_sale_price||0)},
  ]);
 }

 function removeIssueItem(index:number){
  setIssueItems((rows:any[])=>rows.filter((_:any,rowIndex:number)=>rowIndex!==index));
 }

 async function createFromConsultation(a:any){
  setBusy(a.consultationId);setMessage('');
  try{
   const issue=await apiFetch(`/pharmacy/issues/from-consultation/${a.consultationId}`,apiSession,{method:'POST',body:JSON.stringify({amount:0,issued_by_user_id:apiSession.user?.id})});
   try{
    const detail=await apiFetch('/billing/invoices/from-pharmacy-issue',apiSession,{method:'POST',body:JSON.stringify({pharmacy_issue_id:issue.id,created_by_user_id:apiSession.user?.id})});
    await load();setMessage(`Pharmacy issue created and invoice ${detail.invoice?.invoice_number||''} linked.`);
   }catch(invoiceErr:any){
    await load();setMessage(`Pharmacy issue created. ${invoiceErr.message||'Invoice can be generated from the worklist.'}`);
   }
  }catch(err:any){setMessage(err.message||'Could not create prescription issue.')}finally{setBusy('')}
 }

 async function updateStatus(issue:any,status:string){
  setBusy(issue.id);setMessage('');
  try{
   await apiFetch(`/pharmacy/issues/${issue.id}/status`,apiSession,{method:'PATCH',body:JSON.stringify({status,actor_user_id:apiSession.user?.id,reason:status==='cancelled'?'Cancelled from pharmacy screen':undefined})});
   await load();
  }catch(err:any){setMessage(err.message||'Could not update pharmacy issue.')}finally{setBusy('')}
 }

 async function linkBilling(issue:any){
  const value=invoiceRef[issue.id];if(!value)return;setBusy(issue.id);setMessage('');
  try{
   await apiFetch(`/pharmacy/issues/${issue.id}/billing-link`,apiSession,{method:'POST',body:JSON.stringify({billing_invoice_id:value,actor_user_id:apiSession.user?.id})});
   await load();setMessage('Pharmacy issue linked to billing invoice.');
  }catch(err:any){setMessage(err.message||'Could not link billing.')}finally{setBusy('')}
 }

 async function generateInvoice(issue:any){
  setBusy(`invoice-${issue.id}`);setMessage('');
  try{
   const detail=await apiFetch('/billing/invoices/from-pharmacy-issue',apiSession,{method:'POST',body:JSON.stringify({pharmacy_issue_id:issue.id,created_by_user_id:apiSession.user?.id})});
   await load();setMessage(`Pharmacy invoice ${detail.invoice?.invoice_number||''} generated.`);
  }catch(err:any){setMessage(err.message||'Could not generate pharmacy invoice.')}finally{setBusy('')}
 }

 async function loadConsultDetail(a:any){
  setViewConsult(a);setConsultDetail(null);setLoadingDetail(true);
  try{const detail=await apiFetch(`/consultations/${a.consultationId}`,apiSession);setConsultDetail(detail);}
  catch(err:any){setMessage(err.message||'Could not load consultation.');}
  finally{setLoadingDetail(false)}
 }

 if(!apiSession)return <Card><h3 className="text-lg font-bold">Electronic Prescriptions</h3><p className="mt-2 text-sm text-slate-500">Backend login is required to view pharmacy data.</p></Card>;
 return <div className="space-y-6">
  {selectedIssue&&<MedicineDetailModal id={selectedIssue.id} patient={(patientMap.get(selectedIssue.patient_id) as any)?.name||selectedIssue.patient_id} createdAt={selectedIssue.created_at} medicineText={selectedIssue.medicine_text} onClose={()=>setSelectedIssue(null)}/>}
  {viewConsult&&<ConsultPrescriptionModal a={viewConsult} detail={consultDetail} loading={loadingDetail} busy={busy} onClose={()=>setViewConsult(null)} onCreate={(a:any)=>{setViewConsult(null);createFromConsultation(a);}}/>}
  {message&&<div className="rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
  <Card><h3 className="text-lg font-bold">Create Pharmacy Issue</h3><form onSubmit={createDirect} className="mt-4 grid gap-3 md:grid-cols-4"><Field label="Patient"><Select value={patientId} onChange={(e:any)=>setPatientId(e.target.value)}>{patients.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field><Field label="Source"><Select value={source} onChange={(e:any)=>setSource(e.target.value)}><option value="op_direct">OP Direct</option><option value="external_prescription">External Prescription</option></Select></Field><Field label="Medicine"><Select value={medicineId} onChange={(e:any)=>setMedicineId(e.target.value)}>{medicines.map((m:any)=><option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field><Field label="Batch"><Select value={batchId} onChange={(e:any)=>setBatchId(e.target.value)}><option value="">Auto</option>{batches.filter((b:any)=>b.medicine_id===medicineId).map((b:any)=><option key={b.id} value={b.id}>{b.batch_number} · Qty {b.quantity_on_hand}</option>)}</Select></Field><Field label="Qty"><Input type="number" value={quantity} onChange={(e:any)=>setQuantity(e.target.value)}/></Field><div className="md:col-span-2"><Field label="External Prescriber"><Input value={externalPrescriber} onChange={(e:any)=>setExternalPrescriber(e.target.value)} disabled={source!=='external_prescription'}/></Field></div><div className="flex items-end gap-2"><ActionButton type="button" onClick={addIssueItem}>Add</ActionButton><Button disabled={busy==='create'}>{busy==='create'?'Saving...':'Create Issue'}</Button></div>{issueItems.length>0&&<div className="md:col-span-4 flex flex-wrap gap-2">{issueItems.map((item:any,index:number)=><button key={`${item.medicine_id}-${index}`} type="button" onClick={()=>removeIssueItem(index)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">{item.medicine_name} x {item.quantity} · ₹{item.quantity*item.unit_price} ×</button>)}</div>}</form></Card>
  <Card><h3 className="text-lg font-bold">Doctor Prescriptions</h3><div className="mt-4 grid gap-3">{prescriptionReady.length===0&&<div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No signed prescriptions ready.</div>}{prescriptionReady.slice(0,6).map((a:any)=><div key={a.id} className="flex flex-col justify-between gap-3 rounded-2xl border p-4 md:flex-row md:items-center"><div><b>{a.token} · {a.patient}</b><p className="text-sm text-slate-500">Consultation: {a.consultationId}</p></div><div className="flex gap-2"><ActionButton onClick={()=>loadConsultDetail(a)}>View Rx</ActionButton><Button disabled={busy===a.consultationId} onClick={()=>createFromConsultation(a)}>{busy===a.consultationId?'Creating...':'Create Pharmacy Issue'}</Button></div></div>)}</div></Card>
  <Card><h3 className="text-lg font-bold">Pharmacy Worklist</h3><div className="mt-4 overflow-auto rounded-2xl border"><table className="w-full min-w-[1840px] table-fixed text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="w-[190px] px-4 py-3">Issue</th><th className="w-[150px]">Patient</th><th className="w-[300px]">Medicine</th><th className="w-[160px]">Source</th><th className="w-[130px]">Status</th><th className="w-[90px]">Amount</th><th className="w-[520px]">Billing</th><th className="w-[400px] pr-4 text-right">Actions</th></tr></thead><tbody className="divide-y">{issues.length===0&&<tr><td colSpan={8} className="px-4 py-4 text-slate-500">No pharmacy issues yet.</td></tr>}{pharmacyPageRows.map((issue:any)=>{const p:any=patientMap.get(issue.patient_id);const selected=selectedIssue?.id===issue.id;return <tr key={issue.id} onClick={()=>setSelectedIssue(issue)} className={`cursor-pointer transition hover:bg-slate-50 ${selected?'bg-slate-50':''}`}><td className="px-4 py-4"><b>{issue.id}</b><p className="text-xs text-slate-500">{new Date(issue.created_at).toLocaleString()}</p></td><td>{p?.name||issue.patient_id}</td><td><p className="truncate" title={issue.medicine_text}>{issue.medicine_text}</p></td><td><Badge>{issue.source}</Badge></td><td><Badge tone={issue.status==='dispensed'?'green':issue.status==='cancelled'?'red':'amber'}>{issue.status}</Badge></td><td>₹{issue.amount}</td><td onClick={(event)=>event.stopPropagation()}><div className="flex min-w-[460px] items-center gap-2"><Input className="min-w-0" placeholder="Invoice ID" value={invoiceRef[issue.id]||issue.billing_invoice_id||''} onChange={(e:any)=>setInvoiceRef({...invoiceRef,[issue.id]:e.target.value})}/><ActionButton onClick={()=>linkBilling(issue)}>Link</ActionButton></div></td><td className="pr-4" onClick={(event)=>event.stopPropagation()}><ActionGroup><ActionButton disabled={busy===issue.id} onClick={()=>updateStatus(issue,'partially_dispensed')}>Partial</ActionButton><ActionButton tone="primary" disabled={busy===issue.id} onClick={()=>updateStatus(issue,'dispensed')}>Dispense</ActionButton><ActionButton disabled={busy===`invoice-${issue.id}`} onClick={()=>generateInvoice(issue)}>{busy===`invoice-${issue.id}`?'Billing...':'Invoice'}</ActionButton><ActionButton tone="danger" disabled={busy===issue.id} onClick={()=>updateStatus(issue,'cancelled')}>Cancel</ActionButton></ActionGroup></td></tr>})}</tbody></table></div><Pagination page={safePage} totalPages={totalPages} total={issues.length} onPage={setPage}/></Card>
 </div>
}

function splitList(value:any){
 return String(value||'').split(/\n|,(?=\s*[A-Za-z0-9])|\s+\|\s+/).map(item=>item.trim()).filter(Boolean);
}

function parseMedicines(text:string){
 return String(text||'').split(/\n|,\s+(?=[A-Za-z])/).map(l=>l.trim()).filter(Boolean).map(line=>{
  const parts=line.split(/\s*\|\s*/).map((p:string)=>p.trim());
  return {name:parts[0]||'',dosage:parts[1]||'',frequency:parts[2]||'',duration:parts[3]||'',instructions:parts[4]||''};
 });
}

function MedicineDetailModal({id,patient,createdAt,medicineText,onClose}:any){
 const medicines=parseMedicines(medicineText);
 return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"><Card className="w-full max-w-3xl"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-bold">Medicine List</h3><p className="mt-1 text-sm text-slate-500">{patient} · {id}</p><p className="text-xs text-slate-500">{createdAt?new Date(createdAt).toLocaleString():''}</p></div><ActionButton onClick={onClose}>Close</ActionButton></div>{medicines.length>0?<div className="mt-5 overflow-auto rounded-2xl border"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th className="pr-4">Instructions</th></tr></thead><tbody className="divide-y">{medicines.map((m:any,i:number)=><tr key={i}><td className="px-4 py-3 font-semibold">{m.name}</td><td>{m.dosage||'-'}</td><td>{m.frequency||'-'}</td><td>{m.duration||'-'}</td><td className="pr-4 text-slate-500">{m.instructions||'-'}</td></tr>)}</tbody></table></div>:<p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No medicines found.</p>}</Card></div>
}

function ConsultPrescriptionModal({a,detail,loading,busy,onClose,onCreate}:any){
 return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"><Card className="w-full max-w-3xl"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-bold">Prescription Detail</h3><p className="mt-1 text-sm text-slate-500">{a.token} · {a.patient}</p><p className="text-xs text-slate-500">Consultation: {a.consultationId}</p></div><ActionButton onClick={onClose}>Close</ActionButton></div>{loading&&<p className="mt-4 text-sm text-slate-500">Loading...</p>}{detail&&detail.medicines?.length>0&&<div className="mt-4 overflow-auto rounded-2xl border"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr></thead><tbody className="divide-y">{detail.medicines.map((m:any,i:number)=><tr key={i}><td className="px-4 py-3 font-semibold">{m.medicine_name}</td><td>{m.dosage||'-'}</td><td>{m.frequency||'-'}</td><td>{m.duration||'-'}</td><td className="pr-4 text-slate-500">{m.instructions||'-'}</td></tr>)}</tbody></table></div>}{detail&&(!detail.medicines||detail.medicines.length===0)&&<p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No medicines in this prescription.</p>}<div className="mt-4 flex gap-2"><Button disabled={busy===a.consultationId||loading} onClick={()=>onCreate(a)}>{busy===a.consultationId?'Creating...':'Create Pharmacy Issue'}</Button><ActionButton onClick={onClose}>Cancel</ActionButton></div></Card></div>
}

function Pagination({page,totalPages,total,onPage}:any){
 const start=total===0?0:(page-1)*pageSize+1;
 const end=Math.min(page*pageSize,total);
 return <div className="mt-4 flex flex-col justify-between gap-3 text-sm text-slate-500 sm:flex-row sm:items-center"><span>Showing {start}-{end} of {total}</span><div className="flex gap-2"><button type="button" onClick={()=>onPage(Math.max(1,page-1))} disabled={page<=1} className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300">Previous</button><span className="rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-700">Page {page} / {totalPages}</span><button type="button" onClick={()=>onPage(Math.min(totalPages,page+1))} disabled={page>=totalPages} className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300">Next</button></div></div>
}
