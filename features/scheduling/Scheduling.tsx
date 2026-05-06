'use client';

import {useEffect,useState} from 'react';
import {Plus} from 'lucide-react';
import {Badge,Button,Card,Field,Input,Select} from '@/components/ui';
import {apiFetch} from '@/lib/api';
import {practitioners as mockPractitioners,schedules as mockSchedules} from '@/lib/mockData';

const weekdays=[
 ['0','Monday'],['1','Tuesday'],['2','Wednesday'],['3','Thursday'],['4','Friday'],['5','Saturday'],['6','Sunday'],
] as const;
const pageSize=10;

export function Scheduling({apiSession,branchId}:any){
 const isSuperAdmin=Boolean(apiSession?.user?.is_super_admin);
 const [view,setView]=useState('list');
 const [tenants,setTenants]=useState<any[]>([]);
 const [tenantId,setTenantId]=useState(apiSession?.tenantId||'');
 const [branches,setBranches]=useState<any[]>([]);
 const [departments,setDepartments]=useState<any[]>([]);
 const [practitioners,setPractitioners]=useState<any[]>([]);
 const [rows,setRows]=useState<any[]>([]);
 const [selectedId,setSelectedId]=useState('');
 const [query,setQuery]=useState('');
 const [filterBranch,setFilterBranch]=useState('all');
 const [filterDepartment,setFilterDepartment]=useState('all');
 const [filterWeekday,setFilterWeekday]=useState('all');
 const [filterStatus,setFilterStatus]=useState('active');
 const [page,setPage]=useState(1);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [confirm,setConfirm]=useState<any>(null);
 const scopedSession=apiSession&&tenantId?{...apiSession,tenantId}:apiSession;
 const selected=rows.find((row:any)=>row.id===selectedId);

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
   const [branchRows,departmentRows,practitionerRows,scheduleRows]=await Promise.all([
    apiFetch(`/tenants/${nextTenantId}/branches`,session).catch(()=>[]),
    apiFetch(`/tenants/${nextTenantId}/departments`,session).catch(()=>[]),
    apiFetch('/practitioners',session),
    apiFetch(`/practitioners/schedules${filterStatus==='all'?'':`?is_active=${filterStatus==='active'}`}`,session),
   ]);
   setBranches(branchRows);setDepartments(departmentRows);setPractitioners(practitionerRows);setRows(scheduleRows);
  }catch(err:any){setMessage(err.message||'Could not load schedules.')}finally{setBusy(false)}
 }

 useEffect(()=>{if(apiSession){loadTenants()}},[apiSession?.token]);
 useEffect(()=>{if(apiSession&&tenantId){loadData(tenantId)}},[apiSession?.token,tenantId,filterStatus]);

 function open(nextView:string,id=''){
  setSelectedId(id);setView(nextView);
  requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}));
 }

 async function createSchedule(e:any){
  e.preventDefault();if(!scopedSession)return;
  const form=e.currentTarget;const fd=new FormData(form);
  const practitionerId=String(fd.get('practitionerId')||'');
  setBusy(true);setMessage('');
  try{
   const created=await apiFetch(`/practitioners/${practitionerId}/schedules`,scopedSession,{method:'POST',body:JSON.stringify(payload(fd))});
   setRows((previous:any[])=>[created,...previous.filter((row:any)=>row.id!==created.id)]);
   form.reset();open('list');await loadData(tenantId);setMessage('Schedule created.');
  }catch(err:any){setMessage(err.message||'Could not create schedule.')}finally{setBusy(false)}
 }

 async function updateSchedule(e:any){
  e.preventDefault();if(!scopedSession||!selected)return;
  const fd=new FormData(e.currentTarget);
  setBusy(true);setMessage('');
  try{
   const updated=await apiFetch(`/practitioners/schedules/${selected.id}`,scopedSession,{method:'PATCH',body:JSON.stringify({...payload(fd),practitioner_id:fd.get('practitionerId'),is_active:fd.get('isActive')==='true'})});
   setRows((previous:any[])=>[updated,...previous.filter((row:any)=>row.id!==updated.id)]);
   open('list');await loadData(tenantId);setMessage('Schedule updated.');
  }catch(err:any){setMessage(err.message||'Could not update schedule.')}finally{setBusy(false)}
 }

 async function deleteSchedule(row:any){
  if(!scopedSession)return;
  setBusy(true);setMessage('');
  try{
   await apiFetch(`/practitioners/schedules/${row.id}`,scopedSession,{method:'DELETE'});
   setRows((previous:any[])=>previous.map((item:any)=>item.id===row.id?{...item,is_active:false}:item));
   setMessage('Schedule deactivated.');
  }catch(err:any){setMessage(err.message||'Could not delete schedule.')}finally{setBusy(false);setConfirm(null)}
 }

 if(!apiSession){
  return <Card><h3 className="text-lg font-bold">Doctor Scheduling & Availability</h3><p className="text-sm text-slate-500">Backend login is required for schedule CRUD. Mock schedule data is shown for preview only.</p><div className="mt-4 grid gap-3">{mockSchedules.filter((s:any)=>s.branchId===branchId||branchId).map((s:any)=>{const p=mockPractitioners.find((x:any)=>x.id===s.practitionerId);return <div key={s.id} className="rounded-2xl bg-slate-50 p-4"><b>{p?.name}</b><p className="text-sm text-slate-500">{s.days} · {s.timing} · Holiday: {s.holiday} · Slots: {s.slots}</p></div>})}</div></Card>
 }

 if(view==='create')return <ScheduleForm title="Create Doctor Schedule" branches={branches} departments={departments} practitioners={practitioners} busy={busy} onSubmit={createSchedule} back={()=>open('list')}/>;
 if(view==='edit'&&selected)return <ScheduleForm title="Edit Doctor Schedule" schedule={selected} branches={branches} departments={departments} practitioners={practitioners} busy={busy} onSubmit={updateSchedule} back={()=>open('list')}/>;

 const filtered=rows.filter((row:any)=>{
  const doctor=practitioners.find((item:any)=>item.id===row.practitioner_id);
  const department=departments.find((item:any)=>item.id===row.department_id);
  const text=[doctor?.full_name,row.room_name,department?.name,row.id].join(' ').toLowerCase();
  return (!query||text.includes(query.toLowerCase()))
   &&(filterBranch==='all'||row.branch_id===filterBranch)
   &&(filterDepartment==='all'||row.department_id===filterDepartment)
   &&(filterWeekday==='all'||String(row.weekday)===filterWeekday);
 }).sort((a:any,b:any)=>new Date(b.updated_at||b.created_at).getTime()-new Date(a.updated_at||a.created_at).getTime());
 const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
 const safePage=Math.min(page,totalPages);
 const pageRows=filtered.slice((safePage-1)*pageSize,safePage*pageSize);

 return <Card>
  <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h3 className="text-lg font-bold">Doctor Scheduling & Availability</h3><p className="text-sm text-slate-500">Tenant-scoped weekly consultation timings mapped to doctor, branch, department, room, and slot duration.</p></div><button type="button" onClick={()=>open('create')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"><Plus size={16}/>Create Schedule</button></div>
  {message&&<div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
  <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
   {isSuperAdmin&&<Field label="Tenant"><Select value={tenantId} onChange={(e:any)=>setTenantId(e.target.value)}>{tenants.map((tenant:any)=><option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</Select></Field>}
   <Field label="Search"><Input value={query} onChange={(e:any)=>{setQuery(e.target.value);setPage(1)}} placeholder="Doctor, room, department"/></Field>
   <Field label="Branch"><Select value={filterBranch} onChange={(e:any)=>{setFilterBranch(e.target.value);setPage(1)}}><option value="all">All branches</option>{branches.map((branch:any)=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field>
   <Field label="Department"><Select value={filterDepartment} onChange={(e:any)=>{setFilterDepartment(e.target.value);setPage(1)}}><option value="all">All departments</option>{departments.map((department:any)=><option key={department.id} value={department.id}>{department.name}</option>)}</Select></Field>
   <Field label="Weekday"><Select value={filterWeekday} onChange={(e:any)=>{setFilterWeekday(e.target.value);setPage(1)}}><option value="all">All days</option>{weekdays.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field>
   <Field label="Status"><Select value={filterStatus} onChange={(e:any)=>{setFilterStatus(e.target.value);setPage(1)}}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></Select></Field>
  </div>
  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200"><div className="hidden grid-cols-[1.1fr_.9fr_.9fr_.8fr_.8fr_.65fr_.7fr_1fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid"><span>Doctor</span><span>Branch</span><span>Department</span><span>Day</span><span>Timing</span><span>Slots</span><span>Status</span><span>Actions</span></div><div className="divide-y divide-slate-200">{pageRows.length===0&&<Empty text={busy?'Loading schedules...':'No schedules match your search.'}/>} {pageRows.map((row:any)=><ScheduleRow key={row.id} row={row} branches={branches} departments={departments} practitioners={practitioners} onEdit={()=>open('edit',row.id)} onDelete={()=>setConfirm({row})}/>)}</div></div>
  <Pagination page={safePage} totalPages={totalPages} total={filtered.length} onPage={setPage}/>
  {confirm&&<ConfirmModal busy={busy} row={confirm.row} onClose={()=>setConfirm(null)} onConfirm={()=>deleteSchedule(confirm.row)}/>}
 </Card>
}

function payload(fd:FormData){
 return {
  branch_id:fd.get('branchId'),
  department_id:fd.get('departmentId')||null,
  weekday:Number(fd.get('weekday')),
  start_time:fd.get('startTime'),
  end_time:fd.get('endTime'),
  slot_minutes:Number(fd.get('slotMinutes')||15),
  room_name:fd.get('roomName')||null,
 };
}

function ScheduleForm({title,schedule,branches,departments,practitioners,busy,onSubmit,back}:any){
 return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">{title}</h3><p className="text-sm text-slate-500">{schedule?.id||'Create weekly consultation timing for a doctor.'}</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Schedules</button></div><form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"><Field label="Doctor / Practitioner"><Select name="practitionerId" defaultValue={schedule?.practitioner_id||''} required><option value="">Select doctor</option>{practitioners.map((doctor:any)=><option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>)}</Select></Field><Field label="Branch"><Select name="branchId" defaultValue={schedule?.branch_id||''} required><option value="">Select branch</option>{branches.map((branch:any)=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field><Field label="Department"><Select name="departmentId" defaultValue={schedule?.department_id||''}><option value="">All departments</option>{departments.map((department:any)=><option key={department.id} value={department.id}>{department.name}</option>)}</Select></Field><Field label="Weekday"><Select name="weekday" defaultValue={String(schedule?.weekday??0)}>{weekdays.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Start Time"><Input name="startTime" type="time" defaultValue={String(schedule?.start_time||'09:00').slice(0,5)} required/></Field><Field label="End Time"><Input name="endTime" type="time" defaultValue={String(schedule?.end_time||'13:00').slice(0,5)} required/></Field><Field label="Slot Minutes"><Input name="slotMinutes" type="number" min="1" max="240" defaultValue={schedule?.slot_minutes||15}/></Field><Field label="Room Name"><Input name="roomName" defaultValue={schedule?.room_name||''} placeholder="Room 1"/></Field>{schedule&&<Field label="Status"><Select name="isActive" defaultValue={String(schedule.is_active)}><option value="true">Active</option><option value="false">Inactive</option></Select></Field>}<div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3"><Button disabled={busy}>{busy?'Saving...':schedule?'Save Schedule':'Create Schedule'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></form></Card>
}

function ScheduleRow({row,branches,departments,practitioners,onEdit,onDelete}:any){
 const doctor=practitioners.find((item:any)=>item.id===row.practitioner_id);
 const branch=branches.find((item:any)=>item.id===row.branch_id);
 const department=departments.find((item:any)=>item.id===row.department_id);
 const weekday=weekdays.find(([value])=>Number(value)===row.weekday)?.[1]||row.weekday;
 return <div className="grid gap-3 px-4 py-4 text-sm xl:grid-cols-[1.1fr_.9fr_.9fr_.8fr_.8fr_.65fr_.7fr_1fr] xl:items-center"><div><b>{doctor?.full_name||row.practitioner_id}</b><p className="break-all text-xs text-slate-500">{row.id}</p></div><span>{branch?.name||row.branch_id}</span><span>{department?.name||'All departments'}</span><span>{weekday}</span><span>{String(row.start_time).slice(0,5)} - {String(row.end_time).slice(0,5)}<p className="text-xs text-slate-500">{row.room_name||'No room'}</p></span><span>{row.slot_minutes} min</span><Badge tone={row.is_active?'green':'red'}>{row.is_active?'Active':'Inactive'}</Badge><div className="flex flex-wrap gap-2"><button type="button" onClick={onEdit} className="rounded-xl border px-3 py-2 text-xs font-bold">Edit</button><button type="button" onClick={onDelete} className="rounded-xl border px-3 py-2 text-xs font-bold text-red-600">Delete</button></div></div>
}

function Empty({text}:any){return <div className="px-4 py-8 text-center text-sm text-slate-500">{text}</div>}
function Pagination({page,totalPages,total,onPage}:any){return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-slate-500">{total} records · Page {page} of {totalPages}</span><div className="flex gap-2"><button type="button" onClick={()=>onPage(Math.max(1,page-1))} disabled={page<=1} className="rounded-xl border px-3 py-2 font-bold disabled:text-slate-300">Previous</button><button type="button" onClick={()=>onPage(Math.min(totalPages,page+1))} disabled={page>=totalPages} className="rounded-xl border px-3 py-2 font-bold disabled:text-slate-300">Next</button></div></div>}
function ConfirmModal({row,busy,onClose,onConfirm}:any){return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"><Card className="w-full max-w-md"><h3 className="text-lg font-bold">Delete Schedule</h3><p className="mt-2 text-sm text-slate-600">This will deactivate the schedule. Existing appointments remain unchanged.</p><p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold">{String(row.start_time).slice(0,5)} - {String(row.end_time).slice(0,5)}</p><div className="mt-5 flex flex-wrap gap-2"><Button onClick={onConfirm} disabled={busy}>{busy?'Working...':'Confirm'}</Button><button type="button" onClick={onClose} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></Card></div>}
