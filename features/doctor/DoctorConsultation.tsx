'use client';

import {useEffect,useState} from 'react';
import {Badge,Button,Card,Field,Input,Select} from '@/components/ui';
import {apiFetch,type ApiSession} from '@/lib/api';
import {doctorFeeSettings,labCatalog,practitioners,scanCatalog} from '@/lib/mockData';
import {calculateConsultationCharge,getDoctorFeeSetting,practitionersByDepartment,sortQueue} from '@/lib/hmsLogic';

export function DoctorConsultation({clinic,branch,branchId,departmentId,patients,scopedAppointments,appointments,setAppointments,apiSession,loadLiveData}:any){
 const doctorList=practitionersByDepartment(practitioners,departmentId);
 const [doctorId,setDoctorId]=useState(doctorList[0]?.id||'pr1');
 const [selectedAppointmentId,setSelectedAppointmentId]=useState('');
 const [tick,setTick]=useState(0);
 const [feeType,setFeeType]=useState('OP');
 const [treatmentType,setTreatmentType]=useState('general_consultation');
 const [ipBaseAmount,setIpBaseAmount]=useState(10000);
 const [extraFee,setExtraFee]=useState(0);
 const [notes,setNotes]=useState('');
 const [remarks,setRemarks]=useState('');
 const [diagnosis,setDiagnosis]=useState('');
 const [prescription,setPrescription]=useState('Paracetamol 500mg - 1-0-1 after food - 3 days');
 const [vitals,setVitals]=useState('BP=120/80 mmHg, Pulse=78 bpm, Temp=98.6 F');
 const [complaints,setComplaints]=useState('Fever | 2 days | medium');
 const [diagnosisRows,setDiagnosisRows]=useState('Viral fever | primary | Hydration advised');
 const [medicineRows,setMedicineRows]=useState('Paracetamol | 500mg | 1-0-1 | 3 days | After food');
 const [referralRows,setReferralRows]=useState('lab | CBC | routine | If fever persists');
 const [templates,setTemplates]=useState<any[]>([]);
 const [addendumNote,setAddendumNote]=useState('');
 const [medicineAmount,setMedicineAmount]=useState(250);
 const [labNeeded,setLabNeeded]=useState(false);
 const [labTests,setLabTests]=useState('CBC, FBS');
 const [scanNeeded,setScanNeeded]=useState(false);
 const [scanTests,setScanTests]=useState('X-Ray');
 const [referDoctor,setReferDoctor]=useState(false);
 const [referDoctorId,setReferDoctorId]=useState('pr2');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{const id=setInterval(()=>setTick(v=>v+1),5000); return ()=>clearInterval(id)},[]);
 const doctor=practitioners.find(p=>p.id===doctorId)||doctorList[0]||practitioners[0];
 const feeSetting=getDoctorFeeSetting(doctorFeeSettings,clinic.id,doctor.id,departmentId);
 const consultationCharge=calculateConsultationCharge(feeSetting,feeType,ipBaseAmount);
 const doctorQueue=sortQueue(scopedAppointments.filter((a:any)=>a.doctorId===doctor.id || a.departmentId===departmentId));
 const activeQueue=doctorQueue.filter((a:any)=>!['Consultation Done','Cancelled','Billed','Seen'].includes(a.status));
 const current=activeQueue.find((a:any)=>a.queueStatus==='Called') || activeQueue.find((a:any)=>a.queueStatus==='Emergency Queue') || activeQueue.find((a:any)=>a.queueStatus==='In Queue') || activeQueue.find((a:any)=>a.queueStatus==='Requeued') || activeQueue[0];
 const selected=doctorQueue.find((a:any)=>a.id===selectedAppointmentId) || current;
 useEffect(()=>{if(selected?.treatmentType)setTreatmentType(selected.treatmentType);else if(selected?.visitPurpose==='fitness_certificate'||selected?.visitType==='FITNESS CERTIFICATE')setTreatmentType('fitness_certificate');else if(selected?.visitPurpose==='doctor_review'||selected?.visitType==='DOCTOR REVIEW')setTreatmentType('doctor_review')},[selected?.id]);
 const patient=patients.find((p:any)=>p.id===selected?.patientId);
 const completedToday=doctorQueue.filter((a:any)=>['Consultation Done','Seen','Billed'].includes(a.status)).length;
 const waitingToday=activeQueue.filter((a:any)=>['In Queue','Emergency Queue','Requeued','Called'].includes(a.queueStatus)).length;
 const finalFee=Number(consultationCharge||selected?.fee||0)+Number(extraFee||0);
 useEffect(()=>{let alive=true;async function loadTemplates(){if(!apiSession)return;try{const rows=await apiFetch(`/consultations/by-department/${encodeURIComponent(departmentId)}/clinical-templates`,apiSession);if(alive)setTemplates(rows)}catch{if(alive)setTemplates([])}}loadTemplates();return()=>{alive=false}},[apiSession?.token,apiSession?.tenantId,departmentId]);
 function updateAppt(id:string, patch:any){setAppointments(appointments.map((a:any)=>a.id===id?{...a,...patch}:a))}
 function splitRows(value:string){return value.split('\n').map((line:string)=>line.trim()).filter(Boolean)}
 function structuredPayload(){
  return {
   vitals:vitals.split(',').map((item:string)=>item.trim()).filter(Boolean).map((item:string)=>{const [name,rest='']=item.split('=');const parts=rest.trim().split(' ');return {name:name.trim(),value:parts[0]||rest.trim(),unit:parts.slice(1).join(' ')||null}}),
   complaints:splitRows(complaints).map((line:string)=>{const [complaint,duration,severity]=line.split('|').map((part:string)=>part.trim());return {complaint,duration:duration||null,severity:severity||null}}),
   diagnoses:splitRows(diagnosisRows).map((line:string)=>{const [dx,type,dxNotes]=line.split('|').map((part:string)=>part.trim());return {diagnosis:dx,diagnosis_type:type||'primary',notes:dxNotes||null}}),
   medicines:splitRows(medicineRows).map((line:string)=>{const [medicine_name,dosage,frequency,duration,instructions]=line.split('|').map((part:string)=>part.trim());return {medicine_name,dosage:dosage||null,frequency:frequency||null,duration:duration||null,instructions:instructions||null}}),
   referrals:splitRows(referralRows).map((line:string)=>{const [referral_type,item_name,priority,instructions]=line.split('|').map((part:string)=>part.trim());return {referral_type:referral_type||'lab',item_name,priority:priority||'routine',instructions:instructions||null}}).filter((row:any)=>row.item_name)
  }
 }
 async function callPatient(a:any){if(apiSession&&a.queueEntryId){setBusy(true);setMessage('');try{await apiFetch(`/queue/${a.queueEntryId}/call`,apiSession,{method:'POST',body:JSON.stringify({reason:'Called from doctor dashboard'})});await loadLiveData(apiSession);setSelectedAppointmentId(a.id);setMessage('Token called in backend.')}catch(err:any){setMessage(err.message||'Could not call patient.')}finally{setBusy(false)}return}updateAppt(a.id,{queueStatus:'Called',status:'In Consultation'});setSelectedAppointmentId(a.id)}
 function callNext(){if(current) callPatient(current)}
 function skipPatient(){if(!selected)return; updateAppt(selected.id,{status:'Patient Not Available',queueStatus:'Not Available',skippedCount:(selected.skippedCount||0)+1})}
 function requeuePatient(mode:'after2'|'end'){if(!selected)return; updateAppt(selected.id,{status:'Scheduled',queueStatus:'Requeued',priority:mode==='after2'?2.5:5,requeueMode:mode})}
 function cancelAppointment(){if(!selected)return; updateAppt(selected.id,{status:'Cancelled',queueStatus:'Cancelled'})}
 function markDone(){
  if(!selected)return;
  const referralDoctor=referDoctor?practitioners.find(p=>p.id===referDoctorId):null;
 updateAppt(selected.id,{status:'Consultation Done',queueStatus:'Completed',doctorNotes:notes,patientRemarks:remarks,diagnosis,prescription,medicineAmount:Number(medicineAmount||0),labNeeded,labTests,labAmount:labNeeded?labTests.split(',').length*350:0,scanNeeded,scanTests,scanAmount:scanNeeded?scanTests.split(',').length*900:0,referDoctor,referDoctorId:referralDoctor?.id,referDoctorName:referralDoctor?.name,feeType,consultationCharge,ipBaseAmount,extraFee:Number(extraFee||0),finalFee});
  setNotes('');setRemarks('');setDiagnosis('');setExtraFee(0);setLabNeeded(false);setScanNeeded(false);setReferDoctor(false);
 }
 async function ensureBackendConsultation(){
  if(!apiSession||!selected)throw new Error('Backend login and appointment selection are required.');
  if(selected.queueEntryId&&selected.queueStatus!=='in_consultation'&&selected.status!=='in_consultation'){try{await apiFetch(`/queue/${selected.queueEntryId}/start-consultation`,apiSession,{method:'POST',body:JSON.stringify({reason:'Started from doctor dashboard'})})}catch(err:any){if(!String(err.message||'').includes('already'))throw err}}
  if(selected.consultationId)return selected.consultationId;
   const created=await apiFetch('/consultations',apiSession,{method:'POST',body:JSON.stringify({appointment_id:selected.id,treatment_type:treatmentType,created_by_user_id:apiSession.user?.id,...structuredPayload()})});
  await loadLiveData(apiSession);
  return created.id;
 }
 async function saveBackendDraft(){
  setBusy(true);setMessage('');
  try{
   const consultationId=await ensureBackendConsultation();
   await apiFetch(`/consultations/${consultationId}`,apiSession,{method:'PATCH',body:JSON.stringify({treatment_type:treatmentType,diagnosis,clinical_notes:notes,prescription_text:prescription,lab_referral_text:labNeeded?labTests:null,scan_referral_text:scanNeeded?scanTests:null,follow_up_advice:remarks,patient_remarks:remarks,...structuredPayload()})});
   await loadLiveData(apiSession);setMessage('Consultation draft saved to backend.');
  }catch(err:any){setMessage(err.message||'Could not save consultation.')}finally{setBusy(false)}
 }
 async function signBackendConsultation(){
  setBusy(true);setMessage('');
  try{
   const consultationId=await ensureBackendConsultation();
   await apiFetch(`/consultations/${consultationId}`,apiSession,{method:'PATCH',body:JSON.stringify({treatment_type:treatmentType,diagnosis,clinical_notes:notes,prescription_text:prescription,lab_referral_text:labNeeded?labTests:null,scan_referral_text:scanNeeded?scanTests:null,follow_up_advice:remarks,patient_remarks:remarks,...structuredPayload()})});
   await apiFetch(`/consultations/${consultationId}/sign`,apiSession,{method:'POST',body:JSON.stringify({signed_by_user_id:apiSession.user?.id})});
   await loadLiveData(apiSession);setMessage('Consultation signed and locked in backend.');
  }catch(err:any){setMessage(err.message||'Could not sign consultation.')}finally{setBusy(false)}
 }
 async function saveAddendum(){if(!apiSession||!selected?.consultationId||!addendumNote.trim())return;setBusy(true);setMessage('');try{await apiFetch(`/consultations/${selected.consultationId}/addendums`,apiSession,{method:'POST',body:JSON.stringify({note:addendumNote,created_by_user_id:apiSession.user?.id})});setAddendumNote('');setMessage('Addendum saved to signed consultation.')}catch(err:any){setMessage(err.message||'Could not save addendum.')}finally{setBusy(false)}}
 return <div className="space-y-6">
  <div className="grid gap-4 md:grid-cols-4"><Card><p className="text-sm text-slate-500">Today Booked</p><p className="mt-1 text-3xl font-bold">{doctorQueue.length}</p><p className="text-xs text-slate-500">{doctor.name}</p></Card><Card><p className="text-sm text-slate-500">Waiting</p><p className="mt-1 text-3xl font-bold">{waitingToday}</p><p className="text-xs text-slate-500">Live token queue</p></Card><Card><p className="text-sm text-slate-500">Completed</p><p className="mt-1 text-3xl font-bold">{completedToday}</p><p className="text-xs text-slate-500">Consultation done</p></Card><Card><p className="text-sm text-slate-500">Auto Refresh</p><p className="mt-1 text-2xl font-bold">Socket-ready</p><p className="text-xs text-slate-500">Mock refresh #{tick}</p></Card></div>
  <div className="grid gap-6 xl:grid-cols-3"><Card><div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-bold">Doctor Dashboard</h3><p className="text-sm text-slate-500">Today's booked appointments</p></div><Badge tone="blue">{branch.name}</Badge></div>{message&&<div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}<div className="mt-4 grid gap-3"><Field label="Practitioner"><Select value={doctorId} onChange={(e:any)=>{setDoctorId(e.target.value);setSelectedAppointmentId('')}}>{doctorList.map((d:any)=><option key={d.id} value={d.id}>{d.name} - {d.specialty}</option>)}</Select></Field><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Current Patient</p>{selected?<><p className="mt-2 text-2xl font-bold">{selected.token}</p><p className="font-semibold">{selected.patient}</p><p className="text-sm text-slate-500">{selected.status} · {selected.queueStatus}</p><div className="mt-3 flex flex-wrap gap-2"><Badge tone={selected.tokenType==='Emergency'?'red':'slate'}>{selected.tokenType}</Badge><Badge>{treatmentType.replaceAll('_',' ')}</Badge>{selected.consultationStatus&&<Badge tone={selected.consultationStatus==='signed'?'green':'blue'}>{selected.consultationStatus}</Badge>}</div></>:<p className="mt-2 text-sm text-slate-500">No patient selected</p>}</div><Button onClick={callNext} disabled={!current||busy}>Call Next Patient</Button></div><div className="mt-5 space-y-3">{doctorQueue.map((a:any)=><button key={a.id} onClick={()=>setSelectedAppointmentId(a.id)} className={`w-full rounded-2xl border p-4 text-left ${selected?.id===a.id?'border-slate-900 bg-slate-50':'border-slate-200 bg-white'}`}><div className="flex items-start justify-between gap-3"><div><b>{a.token} · {a.patient}</b><p className="text-xs text-slate-500">{a.time} · {a.status} · {a.queueStatus}</p></div><div className="flex flex-wrap gap-2"><Badge tone={a.tokenType==='Emergency'?'red':'amber'}>{a.tokenType}</Badge>{a.consultationStatus&&<Badge tone={a.consultationStatus==='signed'?'green':'blue'}>{a.consultationStatus}</Badge>}</div></div></button>)}</div></Card>
  <Card className="xl:col-span-2"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div><h3 className="text-lg font-bold">Consultation Workspace</h3><p className="text-sm text-slate-500">Structured vitals, complaints, diagnosis, prescription, referrals, follow-up and addendums.</p></div><div className="flex flex-wrap gap-2"><button onClick={()=>selected&&callPatient(selected)} className="rounded-2xl border px-4 py-3 text-sm font-bold">Call</button><button onClick={skipPatient} className="rounded-2xl border px-4 py-3 text-sm font-bold">Not Present</button><button onClick={()=>requeuePatient('after2')} className="rounded-2xl border px-4 py-3 text-sm font-bold">Requeue</button><button onClick={cancelAppointment} className="rounded-2xl border px-4 py-3 text-sm font-bold text-red-600">Cancel</button></div></div>{!selected?<div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">No appointment selected.</div>:<div className="mt-5 space-y-5"><div className="grid gap-3 md:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Patient ID</p><p className="font-bold">{patient?.id}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Age / Gender</p><p className="font-bold">{patient?.age} / {patient?.gender}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Allergies</p><p className="font-bold">{patient?.allergies||'None'}</p></div></div>{templates.length>0&&<div className="flex flex-wrap gap-2">{templates.map((template:any)=><button key={template.id} type="button" onClick={()=>{setComplaints((template.content?.complaints||[]).join('\\n')||complaints);setDiagnosisRows((template.content?.diagnoses||[]).map((x:string)=>`${x} | primary`).join('\\n')||diagnosisRows)}} className="rounded-xl border px-3 py-2 text-xs font-bold">{template.name}</button>)}</div>}<div className="grid gap-3 md:grid-cols-2"><Field label="Treatment Type"><Select value={treatmentType} onChange={(e:any)=>setTreatmentType(e.target.value)}><option value="general_consultation">General Consultation</option><option value="doctor_review">Doctor Review</option><option value="fitness_certificate">Fitness Certificate</option><option value="pediatric_consultation">Pediatric Consultation</option><option value="diabetology_consultation">Diabetology Consultation</option><option value="procedure_review">Procedure Review</option><option value="follow_up">Follow-up</option></Select></Field><Field label="Follow-up Advice"><Input value={remarks} onChange={(e:any)=>setRemarks(e.target.value)} placeholder="Review after 3 days"/></Field></div><Field label="Vitals"><Input value={vitals} onChange={(e:any)=>setVitals(e.target.value)} placeholder="BP=120/80 mmHg, Pulse=78 bpm"/></Field><div className="grid gap-3 md:grid-cols-2"><Field label="Complaints Rows"><textarea value={complaints} onChange={(e:any)=>setComplaints(e.target.value)} className="min-h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="Fever | 2 days | medium"/></Field><Field label="Diagnosis Rows"><textarea value={diagnosisRows} onChange={(e:any)=>setDiagnosisRows(e.target.value)} className="min-h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="Viral fever | primary | notes"/></Field></div><Field label="Doctor Notes"><textarea value={notes} onChange={(e:any)=>setNotes(e.target.value)} className="min-h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="Clinical notes, advice..."/></Field><Field label="Prescription Medicine Rows"><textarea value={medicineRows} onChange={(e:any)=>setMedicineRows(e.target.value)} className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="Medicine | dosage | frequency | duration | instructions"/></Field><Field label="Lab / Scan Referral Rows"><textarea value={referralRows} onChange={(e:any)=>setReferralRows(e.target.value)} className="min-h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="lab | CBC | routine | instructions&#10;scan | X-Ray | urgent | instructions"/></Field><div className="grid gap-3 md:grid-cols-3"><div className="rounded-3xl bg-slate-50 p-4"><label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={labNeeded} onChange={(e:any)=>setLabNeeded(e.target.checked)}/> Lab test needed</label>{labNeeded&&<Field label="Lab Tests"><Input value={labTests} onChange={(e:any)=>setLabTests(e.target.value)} placeholder="CBC, FBS, HbA1c"/></Field>}<div className="mt-2 flex flex-wrap gap-1">{labCatalog.map((l:any)=><Badge key={l.id}>{l.name}</Badge>)}</div></div><div className="rounded-3xl bg-slate-50 p-4"><label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={scanNeeded} onChange={(e:any)=>setScanNeeded(e.target.checked)}/> Scan referral</label>{scanNeeded&&<Field label="Scan / Diagnostic"><Input value={scanTests} onChange={(e:any)=>setScanTests(e.target.value)} placeholder="X-Ray, ECG, Ultrasound"/></Field>}<div className="mt-2 flex flex-wrap gap-1">{scanCatalog.map((s:any)=><Badge key={s.id}>{s.name}</Badge>)}</div></div><div className="rounded-3xl bg-slate-50 p-4"><label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={referDoctor} onChange={(e:any)=>setReferDoctor(e.target.checked)}/> Refer another doctor</label>{referDoctor&&<Field label="Recommended Doctor"><Select value={referDoctorId} onChange={(e:any)=>setReferDoctorId(e.target.value)}>{practitioners.filter(p=>p.role==='Doctor'&&p.id!==doctor.id).map((p:any)=><option key={p.id} value={p.id}>{p.name} - {p.specialty}</option>)}</Select></Field>}</div></div>{selected?.consultationStatus==='signed'&&<div className="rounded-3xl bg-emerald-50 p-4"><Field label="Signed Record Addendum"><textarea value={addendumNote} onChange={(e:any)=>setAddendumNote(e.target.value)} className="min-h-20 w-full rounded-2xl border border-emerald-100 px-4 py-3 text-sm outline-none" placeholder="Add clarification without changing signed record"/></Field><Button onClick={saveAddendum} disabled={busy||!addendumNote.trim()}>Save Addendum</Button></div>}<div className="flex flex-wrap gap-3"><Button onClick={apiSession?saveBackendDraft:markDone} disabled={busy||selected?.consultationStatus==='signed'}>{apiSession?'Save Draft':'Mark Consultation Done'}</Button>{apiSession&&<Button onClick={signBackendConsultation} disabled={busy||selected?.consultationStatus==='signed'} className="bg-emerald-700">Sign & Lock</Button>}<button onClick={()=>requeuePatient('end')} className="rounded-2xl border px-4 py-3 text-sm font-bold">Requeue to End</button></div></div>}</Card></div>
  <Card><h3 className="text-lg font-bold">Doctor Revenue Tracking Logic</h3><div className="mt-3 grid gap-3 md:grid-cols-5"><div className="rounded-2xl bg-slate-50 p-4"><b>Consultation</b><p className="text-sm text-slate-500">OP/IP/Online/Home Visit</p></div><div className="rounded-2xl bg-slate-50 p-4"><b>Lab Referral</b><p className="text-sm text-slate-500">Lab tests written</p></div><div className="rounded-2xl bg-slate-50 p-4"><b>Scan Referral</b><p className="text-sm text-slate-500">Diagnostics referred</p></div><div className="rounded-2xl bg-slate-50 p-4"><b>Pharmacy</b><p className="text-sm text-slate-500">Medicine value referred</p></div><div className="rounded-2xl bg-slate-50 p-4"><b>Reports</b><p className="text-sm text-slate-500">Admin revenue analytics</p></div></div></Card>
 </div>
}
