'use client';

import {useEffect,useMemo,useState} from 'react';
import {Plus} from 'lucide-react';
import {Badge,Button,Card,Field,Input,Select} from '@/components/ui';
import {apiFetch,type ApiSession} from '@/lib/api';

type PatientProps = {
  patients: any[];
  appointments: any[];
  ipAdmissions: any[];
  apiSession: ApiSession | null;
};

const pageSize = 10;
const genders = [
  ['unknown','Unknown'],
  ['male','Male'],
  ['female','Female'],
  ['other','Other'],
] as const;

export function Patient({patients, appointments, ipAdmissions, apiSession}: PatientProps) {
  const isSuperAdmin=Boolean(apiSession?.user?.is_super_admin);
  const [view,setView]=useState('list');
  const [tenants,setTenants]=useState<any[]>([]);
  const [tenantId,setTenantId]=useState(apiSession?.tenantId||'');
  const [branches,setBranches]=useState<any[]>([]);
  const [rows,setRows]=useState<any[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [selectedDetail,setSelectedDetail]=useState<any>(null);
  const [summary,setSummary]=useState<any>(null);
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('all');
  const [gender,setGender]=useState('all');
  const [branchFilter,setBranchFilter]=useState('all');
  const [fromDate,setFromDate]=useState('');
  const [toDate,setToDate]=useState('');
  const [page,setPage]=useState(1);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [confirm,setConfirm]=useState<any>(null);
  const scopedSession=apiSession&&tenantId?{...apiSession,tenantId}:apiSession;
  const selected=selectedDetail||rows.find((row:any)=>row.id===selectedId);

  async function loadTenants(){
    if(!apiSession?.user?.is_super_admin)return;
    const tenantRows=await apiFetch('/tenants',apiSession);
    setTenants(tenantRows);
    if(!tenantId)setTenantId(tenantRows.find((tenant:any)=>!tenant.is_primary)?.id||tenantRows[0]?.id||apiSession.tenantId);
  }

  async function loadData(nextTenantId=tenantId){
    if(!apiSession||!nextTenantId)return;
    setBusy(true);setMessage('');
    const session={...apiSession,tenantId:nextTenantId};
    try{
      const [branchRows,patientRows]=await Promise.all([
        apiFetch(`/tenants/${nextTenantId}/branches`,session).catch(()=>[]),
        apiFetch(`/patients?limit=100${query?`&q=${encodeURIComponent(query)}`:''}`,session),
      ]);
      setBranches(branchRows);setRows(patientRows);
      if(!selectedId&&patientRows[0]?.id)setSelectedId(patientRows[0].id);
    }catch(err:any){setMessage(err.message||'Could not load patients.')}finally{setBusy(false)}
  }

  async function loadPatientDetail(id:string){
    if(!scopedSession||!id)return;
    setBusy(true);setMessage('');
    try{
      const [detail,summaryData]=await Promise.all([
        apiFetch(`/patients/${id}`,scopedSession),
        apiFetch(`/patients/${id}/summary`,scopedSession),
      ]);
      setSelectedDetail(detail);setSummary(summaryData);setSelectedId(id);
    }catch(err:any){setMessage(err.message||'Could not load patient details.')}finally{setBusy(false)}
  }

  useEffect(()=>{if(apiSession){loadTenants()}},[apiSession?.token]);
  useEffect(()=>{if(apiSession&&tenantId){loadData(tenantId)}},[apiSession?.token,tenantId]);

  function open(nextView:string,id=''){
    if(id)setSelectedId(id);
    if(nextView==='detail'&&id)loadPatientDetail(id);
    setView(nextView);
    requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}));
  }

  async function createPatient(e:any){
    e.preventDefault();if(!scopedSession)return;
    const form=e.currentTarget;const fd=new FormData(form);
    setBusy(true);setMessage('');
    try{
      const created=await apiFetch('/patients',scopedSession,{method:'POST',body:JSON.stringify(formPayload(fd))});
      setRows((previous:any[])=>[toRow(created),...previous.filter((row:any)=>row.id!==created.id)]);
      form.reset();setSelectedId(created.id);await loadData(tenantId);open('detail',created.id);setMessage(`Patient created: ${created.full_name}`);
    }catch(err:any){setMessage(err.message||'Could not create patient.')}finally{setBusy(false)}
  }

  async function updatePatient(e:any){
    e.preventDefault();if(!scopedSession||!selectedId)return;
    const fd=new FormData(e.currentTarget);
    setBusy(true);setMessage('');
    try{
      const updated=await apiFetch(`/patients/${selectedId}`,scopedSession,{method:'PATCH',body:JSON.stringify({...formPayload(fd),status:fd.get('status')||'active'})});
      setRows((previous:any[])=>[toRow(updated),...previous.filter((row:any)=>row.id!==updated.id)]);
      setSelectedDetail(updated);await loadData(tenantId);open('detail',updated.id);setMessage('Patient updated.');
    }catch(err:any){setMessage(err.message||'Could not update patient.')}finally{setBusy(false)}
  }

  async function deactivatePatient(row:any){
    if(!scopedSession)return;
    setBusy(true);setMessage('');
    try{
      await apiFetch(`/patients/${row.id}`,scopedSession,{method:'DELETE'});
      setRows((previous:any[])=>previous.map((item:any)=>item.id===row.id?{...item,status:'inactive'}:item));
      if(selectedId===row.id)setSelectedDetail({...selectedDetail,status:'inactive'});
      setMessage('Patient deleted/deactivated.');
    }catch(err:any){setMessage(err.message||'Could not delete patient.')}finally{setBusy(false);setConfirm(null)}
  }

  if(!apiSession)return <Card><h3 className="text-lg font-bold">EMR / Patient Management</h3><p className="mt-2 text-sm text-slate-500">Backend login is required to view patient records.</p></Card>;

  if(view==='create')return <PatientForm title="Create Patient" branches={branches} busy={busy} onSubmit={createPatient} back={()=>open('list')}/>;
  if(view==='edit'&&selected)return <PatientForm title="Edit Patient" patient={selected} branches={branches} busy={busy} onSubmit={updatePatient} back={()=>open('detail',selected.id)}/>;
  if(view==='detail'&&selected)return <PatientDetail patient={selected} summary={summary} appointments={appointments} ipAdmissions={ipAdmissions} loading={busy} message={message} onBack={()=>open('list')} onEdit={()=>open('edit',selected.id)}/>;

  const filtered=rows.filter((row:any)=>{
    const created=row.created_at?new Date(row.created_at).getTime():0;
    const from=fromDate?new Date(fromDate).getTime():0;
    const to=toDate?new Date(`${toDate}T23:59:59`).getTime():Number.MAX_SAFE_INTEGER;
    return (status==='all'||row.status===status)
      &&(gender==='all'||row.gender===gender)
      &&(branchFilter==='all'||row.branch_id===branchFilter)
      &&(!fromDate||created>=from)&&(!toDate||created<=to);
  }).sort((a:any,b:any)=>new Date(b.updated_at||b.created_at).getTime()-new Date(a.updated_at||a.created_at).getTime());
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const safePage=Math.min(page,totalPages);
  const pageRows=filtered.slice((safePage-1)*pageSize,safePage*pageSize);

  return <Card>
    <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
      <div><h3 className="text-lg font-bold">EMR / Patient Management</h3><p className="text-sm text-slate-500">Tenant-scoped patient registry with history, alerts, treatment timeline, and audited record views.</p></div>
      <button type="button" onClick={()=>open('create')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"><Plus size={16}/>Create Patient</button>
    </div>
    {message&&<div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
    <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
      {isSuperAdmin&&<Field label="Tenant"><Select value={tenantId} onChange={(e:any)=>setTenantId(e.target.value)}>{tenants.map((tenant:any)=><option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</Select></Field>}
      <Field label="Patient / Mobile"><Input value={query} onChange={(e:any)=>setQuery(e.target.value)} placeholder="Name, mobile, area"/></Field>
      <Field label="Branch"><Select value={branchFilter} onChange={(e:any)=>{setBranchFilter(e.target.value);setPage(1)}}><option value="all">All branches</option>{branches.map((branch:any)=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field>
      <Field label="Gender"><Select value={gender} onChange={(e:any)=>{setGender(e.target.value);setPage(1)}}><option value="all">All gender</option>{genders.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field>
      <Field label="Status"><Select value={status} onChange={(e:any)=>{setStatus(e.target.value);setPage(1)}}><option value="all">All status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="deceased">Deceased</option></Select></Field>
      <Field label="From"><Input type="date" value={fromDate} onChange={(e:any)=>setFromDate(e.target.value)}/></Field>
      <Field label="To"><Input type="date" value={toDate} onChange={(e:any)=>setToDate(e.target.value)}/></Field>
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><Button onClick={()=>{setPage(1);loadData(tenantId)}} disabled={busy}>{busy?'Searching...':'Search'}</Button><button type="button" onClick={()=>{setQuery('');setStatus('all');setGender('all');setBranchFilter('all');setFromDate('');setToDate('');setPage(1);setTimeout(()=>loadData(tenantId),0)}} className="rounded-2xl border px-4 py-3 text-sm font-bold">Reset</button></div>
    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
      <div className="hidden grid-cols-[1.15fr_.85fr_.9fr_.8fr_.85fr_.75fr_1.15fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid"><span>Patient</span><span>Mobile</span><span>Branch</span><span>Gender / Age</span><span>Alerts</span><span>Status</span><span>Actions</span></div>
      <div className="divide-y divide-slate-200">{pageRows.length===0&&<Empty text={busy?'Loading patients...':'No patients match your search.'}/>} {pageRows.map((row:any)=><PatientRow key={row.id} row={row} branches={branches} onView={()=>open('detail',row.id)} onEdit={()=>{setSelectedDetail(row);open('edit',row.id)}} onDelete={()=>setConfirm({row})}/>)}</div>
    </div>
    <Pagination page={safePage} totalPages={totalPages} total={filtered.length} onPage={setPage}/>
    {confirm&&<ConfirmModal busy={busy} row={confirm.row} onClose={()=>setConfirm(null)} onConfirm={()=>deactivatePatient(confirm.row)}/>}
  </Card>
}

function formPayload(fd:FormData){
  return {
    branch_id:fd.get('branchId')||null,
    full_name:fd.get('fullName'),
    mobile:fd.get('mobile')||null,
    alternate_mobile:fd.get('alternateMobile')||null,
    email:fd.get('email')||null,
    gender:fd.get('gender')||'unknown',
    date_of_birth:fd.get('dateOfBirth')||null,
    age_years:fd.get('ageYears')?Number(fd.get('ageYears')):null,
    guardian_name:fd.get('guardianName')||null,
    guardian_mobile:fd.get('guardianMobile')||null,
    area:fd.get('area')||null,
    address:fd.get('address')||null,
    blood_group:fd.get('bloodGroup')||null,
  };
}

function toRow(patient:any){return {...patient,active_alert_count:0,critical_alert_count:0}}

function PatientForm({title,patient,branches,busy,onSubmit,back}:any){
  return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">{title}</h3><p className="text-sm text-slate-500">{patient?.patient_number||'Create tenant-scoped patient record.'}</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back</button></div><form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"><Field label="Full Name"><Input name="fullName" defaultValue={patient?.full_name||''} required/></Field><Field label="Mobile"><Input name="mobile" defaultValue={patient?.mobile||''}/></Field><Field label="Branch"><Select name="branchId" defaultValue={patient?.branch_id||''}><option value="">No branch</option>{branches.map((branch:any)=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field><Field label="Gender"><Select name="gender" defaultValue={patient?.gender||'unknown'}>{genders.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Date of Birth"><Input name="dateOfBirth" type="date" defaultValue={patient?.date_of_birth||''}/></Field><Field label="Age Years"><Input name="ageYears" type="number" min="0" max="130" defaultValue={patient?.age_years||''}/></Field><Field label="Guardian Name"><Input name="guardianName" defaultValue={patient?.guardian_name||''}/></Field><Field label="Guardian Mobile"><Input name="guardianMobile" defaultValue={patient?.guardian_mobile||''}/></Field><Field label="Alternate Mobile"><Input name="alternateMobile" defaultValue={patient?.alternate_mobile||''}/></Field><Field label="Email"><Input name="email" type="email" defaultValue={patient?.email||''}/></Field><Field label="Area"><Input name="area" defaultValue={patient?.area||''}/></Field><Field label="Blood Group"><Input name="bloodGroup" defaultValue={patient?.blood_group||''}/></Field>{patient&&<Field label="Status"><Select name="status" defaultValue={patient.status||'active'}><option value="active">Active</option><option value="inactive">Inactive</option><option value="deceased">Deceased</option></Select></Field>}<div className="md:col-span-2 xl:col-span-3"><Field label="Address"><Input name="address" defaultValue={patient?.address||''}/></Field></div><div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3"><Button disabled={busy}>{busy?'Saving...':patient?'Save Patient':'Create Patient'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></form></Card>
}

function PatientRow({row,branches,onView,onEdit,onDelete}:any){
  const branch=branches.find((item:any)=>item.id===row.branch_id);
  return <div className="grid gap-3 px-4 py-4 text-sm xl:grid-cols-[1.15fr_.85fr_.9fr_.8fr_.85fr_.75fr_1.15fr] xl:items-center"><div><b>{row.full_name}</b><p className="text-xs text-slate-500">{row.patient_number}</p></div><span>{row.mobile||row.guardian_mobile||'-'}</span><span>{branch?.name||'No branch'}</span><span>{row.gender} / {row.age_years??'-'}</span><span>{row.critical_alert_count>0?<Badge tone="red">{row.critical_alert_count} critical</Badge>:row.active_alert_count>0?<Badge tone="amber">{row.active_alert_count} alerts</Badge>:'-'}</span><Badge tone={row.status==='active'?'green':row.status==='deceased'?'purple':'red'}>{row.status}</Badge><div className="flex flex-wrap gap-2"><button type="button" onClick={onView} className="rounded-xl border px-3 py-2 text-xs font-bold">View</button><button type="button" onClick={onEdit} className="rounded-xl border px-3 py-2 text-xs font-bold">Edit</button><button type="button" onClick={onDelete} className="rounded-xl border px-3 py-2 text-xs font-bold text-red-600">Delete</button></div></div>
}

function PatientDetail({patient,summary,appointments,ipAdmissions,loading,message,onBack,onEdit}:any){
  const alerts=[...(summary?.critical_alerts||[]),...(summary?.allergies||[])];
  const risks=[...(summary?.risk_alerts||[]),...(summary?.notes||[])];
  const patientAppointments=appointments.filter((item:any)=>item.patientId===patient.id||item.patient_id===patient.id);
  return <div className="space-y-5"><Card><div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div><h3 className="text-lg font-bold">Patient Details</h3><p className="text-sm text-slate-500">Audited EMR view with demographics, alerts, history, treatment, and timeline.</p></div><div className="flex flex-wrap gap-2">{loading&&<Badge tone="amber">Loading</Badge>}<button type="button" onClick={onBack} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Patients</button><Button onClick={onEdit}>Edit Patient</Button></div></div>{message&&<div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}<div className="mt-4 grid gap-3 md:grid-cols-3"><Info k="Name" v={patient.full_name}/><Info k="Patient Number" v={patient.patient_number}/><Info k="Mobile" v={patient.mobile||'-'}/><Info k="Age / Gender" v={`${patient.age_years??'-'} / ${patient.gender||'-'}`}/><Info k="Blood Group" v={patient.blood_group||'-'}/><Info k="Area" v={patient.area||'-'}/><Info k="Guardian" v={patient.guardian_name||'-'}/><Info k="Guardian Mobile" v={patient.guardian_mobile||'-'}/><Info k="IP Status" v={ipAdmissions.some((item:any)=>item.patientId===patient.id||item.patient_id===patient.id)?'Admitted':'No'}/></div></Card><div className="grid gap-5 lg:grid-cols-2"><Card><h4 className="font-bold text-red-700">Allergies & Critical Alerts</h4><div className="mt-3 space-y-2">{alerts.length===0&&<p className="text-sm text-slate-500">No active allergy or critical alert.</p>}{alerts.map((alert:any)=><AlertCard key={alert.id} alert={alert}/>)}</div></Card><Card><h4 className="font-bold">Risk Notes</h4><div className="mt-3 space-y-2">{risks.length===0&&<p className="text-sm text-slate-500">No active risk notes.</p>}{risks.map((alert:any)=><AlertCard key={alert.id} alert={alert}/>)}</div></Card></div><Card><h4 className="font-bold">Treatment History</h4>{patientAppointments.length===0&&<p className="mt-3 text-sm text-slate-500">No appointment history loaded in current workspace.</p>}{patientAppointments.map((item:any)=><div key={item.id} className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm"><b>{item.appointmentDate||item.appointment_date||'-'} · {item.doctor||item.practitioner_name||'Doctor'}</b><p className="text-slate-500">{item.status} · {item.queueStatus||item.queue_status||'-'} · {item.visitType||item.visit_purpose||'consultation'}</p></div>)}<h4 className="mt-6 font-bold">Timeline</h4>{summary?.timeline?.map((event:any,index:number)=><div key={`${event.type}-${index}`} className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm"><b>{event.title}</b><p className="text-slate-500">{event.recorded_at}</p></div>)}</Card></div>
}

function AlertCard({alert}:any){return <div className="rounded-xl bg-slate-50 p-3 text-sm"><b>{alert.title}</b><p className="text-slate-600">{alert.description||alert.alert_type}</p><Badge tone={alert.severity==='critical'?'red':'amber'}>{alert.severity}</Badge></div>}
function Info({k,v}:any){return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{k}</p><p className="font-bold">{v}</p></div>}
function Empty({text}:any){return <div className="px-4 py-8 text-center text-sm text-slate-500">{text}</div>}
function Pagination({page,totalPages,total,onPage}:any){return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-slate-500">{total} records · Page {page} of {totalPages}</span><div className="flex gap-2"><button type="button" onClick={()=>onPage(Math.max(1,page-1))} disabled={page<=1} className="rounded-xl border px-3 py-2 font-bold disabled:text-slate-300">Previous</button><button type="button" onClick={()=>onPage(Math.min(totalPages,page+1))} disabled={page>=totalPages} className="rounded-xl border px-3 py-2 font-bold disabled:text-slate-300">Next</button></div></div>}
function ConfirmModal({row,busy,onClose,onConfirm}:any){return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"><Card className="w-full max-w-md"><h3 className="text-lg font-bold">Delete Patient</h3><p className="mt-2 text-sm text-slate-600">This will deactivate the patient record. Treatment history remains available for audit and care continuity.</p><p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold">{row.full_name}</p><div className="mt-5 flex flex-wrap gap-2"><Button onClick={onConfirm} disabled={busy}>{busy?'Working...':'Confirm'}</Button><button type="button" onClick={onClose} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></Card></div>}
