'use client';

import {useEffect,useMemo,useState} from 'react';
import {Building2,ClipboardList,Plus,Settings,ShieldCheck,Users} from 'lucide-react';
import {Badge,Button,Card,Field,Input,Select} from '@/components/ui';
import {apiFetch} from '@/lib/api';

const sections = [
  ['users','Users',Users],
  ['roles','Roles',ShieldCheck],
  ['departments','Departments',ClipboardList],
  ['branches','Branches',Building2],
  ['settings','Tenant & Branch Settings',Settings],
] as const;

export const tenantAdminSections = sections;
export function canUseTenantAdminSection(section:string, user:any){
 const permissions=user?.permissions||[];
 if(user?.is_super_admin||permissions.includes('*')||user?.roles?.includes('tenant_admin'))return true;
 if(section==='users')return ['identity.users.manage','identity.users.create','identity.users.read','identity.users.edit','identity.users.delete'].some(permission=>permissions.includes(permission));
 if(section==='roles')return permissions.includes('identity.roles.manage')||permissions.includes('identity.roles.read');
 if(section==='departments')return ['departments.manage','departments.create','departments.read','departments.edit','departments.delete','settings.manage'].some(permission=>permissions.includes(permission));
 if(section==='branches')return ['branches.manage','branches.create','branches.read','branches.edit','branches.delete','settings.manage'].some(permission=>permissions.includes(permission));
 if(section==='settings')return permissions.includes('settings.manage');
 return false;
}
const userTypes = [
  ['tenant_admin','Tenant Admin'],
  ['doctor','Doctor'],
  ['reception','Reception'],
  ['nurse','Staff Nurse'],
  ['lab','Lab Technician'],
  ['pharmacy','Pharmacy User'],
  ['billing','Billing Staff'],
  ['back_office','Back Office Staff'],
  ['staff','General Staff'],
] as const;

const requiredRolePermissions = [
 {key:'identity.users.manage',module:'identity.users',action:'manage',description:'Users Manage'},
 {key:'identity.users.create',module:'identity.users',action:'create',description:'Users Create'},
 {key:'identity.users.read',module:'identity.users',action:'read',description:'Users Read'},
 {key:'identity.users.edit',module:'identity.users',action:'edit',description:'Users Edit'},
 {key:'identity.users.delete',module:'identity.users',action:'delete',description:'Users Delete'},
 {key:'departments.manage',module:'departments',action:'manage',description:'Departments Manage'},
 {key:'departments.create',module:'departments',action:'create',description:'Departments Create'},
 {key:'departments.read',module:'departments',action:'read',description:'Departments Read'},
 {key:'departments.edit',module:'departments',action:'edit',description:'Departments Edit'},
 {key:'departments.delete',module:'departments',action:'delete',description:'Departments Delete'},
 {key:'branches.manage',module:'branches',action:'manage',description:'Branches Manage'},
 {key:'branches.create',module:'branches',action:'create',description:'Branches Create'},
 {key:'branches.read',module:'branches',action:'read',description:'Branches Read'},
 {key:'branches.edit',module:'branches',action:'edit',description:'Branches Edit'},
 {key:'branches.delete',module:'branches',action:'delete',description:'Branches Delete'},
 {key:'scheduling.manage',module:'scheduling',action:'manage',description:'Scheduling Manage'},
 {key:'scheduling.create',module:'scheduling',action:'create',description:'Scheduling Create'},
 {key:'scheduling.read',module:'scheduling',action:'read',description:'Scheduling Read'},
 {key:'scheduling.edit',module:'scheduling',action:'edit',description:'Scheduling Edit'},
 {key:'scheduling.delete',module:'scheduling',action:'delete',description:'Scheduling Delete'},
] as const;

