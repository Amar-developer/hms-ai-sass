'use client';

import {useEffect,useMemo,useState} from 'react';
import {Badge,Button,Card,Field,Input,Select} from '@/components/ui';
import {apiFetch} from '@/lib/api';

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
 const prescriptionReady=appointments.filter((a:any)=>a.consultationId&&a.consultationStatus==='signed');
 const patientMap=useMemo(()=>new Map(patients.map((p:any)=>[p.id,p])),[patients]);

 useEffect(()=>{if(!patientId&&patients[0]?.id)setPatientId(patients[0].id)},[patients,patientId]);
 useEffect(()=>{load()},[apiSession?.token,apiSession?.tenantId]);
 useEffect(()=>{if(!medicineId&&medicines[0]?.id)setMedicineId(medicines[0].id)},[medicines,medicineId]);
 useEffect(()=>{const first=batches.find((b:any)=>b.medicine_id===medicineId);setBatchId(first?.id||'')},[medicineId,batches]);

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
  try{
   await apiFetch('/pharmacy/issues',apiSession,{method:'POST',body:JSON.stringify({branch_id:branchId,patient_id:patientId,source,medicine_text:medicineText,external_prescriber:source==='external_prescription'?externalPrescriber:null,items:medicineId?[{medicine_id:medicineId,batch_id:batchId||null,medicine_name:med?.name||medicineText,quantity:Number(quantity||1),unit_price:Number(med?.default_sale_price||0)}]:[],issued_by_user_id:apiSession.user?.id})});
   await load();setMessage('Pharmacy issue created.');
  }catch(err:any){setMessage(err.message||'Could not create pharmacy issue.')}finally{setBusy('')}
 }

 async function createFromConsultation(a:any){
  setBusy(a.consultationId);setMessage('');
  try{
   await apiFetch(`/pharmacy/issues/from-consultation/${a.consultationId}`,apiSession,{method:'POST',body:JSON.stringify({amount:0,issued_by_user_id:apiSession.user?.id})});
   await load();setMessage('Pharmacy issue created from prescription.');
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

 if(!apiSession)return <Card><h3 className="text-lg font-bold">Electronic Prescriptions</h3><p className="mt-2 text-sm text-slate-500">Backend login is required to view pharmacy data.</p></Card>;
 return <div className="space-y-6">
  <Card><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start"><div><h3 className="text-lg font-bold">Pharmacy Catalog & Stock</h3><p className="text-sm text-slate-500">Medicine catalog, suppliers, purchases, batches, stock ledger, and low-stock alerts.</p></div><Badge tone={lowStock.length?'amber':'green'}>{lowStock.length} low stock</Badge></div>{message&&<div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}<form onSubmit={createMedicine} className="mt-4 grid gap-3 md:grid-cols-6"><Field label="Code"><Input value={code} onChange={(e:any)=>setCode(e.target.value)}/></Field><Field label="Medicine"><Input value={name} onChange={(e:any)=>setName(e.target.value)}/></Field><Field label="Generic"><Input value={generic} onChange={(e:any)=>setGeneric(e.target.value)}/></Field><Field label="Sale Price"><Input type="number" value={salePrice} onChange={(e:any)=>setSalePrice(e.target.value)}/></Field><Field label="Reorder"><Input type="number" value={reorder} onChange={(e:any)=>setReorder(e.target.value)}/></Field><div className="flex items-end"><Button disabled={busy==='medicine'}>{busy==='medicine'?'Saving...':'Add Medicine'}</Button></div></form><div className="mt-4 grid gap-3 lg:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><Field label="Supplier"><Input value={supplierName} onChange={(e:any)=>setSupplierName(e.target.value)}/></Field><button type="button" onClick={createSupplier} className="mt-2 rounded-xl border px-3 py-2 text-xs font-bold">Add Supplier</button><p className="mt-2 text-xs text-slate-500">{suppliers.length} suppliers</p></div><div className="rounded-2xl bg-slate-50 p-4"><div className="grid gap-2 md:grid-cols-2"><Field label="PO ID"><Input value={purchaseOrderId} onChange={(e:any)=>setPurchaseOrderId(e.target.value)}/></Field><Field label="Purchase Date"><Input type="date" value={purchaseDate} onChange={(e:any)=>setPurchaseDate(e.target.value)}/></Field><Field label="Purchase Medicine"><Select value={medicineId} onChange={(e:any)=>setMedicineId(e.target.value)}>{medicines.map((m:any)=><option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field><Field label="Quantity"><Input type="number" value={purchaseQty} onChange={(e:any)=>setPurchaseQty(e.target.value)}/></Field><Field label="Header Discount %"><Input type="number" value={purchaseDiscount} onChange={(e:any)=>setPurchaseDiscount(e.target.value)}/></Field><Field label="Line Discount %"><Input type="number" value={lineDiscount} onChange={(e:any)=>setLineDiscount(e.target.value)}/></Field><Field label="CGST %"><Input type="number" value={cgst} onChange={(e:any)=>setCgst(e.target.value)}/></Field><Field label="SGST %"><Input type="number" value={sgst} onChange={(e:any)=>setSgst(e.target.value)}/></Field></div><button type="button" onClick={createPurchase} className="mt-2 rounded-xl border px-3 py-2 text-xs font-bold">Create Purchase</button></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Low Stock / Return</p><div className="mt-2 grid gap-2">{lowStock.length===0?<p className="text-sm text-slate-500">No low-stock items.</p>:lowStock.map((row:any)=><div key={row.medicine_id} className="rounded-xl bg-white p-3 text-sm"><b>{row.medicine_name}</b><p className="text-xs text-slate-500">Qty {row.quantity_on_hand} / Reorder {row.reorder_level}</p></div>)}</div><div className="mt-3 grid gap-2 md:grid-cols-2"><Field label="Return Batch"><Select value={batchId} onChange={(e:any)=>setBatchId(e.target.value)}>{batches.filter((b:any)=>b.medicine_id===medicineId).map((b:any)=><option key={b.id} value={b.id}>{b.batch_number} · Qty {b.quantity_on_hand}</option>)}</Select></Field><Field label="Return Qty"><Input type="number" value={returnQty} onChange={(e:any)=>setReturnQty(e.target.value)}/></Field></div><button type="button" onClick={returnExpiredStock} className="mt-2 rounded-xl border px-3 py-2 text-xs font-bold text-red-600">Return Expired</button></div></div></Card>
  <Card><h3 className="text-lg font-bold">Create Pharmacy Issue</h3><form onSubmit={createDirect} className="mt-4 grid gap-3 md:grid-cols-7"><Field label="Patient"><Select value={patientId} onChange={(e:any)=>setPatientId(e.target.value)}>{patients.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field><Field label="Source"><Select value={source} onChange={(e:any)=>setSource(e.target.value)}><option value="op_direct">OP Direct</option><option value="external_prescription">External Prescription</option></Select></Field><Field label="Medicine"><Select value={medicineId} onChange={(e:any)=>setMedicineId(e.target.value)}>{medicines.map((m:any)=><option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field><Field label="Batch"><Select value={batchId} onChange={(e:any)=>setBatchId(e.target.value)}><option value="">Auto</option>{batches.filter((b:any)=>b.medicine_id===medicineId).map((b:any)=><option key={b.id} value={b.id}>{b.batch_number} · Qty {b.quantity_on_hand}</option>)}</Select></Field><Field label="Qty"><Input type="number" value={quantity} onChange={(e:any)=>setQuantity(e.target.value)}/></Field><Field label="External Prescriber"><Input value={externalPrescriber} onChange={(e:any)=>setExternalPrescriber(e.target.value)} disabled={source!=='external_prescription'}/></Field><div className="flex items-end"><Button disabled={busy==='create'}>{busy==='create'?'Saving...':'Create Issue'}</Button></div></form></Card>
  <Card><h3 className="text-lg font-bold">Doctor Prescriptions</h3><div className="mt-4 grid gap-3">{prescriptionReady.length===0&&<div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No signed prescriptions ready.</div>}{prescriptionReady.slice(0,6).map((a:any)=><div key={a.id} className="flex flex-col justify-between gap-3 rounded-2xl border p-4 md:flex-row md:items-center"><div><b>{a.token} · {a.patient}</b><p className="text-sm text-slate-500">Consultation: {a.consultationId}</p></div><Button disabled={busy===a.consultationId} onClick={()=>createFromConsultation(a)}>{busy===a.consultationId?'Creating...':'Create Pharmacy Issue'}</Button></div>)}</div></Card>
  <Card><h3 className="text-lg font-bold">Pharmacy Worklist</h3><div className="mt-4 overflow-auto rounded-2xl border"><table className="w-full min-w-[1160px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Issue</th><th>Patient</th><th>Medicine</th><th>Source</th><th>Status</th><th>Amount</th><th>Billing</th><th>Actions</th></tr></thead><tbody className="divide-y">{issues.length===0&&<tr><td colSpan={8} className="px-4 py-4 text-slate-500">No pharmacy issues yet.</td></tr>}{issues.map((issue:any)=>{const p:any=patientMap.get(issue.patient_id);return <tr key={issue.id}><td className="px-4 py-4"><b>{issue.id}</b><p className="text-xs text-slate-500">{new Date(issue.created_at).toLocaleString()}</p></td><td>{p?.name||issue.patient_id}</td><td>{issue.medicine_text}</td><td><Badge>{issue.source}</Badge></td><td><Badge tone={issue.status==='dispensed'?'green':issue.status==='cancelled'?'red':'amber'}>{issue.status}</Badge></td><td>₹{issue.amount}</td><td><div className="grid min-w-[220px] gap-2"><Input placeholder="Invoice ID" value={invoiceRef[issue.id]||issue.billing_invoice_id||''} onChange={(e:any)=>setInvoiceRef({...invoiceRef,[issue.id]:e.target.value})}/><button type="button" onClick={()=>linkBilling(issue)} className="rounded-xl border px-3 py-2 text-xs font-bold">Link</button></div></td><td><div className="flex flex-wrap gap-2"><button disabled={busy===issue.id} onClick={()=>updateStatus(issue,'partially_dispensed')} className="rounded-xl border px-3 py-2 disabled:text-slate-300">Partial</button><button disabled={busy===issue.id} onClick={()=>updateStatus(issue,'dispensed')} className="rounded-xl bg-slate-900 px-3 py-2 text-white disabled:bg-slate-300">Dispense</button><button disabled={busy===issue.id} onClick={()=>updateStatus(issue,'cancelled')} className="rounded-xl border px-3 py-2 text-red-600 disabled:text-slate-300">Cancel</button></div></td></tr>})}</tbody></table></div></Card>
 </div>
}
