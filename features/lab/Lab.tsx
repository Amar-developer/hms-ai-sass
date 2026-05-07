'use client';

import {useEffect,useMemo,useState} from 'react';
import {Badge,Button,Card,Field,Input,Select} from '@/components/ui';
import {apiBlob,apiFetch} from '@/lib/api';

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
 const [selectedPackageId,setSelectedPackageId]=useState('');
 const [testName,setTestName]=useState('Complete Blood Count');
 const [testCode,setTestCode]=useState('CBC');
 const [sampleType,setSampleType]=useState('Blood');
 const [price,setPrice]=useState('350');
 const [templateName,setTemplateName]=useState('Standard Result Template');
 const [resultText,setResultText]=useState<Record<string,string>>({});
 const [reportUrl,setReportUrl]=useState<Record<string,string>>({});
 const labReady=appointments.filter((a:any)=>a.consultationId&&a.consultationStatus==='signed');
 const patientMap=useMemo(()=>new Map(patients.map((p:any)=>[p.id,p])),[patients]);

 useEffect(()=>{if(!patientId&&patients[0]?.id)setPatientId(patients[0].id)},[patients,patientId]);
 useEffect(()=>{load()},[apiSession?.token,apiSession?.tenantId]);

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
  try{
   await apiFetch('/lab/orders',apiSession,{method:'POST',body:JSON.stringify({branch_id:branchId,patient_id:patientId,source,tests:manualTests,test_ids:selectedTestIds,package_ids:selectedPackageId?[selectedPackageId]:[],external_referrer:source==='external_referral'?externalReferrer:null,amount:0,ordered_by_user_id:apiSession.user?.id})});
   await load();setMessage('Lab order created.');
  }catch(err:any){setMessage(err.message||'Could not create lab order.')}finally{setBusy('')}
 }

 async function createFromConsultation(a:any){
  setBusy(a.consultationId);setMessage('');
  try{
   await apiFetch(`/lab/orders/from-consultation/${a.consultationId}`,apiSession,{method:'POST',body:JSON.stringify({amount:0,priority:a.tokenType==='Emergency'?'urgent':'routine',ordered_by_user_id:apiSession.user?.id})});
   await load();setMessage('Lab order created from consultation referral.');
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

 if(!apiSession)return <Card><h3 className="text-lg font-bold">Lab & Diagnostic Integration</h3><p className="mt-2 text-sm text-slate-500">Backend login is required to view lab data.</p></Card>;
 return <div className="space-y-6">
  <Card><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start"><div><h3 className="text-lg font-bold">Lab Catalog</h3><p className="text-sm text-slate-500">Tests, packages, and result templates used by OP, external, and doctor-referred orders.</p></div><Badge tone="blue">{tests.length} tests</Badge></div>{message&&<div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}<form onSubmit={createTest} className="mt-4 grid gap-3 md:grid-cols-5"><Field label="Code"><Input value={testCode} onChange={(e:any)=>setTestCode(e.target.value)}/></Field><Field label="Test Name"><Input value={testName} onChange={(e:any)=>setTestName(e.target.value)}/></Field><Field label="Sample"><Input value={sampleType} onChange={(e:any)=>setSampleType(e.target.value)}/></Field><Field label="Price"><Input type="number" value={price} onChange={(e:any)=>setPrice(e.target.value)}/></Field><div className="flex items-end"><Button disabled={busy==='test'}>{busy==='test'?'Saving...':'Add Test'}</Button></div></form><div className="mt-4 grid gap-3 lg:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Catalog Tests</p><div className="mt-3 flex flex-wrap gap-2">{tests.slice(0,12).map((test:any)=><button key={test.id} type="button" onClick={()=>setSelectedTestIds(ids=>ids.includes(test.id)?ids.filter(id=>id!==test.id):[...ids,test.id])} className={`rounded-xl border px-3 py-2 text-xs font-bold ${selectedTestIds.includes(test.id)?'bg-slate-900 text-white':'bg-white'}`}>{test.name} · ₹{test.default_price}</button>)}</div></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Packages</p><div className="mt-3 flex flex-wrap gap-2">{packages.map((pkg:any)=><button key={pkg.id} type="button" onClick={()=>setSelectedPackageId(selectedPackageId===pkg.id?'':pkg.id)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${selectedPackageId===pkg.id?'bg-slate-900 text-white':'bg-white'}`}>{pkg.name} · ₹{pkg.package_price}</button>)}</div><button type="button" onClick={createPackage} disabled={busy==='package'||selectedTestIds.length===0} className="mt-3 rounded-xl border px-3 py-2 text-xs font-bold disabled:text-slate-300">Create Package from Selected</button></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Result Templates</p><Field label="Template Name"><Input value={templateName} onChange={(e:any)=>setTemplateName(e.target.value)}/></Field><button type="button" onClick={createTemplate} disabled={busy==='template'} className="mt-2 rounded-xl border px-3 py-2 text-xs font-bold">Add Template</button><div className="mt-3 flex flex-wrap gap-2">{templates.slice(0,6).map((template:any)=><Badge key={template.id}>{template.name}</Badge>)}</div></div></div></Card>
  <Card><h3 className="text-lg font-bold">Create Lab Order</h3><form onSubmit={createDirect} className="mt-4 grid gap-3 md:grid-cols-6"><Field label="Patient"><Select value={patientId} onChange={(e:any)=>setPatientId(e.target.value)}>{patients.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field><Field label="Source"><Select value={source} onChange={(e:any)=>setSource(e.target.value)}><option value="op_direct">OP Direct</option><option value="external_referral">External Referral</option></Select></Field><Field label="Manual Tests"><Input value={manualTests} onChange={(e:any)=>setManualTests(e.target.value)} required/></Field><Field label="Package"><Select value={selectedPackageId} onChange={(e:any)=>setSelectedPackageId(e.target.value)}><option value="">No package</option>{packages.map((pkg:any)=><option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}</Select></Field><Field label="External Referrer"><Input value={externalReferrer} onChange={(e:any)=>setExternalReferrer(e.target.value)} disabled={source!=='external_referral'}/></Field><div className="flex items-end"><Button disabled={busy==='create'}>{busy==='create'?'Saving...':'Create Order'}</Button></div></form></Card>
  <Card><h3 className="text-lg font-bold">Consultation Referrals</h3><div className="mt-4 grid gap-3">{labReady.length===0&&<div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No signed consultation referrals ready.</div>}{labReady.slice(0,6).map((a:any)=><div key={a.id} className="flex flex-col justify-between gap-3 rounded-2xl border p-4 md:flex-row md:items-center"><div><b>{a.token} · {a.patient}</b><p className="text-sm text-slate-500">Consultation: {a.consultationId}</p></div><Button disabled={busy===a.consultationId} onClick={()=>createFromConsultation(a)}>{busy===a.consultationId?'Creating...':'Create Lab Order'}</Button></div>)}</div></Card>
  <Card><h3 className="text-lg font-bold">Lab Worklist</h3><div className="mt-4 overflow-auto rounded-2xl border"><table className="w-full min-w-[1180px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Order</th><th>Patient</th><th>Tests</th><th>Source</th><th>Status</th><th>Amount</th><th>Result Entry</th><th>Actions</th></tr></thead><tbody className="divide-y">{orders.length===0&&<tr><td colSpan={8} className="px-4 py-4 text-slate-500">No lab orders yet.</td></tr>}{orders.map((o:any)=>{const p:any=patientMap.get(o.patient_id);return <tr key={o.id}><td className="px-4 py-4"><b>{o.id}</b><p className="text-xs text-slate-500">{new Date(o.created_at).toLocaleString()}</p></td><td>{p?.name||o.patient_id}</td><td>{o.tests}</td><td><Badge>{o.source}</Badge></td><td><Badge tone={o.status==='result_ready'?'green':o.status==='cancelled'?'red':'amber'}>{o.status}</Badge></td><td>₹{o.amount}</td><td><div className="grid min-w-[280px] gap-2"><Input placeholder="Result summary" value={resultText[o.id]||''} onChange={(e:any)=>setResultText({...resultText,[o.id]:e.target.value})}/><Input placeholder="Report file URL" value={reportUrl[o.id]||''} onChange={(e:any)=>setReportUrl({...reportUrl,[o.id]:e.target.value})}/></div></td><td><div className="flex flex-wrap gap-2"><button disabled={busy===o.id} onClick={()=>collectSample(o)} className="rounded-xl border px-3 py-2 disabled:text-slate-300">Sample</button><button disabled={busy===o.id} onClick={()=>releaseResult(o)} className="rounded-xl bg-slate-900 px-3 py-2 text-white disabled:bg-slate-300">Release</button><button disabled={busy===o.id} onClick={()=>openReport(o)} className="rounded-xl border px-3 py-2 disabled:text-slate-300">PDF</button><button disabled={busy===o.id} onClick={()=>updateStatus(o,'cancelled')} className="rounded-xl border px-3 py-2 text-red-600 disabled:text-slate-300">Cancel</button></div></td></tr>})}</tbody></table></div></Card>
 </div>
}