export function TenantAdmin({apiSession,clinic,branchId,section:externalSection,setSection:externalSetSection}:any){
 const [localSection,setLocalSection]=useState('users');
 const section=externalSection||localSection;
 const setSection=externalSetSection||setLocalSection;
 const [view,setView]=useState('list');
 const [roles,setRoles]=useState<any[]>([]);
 const [users,setUsers]=useState<any[]>([]);
 const [departments,setDepartments]=useState<any[]>([]);
 const [branches,setBranches]=useState<any[]>([]);
 const [settings,setSettings]=useState<any[]>([]);
 const [permissions,setPermissions]=useState<any[]>([]);
 const [selectedId,setSelectedId]=useState('');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [confirm,setConfirm]=useState<any>(null);
 const [invoicePrefix,setInvoicePrefix]=useState('MHD');
 const [requeueAfter,setRequeueAfter]=useState(2);
 const [noShowAfter,setNoShowAfter]=useState(3);
 const [slotIntervalsEnabled,setSlotIntervalsEnabled]=useState(false);
 const [slotIntervalMinutes,setSlotIntervalMinutes]=useState(5);
 const [payments,setPayments]=useState('cash,credit_card,debit_card,upi,gpay,paytm');
 const [providers,setProviders]=useState('whatsapp,sms,voice');
 const selectedRole=roles.find((row:any)=>row.id===selectedId);
 const selectedUser=users.find((row:any)=>row.id===selectedId);
 const selectedDepartment=departments.find((row:any)=>row.id===selectedId);
 const selectedBranch=branches.find((row:any)=>row.id===selectedId);
 const visibleSections=sections.filter(([sectionId])=>canUseTenantAdminSection(sectionId,apiSession?.user));

 function open(nextSection:string,nextView='list'){
  setSection(nextSection);
  setView(nextView);
  setSelectedId('');
  requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}));
 }

 async function loadAdmin(){
  if(!apiSession)return;
  setBusy(true);setMessage('');
  try{
   const scoped={...apiSession,tenantId:apiSession.tenantId};
   const canUsers=canUseTenantAdminSection('users',apiSession.user);
   const canRoles=canUseTenantAdminSection('roles',apiSession.user)||canUsers;
   const canDepartments=canUseTenantAdminSection('departments',apiSession.user);
   const canBranches=canUseTenantAdminSection('branches',apiSession.user);
   const canSettings=canUseTenantAdminSection('settings',apiSession.user);
   const safeFetch=async(path:string,enabled=true)=>enabled?apiFetch(path,scoped).catch(()=>[]):Promise.resolve([]);
   const [roleRows,userRows,departmentRows,branchRows,settingRows,permissionRows]=await Promise.all([
    safeFetch('/identity/roles',canRoles),
    safeFetch('/identity/users',canUsers),
    safeFetch(`/tenants/${apiSession.tenantId}/departments`,canDepartments),
    safeFetch(`/tenants/${apiSession.tenantId}/branches`,canBranches),
    safeFetch('/settings',canSettings),
    apiFetch('/identity/permissions',scoped).catch(()=>[]),
   ]);
   setRoles(roleRows);setUsers(userRows);setDepartments(departmentRows);setBranches(branchRows);setSettings(settingRows);setPermissions(permissionRows);
   const find=(key:string)=>settingRows.find((x:any)=>x.key===key);
   if(find('invoice.prefix'))setInvoicePrefix(find('invoice.prefix').value);
   if(find('queue.requeue_after_patients'))setRequeueAfter(Number(find('queue.requeue_after_patients').value));
   if(find('queue.auto_no_show_after_missed_calls'))setNoShowAfter(Number(find('queue.auto_no_show_after_missed_calls').value));
   if(find('appointment.slot_intervals_enabled'))setSlotIntervalsEnabled(Boolean(find('appointment.slot_intervals_enabled').value));
   if(find('appointment.slot_interval_minutes'))setSlotIntervalMinutes(Number(find('appointment.slot_interval_minutes').value||5));
   if(find('payment.methods_enabled'))setPayments((find('payment.methods_enabled').value||[]).join(','));
   if(find('communication.providers_enabled'))setProviders((find('communication.providers_enabled').value||[]).join(','));
  }catch(err:any){setMessage(err.message||'Could not load tenant admin data.')}finally{setBusy(false)}
 }

 useEffect(()=>{loadAdmin()},[apiSession?.token,apiSession?.tenantId]);
 useEffect(()=>{
  if(apiSession&&visibleSections.length&&!visibleSections.some(([sectionId])=>sectionId===section)){
   open(visibleSections[0][0]);
  }
 },[apiSession?.token,section,visibleSections.length]);

 async function createRole(e:any){
  e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);
  setBusy(true);setMessage('');
  try{
   const created=await apiFetch('/identity/roles',apiSession,{method:'POST',body:JSON.stringify({
    name:fd.get('name'),key:fd.get('key'),permission_keys:fd.getAll('permissionKeys').map(String)
   })});
   form.reset();setRoles(previous=>[created,...previous.filter((row:any)=>row.id!==created.id)]);
   open('roles');await loadAdmin();setMessage(`Role created: ${created.name}`);
  }catch(err:any){setMessage(err.message||'Could not create role.')}finally{setBusy(false)}
 }

 async function updateRole(e:any){
  e.preventDefault();if(!selectedRole)return;
  const fd=new FormData(e.currentTarget);
  setBusy(true);setMessage('');
  try{
   const updated=await apiFetch(`/identity/roles/${selectedRole.id}`,apiSession,{method:'PATCH',body:JSON.stringify({
    name:fd.get('name'),key:fd.get('key'),is_active:fd.get('isActive')==='true',permission_keys:fd.getAll('permissionKeys').map(String)
   })});
   setRoles(previous=>[updated,...previous.filter((row:any)=>row.id!==updated.id)]);
   open('roles');await loadAdmin();setMessage('Role updated.');
  }catch(err:any){setMessage(err.message||'Could not update role.')}finally{setBusy(false)}
 }

 async function createUser(e:any){
  e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);
  setBusy(true);setMessage('');
  try{
   const created=await apiFetch('/identity/users',apiSession,{method:'POST',body:JSON.stringify({
    name:fd.get('name'),email:fd.get('email'),password:fd.get('password'),mobile:fd.get('mobile')||null,
    user_type:fd.get('userType')||'staff',branch_id:fd.get('branchId')||null,role_keys:fd.getAll('roleKeys').map(String),must_change_password:fd.get('mustChangePassword')==='true'
   })});
   form.reset();setUsers(previous=>[created,...previous.filter((row:any)=>row.id!==created.id)]);
   open('users');await loadAdmin();setMessage(`User created: ${created.name}`);
  }catch(err:any){setMessage(err.message||'Could not create user.')}finally{setBusy(false)}
 }

 async function updateUser(e:any){
  e.preventDefault();if(!selectedUser)return;
  const fd=new FormData(e.currentTarget);
  setBusy(true);setMessage('');
  try{
   const updated=await apiFetch(`/identity/users/${selectedUser.id}`,apiSession,{method:'PATCH',body:JSON.stringify({
    name:fd.get('name'),email:fd.get('email'),user_type:fd.get('userType')||'staff',mobile:fd.get('mobile')||null,branch_id:fd.get('branchId')||null,
    role_keys:fd.getAll('roleKeys').map(String),is_active:fd.get('isActive')==='true',must_change_password:fd.get('mustChangePassword')==='true'
   })});
   setUsers(previous=>[updated,...previous.filter((row:any)=>row.id!==updated.id)]);
   open('users');await loadAdmin();setMessage('User updated.');
  }catch(err:any){setMessage(err.message||'Could not update user.')}finally{setBusy(false)}
 }

 async function createDepartment(e:any){
  e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);
  setBusy(true);setMessage('');
  try{
   const created=await apiFetch(`/tenants/${apiSession.tenantId}/departments`,apiSession,{method:'POST',body:JSON.stringify({
    name:fd.get('name'),description:fd.get('description')||null,branch_id:fd.get('branchId')||null
   })});
   form.reset();setDepartments(previous=>[created,...previous.filter((row:any)=>row.id!==created.id)]);
   open('departments');await loadAdmin();setMessage(`Department created: ${created.name}`);
  }catch(err:any){setMessage(err.message||'Could not create department.')}finally{setBusy(false)}
 }

 async function updateDepartment(e:any){
  e.preventDefault();if(!selectedDepartment)return;
  const fd=new FormData(e.currentTarget);
  setBusy(true);setMessage('');
  try{
   const updated=await apiFetch(`/tenants/${apiSession.tenantId}/departments/${selectedDepartment.id}`,apiSession,{method:'PATCH',body:JSON.stringify({
    name:fd.get('name'),description:fd.get('description')||null,branch_id:fd.get('branchId')||null,is_active:fd.get('isActive')==='true'
   })});
   setDepartments(previous=>[updated,...previous.filter((row:any)=>row.id!==updated.id)]);
   open('departments');await loadAdmin();setMessage('Department updated.');
  }catch(err:any){setMessage(err.message||'Could not update department.')}finally{setBusy(false)}
 }

 async function createBranch(e:any){
  e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);
  setBusy(true);setMessage('');
  try{
   const created=await apiFetch(`/tenants/${apiSession.tenantId}/branches`,apiSession,{method:'POST',body:JSON.stringify({
    name:fd.get('name'),code:fd.get('code'),address:fd.get('address')||null,city:fd.get('city')||null,state:fd.get('state')||null
   })});
   form.reset();setBranches(previous=>[created,...previous.filter((row:any)=>row.id!==created.id)]);
   open('branches');await loadAdmin();setMessage(`Branch created: ${created.name}`);
  }catch(err:any){setMessage(err.message||'Could not create branch.')}finally{setBusy(false)}
 }

 async function updateBranch(e:any){
  e.preventDefault();if(!selectedBranch)return;
  const fd=new FormData(e.currentTarget);
  setBusy(true);setMessage('');
  try{
   const updated=await apiFetch(`/tenants/${apiSession.tenantId}/branches/${selectedBranch.id}`,apiSession,{method:'PATCH',body:JSON.stringify({
    name:fd.get('name'),code:fd.get('code'),address:fd.get('address')||null,city:fd.get('city')||null,state:fd.get('state')||null,is_active:fd.get('isActive')==='true'
   })});
   setBranches(previous=>[updated,...previous.filter((row:any)=>row.id!==updated.id)]);
   open('branches');await loadAdmin();setMessage('Branch updated.');
  }catch(err:any){setMessage(err.message||'Could not update branch.')}finally{setBusy(false)}
 }

 async function changeStatus(entity:string,row:any){
  const paths:any={roles:`/identity/roles/${row.id}/status`,users:`/identity/users/${row.id}/status`,departments:`/tenants/${apiSession.tenantId}/departments/${row.id}/status`,branches:`/tenants/${apiSession.tenantId}/branches/${row.id}/status`};
  setBusy(true);setMessage('');
  try{await apiFetch(paths[entity],apiSession,{method:'POST',body:JSON.stringify({is_active:!row.is_active})});await loadAdmin();setMessage(`${title(entity)} status updated.`)}
  catch(err:any){setMessage(err.message||'Could not change status.')}finally{setBusy(false);setConfirm(null)}
 }

 async function deleteRow(entity:string,row:any){
  const paths:any={roles:`/identity/roles/${row.id}`,users:`/identity/users/${row.id}`,departments:`/tenants/${apiSession.tenantId}/departments/${row.id}`,branches:`/tenants/${apiSession.tenantId}/branches/${row.id}`};
  setBusy(true);setMessage('');
  try{await apiFetch(paths[entity],apiSession,{method:'DELETE'});await loadAdmin();setMessage(`${title(entity)} deactivated.`)}
  catch(err:any){setMessage(err.message||'Could not delete record.')}finally{setBusy(false);setConfirm(null)}
 }

 async function saveSettings(){
  setMessage('');setBusy(true);
  const list=(v:string)=>v.split(',').map(x=>x.trim()).filter(Boolean);
  try{
   await Promise.all([
    apiFetch('/settings',apiSession,{method:'PUT',body:JSON.stringify({scope:'branch',scope_id:branchId,module:'invoice',key:'invoice.prefix',value:invoicePrefix,actor_user_id:apiSession.user?.id})}),
    apiFetch('/settings',apiSession,{method:'PUT',body:JSON.stringify({scope:'branch',scope_id:branchId,module:'queue',key:'queue.requeue_after_patients',value:Number(requeueAfter),actor_user_id:apiSession.user?.id})}),
    apiFetch('/settings',apiSession,{method:'PUT',body:JSON.stringify({scope:'branch',scope_id:branchId,module:'queue',key:'queue.auto_no_show_after_missed_calls',value:Number(noShowAfter),actor_user_id:apiSession.user?.id})}),
    apiFetch('/settings',apiSession,{method:'PUT',body:JSON.stringify({scope:'branch',scope_id:branchId,module:'appointments',key:'appointment.slot_intervals_enabled',value:slotIntervalsEnabled,actor_user_id:apiSession.user?.id})}),
    apiFetch('/settings',apiSession,{method:'PUT',body:JSON.stringify({scope:'branch',scope_id:branchId,module:'appointments',key:'appointment.slot_interval_minutes',value:Number(slotIntervalMinutes),actor_user_id:apiSession.user?.id})}),
    apiFetch('/settings',apiSession,{method:'PUT',body:JSON.stringify({scope:'tenant',module:'payment',key:'payment.methods_enabled',value:list(payments),actor_user_id:apiSession.user?.id})}),
    apiFetch('/settings',apiSession,{method:'PUT',body:JSON.stringify({scope:'tenant',module:'communication',key:'communication.providers_enabled',value:list(providers),actor_user_id:apiSession.user?.id})}),
   ]);
   await loadAdmin();setMessage('Settings saved.');
  }catch(err:any){setMessage(err.message||'Could not save settings.')}finally{setBusy(false)}
 }

 if(!apiSession)return <Card><h3 className="text-lg font-bold">Tenant Admin</h3><p className="mt-2 text-sm text-slate-500">Login to manage tenant settings.</p></Card>;
 if(visibleSections.length===0)return <Card><h3 className="text-lg font-bold">Tenant Admin</h3><p className="mt-2 text-sm text-slate-500">Your role does not include tenant administration permissions.</p></Card>;

 return <div className="space-y-5">
  <Card><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h3 className="text-xl font-bold">{clinic?.name||'Tenant'} Administration</h3><p className="text-sm text-slate-500">Manage only this tenant’s users, roles, departments, branches, and settings.</p></div><Badge tone="green">Tenant scoped</Badge></div></Card>
  {message&&<div className="rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
  {section==='users'&&view==='list'&&<ListCard title="Users" rows={users} searchKeys={['name','email','mobile','user_type','id']} createLabel="Create User" onCreate={()=>setView('create')} columns={['Name','Email','Type','Branch','Status','Created','Actions']} render={(user:any)=><UserRow key={user.id} user={user} branches={branches} onEdit={()=>{setSelectedId(user.id);setView('edit')}} onStatus={()=>setConfirm({entity:'users',kind:'status',row:user})} onDelete={()=>setConfirm({entity:'users',kind:'delete',row:user})}/>}/>}
  {section==='users'&&view==='create'&&<UserForm title="Create User" roles={roles} branches={branches} busy={busy} onSubmit={createUser} back={()=>open('users')}/>}
  {section==='users'&&view==='edit'&&selectedUser&&<UserForm title="Edit User" user={selectedUser} roles={roles} branches={branches} busy={busy} onSubmit={updateUser} back={()=>open('users')}/>}

  {section==='roles'&&view==='list'&&<ListCard title="Roles" rows={roles} searchKeys={['name','key','id']} createLabel="Create Role" onCreate={()=>setView('create')} columns={['Role','Key','Status','Modified','Actions']} render={(role:any)=><RoleRow key={role.id} role={role} onEdit={()=>{setSelectedId(role.id);setView('edit')}} onStatus={()=>setConfirm({entity:'roles',kind:'status',row:role})} onDelete={()=>setConfirm({entity:'roles',kind:'delete',row:role})}/>}/>}
  {section==='roles'&&view==='create'&&<RoleForm title="Create Role" permissions={permissions} busy={busy} onSubmit={createRole} back={()=>open('roles')}/>}
  {section==='roles'&&view==='edit'&&selectedRole&&<RoleForm title="Edit Role" role={selectedRole} permissions={permissions} busy={busy} onSubmit={updateRole} back={()=>open('roles')}/>}

  {section==='departments'&&view==='list'&&<ListCard title="Departments" rows={departments} searchKeys={['name','code','description','id']} createLabel="Create Department" onCreate={()=>setView('create')} columns={['Department','Code','Branch','Status','Actions']} render={(department:any)=><DepartmentRow key={department.id} department={department} branches={branches} onEdit={()=>{setSelectedId(department.id);setView('edit')}} onStatus={()=>setConfirm({entity:'departments',kind:'status',row:department})} onDelete={()=>setConfirm({entity:'departments',kind:'delete',row:department})}/>}/>}
  {section==='departments'&&view==='create'&&<DepartmentForm title="Create Department" branches={branches} busy={busy} onSubmit={createDepartment} back={()=>open('departments')}/>}
  {section==='departments'&&view==='edit'&&selectedDepartment&&<DepartmentForm title="Edit Department" department={selectedDepartment} branches={branches} busy={busy} onSubmit={updateDepartment} back={()=>open('departments')}/>}

  {section==='branches'&&view==='list'&&<ListCard title="Branches" rows={branches} searchKeys={['name','code','city','state','id']} createLabel="Create Branch" onCreate={()=>setView('create')} columns={['Branch','Code','Location','Status','Actions']} render={(branch:any)=><BranchRow key={branch.id} branch={branch} onEdit={()=>{setSelectedId(branch.id);setView('edit')}} onStatus={()=>setConfirm({entity:'branches',kind:'status',row:branch})} onDelete={()=>setConfirm({entity:'branches',kind:'delete',row:branch})}/>}/>}
  {section==='branches'&&view==='create'&&<BranchForm title="Create Branch" branchCount={branches.length} busy={busy} onSubmit={createBranch} back={()=>open('branches')}/>}
  {section==='branches'&&view==='edit'&&selectedBranch&&<BranchForm title="Edit Branch" branch={selectedBranch} busy={busy} onSubmit={updateBranch} back={()=>open('branches')}/>}

  {section==='settings'&&<SettingsPanel settings={settings} invoicePrefix={invoicePrefix} setInvoicePrefix={setInvoicePrefix} requeueAfter={requeueAfter} setRequeueAfter={setRequeueAfter} noShowAfter={noShowAfter} setNoShowAfter={setNoShowAfter} slotIntervalsEnabled={slotIntervalsEnabled} setSlotIntervalsEnabled={setSlotIntervalsEnabled} slotIntervalMinutes={slotIntervalMinutes} setSlotIntervalMinutes={setSlotIntervalMinutes} payments={payments} setPayments={setPayments} providers={providers} setProviders={setProviders} busy={busy} saveSettings={saveSettings}/>}
  {confirm&&<ConfirmModal action={confirm} busy={busy} onCancel={()=>setConfirm(null)} onConfirm={()=>confirm.kind==='delete'?deleteRow(confirm.entity,confirm.row):changeStatus(confirm.entity,confirm.row)}/>}
 </div>
}

function ListCard({title,rows,searchKeys,createLabel,onCreate,columns,render}:any){
 const [query,setQuery]=useState('');
 const [page,setPage]=useState(1);
 const pageSize=8;
 const filtered=useMemo(()=>rows.filter((row:any)=>searchKeys.some((key:string)=>String(row[key]||'').toLowerCase().includes(query.toLowerCase()))),[rows,query,searchKeys]);
 const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
 const safePage=Math.min(page,totalPages);
 const pageRows=filtered.slice((safePage-1)*pageSize,safePage*pageSize);
 useEffect(()=>{setPage(1)},[query,rows.length]);
 const gridClass=columns.length===7?'grid-cols-[1.05fr_1.15fr_.8fr_1fr_.7fr_.75fr_1.05fr]':columns.length===6?'grid-cols-[1.2fr_1.2fr_1fr_.7fr_.75fr_1.05fr]':'grid-cols-[1.2fr_.8fr_1fr_.7fr_1.05fr]';
 return <Card><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h3 className="text-lg font-bold">{title}</h3><p className="text-sm text-slate-500">Latest created or updated records appear first. Search, edit, activate, deactivate, or delete from this page.</p></div><button type="button" onClick={onCreate} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"><Plus size={16}/>{createLabel}</button></div><div className="mt-4 max-w-md"><Field label={`Search ${title}`}><Input value={query} onChange={(e:any)=>setQuery(e.target.value)} placeholder={`Search ${title.toLowerCase()}`}/></Field></div><div className="mt-4 overflow-hidden rounded-2xl border border-slate-200"><div className={`hidden gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid ${gridClass}`}>{columns.map((column:string)=><span key={column}>{column}</span>)}</div><div className="divide-y divide-slate-200">{pageRows.length===0&&<Empty text="No records match your search."/>}{pageRows.map(render)}</div></div><Pagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={pageSize} onPage={setPage}/></Card>
}

function RoleForm({title,role,permissions,busy,onSubmit,back}:any){
 return <Card><Header title={title} subtitle={role?.key||'Select permissions by module action.'} back={back}/><form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2"><Field label="Role Name"><Input name="name" defaultValue={role?.name||''} required disabled={isLocked(role)}/></Field><Field label="Role Key"><Input name="key" defaultValue={role?.key||''} required disabled={isLocked(role)}/></Field>{role&&<Field label="Status"><Select name="isActive" defaultValue={String(role.is_active)} disabled={isLocked(role)}><option value="true">Active</option><option value="false">Inactive</option></Select></Field>}<div className="md:col-span-2"><PermissionCheckboxes permissions={permissions} selected={role?.permission_keys||[]} disabled={isLocked(role)}/></div><Actions busy={busy} back={back} disabled={isLocked(role)} label={role?'Save Role':'Create Role'}/></form></Card>
}

function UserForm({title,user,roles,branches,busy,onSubmit,back}:any){
 return <Card><Header title={title} subtitle={user?.email||'Create tenant-scoped users only.'} back={back}/><form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2"><Field label="Name"><Input name="name" defaultValue={user?.name||''} required/></Field><Field label="Email"><Input name="email" type="email" defaultValue={user?.email||''} required/></Field><Field label="User Type"><Select name="userType" defaultValue={user?.user_type||'staff'}>{userTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Mobile"><Input name="mobile" defaultValue={user?.mobile||''}/></Field><Field label="Branch"><Select name="branchId" defaultValue={user?.branch_id||''}><option value="">All branches</option>{branches.map((branch:any)=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field>{!user&&<Field label="Temporary Password"><Input name="password" type="text" defaultValue="TempPass123" required/></Field>}<Field label="Must Change Password"><Select name="mustChangePassword" defaultValue={String(user?.must_change_password??true)}><option value="true">Yes</option><option value="false">No</option></Select></Field>{user&&<Field label="Status"><Select name="isActive" defaultValue={String(user.is_active)}><option value="true">Active</option><option value="false">Inactive</option></Select></Field>}<div className="md:col-span-2"><CheckboxList title="Role Access" name="roleKeys" rows={roles} selected={user?.roles||[]} valueKey="key" labelKey="name"/></div><Actions busy={busy} back={back} label={user?'Save User':'Create User'}/></form></Card>
}

function DepartmentForm({title,department,branches,busy,onSubmit,back}:any){
 return <Card><Header title={title} subtitle={department?.code||'Departments belong to this tenant only.'} back={back}/><form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2"><Field label="Name"><Input name="name" defaultValue={department?.name||''} required disabled={isLocked(department)}/></Field><Field label="Branch"><Select name="branchId" defaultValue={department?.branch_id||''} disabled={isLocked(department)}><option value="">All branches</option>{branches.map((branch:any)=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></Field>{department&&<Field label="Status"><Select name="isActive" defaultValue={String(department.is_active)} disabled={isLocked(department)}><option value="true">Active</option><option value="false">Inactive</option></Select></Field>}<div className="md:col-span-2"><Field label="Description"><Input name="description" defaultValue={department?.description||''} disabled={isLocked(department)}/></Field></div><Actions busy={busy} back={back} disabled={isLocked(department)} label={department?'Save Department':'Create Department'}/></form></Card>
}

function BranchForm({title,branch,branchCount,busy,onSubmit,back}:any){
 return <Card><Header title={title} subtitle={branch?'Update branch details.':'Branch creation is checked against the active subscription limit.'} back={back}/>{!branch&&branchCount>=1&&<div className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">Single-clinic plans usually allow one branch. If this tenant is on a single-branch plan, the API will ask for a subscription upgrade before creating another branch.</div>}<form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2"><Field label="Branch Name"><Input name="name" defaultValue={branch?.name||''} required disabled={isLocked(branch)}/></Field><Field label="Code"><Input name="code" defaultValue={branch?.code||''} required disabled={isLocked(branch)}/></Field><Field label="City"><Input name="city" defaultValue={branch?.city||''} disabled={isLocked(branch)}/></Field><Field label="State"><Input name="state" defaultValue={branch?.state||''} disabled={isLocked(branch)}/></Field>{branch&&<Field label="Status"><Select name="isActive" defaultValue={String(branch.is_active)} disabled={isLocked(branch)}><option value="true">Active</option><option value="false">Inactive</option></Select></Field>}<div className="md:col-span-2"><Field label="Address"><Input name="address" defaultValue={branch?.address||''} disabled={isLocked(branch)}/></Field></div><Actions busy={busy} back={back} disabled={isLocked(branch)} label={branch?'Save Branch':'Create Branch'}/></form></Card>
}

function SettingsPanel(props:any){
 const {settings,invoicePrefix,setInvoicePrefix,requeueAfter,setRequeueAfter,noShowAfter,setNoShowAfter,slotIntervalsEnabled,setSlotIntervalsEnabled,slotIntervalMinutes,setSlotIntervalMinutes,payments,setPayments,providers,setProviders,busy,saveSettings}=props;
 return <Card><h3 className="text-lg font-bold">Tenant & Branch Settings</h3><p className="text-sm text-slate-500">Configuration affects invoice numbering, queue behavior, appointment slots, payments, and communications for this tenant.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Invoice Prefix"><Input value={invoicePrefix} onChange={(e:any)=>setInvoicePrefix(e.target.value)}/></Field><Field label="Requeue After"><Input type="number" value={requeueAfter} onChange={(e:any)=>setRequeueAfter(Number(e.target.value))}/></Field><Field label="No-show Calls"><Input type="number" value={noShowAfter} onChange={(e:any)=>setNoShowAfter(Number(e.target.value))}/></Field><Field label="Slot Display"><Select value={slotIntervalsEnabled?'intervals':'sessions'} onChange={(e:any)=>setSlotIntervalsEnabled(e.target.value==='intervals')}><option value="sessions">Consultation timings only</option><option value="intervals">Detailed interval slots</option></Select></Field><Field label="Interval Minutes"><Input type="number" min="5" step="5" value={slotIntervalMinutes} onChange={(e:any)=>setSlotIntervalMinutes(Number(e.target.value))} disabled={!slotIntervalsEnabled}/></Field><Field label="Payment Methods"><Input value={payments} onChange={(e:any)=>setPayments(e.target.value)}/></Field><Field label="Communication"><Input value={providers} onChange={(e:any)=>setProviders(e.target.value)}/></Field></div><div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Default booking mode shows only doctor consultation timings, such as Morning 10 AM - 1 PM. Enable interval slots only for clinics that want fine-grained booking times.</div><Button onClick={saveSettings} disabled={busy} className="mt-4">Save Settings</Button><div className="mt-5 grid gap-2 md:grid-cols-2">{settings.slice(0,10).map((setting:any)=><div key={setting.id} className="rounded-2xl bg-slate-50 p-3 text-sm"><b>{setting.key}</b><p className="break-all text-slate-500">{JSON.stringify(setting.value)}</p></div>)}</div></Card>
}

function PermissionCheckboxes({permissions,selected,disabled}:any){
 const catalog=[...permissions];
 for(const permission of requiredRolePermissions){
  if(!catalog.some((item:any)=>item.key===permission.key))catalog.push(permission);
 }
 const grouped=catalog.reduce((acc:any,permission:any)=>{acc[permission.module]=[...(acc[permission.module]||[]),permission];return acc},{});
 const buckets=[
  ['manage','Manage',['manage','sign','approve','export']],
  ['create','Create',['create']],
  ['read','Read',['read','view']],
  ['edit','Edit',['edit','write']],
  ['delete','Delete',['delete','cancel']],
 ];
 const modules=Object.keys(grouped).sort();
 const selectedSet=new Set(selected||[]);
 const normalizedAction=(permission:any)=>String(permission.action||'manage').split('.').pop()||'manage';
 const bucketFor=(permission:any)=>buckets.find((bucket:any)=>bucket[2].includes(normalizedAction(permission)))||buckets[0];
 const labelFor=(permission:any)=>title(String(permission.action||'manage').replaceAll('_',' ').replaceAll('.',' '));
 return <div><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><h4 className="font-bold">Module Permissions</h4><p className="text-sm text-slate-500">Enable permissions by module. Use Manage for full workflow/action access, then Create, Read, Edit, and Delete as needed.</p></div><Badge tone="slate">{selectedSet.size} selected</Badge></div><div className="mt-3 grid gap-4 xl:grid-cols-2">{modules.map(module=><div key={module} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><h5 className="font-bold">{title(module.replaceAll('_',' '))}</h5><p className="text-xs text-slate-500">{grouped[module].length} permissions</p></div><Badge tone="slate">Module</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{buckets.map((bucket:any)=>{const bucketPermissions=grouped[module].filter((permission:any)=>bucketFor(permission)[0]===bucket[0]).sort((a:any,b:any)=>a.key.localeCompare(b.key));return <div key={`${module}-${bucket[0]}`} className="rounded-2xl bg-slate-50 p-3"><p className="mb-2 text-xs font-bold uppercase text-slate-500">{bucket[1]}</p><div className="grid gap-2">{bucketPermissions.length?bucketPermissions.map((permission:any)=><label key={permission.key} className="flex items-start gap-2 text-sm"><input name="permissionKeys" type="checkbox" value={permission.key} defaultChecked={selectedSet.has(permission.key)} disabled={disabled} className="mt-1 h-4 w-4"/><span><span className="font-semibold">{labelFor(permission)}</span><span className="block break-all text-xs text-slate-400">{permission.key}</span></span></label>):<span className="text-xs text-slate-300">No access</span>}</div></div>})}</div></div>)}</div></div>
}

function CheckboxList({title,name,rows,selected,valueKey,labelKey}:any){
 return <div><p className="mb-2 text-xs font-bold uppercase text-slate-500">{title}</p><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{rows.map((row:any)=><label key={row.id} className="flex items-start gap-2 rounded-2xl border border-slate-200 p-3 text-sm"><input name={name} type="checkbox" value={row[valueKey]} defaultChecked={selected.includes(row[valueKey])} className="mt-1 h-4 w-4"/><span><b>{row[labelKey]}</b><span className="block break-all text-xs text-slate-500">{row[valueKey]}</span>{isLocked(row)&&<span className="mt-1 inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">Template</span>}</span></label>)}</div></div>
}

function UserRow({user,branches,onEdit,onStatus,onDelete}:any){const branch=branches.find((row:any)=>row.id===user.branch_id);const typeLabel=userTypes.find(([value])=>value===user.user_type)?.[1]||user.user_type||'Staff';return <div className="grid gap-3 px-4 py-4 text-sm xl:grid-cols-[1.05fr_1.15fr_.8fr_1fr_.7fr_.75fr_1.05fr] xl:items-center"><div><b>{user.name}</b><p className="break-all text-xs text-slate-500">{user.id}</p></div><span className="break-all">{user.email}</span><span>{typeLabel}</span><span>{branch?.name||'All branches'}</span><Badge tone={user.is_active?'green':'red'}>{user.is_active?'Active':'Inactive'}</Badge><span>{formatDate(user.created_at)}</span><RowActions row={user} onEdit={onEdit} onStatus={onStatus} onDelete={onDelete}/></div>}
function RoleRow({role,onEdit,onStatus,onDelete}:any){return <div className="grid gap-3 px-4 py-4 text-sm xl:grid-cols-[1.2fr_.8fr_1fr_.7fr_1.05fr] xl:items-center"><div><b>{role.name}</b>{isLocked(role)&&<span className="ml-2"><Badge tone="purple">Locked</Badge></span>}</div><span>{role.key}</span><Badge tone={role.is_active?'green':'red'}>{role.is_active?'Active':'Inactive'}</Badge><span>{formatDate(role.updated_at||role.created_at)}</span><RowActions row={role} locked={isLocked(role)} onEdit={onEdit} onStatus={onStatus} onDelete={onDelete}/></div>}
function DepartmentRow({department,branches,onEdit,onStatus,onDelete}:any){const branch=branches.find((row:any)=>row.id===department.branch_id);return <div className="grid gap-3 px-4 py-4 text-sm xl:grid-cols-[1.2fr_.8fr_1fr_.7fr_1.05fr] xl:items-center"><div><b>{department.name}</b>{isLocked(department)&&<span className="ml-2"><Badge tone="purple">Locked</Badge></span>}</div><span>{department.code}</span><span>{branch?.name||'All branches'}</span><Badge tone={department.is_active?'green':'red'}>{department.is_active?'Active':'Inactive'}</Badge><RowActions row={department} locked={isLocked(department)} onEdit={onEdit} onStatus={onStatus} onDelete={onDelete}/></div>}
function BranchRow({branch,onEdit,onStatus,onDelete}:any){return <div className="grid gap-3 px-4 py-4 text-sm xl:grid-cols-[1.2fr_.8fr_1fr_.7fr_1.05fr] xl:items-center"><div><b>{branch.name}</b>{isLocked(branch)&&<span className="ml-2"><Badge tone="purple">Locked</Badge></span>}</div><span>{branch.code}</span><span>{[branch.city,branch.state].filter(Boolean).join(', ')||'-'}</span><Badge tone={branch.is_active?'green':'red'}>{branch.is_active?'Active':'Inactive'}</Badge><RowActions row={branch} locked={isLocked(branch)} onEdit={onEdit} onStatus={onStatus} onDelete={onDelete}/></div>}
function RowActions({row,locked,onEdit,onStatus,onDelete}:any){return <div className="flex flex-wrap gap-2"><button type="button" onClick={onEdit} className="rounded-xl border px-3 py-2 text-xs font-bold">{locked?'View':'Edit'}</button>{!locked&&<button type="button" onClick={onStatus} className="rounded-xl border px-3 py-2 text-xs font-bold">{row.is_active?'Inactive':'Active'}</button>}{!locked&&<button type="button" onClick={onDelete} className="rounded-xl border px-3 py-2 text-xs font-bold text-red-600">Delete</button>}</div>}

function Header({title,subtitle,back}:any){return <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">{title}</h3><p className="text-sm text-slate-500">{subtitle}</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back</button></div>}
function Actions({busy,back,disabled,label}:any){return <div className="flex flex-wrap gap-2 md:col-span-2"><Button disabled={busy||disabled}>{busy?'Saving...':label}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div>}
function ConfirmModal({action,busy,onCancel,onConfirm}:any){return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><Card className="max-w-md"><h3 className="text-lg font-bold">Confirm {action.kind}</h3><p className="mt-2 text-sm text-slate-500">This will {action.kind==='delete'?'deactivate/delete':'change status for'} {action.row.name || action.row.email}. Continue?</p><div className="mt-4 flex gap-2"><Button onClick={onConfirm} disabled={busy}>Confirm</Button><button type="button" onClick={onCancel} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></Card></div>}
function Empty({text}:any){return <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">{text}</div>}
function Pagination({page,totalPages,total,pageSize,onPage}:any){const start=total===0?0:(page-1)*pageSize+1;const end=Math.min(page*pageSize,total);return <div className="mt-4 flex flex-col justify-between gap-3 text-sm text-slate-500 sm:flex-row sm:items-center"><span>Showing {start}-{end} of {total}</span><div className="flex gap-2"><button type="button" onClick={()=>onPage(Math.max(1,page-1))} disabled={page<=1} className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300">Previous</button><span className="rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-700">Page {page} / {totalPages}</span><button type="button" onClick={()=>onPage(Math.min(totalPages,page+1))} disabled={page>=totalPages} className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300">Next</button></div></div>}
function title(value:string){return value.split(' ').filter(Boolean).map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(' ')}
function formatDate(value:any){return value?new Date(value).toLocaleDateString():'-'}
function isLocked(row:any){return Boolean(row?.is_template_locked||row?.source_template_role_id||row?.source_template_department_id||row?.source_template_branch_id)}
