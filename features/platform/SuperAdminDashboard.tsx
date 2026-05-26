'use client';

import {useEffect,useState} from 'react';
import {Activity,Building2,ClipboardList,CreditCard,Plus,Settings,ShieldCheck,Users} from 'lucide-react';
import {ActionButton,ActionGroup,Badge,Button,Card,Field,Input,Select} from '@/components/ui';
import {apiFetch,apiUpload} from '@/lib/api';
import {normalizeOptionLabel} from '@/lib/options';

const tenantTypes = [
  ['clinic', 'Clinic'],
  ['polyclinic', 'Polyclinic'],
  ['general_hospital', 'General Hospitals'],
  ['specialty_hospital', 'Specialty Hospitals'],
  ['multi_specialty_hospital', 'Multi Specialty Hospitals'],
] as const;

const defaultNumberingEntities:any={user:'USR',patient:'PAT',doctor:'DOC',department:'DEPT',lab_order:'LAB',pharmacy_issue:'PHM',invoice:'INV',ip_admission:'IP',physiotherapy_case:'PHY',supplier:'SUP'};
const parseNumberingRules=(value:any,fallbackPrefix='SUN')=>({prefix:String(value?.prefix||fallbackPrefix||'SUN').toUpperCase(),digits:Number(value?.digits||5),entities:{...defaultNumberingEntities,...(value?.entities||{})}});
const numberEntityLabel=(value:string)=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,part=>part.toUpperCase());

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

export const superAdminSections = [
  ['overview','Overview',Activity],
  ['tenants','Tenants',Building2],
  ['roles','Roles',ShieldCheck],
  ['users','Users',Users],
  ['departments','Departments',ClipboardList],
  ['branches','Branches',Building2],
  ['subscriptions','Subscription Management',CreditCard],
  ['settings','Tenant & Branch Settings',Settings],
] as const;

export function SuperAdminDashboard({apiSession,switchTenant,section,setSection}:any){
 const [localSection,setLocalSection]=useState('overview');
 const currentSection=section||localSection;
 const changeSection=setSection||setLocalSection;
 const [tenants,setTenants]=useState<any[]>([]);
 const [plans,setPlans]=useState<any[]>([]);
 const [roles,setRoles]=useState<any[]>([]);
 const [users,setUsers]=useState<any[]>([]);
 const [departments,setDepartments]=useState<any[]>([]);
 const [tenantBranches,setTenantBranches]=useState<any[]>([]);
 const [primaryTemplates,setPrimaryTemplates]=useState<any>({roles:[],departments:[],branches:[]});
 const [permissionCatalog,setPermissionCatalog]=useState<any[]>([]);
 const [moduleRegistry,setModuleRegistry]=useState<any[]>([]);
 const [selectedId,setSelectedId]=useState('');
 const [selectedRoleId,setSelectedRoleId]=useState('');
 const [selectedUserId,setSelectedUserId]=useState('');
 const [selectedDepartmentId,setSelectedDepartmentId]=useState('');
 const [selectedBranchId,setSelectedBranchId]=useState('');
 const [confirmAction,setConfirmAction]=useState<any>(null);
 const [tenantSuccess,setTenantSuccess]=useState<any>(null);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const selected=tenants.find(t=>t.id===selectedId)||tenants.find(t=>t.is_primary)||tenants[0];
 const customerTenants=tenants.filter(t=>!t.is_primary);
 const activeTenants=customerTenants.filter(t=>t.status==='active').length;
 const trialTenants=customerTenants.filter(t=>t.status==='trial').length;
 const estimatedRevenue=customerTenants.reduce((sum,t)=>sum+Number(plans.find(p=>p.is_active)?.price_inr_monthly||0),0);

 function openListing(sectionId:string){
  changeSection(sectionId);
  requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}));
 }

 async function loadPlatform(){
  if(!apiSession)return [];
  setBusy(true);setMessage('');
  try{
   const [tenantRows,planRows,moduleRows]=await Promise.all([apiFetch('/tenants',apiSession),apiFetch('/subscription-plans',apiSession),apiFetch('/modules',apiSession)]);
   setTenants(tenantRows);setPlans(planRows);setModuleRegistry(moduleRows);
   if(!selectedId&&tenantRows.length)setSelectedId(tenantRows.find((t:any)=>t.is_primary)?.id||tenantRows[0].id);
   const primary=tenantRows.find((tenant:any)=>tenant.is_primary);
   if(primary)await loadPrimaryTemplates(primary.id);
   return tenantRows;
  }catch(err:any){setMessage(err.message||'Could not load platform data.');return []}finally{setBusy(false)}
 }

 async function loadPrimaryTemplates(primaryTenantId:string){
  if(!apiSession||!primaryTenantId)return;
  try{
   const scoped={...apiSession,tenantId:primaryTenantId};
   const [roleRows,departmentRows,branchRows]=await Promise.all([apiFetch('/identity/roles',scoped),apiFetch(`/tenants/${primaryTenantId}/departments`,scoped),apiFetch(`/tenants/${primaryTenantId}/branches`,scoped)]);
   setPrimaryTemplates({
    roles:roleRows.filter((role:any)=>role.key!=='super_admin'),
    departments:departmentRows,
    branches:branchRows,
   });
  }catch{
   setPrimaryTemplates({roles:[],departments:[],branches:[]});
  }
 }

 async function loadTenantAccess(tenantId:string){
  if(!apiSession||!tenantId)return;
  try{
   const scoped={...apiSession,tenantId};
   const [roleRows,userRows,departmentRows,branchRows,permissionRows]=await Promise.all([apiFetch('/identity/roles',scoped),apiFetch('/identity/users',scoped),apiFetch(`/tenants/${tenantId}/departments`,scoped),apiFetch(`/tenants/${tenantId}/branches`,scoped),apiFetch('/identity/permissions',scoped)]);
   setRoles(roleRows);setUsers(userRows);setDepartments(departmentRows);setTenantBranches(branchRows);setPermissionCatalog(permissionRows);
  }catch{
   setRoles([]);setUsers([]);setDepartments([]);setTenantBranches([]);
  }
 }

 useEffect(()=>{loadPlatform()},[apiSession?.token,apiSession?.tenantId]);
 useEffect(()=>{if(selectedId)loadTenantAccess(selectedId)},[selectedId,apiSession?.token]);

 async function createTenant(e:any){
  e.preventDefault();if(!apiSession)return;
  const form=e.currentTarget;
  const fd=new FormData(form);
  setBusy(true);setMessage('');
  try{
   const created=await apiFetch('/tenants',apiSession,{method:'POST',body:JSON.stringify({
    name:fd.get('name'),legal_name:fd.get('legalName')||null,description:fd.get('description')||null,
    email:fd.get('email')||null,phone:fd.get('phone')||null,address:fd.get('address')||null,
    tenant_type:fd.get('tenantType')||'clinic',status:fd.get('status')||'trial',
    country:String(fd.get('country')||'IN').toUpperCase(),timezone:fd.get('timezone')||'Asia/Kolkata'
   })});
   const logoFile=fd.get('logoFile') as File|null;
   let tenantWithLogo=created;
   if(logoFile&&logoFile.size>0){
    const logoData=new FormData();
    logoData.append('file',logoFile);
    tenantWithLogo=await apiUpload(`/tenants/${created.id}/logo`,apiSession,logoData);
   }
   const branchCount=Number(fd.get('branchCount')||1);
   let firstBranchId='';
   for(let index=0;index<branchCount;index+=1){
    const branchName=String(fd.get(`branchName_${index}`)||'').trim();
    if(!branchName)continue;
    const branch=await apiFetch(`/tenants/${created.id}/branches`,{...apiSession,tenantId:created.id},{method:'POST',body:JSON.stringify({
     name:branchName,code:String(fd.get(`branchCode_${index}`)||`BR${index+1}`).trim(),address:fd.get(`branchAddress_${index}`)||fd.get('address')||null,
     city:fd.get(`branchCity_${index}`)||null,state:fd.get(`branchState_${index}`)||null
    })});
    firstBranchId=firstBranchId||branch.id;
   }
   const planId=String(fd.get('planId')||'');
   const selectedModuleKeys=fd.getAll('enabledModules').map(value=>String(value));
   const moduleByEntitlement=new Map(moduleRegistry.map((module:any)=>[module.entitlement_key||module.key,module]));
   const withDependencies=new Set<string>(selectedModuleKeys);
   selectedModuleKeys.forEach(key=>{
    const module=moduleByEntitlement.get(key);
    (module?.dependencies||[]).forEach((dependency:string)=>{
     const dependencyModule=moduleRegistry.find((item:any)=>item.key===dependency);
     if(dependencyModule?.entitlement_key)withDependencies.add(dependencyModule.entitlement_key);
    });
   });
   const enabledModules=Array.from(withDependencies).filter(Boolean);
   let subscriptionPlanId=planId;
   let createdOnboardingPlan=null;
   if(planId&&enabledModules.length){
    const basePlan=plans.find((plan:any)=>plan.id===planId);
    createdOnboardingPlan=await apiFetch('/subscription-plans',apiSession,{method:'POST',body:JSON.stringify({
     key:`tenant_${created.id.replace(/^tenant_/,'')}`,
     name:`${created.name} Onboarding Plan`,
     monthly_patient_limit:Number(basePlan?.monthly_patient_limit||300),
     included_branches:Number(basePlan?.included_branches||Math.max(1,branchCount)),
     included_doctors:Number(basePlan?.included_doctors||1),
     price_inr_monthly:Number(basePlan?.price_inr_monthly||0),
     enabled_modules:enabledModules
    })});
    subscriptionPlanId=createdOnboardingPlan.id;
   }
   if(subscriptionPlanId){
    await apiFetch('/subscription-plans/tenant-subscriptions',{...apiSession,tenantId:created.id},{method:'POST',body:JSON.stringify({
     plan_id:subscriptionPlanId,starts_on:new Date().toISOString().slice(0,10),is_trial:fd.get('status')==='trial'
    })});
   }
   const roleTemplateIds=fd.getAll('roleTemplateIds').map(value=>String(value));
   const tenantAdminTemplate=primaryTemplates.roles.find((role:any)=>role.key==='tenant_admin');
   if(fd.get('adminEmail')&&tenantAdminTemplate&&!roleTemplateIds.includes(tenantAdminTemplate.id))roleTemplateIds.push(tenantAdminTemplate.id);
   for(const roleId of roleTemplateIds){
    await apiFetch(`/identity/roles/${roleId}/assign/${created.id}`,apiSession,{method:'POST'});
   }
   for(const departmentId of fd.getAll('departmentTemplateIds').map(value=>String(value))){
    await apiFetch(`/tenants/departments/${departmentId}/assign/${created.id}`,apiSession,{method:'POST'});
   }
   for(const branchId of fd.getAll('branchTemplateIds').map(value=>String(value))){
    await apiFetch(`/tenants/branches/${branchId}/assign/${created.id}`,apiSession,{method:'POST'});
   }
   const adminEmail=String(fd.get('adminEmail')||'').trim();
   const adminPassword=String(fd.get('adminPassword')||'').trim();
   let tenantAdminUser=null;
   if(adminEmail&&adminPassword){
    tenantAdminUser=await apiFetch('/identity/users',{...apiSession,tenantId:created.id},{method:'POST',body:JSON.stringify({
     name:fd.get('adminName')||'Tenant Admin',
     email:adminEmail,
     password:adminPassword,
     mobile:fd.get('adminMobile')||null,
     branch_id:firstBranchId||null,
     role_keys:['tenant_admin'],
     must_change_password:fd.get('adminMustChangePassword')!=='false'
    })});
   }
   form.reset();
   setSelectedId(tenantWithLogo.id);
   setTenants(previous=>[tenantWithLogo,...previous.filter((tenant:any)=>tenant.id!==tenantWithLogo.id)]);
   openListing('tenants');
   await loadPlatform();
   setTenantSuccess({tenant:tenantWithLogo,branchCount,hasSubscription:Boolean(subscriptionPlanId),moduleCount:enabledModules.length,onboardingPlan:createdOnboardingPlan,roleCount:roleTemplateIds.length,departmentCount:fd.getAll('departmentTemplateIds').length,branchTemplateCount:fd.getAll('branchTemplateIds').length,adminUser:tenantAdminUser,adminPassword});
   setMessage(`Tenant onboarding completed successfully: ${tenantWithLogo.name}`);
  }catch(err:any){setMessage(err.message||'Could not create tenant.')}finally{setBusy(false)}
 }

 async function updateTenant(e:any){
  e.preventDefault();if(!apiSession||!selected)return;
  const fd=new FormData(e.currentTarget);
  setBusy(true);setMessage('');
  try{
   const updated=await apiFetch(`/tenants/${selected.id}`,apiSession,{method:'PATCH',body:JSON.stringify({
    name:fd.get('name'),legal_name:fd.get('legalName')||null,description:fd.get('description')||null,
    email:fd.get('email')||null,phone:fd.get('phone')||null,address:fd.get('address')||null,
    tenant_type:fd.get('tenantType'),status:fd.get('status'),country:String(fd.get('country')||'IN').toUpperCase(),
   timezone:fd.get('timezone')||'Asia/Kolkata'
   })});
   const logoFile=fd.get('logoFile') as File|null;
   let tenantRow=updated;
   if(logoFile&&logoFile.size>0){
    const logoData=new FormData();
    logoData.append('file',logoFile);
    tenantRow=await apiUpload(`/tenants/${selected.id}/logo`,apiSession,logoData);
   }
   const branchCount=Number(fd.get('branchCount')||0);
   for(let index=0;index<branchCount;index+=1){
    const branchName=String(fd.get(`branchName_${index}`)||'').trim();
    const branchId=String(fd.get(`branchId_${index}`)||'').trim();
    if(!branchName)continue;
    const payload={
     name:branchName,
     code:String(fd.get(`branchCode_${index}`)||`BR${index+1}`).trim(),
     address:fd.get(`branchAddress_${index}`)||null,
     city:fd.get(`branchCity_${index}`)||null,
     state:fd.get(`branchState_${index}`)||null,
     is_active:fd.get(`branchActive_${index}`)!=='false'
    };
    if(branchId){
     await apiFetch(`/tenants/${updated.id}/branches/${branchId}`,{...apiSession,tenantId:updated.id},{method:'PATCH',body:JSON.stringify(payload)});
    }else{
     await apiFetch(`/tenants/${updated.id}/branches`,{...apiSession,tenantId:updated.id},{method:'POST',body:JSON.stringify(payload)});
    }
   }
   setSelectedId(updated.id);
   setTenants(previous=>[tenantRow,...previous.filter((tenant:any)=>tenant.id!==tenantRow.id)]);
   openListing('tenants');
   await loadPlatform();
   setMessage(`Tenant has been updated successfully: ${updated.name}`);
  }catch(err:any){setMessage(err.message||'Could not update tenant.')}finally{setBusy(false)}
 }

 async function suspendTenant(tenant=selected){
  if(!apiSession||!tenant||tenant.is_primary)return;
  if(!window.confirm(`Suspend tenant ${tenant.name}?`))return;
  setBusy(true);setMessage('');
  try{await apiFetch(`/tenants/${tenant.id}`,apiSession,{method:'DELETE'});await loadPlatform();setMessage(`Tenant suspended: ${tenant.name}`)}
  catch(err:any){setMessage(err.message||'Could not suspend tenant.')}finally{setBusy(false)}
 }

 async function createRole(e:any){
  e.preventDefault();if(!apiSession||!selectedId)return;
  const form=e.currentTarget;
  const fd=new FormData(form);
  const permissionKeys=fd.getAll('permissionKeys').map(x=>String(x).trim()).filter(Boolean);
  setBusy(true);setMessage('');
  try{
   const created=await apiFetch('/identity/roles',{...apiSession,tenantId:selectedId},{method:'POST',body:JSON.stringify({
    name:fd.get('name'),key:fd.get('key'),permission_keys:permissionKeys
   })});
   form.reset();setRoles(previous=>[created,...previous.filter((role:any)=>role.id!==created.id)]);
   setSelectedRoleId(created.id);openListing('roles');await loadTenantAccess(selectedId);setMessage(`Role created: ${created.name}`);
  }catch(err:any){setMessage(err.message||'Could not create role.')}finally{setBusy(false)}
 }

 async function updateRole(e:any){
  e.preventDefault();if(!apiSession||!selectedId||!selectedRoleId)return;
  const fd=new FormData(e.currentTarget);
  const checkedKeys=fd.getAll('permissionKeys').map(x=>String(x).trim()).filter(Boolean);
  const typedKeys=String(fd.get('permissionKeysText')||'').split(',').map(x=>x.trim()).filter(Boolean);
  const permissionKeys=[...checkedKeys,...typedKeys];
  const payload:any={name:fd.get('name'),key:fd.get('key'),is_active:fd.get('isActive')==='true'};
  if(permissionKeys.length||fd.get('replacePermissions')==='true')payload.permission_keys=permissionKeys;
  setBusy(true);setMessage('');
  try{
   const updated=await apiFetch(`/identity/roles/${selectedRoleId}`,{...apiSession,tenantId:selectedId},{method:'PATCH',body:JSON.stringify(payload)});
   setRoles(previous=>[updated,...previous.filter((role:any)=>role.id!==updated.id)]);
   openListing('roles');await loadTenantAccess(selectedId);setMessage('Role updated.');
  }catch(err:any){setMessage(err.message||'Could not update role.')}finally{setBusy(false)}
 }

 async function changeRoleStatus(role:any){
  if(!apiSession||!selectedId)return;
  setBusy(true);setMessage('');
  try{
   await apiFetch(`/identity/roles/${role.id}/status`,{...apiSession,tenantId:selectedId},{method:'POST',body:JSON.stringify({is_active:!role.is_active})});
   await loadTenantAccess(selectedId);setMessage(`Role ${role.is_active?'deactivated':'activated'}.`);
  }catch(err:any){setMessage(err.message||'Could not change role status.')}finally{setBusy(false);setConfirmAction(null)}
 }

 async function deleteRole(role:any){
  if(!apiSession||!selectedId)return;
  setBusy(true);setMessage('');
  try{
   await apiFetch(`/identity/roles/${role.id}`,{...apiSession,tenantId:selectedId},{method:'DELETE'});
   await loadTenantAccess(selectedId);setMessage('Role deleted.');
  }catch(err:any){setMessage(err.message||'Could not delete role.')}finally{setBusy(false);setConfirmAction(null)}
 }

 async function assignRoleTemplate(e:any){
  e.preventDefault();if(!apiSession||!selectedRoleId)return;
  const fd=new FormData(e.currentTarget);
  const targetTenantId=String(fd.get('targetTenantId')||'');
  setBusy(true);setMessage('');
  try{
   const assigned=await apiFetch(`/identity/roles/${selectedRoleId}/assign/${targetTenantId}`,apiSession,{method:'POST'});
   openListing('roles');setMessage(`Role template assigned to tenant: ${assigned.name}`);
  }catch(err:any){setMessage(err.message||'Could not assign role template.')}finally{setBusy(false)}
 }

 async function createUser(e:any){
  e.preventDefault();if(!apiSession||!selectedId)return;
  const form=e.currentTarget;
  const fd=new FormData(form);
  const roleKeys=String(fd.get('roleKeys')||'').split(',').map(x=>x.trim()).filter(Boolean);
  setBusy(true);setMessage('');
  try{
   const created=await apiFetch('/identity/users',{...apiSession,tenantId:selectedId},{method:'POST',body:JSON.stringify({
    name:fd.get('name'),email:fd.get('email'),password:fd.get('password'),mobile:fd.get('mobile')||null,
    user_type:fd.get('userType')||'staff',branch_id:fd.get('branchId')||null,role_keys:roleKeys,must_change_password:fd.get('mustChangePassword')==='true'
   })});
   form.reset();setUsers(previous=>[created,...previous.filter((user:any)=>user.id!==created.id)]);
   setSelectedUserId(created.id);openListing('users');await loadTenantAccess(selectedId);setMessage(`User created: ${created.name}`);
  }catch(err:any){setMessage(err.message||'Could not create user.')}finally{setBusy(false)}
 }

 async function updateUser(e:any){
  e.preventDefault();if(!apiSession||!selectedId||!selectedUserId)return;
  const fd=new FormData(e.currentTarget);
  const roleKeys=String(fd.get('roleKeys')||'').split(',').map(x=>x.trim()).filter(Boolean);
  const payload:any={
    name:fd.get('name'),email:fd.get('email'),user_type:fd.get('userType')||'staff',mobile:fd.get('mobile')||null,branch_id:fd.get('branchId')||null,
    is_active:fd.get('isActive')==='true',must_change_password:fd.get('mustChangePassword')==='true'
  };
  if(roleKeys.length)payload.role_keys=roleKeys;
  setBusy(true);setMessage('');
  try{
   const updated=await apiFetch(`/identity/users/${selectedUserId}`,{...apiSession,tenantId:selectedId},{method:'PATCH',body:JSON.stringify(payload)});
   setUsers(previous=>[updated,...previous.filter((user:any)=>user.id!==updated.id)]);
   openListing('users');await loadTenantAccess(selectedId);setMessage('User updated.');
  }catch(err:any){setMessage(err.message||'Could not update user.')}finally{setBusy(false)}
 }

 async function changeUserStatus(user:any){
  if(!apiSession||!selectedId)return;
  setBusy(true);setMessage('');
  try{
   await apiFetch(`/identity/users/${user.id}/status`,{...apiSession,tenantId:selectedId},{method:'POST',body:JSON.stringify({is_active:!user.is_active})});
   await loadTenantAccess(selectedId);setMessage(`User ${user.is_active?'deactivated':'activated'}.`);
  }catch(err:any){setMessage(err.message||'Could not change user status.')}finally{setBusy(false);setConfirmAction(null)}
 }

 async function deleteUser(user:any){
  if(!apiSession||!selectedId)return;
  setBusy(true);setMessage('');
  try{
   await apiFetch(`/identity/users/${user.id}`,{...apiSession,tenantId:selectedId},{method:'DELETE'});
   await loadTenantAccess(selectedId);setMessage('User deleted.');
  }catch(err:any){setMessage(err.message||'Could not delete user.')}finally{setBusy(false);setConfirmAction(null)}
 }

 async function createDepartment(e:any){
  e.preventDefault();if(!apiSession||!selectedId)return;
  const form=e.currentTarget;
  const fd=new FormData(form);
  setBusy(true);setMessage('');
  try{
   const created=await apiFetch(`/tenants/${selectedId}/departments`,{...apiSession,tenantId:selectedId},{method:'POST',body:JSON.stringify({
    name:fd.get('name'),description:fd.get('description')||null,created_by_user_id:apiSession.user?.id||null
   })});
   form.reset();setDepartments(previous=>[created,...previous.filter((department:any)=>department.id!==created.id)]);
   setSelectedDepartmentId(created.id);openListing('departments');await loadTenantAccess(selectedId);setMessage(`Department created: ${created.name}`);
  }catch(err:any){setMessage(err.message||'Could not create department.')}finally{setBusy(false)}
 }

 async function updateDepartment(e:any){
  e.preventDefault();if(!apiSession||!selectedId||!selectedDepartmentId)return;
  const fd=new FormData(e.currentTarget);
  setBusy(true);setMessage('');
  try{
   const updated=await apiFetch(`/tenants/${selectedId}/departments/${selectedDepartmentId}`,{...apiSession,tenantId:selectedId},{method:'PATCH',body:JSON.stringify({
    name:fd.get('name'),description:fd.get('description')||null,is_active:fd.get('isActive')==='true'
   })});
   setDepartments(previous=>[updated,...previous.filter((department:any)=>department.id!==updated.id)]);
   openListing('departments');await loadTenantAccess(selectedId);setMessage('Department updated.');
  }catch(err:any){setMessage(err.message||'Could not update department.')}finally{setBusy(false)}
 }

 async function changeDepartmentStatus(department:any){
  if(!apiSession||!selectedId)return;
  setBusy(true);setMessage('');
  try{
   await apiFetch(`/tenants/${selectedId}/departments/${department.id}/status`,{...apiSession,tenantId:selectedId},{method:'POST',body:JSON.stringify({is_active:!department.is_active})});
   await loadTenantAccess(selectedId);setMessage(`Department ${department.is_active?'deactivated':'activated'}.`);
  }catch(err:any){setMessage(err.message||'Could not change department status.')}finally{setBusy(false);setConfirmAction(null)}
 }

 async function deleteDepartment(department:any){
  if(!apiSession||!selectedId)return;
  setBusy(true);setMessage('');
  try{
   await apiFetch(`/tenants/${selectedId}/departments/${department.id}`,{...apiSession,tenantId:selectedId},{method:'DELETE'});
   await loadTenantAccess(selectedId);setMessage('Department deleted.');
  }catch(err:any){setMessage(err.message||'Could not delete department.')}finally{setBusy(false);setConfirmAction(null)}
 }

 async function assignDepartmentTemplate(e:any){
  e.preventDefault();if(!apiSession||!selectedDepartmentId)return;
  const fd=new FormData(e.currentTarget);
  const targetTenantId=String(fd.get('targetTenantId')||'');
  setBusy(true);setMessage('');
  try{
   const assigned=await apiFetch(`/tenants/departments/${selectedDepartmentId}/assign/${targetTenantId}`,apiSession,{method:'POST'});
   openListing('departments');setMessage(`Department template assigned to tenant: ${assigned.name}`);
  }catch(err:any){setMessage(err.message||'Could not assign department template.')}finally{setBusy(false)}
 }

 async function createBranch(e:any){
  e.preventDefault();if(!apiSession||!selectedId)return;
  const form=e.currentTarget;
  const fd=new FormData(form);
  setBusy(true);setMessage('');
  try{
   const created=await apiFetch(`/tenants/${selectedId}/branches`,{...apiSession,tenantId:selectedId},{method:'POST',body:JSON.stringify({
    name:fd.get('name'),code:fd.get('code'),address:fd.get('address')||null,city:fd.get('city')||null,state:fd.get('state')||null
   })});
   form.reset();setTenantBranches(previous=>[created,...previous.filter((branch:any)=>branch.id!==created.id)]);
   setSelectedBranchId(created.id);openListing('branches');await loadTenantAccess(selectedId);setMessage(`Branch created: ${created.name}`);
  }catch(err:any){setMessage(err.message||'Could not create branch.')}finally{setBusy(false)}
 }

 async function updateBranch(e:any){
  e.preventDefault();if(!apiSession||!selectedId||!selectedBranchId)return;
  const fd=new FormData(e.currentTarget);
  setBusy(true);setMessage('');
  try{
   const updated=await apiFetch(`/tenants/${selectedId}/branches/${selectedBranchId}`,{...apiSession,tenantId:selectedId},{method:'PATCH',body:JSON.stringify({
    name:fd.get('name'),code:fd.get('code'),address:fd.get('address')||null,city:fd.get('city')||null,state:fd.get('state')||null,is_active:fd.get('isActive')==='true'
   })});
   setTenantBranches(previous=>[updated,...previous.filter((branch:any)=>branch.id!==updated.id)]);
   openListing('branches');await loadTenantAccess(selectedId);setMessage('Branch updated.');
  }catch(err:any){setMessage(err.message||'Could not update branch.')}finally{setBusy(false)}
 }

 async function changeBranchStatus(branch:any){
  if(!apiSession||!selectedId)return;
  setBusy(true);setMessage('');
  try{
   await apiFetch(`/tenants/${selectedId}/branches/${branch.id}/status`,{...apiSession,tenantId:selectedId},{method:'POST',body:JSON.stringify({is_active:!branch.is_active})});
   await loadTenantAccess(selectedId);setMessage(`Branch ${branch.is_active?'deactivated':'activated'}.`);
  }catch(err:any){setMessage(err.message||'Could not change branch status.')}finally{setBusy(false);setConfirmAction(null)}
 }

 async function deleteBranch(branch:any){
  if(!apiSession||!selectedId)return;
  setBusy(true);setMessage('');
  try{
   await apiFetch(`/tenants/${selectedId}/branches/${branch.id}`,{...apiSession,tenantId:selectedId},{method:'DELETE'});
   await loadTenantAccess(selectedId);setMessage('Branch deleted.');
  }catch(err:any){setMessage(err.message||'Could not delete branch.')}finally{setBusy(false);setConfirmAction(null)}
 }

 async function assignBranchTemplate(e:any){
  e.preventDefault();if(!apiSession||!selectedBranchId)return;
  const fd=new FormData(e.currentTarget);
  const targetTenantId=String(fd.get('targetTenantId')||'');
  setBusy(true);setMessage('');
  try{
   const assigned=await apiFetch(`/tenants/branches/${selectedBranchId}/assign/${targetTenantId}`,apiSession,{method:'POST'});
   openListing('branches');setMessage(`Branch template assigned to tenant: ${assigned.name}`);
  }catch(err:any){setMessage(err.message||'Could not assign branch template.')}finally{setBusy(false)}
 }

 if(!apiSession?.user?.is_super_admin)return <Card><h3 className="text-lg font-bold">Super Admin</h3><p className="mt-2 text-sm text-slate-500">This workspace is available only for MedizinHub HMS primary tenant super admin users.</p></Card>;

 return <div className="min-w-0 space-y-5">
   <Card><div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div><h3 className="text-xl font-bold">MedizinHub HMS Primary Tenant</h3><p className="text-sm text-slate-500">Manage tenants, roles, subscriptions, and platform settings from separate pages.</p></div><Badge tone="blue">Global Platform Access</Badge></div></Card>
   {message&&<div className="rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
   {currentSection==='overview'&&<Overview customerTenants={customerTenants} activeTenants={activeTenants} trialTenants={trialTenants} plans={plans} estimatedRevenue={estimatedRevenue}/>}
   {currentSection==='tenants'&&<TenantManagement tenants={tenants} setSelectedId={setSelectedId} setSection={changeSection} switchTenant={switchTenant} apiSession={apiSession} busy={busy} suspendTenant={suspendTenant}/>}
   {currentSection==='tenantEdit'&&selected&&<EditTenant selected={selected} branches={tenantBranches} busy={busy} updateTenant={updateTenant} suspendTenant={suspendTenant} back={()=>changeSection('tenants')}/>}
   {currentSection==='createTenant'&&<CreateTenantForm plans={plans} moduleRegistry={moduleRegistry} templates={primaryTemplates} busy={busy} createTenant={createTenant}/>}
   {currentSection==='roles'&&<RolesManagement tenants={tenants} customerTenants={customerTenants} selected={selected} selectedId={selectedId} setSelectedId={setSelectedId} roles={roles} setSelectedRoleId={setSelectedRoleId} setSection={changeSection} setConfirmAction={setConfirmAction}/>}
   {currentSection==='roleCreate'&&<CreateRole tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId} permissionCatalog={permissionCatalog} busy={busy} createRole={createRole} back={()=>changeSection('roles')}/>}
   {currentSection==='roleEdit'&&<EditRole role={roles.find((r:any)=>r.id===selectedRoleId)} busy={busy} updateRole={updateRole} back={()=>changeSection('roles')}/>}
   {currentSection==='rolePermissions'&&<RolePermissions role={roles.find((r:any)=>r.id===selectedRoleId)} permissionCatalog={permissionCatalog} busy={busy} updateRole={updateRole} back={()=>changeSection('roles')}/>}
   {currentSection==='roleAssign'&&<AssignTemplate title="Assign Role Template" item={roles.find((r:any)=>r.id===selectedRoleId)} tenants={tenants.filter((tenant:any)=>tenant.id!==selectedId)} busy={busy} onSubmit={assignRoleTemplate} back={()=>changeSection('roles')}/>}
   {currentSection==='users'&&<TenantUsers tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId} users={users} setSelectedUserId={setSelectedUserId} setSection={changeSection} setConfirmAction={setConfirmAction}/>}
   {currentSection==='userCreate'&&<CreateUser tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId} roles={roles} busy={busy} createUser={createUser} back={()=>changeSection('users')}/>}
   {currentSection==='userEdit'&&<EditUser user={users.find((u:any)=>u.id===selectedUserId)} roles={roles} busy={busy} updateUser={updateUser} back={()=>changeSection('users')}/>}
   {currentSection==='departments'&&<DepartmentsManagement tenants={tenants} customerTenants={customerTenants} selected={selected} selectedId={selectedId} setSelectedId={setSelectedId} departments={departments} setSelectedDepartmentId={setSelectedDepartmentId} setSection={changeSection} setConfirmAction={setConfirmAction}/>}
   {currentSection==='departmentCreate'&&<CreateDepartment tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId} busy={busy} createDepartment={createDepartment} back={()=>changeSection('departments')}/>}
   {currentSection==='departmentEdit'&&<EditDepartment department={departments.find((d:any)=>d.id===selectedDepartmentId)} busy={busy} updateDepartment={updateDepartment} back={()=>changeSection('departments')}/>}
   {currentSection==='departmentAssign'&&<AssignTemplate title="Assign Department Template" item={departments.find((d:any)=>d.id===selectedDepartmentId)} tenants={tenants.filter((tenant:any)=>tenant.id!==selectedId)} busy={busy} onSubmit={assignDepartmentTemplate} back={()=>changeSection('departments')}/>}
   {currentSection==='branches'&&<BranchesManagement tenants={tenants} selected={selected} selectedId={selectedId} setSelectedId={setSelectedId} branches={tenantBranches} setSelectedBranchId={setSelectedBranchId} setSection={changeSection} setConfirmAction={setConfirmAction}/>}
   {currentSection==='branchCreate'&&<CreateBranch tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId} busy={busy} createBranch={createBranch} back={()=>changeSection('branches')}/>}
   {currentSection==='branchEdit'&&<EditBranch branch={tenantBranches.find((b:any)=>b.id===selectedBranchId)} busy={busy} updateBranch={updateBranch} back={()=>changeSection('branches')}/>}
   {currentSection==='branchAssign'&&<AssignTemplate title="Assign Branch Template" item={tenantBranches.find((b:any)=>b.id===selectedBranchId)} tenants={tenants.filter((tenant:any)=>tenant.id!==selectedId)} busy={busy} onSubmit={assignBranchTemplate} back={()=>changeSection('branches')}/>}
   {currentSection==='subscriptions'&&<SubscriptionManagement apiSession={apiSession} plans={plans} tenants={customerTenants} selectedId={selectedId} setSelectedId={setSelectedId} reloadPlans={loadPlatform}/>}
   {currentSection==='settings'&&<TenantBranchSettings apiSession={apiSession} selected={selected} tenants={customerTenants} selectedId={selectedId} setSelectedId={setSelectedId} plans={plans} modules={moduleRegistry} reloadPlans={loadPlatform}/>}
   {confirmAction&&<ConfirmModal action={confirmAction} busy={busy} onCancel={()=>setConfirmAction(null)} onConfirm={()=>{
   if(confirmAction.entity==='branch')return confirmAction.kind==='delete'?deleteBranch(confirmAction.branch):changeBranchStatus(confirmAction.branch);
   if(confirmAction.entity==='department')return confirmAction.kind==='delete'?deleteDepartment(confirmAction.department):changeDepartmentStatus(confirmAction.department);
   if(confirmAction.entity==='role')return confirmAction.kind==='delete'?deleteRole(confirmAction.role):changeRoleStatus(confirmAction.role);
    return confirmAction.kind==='delete'?deleteUser(confirmAction.user):changeUserStatus(confirmAction.user);
   }}/>}
   {tenantSuccess&&<TenantCreatedModal details={tenantSuccess} onClose={()=>setTenantSuccess(null)}/>}
 </div>
}

function Overview({customerTenants,activeTenants,trialTenants,plans,estimatedRevenue}:any){
 return <div className="grid gap-4 md:grid-cols-5"><Metric icon={Building2} label="Customer Tenants" value={customerTenants.length}/><Metric icon={ShieldCheck} label="Active" value={activeTenants}/><Metric icon={Users} label="Trial" value={trialTenants}/><Metric icon={CreditCard} label="Plans" value={plans.filter((p:any)=>p.is_active).length}/><Metric icon={Activity} label="Monthly Revenue" value={`₹${estimatedRevenue}`}/></div>
}

function Metric({icon:Icon,label,value}:any){return <Card><Icon className="mb-3 text-slate-500"/><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></Card>}

function TenantManagement({tenants,setSelectedId,setSection,switchTenant,apiSession,busy,suspendTenant}:any){
 const [filters,setFilters]=useState({tenant:'',type:'all',status:'all',contact:'',fromDate:'',toDate:'',dateField:'updated_at'});
 const [sort,setSort]=useState({key:'updated_at',dir:'desc'});
 const [page,setPage]=useState(1);
 const pageSize=8;
 function updateFilter(key:string,value:string){setFilters({...filters,[key]:value})}
 function changeSort(key:string){setSort(sort.key===key?{key,dir:sort.dir==='asc'?'desc':'asc'}:{key,dir:'asc'})}
 function sortValue(tenant:any,key:string){
  if(key==='tenant')return `${tenant.name||''} ${tenant.legal_name||''}`.toLowerCase();
  if(key==='contact')return `${tenant.email||''} ${tenant.phone||''}`.toLowerCase();
  if(key==='created_at'||key==='updated_at')return new Date(tenant[key]||tenant.created_at||0).getTime();
  return String(tenant[key]||'').toLowerCase();
 }
 const filtered=tenants.filter((tenant:any)=>{
  const tenantText=[tenant.name,tenant.legal_name,tenant.id].join(' ').toLowerCase();
  const contactText=[tenant.email,tenant.phone,addressText(tenant)].join(' ').toLowerCase();
  const dateValue=tenant[filters.dateField]||tenant.created_at;
  const timestamp=dateValue?new Date(dateValue).getTime():0;
  const from=filters.fromDate?new Date(filters.fromDate).getTime():0;
  const to=filters.toDate?new Date(`${filters.toDate}T23:59:59`).getTime():Number.MAX_SAFE_INTEGER;
  return (!filters.tenant||tenantText.includes(filters.tenant.toLowerCase()))
   &&(filters.type==='all'||tenant.tenant_type===filters.type)
   &&(filters.status==='all'||tenant.status===filters.status)
   &&(!filters.contact||contactText.includes(filters.contact.toLowerCase()))
   &&(!filters.fromDate||timestamp>=from)
   &&(!filters.toDate||timestamp<=to);
 }).sort((a:any,b:any)=>{
  const left=sortValue(a,sort.key);
  const right=sortValue(b,sort.key);
  if(left<right)return sort.dir==='asc'?-1:1;
  if(left>right)return sort.dir==='asc'?1:-1;
  return 0;
 });
 const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
 const safePage=Math.min(page,totalPages);
 const rows=filtered.slice((safePage-1)*pageSize,safePage*pageSize);
 useEffect(()=>{setPage(1)},[filters,sort,tenants.length]);
 return <Card><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h3 className="text-lg font-bold">Tenants</h3><p className="text-sm text-slate-500">Latest created or updated tenants appear first. Use filters and sortable headers to manage tenant records.</p></div><div className="flex flex-wrap items-center gap-2"><Badge tone="blue">{filtered.length} tenants</Badge><CreateActionButton label="Create Tenant" onClick={()=>setSection('createTenant')}/></div></div><div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6"><Field label="Tenant"><Input value={filters.tenant} onChange={(e:any)=>updateFilter('tenant',e.target.value)} placeholder="Tenant name or ID"/></Field><Field label="Type"><Select value={filters.type} onChange={(e:any)=>updateFilter('type',e.target.value)}><option value="all">All types</option>{tenantTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Status"><Select value={filters.status} onChange={(e:any)=>updateFilter('status',e.target.value)}><option value="all">All status</option><option value="trial">Trial</option><option value="active">Active</option><option value="suspended">Suspended</option></Select></Field><Field label="Contact"><Input value={filters.contact} onChange={(e:any)=>updateFilter('contact',e.target.value)} placeholder="Email, phone, address"/></Field><Field label="Date field"><Select value={filters.dateField} onChange={(e:any)=>updateFilter('dateField',e.target.value)}><option value="updated_at">Modified date</option><option value="created_at">Created date</option></Select></Field><div className="grid grid-cols-2 gap-2"><Field label="From"><Input type="date" value={filters.fromDate} onChange={(e:any)=>updateFilter('fromDate',e.target.value)}/></Field><Field label="To"><Input type="date" value={filters.toDate} onChange={(e:any)=>updateFilter('toDate',e.target.value)}/></Field></div></div><div className="mt-4 overflow-hidden rounded-2xl border border-slate-200"><div className="hidden grid-cols-[1.45fr_.9fr_.7fr_1.1fr_.7fr_.7fr_1.15fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid"><SortButton label="Tenant" field="tenant" sort={sort} onSort={changeSort}/><SortButton label="Type" field="tenant_type" sort={sort} onSort={changeSort}/><SortButton label="Status" field="status" sort={sort} onSort={changeSort}/><SortButton label="Contact" field="contact" sort={sort} onSort={changeSort}/><SortButton label="Created" field="created_at" sort={sort} onSort={changeSort}/><SortButton label="Modified" field="updated_at" sort={sort} onSort={changeSort}/><span>Actions</span></div><div className="divide-y divide-slate-200">{rows.length===0&&<Empty text="No tenants match your search."/>}{rows.map((tenant:any)=><div key={tenant.id} className="grid gap-3 px-4 py-4 text-sm xl:grid-cols-[1.45fr_.9fr_.7fr_1.1fr_.7fr_.7fr_1.15fr] xl:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="truncate">{tenant.name}</b>{tenant.is_primary&&<Badge tone="blue">Primary</Badge>}</div><p className="break-all text-xs text-slate-500">{tenant.id}</p></div><div><span className="xl:hidden text-xs font-bold uppercase text-slate-500">Type: </span>{formatTenantType(tenant.tenant_type)}</div><div><Badge tone={tenant.status==='active'?'green':tenant.status==='trial'?'amber':'red'}>{tenant.status}</Badge></div><div className="min-w-0"><p className="truncate">{tenant.email||'-'}</p><p className="text-xs text-slate-500">{tenant.phone||''}</p></div><div>{formatDate(tenant.created_at)}</div><div>{formatDate(tenant.updated_at)}</div><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>{setSelectedId(tenant.id);setSection('tenantEdit')}} className="rounded-xl border px-3 py-2 text-xs font-bold">Edit</button><button type="button" onClick={()=>switchTenant(tenant.id)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300" disabled={busy||apiSession.tenantId===tenant.id}>{apiSession.tenantId===tenant.id?'Opened':'Open'}</button><button type="button" onClick={()=>suspendTenant(tenant)} disabled={tenant.is_primary||busy} className="rounded-xl border px-3 py-2 text-xs font-bold text-red-600 disabled:text-slate-300">Deactivate</button></div></div>)}</div></div><Pagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={pageSize} onPage={setPage}/></Card>
}

function EditTenant({selected,branches,busy,updateTenant,suspendTenant,back}:any){
 const [branchRows,setBranchRows]=useState<any[]>([]);
 useEffect(()=>{
  const rows=(branches||[]).map((branch:any)=>({...branch,_key:branch.id}));
  setBranchRows(rows.length?rows:[{_key:Date.now(),name:'Main Branch',code:'MAIN',is_active:true}]);
 },[selected.id,branches]);
 function addBranch(){setBranchRows([...branchRows,{_key:Date.now()+branchRows.length,name:'',code:`BR${branchRows.length+1}`,is_active:true}])}
 function removeUnsavedBranch(key:any){setBranchRows(branchRows.filter((branch:any)=>branch._key!==key))}
 return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">Edit Tenant Details</h3><p className="text-sm text-slate-500">{selected.name}</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Tenants</button></div><form onSubmit={updateTenant} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"><Field label="Tenant Name"><Input name="name" defaultValue={selected.name} required disabled={selected.is_primary}/></Field><Field label="Legal Name"><Input name="legalName" defaultValue={selected.legal_name||''}/></Field><Field label="Tenant Logo"><Input name="logoFile" type="file" accept="image/*"/>{selected.logo_url&&<p className="mt-1 break-all text-xs text-slate-500">{selected.logo_url}</p>}</Field><Field label="Email"><Input name="email" type="email" defaultValue={selected.email||''}/></Field><Field label="Phone"><Input name="phone" defaultValue={selected.phone||''}/></Field><Field label="Tenant Type"><Select name="tenantType" defaultValue={selected.tenant_type} disabled={selected.is_primary}>{selected.is_primary&&<option value="primary">Primary</option>}{tenantTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Status"><Select name="status" defaultValue={selected.status} disabled={selected.is_primary}><option value="trial">Trial</option><option value="active">Active</option><option value="suspended">Suspended</option></Select></Field><Field label="Country"><Input name="country" defaultValue={selected.country||'IN'} maxLength={2}/></Field><Field label="Timezone"><Input name="timezone" defaultValue={selected.timezone||'Asia/Kolkata'}/></Field><div className="md:col-span-2 xl:col-span-3"><Field label="Address"><Input name="address" defaultValue={selected.address||''}/></Field></div><div className="md:col-span-2 xl:col-span-3"><Field label="Description"><Input name="description" defaultValue={selected.description||''}/></Field></div><div className="md:col-span-2 xl:col-span-3"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h4 className="font-bold">Branches</h4><p className="text-sm text-slate-500">Edit local branches or add new branches for this tenant. Locked global branches are managed from MedizinHub HMS templates.</p></div><button type="button" onClick={addBranch} className="rounded-2xl border px-4 py-3 text-sm font-bold">Add Branch</button></div><input type="hidden" name="branchCount" value={branchRows.length}/><div className="mt-3 grid gap-3">{branchRows.map((branch:any,index:number)=>{const locked=branch.is_template_locked||branch.source_template_branch_id;return <div key={branch._key} className="rounded-2xl border border-slate-200 p-4"><input type="hidden" name={`branchId_${index}`} value={branch.id||''}/><div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><b>Branch {index+1}</b>{branch.is_global_template&&<Badge tone="blue">Global</Badge>}{locked&&<Badge tone="purple">Locked</Badge>}</div>{branch.id&&<p className="break-all text-xs text-slate-500">{branch.id}</p>}</div>{!branch.id&&branchRows.length>1&&<button type="button" onClick={()=>removeUnsavedBranch(branch._key)} className="rounded-xl border px-3 py-2 text-xs font-bold text-red-600">Remove</button>}</div><div className="grid gap-3 md:grid-cols-3"><Field label="Branch Name"><Input name={`branchName_${index}`} defaultValue={branch.name||''} required={index===0} disabled={locked}/></Field><Field label="Branch Code"><Input name={`branchCode_${index}`} defaultValue={branch.code||''} required={index===0} disabled={locked}/></Field><Field label="Status"><Select name={`branchActive_${index}`} defaultValue={String(branch.is_active!==false)} disabled={locked}><option value="true">Active</option><option value="false">Inactive</option></Select></Field><Field label="City"><Input name={`branchCity_${index}`} defaultValue={branch.city||''} disabled={locked}/></Field><Field label="State"><Input name={`branchState_${index}`} defaultValue={branch.state||''} disabled={locked}/></Field><Field label="Branch Address"><Input name={`branchAddress_${index}`} defaultValue={branch.address||''} disabled={locked}/></Field></div></div>})}</div></div><div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3"><Button disabled={busy}>{busy?'Saving...':'Update Tenant'}</Button><button type="button" onClick={()=>suspendTenant(selected)} disabled={busy||selected.is_primary} className="rounded-2xl border px-4 py-3 text-sm font-bold text-red-600 disabled:text-slate-300">Deactivate Tenant</button></div></form></Card>
}

function CreateTenantForm({plans,moduleRegistry,templates,busy,createTenant}:any){
 const [branches,setBranches]=useState([{id:Date.now()}]);
 const [step,setStep]=useState(0);
 const steps=['Tenant','Plan & Branches','Modules','Templates','Admin User','Review'];
 const roleDefaults=new Set(['tenant_admin']);
 const departmentDefaults=new Set(['general_medicine','general']);
 const branchDefaults=new Set(['MAIN','OP_MAIN']);
 return <Card>
  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
   <div><h3 className="text-lg font-bold">Tenant Onboarding Wizard</h3><p className="mt-1 text-sm text-slate-500">Create tenant, assign plan, module entitlements, branches, default templates, tenant admin credentials, and onboarding checklist in one guided flow.</p></div>
   <div className="flex flex-wrap gap-2">{steps.map((label,index)=><button key={label} type="button" onClick={()=>setStep(index)} className={`rounded-xl px-3 py-2 text-xs font-bold ${step===index?'bg-slate-900 text-white':'bg-slate-100 text-slate-600'}`}>{index+1}. {label}</button>)}</div>
  </div>
  <form onSubmit={createTenant} className="mt-5 grid gap-4">
   <input type="hidden" name="branchCount" value={branches.length}/>
   <div className={step===0?'grid gap-4 md:grid-cols-3':'hidden'}><Field label="Tenant Name"><Input name="name" required placeholder="Clinic name"/></Field><Field label="Legal Name"><Input name="legalName" placeholder="Registered legal name"/></Field><Field label="Tenant Type"><Select name="tenantType">{tenantTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Status"><Select name="status" defaultValue="trial"><option value="trial">Trial</option><option value="active">Active</option><option value="suspended">Suspended</option></Select></Field><Field label="Tenant Logo"><Input name="logoFile" type="file" accept="image/*"/></Field><Field label="Email"><Input name="email" type="email"/></Field><Field label="Phone"><Input name="phone"/></Field><Field label="Country"><Input name="country" defaultValue="IN" maxLength={2}/></Field><Field label="Timezone"><Input name="timezone" defaultValue="Asia/Kolkata"/></Field><div className="md:col-span-3"><Field label="Address"><Input name="address"/></Field></div><div className="md:col-span-3"><Field label="Description"><Input name="description" placeholder="Clinic, hospital, or group description"/></Field></div></div>
   <div className={step===1?'grid gap-4':'hidden'}><div className="grid gap-4 md:grid-cols-3"><Field label="Subscription Model"><Select name="planId">{plans.map((plan:any)=><option key={plan.id} value={plan.id}>{plan.name} - ₹{plan.price_inr_monthly}</option>)}</Select></Field></div><div><div className="flex items-center justify-between gap-3"><div><h4 className="font-bold">Branches</h4><p className="text-sm text-slate-500">Add local branches for the tenant. Template branches can also be copied later.</p></div><button type="button" onClick={()=>setBranches([...branches,{id:Date.now()+branches.length}])} className="rounded-2xl border px-4 py-3 text-sm font-bold">Add More Branch</button></div><div className="mt-3 grid gap-3">{branches.map((branch:any,index:number)=><div key={branch.id} className="rounded-2xl border border-slate-200 p-4"><div className="mb-3 flex items-center justify-between gap-3"><b>Branch {index+1}</b>{branches.length>1&&<button type="button" onClick={()=>setBranches(branches.filter((item:any)=>item.id!==branch.id))} className="rounded-xl border px-3 py-2 text-xs font-bold text-red-600">Cancel Branch</button>}</div><div className="grid gap-3 md:grid-cols-3"><Field label="Branch Name"><Input name={`branchName_${index}`} defaultValue={index===0?'Main Branch':''} required={index===0}/></Field><Field label="Branch Code"><Input name={`branchCode_${index}`} defaultValue={index===0?'MAIN':''} placeholder={`BR${index+1}`}/></Field><Field label="City"><Input name={`branchCity_${index}`} placeholder="Chennai"/></Field><Field label="State"><Input name={`branchState_${index}`} placeholder="Tamil Nadu"/></Field><div className="md:col-span-2"><Field label="Branch Address"><Input name={`branchAddress_${index}`}/></Field></div></div></div>)}</div></div></div>
   <div className={step===2?'grid gap-4':'hidden'}><ModuleChecklist modules={moduleRegistry}/></div>
   <div className={step===3?'grid gap-4 lg:grid-cols-3':'hidden'}><TemplateChecklist title="Default Roles" name="roleTemplateIds" items={templates.roles} defaultSelected={(item:any)=>roleDefaults.has(item.key)} empty="Create default roles under MedizinHub HMS first."/><TemplateChecklist title="Default Departments" name="departmentTemplateIds" items={templates.departments} defaultSelected={(item:any)=>departmentDefaults.has(item.code)||departmentDefaults.has(String(item.code||'').toLowerCase())} empty="Create default departments under MedizinHub HMS first."/><TemplateChecklist title="Default Branch Templates" name="branchTemplateIds" items={templates.branches} defaultSelected={(item:any)=>branchDefaults.has(item.code)} empty="Create branch templates under MedizinHub HMS first."/></div>
   <div className={step===4?'grid gap-4 md:grid-cols-3':'hidden'}><Field label="Admin Name"><Input name="adminName" defaultValue="Tenant Admin" placeholder="Clinic Owner / Admin"/></Field><Field label="Admin Email"><Input name="adminEmail" type="email" placeholder="admin@clinic.local"/></Field><Field label="Temporary Password"><Input name="adminPassword" type="text" defaultValue="TempPass123"/></Field><Field label="Admin Mobile"><Input name="adminMobile" placeholder="Optional"/></Field><Field label="Must Change Password"><Select name="adminMustChangePassword" defaultValue="true"><option value="true">Yes</option><option value="false">No</option></Select></Field><div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 md:col-span-3">If admin email and password are entered, the wizard copies the Tenant Admin role template automatically and creates the first tenant admin user.</div></div>
   <div className={step===5?'grid gap-3 md:grid-cols-2 xl:grid-cols-4':'hidden'}><Info label="Checklist" value="Tenant details"/><Info label="Checklist" value="Plan and branches"/><Info label="Checklist" value="Module entitlements"/><Info label="Checklist" value="Templates"/><Info label="Checklist" value="Tenant admin credentials"/><div className="rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-blue-700 md:col-span-2 xl:col-span-4">Submitting this wizard creates the tenant, generates a tenant-specific plan from selected modules, assigns selected defaults, creates the tenant admin user, and returns to the Tenants listing with the latest tenant first.</div></div>
   <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4"><div className="flex gap-2"><button type="button" onClick={()=>setStep(Math.max(0,step-1))} disabled={step===0} className="rounded-2xl border px-4 py-3 text-sm font-bold disabled:text-slate-300">Previous</button><button type="button" onClick={()=>setStep(Math.min(steps.length-1,step+1))} disabled={step===steps.length-1} className="rounded-2xl border px-4 py-3 text-sm font-bold disabled:text-slate-300">Next</button></div><Button disabled={busy}>{busy?'Onboarding...':'Complete Onboarding'}</Button></div>
  </form>
 </Card>
}

function ModuleChecklist({modules}:any){
 const onboardable=(modules||[]).filter((module:any)=>module.entitlement_key);
 const grouped=onboardable.reduce((acc:any,module:any)=>{acc[module.category]=[...(acc[module.category]||[]),module];return acc},{});
 const categories=Object.keys(grouped).sort();
 if(!onboardable.length)return <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Module registry is loading. Core HMS modules will be applied from the selected subscription plan.</div>;
 return <div className="grid gap-4">
  <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-end">
   <div><h4 className="font-bold">Module Registry</h4><p className="text-sm text-slate-500">Select plug-and-play modules for this tenant. The wizard creates a tenant-specific subscription plan with these entitlements, so API enforcement follows the onboarding choice.</p></div>
   <Badge tone="blue">{onboardable.length} modules</Badge>
  </div>
  <div className="grid gap-4 xl:grid-cols-2">
   {categories.map(category=><div key={category} className="rounded-2xl border border-slate-200 p-4">
    <div className="mb-3 flex items-center justify-between gap-2"><h5 className="font-bold">{formatTitle(category.replaceAll('_',' '))}</h5><Badge tone="slate">{grouped[category].length}</Badge></div>
    <div className="grid gap-2">
     {grouped[category].map((module:any)=><label key={module.key} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
      <input type="checkbox" name="enabledModules" value={module.entitlement_key||module.key} defaultChecked={module.default_enabled} className="mt-1 h-4 w-4"/>
      <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{module.name}</span>{module.is_core&&<Badge tone="green">Core</Badge>}<Badge tone={module.status==='foundation'?'blue':'slate'}>{module.status}</Badge></span><span className="mt-1 block text-xs text-slate-500">{module.description}</span>{module.dependencies?.length>0&&<span className="mt-1 block text-xs text-slate-400">Depends on: {module.dependencies.join(', ')}</span>}</span>
     </label>)}
    </div>
   </div>)}
  </div>
 </div>
}

function TemplateChecklist({title,name,items,defaultSelected,empty}:any){
 return <div className="rounded-2xl border border-slate-200 p-4"><h4 className="font-bold">{title}</h4><div className="mt-3 grid gap-2">{items.length===0&&<p className="text-sm text-slate-500">{empty}</p>}{items.map((item:any)=><label key={item.id} className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm"><input type="checkbox" name={name} value={item.id} defaultChecked={defaultSelected(item)} className="mt-1 h-4 w-4"/><span><span className="font-semibold">{item.name}</span><span className="block break-all text-xs text-slate-500">{item.key||item.code}</span>{item.is_global_template&&<span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">Global</span>}</span></label>)}</div></div>
}

function RolesManagement({tenants,selectedId,setSelectedId,selected,roles,setSelectedRoleId,setSection,setConfirmAction}:any){
 const [filters,setFilters]=useState({query:'',status:'all',fromDate:'',toDate:'',dateField:'updated_at'});
 const [sort,setSort]=useState({key:'updated_at',dir:'desc'});
 const [page,setPage]=useState(1);
 const pageSize=8;
 function updateFilter(key:string,value:string){setFilters({...filters,[key]:value})}
 function changeSort(key:string){setSort(sort.key===key?{key,dir:sort.dir==='asc'?'desc':'asc'}:{key,dir:'asc'})}
 function value(role:any,key:string){return key==='created_at'||key==='updated_at'?new Date(role[key]||role.created_at||0).getTime():String(role[key]||'').toLowerCase()}
 const groupedRoles=groupRolesByName(roles);
 const filtered=groupedRoles.filter((role:any)=>{
  const text=[role.name,role.display_key,role.id,(role.rows||[]).map((row:any)=>row.key).join(' ')].join(' ').toLowerCase();
  const dateValue=role[filters.dateField]||role.created_at;
  const timestamp=dateValue?new Date(dateValue).getTime():0;
  const from=filters.fromDate?new Date(filters.fromDate).getTime():0;
  const to=filters.toDate?new Date(`${filters.toDate}T23:59:59`).getTime():Number.MAX_SAFE_INTEGER;
  return (!filters.query||text.includes(filters.query.toLowerCase()))
   &&(filters.status==='all'||(filters.status==='active'?role.is_active:!role.is_active))
   &&(!filters.fromDate||timestamp>=from)&&(!filters.toDate||timestamp<=to);
 }).sort((a:any,b:any)=>{const left=value(a,sort.key);const right=value(b,sort.key);if(left<right)return sort.dir==='asc'?-1:1;if(left>right)return sort.dir==='asc'?1:-1;return 0});
 const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
 const safePage=Math.min(page,totalPages);
 const rows=filtered.slice((safePage-1)*pageSize,safePage*pageSize);
 useEffect(()=>{setPage(1)},[filters,sort,roles.length]);
 const openRole=(role:any,sectionId='rolePermissions')=>{setSelectedRoleId(role.primary.id);setSection(sectionId)};
 return <Card><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="text-lg font-bold">Roles</h3><p className="text-sm text-slate-500">{selected?.is_primary?'Primary tenant roles are global templates. Assign templates to customer tenants to avoid duplicate setup.':'Create, edit, deactivate, and search tenant roles with latest changes shown first.'}</p></div><div className="flex flex-wrap items-center gap-2"><Badge tone={selected?.is_primary?'blue':'slate'}>{selected?.is_primary?'Global templates':`${filtered.length} roles`}</Badge><CreateActionButton label="Create Role" onClick={()=>setSection('roleCreate')}/></div></div><div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-6"><TenantPicker tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId}/><Field label="Role"><Input value={filters.query} onChange={(e:any)=>updateFilter('query',e.target.value)} placeholder="Role name"/></Field><Field label="Status"><Select value={filters.status} onChange={(e:any)=>updateFilter('status',e.target.value)}><option value="all">All status</option><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field><Field label="Date field"><Select value={filters.dateField} onChange={(e:any)=>updateFilter('dateField',e.target.value)}><option value="updated_at">Modified date</option><option value="created_at">Created date</option></Select></Field><Field label="From"><Input type="date" value={filters.fromDate} onChange={(e:any)=>updateFilter('fromDate',e.target.value)}/></Field><Field label="To"><Input type="date" value={filters.toDate} onChange={(e:any)=>updateFilter('toDate',e.target.value)}/></Field></div><div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200"><div className="min-w-[1120px]"><div className="hidden grid-cols-[1.15fr_1fr_.65fr_.7fr_.7fr_1.8fr] items-center gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid"><SortButton label="Role" field="name" sort={sort} onSort={changeSort}/><span>Scope</span><SortButton label="Status" field="is_active" sort={sort} onSort={changeSort}/><SortButton label="Created" field="created_at" sort={sort} onSort={changeSort}/><SortButton label="Modified" field="updated_at" sort={sort} onSort={changeSort}/><span className="text-right">Actions</span></div><div className="divide-y divide-slate-200">{rows.length===0&&<Empty text="No roles match your search."/>}{rows.map((role:any)=>{const locked=role.locked;const stop=(handler:()=>void)=>(event:any)=>{event.stopPropagation();handler()};return <div key={role.id} role="button" tabIndex={0} onClick={()=>openRole(role)} onKeyDown={(event:any)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openRole(role)}}} className="grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none xl:grid-cols-[1.15fr_1fr_.65fr_.7fr_.7fr_1.8fr] xl:items-center"><div><div className="flex flex-wrap items-center gap-2"><b>{role.name}</b>{role.is_global_template&&<Badge tone="blue">Global</Badge>}{locked&&<Badge tone="purple">Locked</Badge>}</div><p className="text-xs text-slate-500">{role.rows.length>1?`${role.rows.length} branch variants grouped`:role.primary.id}</p></div><span>{role.display_key}</span><Badge tone={role.is_active?'green':'red'}>{role.is_active?'Active':'Inactive'}</Badge><span>{formatDate(role.created_at)}</span><span>{formatDate(role.updated_at)}</span><ActionGroup>{!locked&&<ActionButton onClick={stop(()=>openRole(role,'roleEdit'))}>Edit</ActionButton>}<ActionButton onClick={stop(()=>openRole(role,'rolePermissions'))} disabled={locked}>Permissions</ActionButton>{role.key!=='super_admin'&&<ActionButton onClick={stop(()=>openRole(role,'roleAssign'))}>Assign</ActionButton>}{!locked&&<ActionButton onClick={stop(()=>setConfirmAction({entity:'role',kind:'status',role:role.primary}))}>{role.is_active?'Inactive':'Active'}</ActionButton>}{!locked&&<ActionButton tone="danger" onClick={stop(()=>setConfirmAction({entity:'role',kind:'delete',role:role.primary}))}>Delete</ActionButton>}</ActionGroup></div>})}</div></div></div><Pagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={pageSize} onPage={setPage}/></Card>
}

function CreateRole({tenants,selectedId,setSelectedId,permissionCatalog,busy,createRole,back}:any){
 return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">Create Role</h3><p className="text-sm text-slate-500">Add a role and select module permissions.</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Roles</button></div><form onSubmit={createRole} className="mt-4 grid gap-3 md:grid-cols-2"><TenantPicker tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId}/><Field label="Role Name"><Input name="name" required placeholder="Reception Staff"/></Field><Field label="Role Key"><Input name="key" required placeholder="reception_staff"/></Field><div className="md:col-span-2"><PermissionCheckboxes permissions={permissionCatalog} selected={[]}/></div><div className="flex flex-wrap gap-2 md:col-span-2"><Button disabled={busy}>{busy?'Creating...':'Create Role'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></form></Card>
}

function EditRole({role,busy,updateRole,back}:any){
 if(!role)return <Card><h3 className="text-lg font-bold">Role not found</h3><button type="button" onClick={back} className="mt-4 rounded-2xl border px-4 py-3 text-sm font-bold">Back to Roles</button></Card>;
 return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">Edit Role</h3><p className="text-sm text-slate-500">{role.key}</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Roles</button></div><form onSubmit={updateRole} className="mt-4 grid gap-3 md:grid-cols-2"><Field label="Role Name"><Input name="name" defaultValue={role.name} required/></Field><Field label="Role Key"><Input name="key" defaultValue={role.key} required/></Field><Field label="Status"><Select name="isActive" defaultValue={String(role.is_active)}><option value="true">Active</option><option value="false">Inactive</option></Select></Field><div className="md:col-span-2"><Field label="Permission Keys"><Input name="permissionKeysText" defaultValue={(role.permission_keys||[]).join(', ')} placeholder="appointments.manage,patients.read"/></Field></div><div className="flex flex-wrap gap-2 md:col-span-2"><Button disabled={busy}>{busy?'Saving...':'Save Role'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></form></Card>
}

function RolePermissions({role,permissionCatalog,busy,updateRole,back}:any){
 if(!role)return <Card><h3 className="text-lg font-bold">Role not found</h3><button type="button" onClick={back} className="mt-4 rounded-2xl border px-4 py-3 text-sm font-bold">Back to Roles</button></Card>;
 return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">Role Permissions</h3><p className="text-sm text-slate-500">{role.name} · {role.key}</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Roles</button></div><form onSubmit={updateRole} className="mt-4 space-y-4"><input type="hidden" name="name" value={role.name}/><input type="hidden" name="key" value={role.key}/><input type="hidden" name="isActive" value={String(role.is_active)}/><input type="hidden" name="replacePermissions" value="true"/><PermissionCheckboxes permissions={permissionCatalog} selected={role.permission_keys||[]}/><div className="flex flex-wrap gap-2"><Button disabled={busy}>{busy?'Saving...':'Save Permissions'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></form></Card>
}

function PermissionCheckboxes({permissions,selected}:any){
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
 const bucketFor=(permission:any)=>buckets.find((bucket:any)=>bucket[2].includes(permission.action))||buckets[0];
 const labelFor=(permission:any)=>formatTitle(String(permission.action||'manage').replaceAll('_',' '));
 return <div><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><h4 className="font-bold">Module Permissions</h4><p className="text-sm text-slate-500">Enable permissions by module. Use Manage for full workflow/action access, then Create, Read, Edit, and Delete as needed.</p></div><Badge tone="slate">{selectedSet.size} selected</Badge></div><div className="mt-3 grid gap-4 xl:grid-cols-2">{modules.map(module=><div key={module} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><h5 className="font-bold">{formatTitle(module.replaceAll('_',' '))}</h5><p className="text-xs text-slate-500">{grouped[module].length} permissions</p></div><Badge tone="slate">Module</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{buckets.map((bucket:any)=>{const bucketPermissions=grouped[module].filter((permission:any)=>bucketFor(permission)[0]===bucket[0]).sort((a:any,b:any)=>a.key.localeCompare(b.key));return <div key={`${module}-${bucket[0]}`} className="rounded-2xl bg-slate-50 p-3"><p className="mb-2 text-xs font-bold uppercase text-slate-500">{bucket[1]}</p><div className="grid gap-2">{bucketPermissions.length?bucketPermissions.map((permission:any)=><label key={permission.key} className="flex items-start gap-2 text-sm"><input type="checkbox" name="permissionKeys" value={permission.key} defaultChecked={selectedSet.has(permission.key)} className="mt-1 h-4 w-4"/><span><span className="font-semibold">{labelFor(permission)}</span><span className="block break-all text-xs text-slate-400">{permission.key}</span></span></label>):<span className="text-xs text-slate-300">No access</span>}</div></div>})}</div></div>)}</div></div>
}

function AssignTemplate({title,item,tenants,busy,onSubmit,back}:any){
 if(!item)return <Card><h3 className="text-lg font-bold">Template not found</h3><button type="button" onClick={back} className="mt-4 rounded-2xl border px-4 py-3 text-sm font-bold">Back</button></Card>;
 return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">{title}</h3><p className="text-sm text-slate-500">{item.name} will be copied or updated in the selected tenant.</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back</button></div><form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2"><Field label="Target Tenant"><Select name="targetTenantId" required>{tenants.map((tenant:any)=><option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</Select></Field><div className="flex items-end gap-2"><Button disabled={busy}>{busy?'Assigning...':'Assign to Tenant'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></form></Card>
}

function TenantUsers({tenants,selectedId,setSelectedId,users,setSelectedUserId,setSection,setConfirmAction}:any){
 const [filters,setFilters]=useState({query:'',status:'all',fromDate:'',toDate:'',dateField:'updated_at'});
 const [sort,setSort]=useState({key:'updated_at',dir:'desc'});
 const [page,setPage]=useState(1);
 const pageSize=8;
 function updateFilter(key:string,value:string){setFilters({...filters,[key]:value})}
 function changeSort(key:string){setSort(sort.key===key?{key,dir:sort.dir==='asc'?'desc':'asc'}:{key,dir:'asc'})}
 function value(user:any,key:string){return key==='created_at'||key==='updated_at'?new Date(user[key]||user.created_at||0).getTime():String(user[key]||'').toLowerCase()}
 const filtered=users.filter((user:any)=>{
  const text=[user.name,user.email,user.mobile,user.user_type,user.id].join(' ').toLowerCase();
  const dateValue=user[filters.dateField]||user.created_at;
  const timestamp=dateValue?new Date(dateValue).getTime():0;
  const from=filters.fromDate?new Date(filters.fromDate).getTime():0;
  const to=filters.toDate?new Date(`${filters.toDate}T23:59:59`).getTime():Number.MAX_SAFE_INTEGER;
  return (!filters.query||text.includes(filters.query.toLowerCase()))
   &&(filters.status==='all'||(filters.status==='active'?user.is_active:!user.is_active))
   &&(!filters.fromDate||timestamp>=from)&&(!filters.toDate||timestamp<=to);
 }).sort((a:any,b:any)=>{const left=value(a,sort.key);const right=value(b,sort.key);if(left<right)return sort.dir==='asc'?-1:1;if(left>right)return sort.dir==='asc'?1:-1;return 0});
 const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
 const safePage=Math.min(page,totalPages);
 const rows=filtered.slice((safePage-1)*pageSize,safePage*pageSize);
 useEffect(()=>{setPage(1)},[filters,sort,users.length]);
 return <Card><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h3 className="text-lg font-bold">Users</h3><p className="text-sm text-slate-500">Create, edit, activate/deactivate, and search tenant users.</p></div><div className="flex flex-wrap items-center gap-2"><Badge tone="blue">{filtered.length} users</Badge><CreateActionButton label="Create User" onClick={()=>setSection('userCreate')}/></div></div><div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-6"><TenantPicker tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId}/><Field label="User"><Input value={filters.query} onChange={(e:any)=>updateFilter('query',e.target.value)} placeholder="Name, email, mobile, type"/></Field><Field label="Status"><Select value={filters.status} onChange={(e:any)=>updateFilter('status',e.target.value)}><option value="all">All status</option><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field><Field label="Date field"><Select value={filters.dateField} onChange={(e:any)=>updateFilter('dateField',e.target.value)}><option value="updated_at">Modified date</option><option value="created_at">Created date</option></Select></Field><Field label="From"><Input type="date" value={filters.fromDate} onChange={(e:any)=>updateFilter('fromDate',e.target.value)}/></Field><Field label="To"><Input type="date" value={filters.toDate} onChange={(e:any)=>updateFilter('toDate',e.target.value)}/></Field></div><div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200"><div className="min-w-[1240px]"><div className="hidden grid-cols-[1fr_1.2fr_.8fr_.7fr_.6fr_.7fr_.7fr_1.45fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid"><SortButton label="User" field="name" sort={sort} onSort={changeSort}/><SortButton label="Email" field="email" sort={sort} onSort={changeSort}/><SortButton label="Type" field="user_type" sort={sort} onSort={changeSort}/><span>Mobile</span><SortButton label="Status" field="is_active" sort={sort} onSort={changeSort}/><SortButton label="Created" field="created_at" sort={sort} onSort={changeSort}/><SortButton label="Modified" field="updated_at" sort={sort} onSort={changeSort}/><span className="text-right">Actions</span></div><div className="divide-y divide-slate-200">{rows.length===0&&<Empty text="No users match your search."/>}{rows.map((user:any)=>{const typeLabel=userTypes.find(([value])=>value===user.user_type)?.[1]||user.user_type||'Staff';const open=()=>{setSelectedUserId(user.id);setSection('userEdit')};const stop=(handler:()=>void)=>(event:any)=>{event.stopPropagation();handler()};return <div key={user.id} role="button" tabIndex={0} onClick={open} onKeyDown={(event:any)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}}} className="grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none xl:grid-cols-[1fr_1.2fr_.8fr_.7fr_.6fr_.7fr_.7fr_1.45fr] xl:items-center"><div><b>{user.name}</b><p className="break-all text-xs text-slate-500">{user.id}</p></div><span className="break-all">{user.email}</span><span>{typeLabel}</span><span>{user.mobile||'-'}</span><Badge tone={user.is_active?'green':'red'}>{user.is_active?'Active':'Inactive'}</Badge><span>{formatDate(user.created_at)}</span><span>{formatDate(user.updated_at)}</span><ActionGroup><ActionButton onClick={stop(open)}>Edit</ActionButton><ActionButton onClick={stop(()=>setConfirmAction({entity:'user',kind:'status',user}))}>{user.is_active?'Inactive':'Active'}</ActionButton><ActionButton tone="danger" onClick={stop(()=>setConfirmAction({entity:'user',kind:'delete',user}))}>Delete</ActionButton></ActionGroup></div>})}</div></div></div><Pagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={pageSize} onPage={setPage}/></Card>
}

function CreateUser({tenants,selectedId,setSelectedId,roles,busy,createUser,back}:any){
 return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">Create User</h3><p className="text-sm text-slate-500">Add a user under the selected tenant.</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Users</button></div><form onSubmit={createUser} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"><TenantPicker tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId}/><Field label="Name"><Input name="name" required placeholder="Clinic Admin"/></Field><Field label="Email"><Input name="email" type="email" required placeholder="admin@clinic.local"/></Field><Field label="User Type"><Select name="userType" defaultValue="staff">{userTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Password"><Input name="password" type="password" required placeholder="Minimum 8 characters"/></Field><Field label="Mobile"><Input name="mobile"/></Field><Field label="Branch ID"><Input name="branchId"/></Field><Field label="Must Change Password"><Select name="mustChangePassword" defaultValue="true"><option value="true">Yes</option><option value="false">No</option></Select></Field><div className="md:col-span-2 xl:col-span-3"><Field label="Role Keys"><Input name="roleKeys" placeholder="tenant_admin,doctor"/></Field><p className="mt-1 text-xs text-slate-500">Available: {roles.map((role:any)=>role.key).join(', ')||'No roles loaded'}</p></div><div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3"><Button disabled={busy}>{busy?'Creating...':'Create User'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></form></Card>
}

function EditUser({user,roles,busy,updateUser,back}:any){
 if(!user)return <Card><h3 className="text-lg font-bold">User not found</h3><button type="button" onClick={back} className="mt-4 rounded-2xl border px-4 py-3 text-sm font-bold">Back to Users</button></Card>;
 return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">Edit User</h3><p className="text-sm text-slate-500">{user.email}</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Users</button></div><form onSubmit={updateUser} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"><Field label="Name"><Input name="name" defaultValue={user.name} required/></Field><Field label="Email"><Input name="email" type="email" defaultValue={user.email} required/></Field><Field label="User Type"><Select name="userType" defaultValue={user.user_type||'staff'}>{userTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Mobile"><Input name="mobile" defaultValue={user.mobile||''}/></Field><Field label="Branch ID"><Input name="branchId" defaultValue={user.branch_id||''}/></Field><Field label="Status"><Select name="isActive" defaultValue={String(user.is_active)}><option value="true">Active</option><option value="false">Inactive</option></Select></Field><Field label="Must Change Password"><Select name="mustChangePassword" defaultValue={String(user.must_change_password)}><option value="true">Yes</option><option value="false">No</option></Select></Field><div className="md:col-span-2 xl:col-span-3"><Field label="Role Keys"><Input name="roleKeys" placeholder="tenant_admin,doctor"/></Field><p className="mt-1 text-xs text-slate-500">Leave blank to keep existing roles. Available: {roles.map((role:any)=>role.key).join(', ')||'No roles loaded'}</p></div><div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3"><Button disabled={busy}>{busy?'Saving...':'Save User'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></form></Card>
}

function DepartmentsManagement({tenants,selectedId,setSelectedId,selected,departments,setSelectedDepartmentId,setSection,setConfirmAction}:any){
 const [query,setQuery]=useState('');
 const [page,setPage]=useState(1);
 const pageSize=8;
 const filtered=departments.filter((department:any)=>[department.name,department.code,department.description,department.is_active?'active':'inactive'].join(' ').toLowerCase().includes(query.toLowerCase()));
 const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
 const safePage=Math.min(page,totalPages);
 const rows=filtered.slice((safePage-1)*pageSize,safePage*pageSize);
 useEffect(()=>{setPage(1)},[query,departments.length]);
 return <Card><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h3 className="text-lg font-bold">Departments</h3><p className="text-sm text-slate-500">{selected?.is_primary?'Primary tenant departments are global templates. Assign templates to customer tenants to keep departments consistent.':'Manage tenant departments used for practitioner mapping, schedules, and appointment booking.'}</p></div><CreateActionButton label="Create Department" onClick={()=>setSection('departmentCreate')}/></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_280px]"><Input value={query} onChange={(e:any)=>setQuery(e.target.value)} placeholder="Search department name, code, status"/><TenantPicker tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId}/></div><div className="mt-4 overflow-hidden rounded-2xl border border-slate-200"><div className="hidden grid-cols-[1.2fr_.8fr_1.4fr_.7fr_.8fr_1.15fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid"><span>Department</span><span>Code</span><span>Description</span><span>Status</span><span>Modified</span><span>Actions</span></div><div className="divide-y divide-slate-200">{rows.length===0&&<Empty text="No departments match your search."/>}{rows.map((department:any)=>{const locked=department.is_template_locked||department.source_template_department_id;return <div key={department.id} className="grid gap-3 px-4 py-4 text-sm xl:grid-cols-[1.2fr_.8fr_1.4fr_.7fr_.8fr_1.15fr] xl:items-center"><div><div className="flex flex-wrap items-center gap-2"><b>{department.name}</b>{department.is_global_template&&<Badge tone="blue">Global</Badge>}{locked&&<Badge tone="purple">Locked</Badge>}</div><p className="break-all text-xs text-slate-500">{department.id}</p></div><span>{department.code}</span><span className="text-slate-500">{department.description||'-'}</span><Badge tone={department.is_active?'green':'red'}>{department.is_active?'Active':'Inactive'}</Badge><span>{new Date(department.updated_at||department.created_at).toLocaleDateString()}</span><div className="flex flex-wrap gap-2">{!locked&&<button type="button" onClick={()=>{setSelectedDepartmentId(department.id);setSection('departmentEdit')}} className="rounded-xl border px-3 py-2 text-xs font-bold">Edit</button>}<button type="button" onClick={()=>{setSelectedDepartmentId(department.id);setSection('departmentAssign')}} className="rounded-xl border px-3 py-2 text-xs font-bold">Assign</button>{!locked&&<button type="button" onClick={()=>setConfirmAction({entity:'department',kind:'status',department})} className="rounded-xl border px-3 py-2 text-xs font-bold">{department.is_active?'Inactive':'Active'}</button>}{!locked&&<button type="button" onClick={()=>setConfirmAction({entity:'department',kind:'delete',department})} className="rounded-xl border px-3 py-2 text-xs font-bold text-red-600">Delete</button>}</div></div>})}</div></div><Pagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={pageSize} onPage={setPage}/></Card>
}

function CreateDepartment({tenants,selectedId,setSelectedId,busy,createDepartment,back}:any){
 return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">Create Department</h3><p className="text-sm text-slate-500">Add a department to the selected tenant.</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Departments</button></div><form onSubmit={createDepartment} className="mt-4 grid gap-3 md:grid-cols-2"><TenantPicker tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId}/><Field label="Name"><Input name="name" required placeholder="General Medicine"/></Field><div className="md:col-span-2"><Field label="Description"><Input name="description" placeholder="OP, IP, or speciality care handled by this department"/></Field></div><div className="flex flex-wrap gap-2 md:col-span-2"><Button disabled={busy}>{busy?'Creating...':'Create Department'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></form></Card>
}

function EditDepartment({department,busy,updateDepartment,back}:any){
 if(!department)return <Card><h3 className="text-lg font-bold">Department not found</h3><button type="button" onClick={back} className="mt-4 rounded-2xl border px-4 py-3 text-sm font-bold">Back to Departments</button></Card>;
 return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">Edit Department</h3><p className="text-sm text-slate-500">{department.code}</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Departments</button></div><form onSubmit={updateDepartment} className="mt-4 grid gap-3 md:grid-cols-2"><Field label="Name"><Input name="name" defaultValue={department.name} required/></Field><Field label="Status"><Select name="isActive" defaultValue={String(department.is_active)}><option value="true">Active</option><option value="false">Inactive</option></Select></Field><div className="md:col-span-2"><Field label="Description"><Input name="description" defaultValue={department.description||''}/></Field></div><div className="flex flex-wrap gap-2 md:col-span-2"><Button disabled={busy}>{busy?'Saving...':'Save Department'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></form></Card>
}

function BranchesManagement({tenants,selectedId,setSelectedId,selected,branches,setSelectedBranchId,setSection,setConfirmAction}:any){
 const [query,setQuery]=useState('');
 const [page,setPage]=useState(1);
 const pageSize=8;
 const filtered=branches.filter((branch:any)=>[branch.name,branch.code,branch.city,branch.state,branch.is_active?'active':'inactive'].join(' ').toLowerCase().includes(query.toLowerCase()));
 const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
 const safePage=Math.min(page,totalPages);
 const rows=filtered.slice((safePage-1)*pageSize,safePage*pageSize);
 useEffect(()=>{setPage(1)},[query,branches.length]);
 return <Card><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h3 className="text-lg font-bold">Branches</h3><p className="text-sm text-slate-500">{selected?.is_primary?'Primary tenant branches are reusable templates. Assign them to clinics to avoid duplicate setup.':'Manage tenant branches used by appointments, users, billing, lab, pharmacy, and reports.'}</p></div><CreateActionButton label="Create Branch" onClick={()=>setSection('branchCreate')}/></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_280px]"><Input value={query} onChange={(e:any)=>setQuery(e.target.value)} placeholder="Search branch name, code, city, status"/><TenantPicker tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId}/></div><div className="mt-4 overflow-hidden rounded-2xl border border-slate-200"><div className="hidden grid-cols-[1.1fr_.7fr_1.3fr_.7fr_.8fr_1.2fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid"><span>Branch</span><span>Code</span><span>Location</span><span>Status</span><span>Modified</span><span>Actions</span></div><div className="divide-y divide-slate-200">{rows.length===0&&<Empty text="No branches match your search."/>}{rows.map((branch:any)=>{const locked=branch.is_template_locked||branch.source_template_branch_id;return <div key={branch.id} className="grid gap-3 px-4 py-4 text-sm xl:grid-cols-[1.1fr_.7fr_1.3fr_.7fr_.8fr_1.2fr] xl:items-center"><div><div className="flex flex-wrap items-center gap-2"><b>{branch.name}</b>{branch.is_global_template&&<Badge tone="blue">Global</Badge>}{locked&&<Badge tone="purple">Locked</Badge>}</div><p className="break-all text-xs text-slate-500">{branch.id}</p></div><span>{branch.code}</span><span className="text-slate-500">{[branch.address,branch.city,branch.state].filter(Boolean).join(', ')||'-'}</span><Badge tone={branch.is_active?'green':'red'}>{branch.is_active?'Active':'Inactive'}</Badge><span>{formatDate(branch.updated_at||branch.created_at)}</span><div className="flex flex-wrap gap-2">{!locked&&<button type="button" onClick={()=>{setSelectedBranchId(branch.id);setSection('branchEdit')}} className="rounded-xl border px-3 py-2 text-xs font-bold">Edit</button>}<button type="button" onClick={()=>{setSelectedBranchId(branch.id);setSection('branchAssign')}} className="rounded-xl border px-3 py-2 text-xs font-bold">Assign</button>{!locked&&<button type="button" onClick={()=>setConfirmAction({entity:'branch',kind:'status',branch})} className="rounded-xl border px-3 py-2 text-xs font-bold">{branch.is_active?'Inactive':'Active'}</button>}{!locked&&<button type="button" onClick={()=>setConfirmAction({entity:'branch',kind:'delete',branch})} className="rounded-xl border px-3 py-2 text-xs font-bold text-red-600">Delete</button>}</div></div>})}</div></div><Pagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={pageSize} onPage={setPage}/></Card>
}

function CreateBranch({tenants,selectedId,setSelectedId,busy,createBranch,back}:any){
 return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">Create Branch</h3><p className="text-sm text-slate-500">Add a branch or global branch template to the selected tenant.</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Branches</button></div><form onSubmit={createBranch} className="mt-4 grid gap-3 md:grid-cols-2"><TenantPicker tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId}/><Field label="Branch Name"><Input name="name" required placeholder="Main Branch"/></Field><Field label="Branch Code"><Input name="code" required placeholder="MAIN"/></Field><Field label="City"><Input name="city" placeholder="Chennai"/></Field><Field label="State"><Input name="state" placeholder="Tamil Nadu"/></Field><div className="md:col-span-2"><Field label="Address"><Input name="address" placeholder="Street, area, landmark"/></Field></div><div className="flex flex-wrap gap-2 md:col-span-2"><Button disabled={busy}>{busy?'Creating...':'Create Branch'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></form></Card>
}

function EditBranch({branch,busy,updateBranch,back}:any){
 if(!branch)return <Card><h3 className="text-lg font-bold">Branch not found</h3><button type="button" onClick={back} className="mt-4 rounded-2xl border px-4 py-3 text-sm font-bold">Back to Branches</button></Card>;
 return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">Edit Branch</h3><p className="text-sm text-slate-500">{branch.code}</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Branches</button></div><form onSubmit={updateBranch} className="mt-4 grid gap-3 md:grid-cols-2"><Field label="Branch Name"><Input name="name" defaultValue={branch.name} required/></Field><Field label="Branch Code"><Input name="code" defaultValue={branch.code} required/></Field><Field label="City"><Input name="city" defaultValue={branch.city||''}/></Field><Field label="State"><Input name="state" defaultValue={branch.state||''}/></Field><Field label="Status"><Select name="isActive" defaultValue={String(branch.is_active)}><option value="true">Active</option><option value="false">Inactive</option></Select></Field><div className="md:col-span-2"><Field label="Address"><Input name="address" defaultValue={branch.address||''}/></Field></div><div className="flex flex-wrap gap-2 md:col-span-2"><Button disabled={busy}>{busy?'Saving...':'Save Branch'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></form></Card>
}

function ConfirmModal({action,busy,onCancel,onConfirm}:any){
 const isDelete=action.kind==='delete';
 const item=action.entity==='branch'?action.branch:action.entity==='department'?action.department:action.entity==='role'?action.role:action.user;
 const label=action.entity==='branch'?'Branch':action.entity==='department'?'Department':action.entity==='role'?'Role':'User';
 return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"><Card className="w-full max-w-md"><h3 className="text-lg font-bold">{isDelete?`Delete ${label}`:`Change ${label} Status`}</h3><p className="mt-3 text-sm text-slate-600">{isDelete?`Delete ${item.name}? This will deactivate the record and keep history for audit/reference.`:`${item.is_active?'Deactivate':'Activate'} ${item.name}?`}</p><div className="mt-5 flex flex-wrap gap-2"><Button onClick={onConfirm} disabled={busy}>{busy?'Working...':isDelete?`Delete ${label}`:'Confirm'}</Button><button type="button" onClick={onCancel} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></Card></div>
}

function TenantCreatedModal({details,onClose}:any){
 const tenant=details.tenant;
 return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"><Card className="w-full max-w-lg"><div className="flex flex-col gap-3"><Badge tone="green">Tenant Created</Badge><div><h3 className="text-xl font-bold">Tenant has been created successfully</h3><p className="mt-1 text-sm text-slate-600">{tenant.name} is ready and the Tenants listing page is open with the latest record shown first.</p></div><div className="grid gap-3 sm:grid-cols-2"><Info label="Tenant ID" value={tenant.id}/><Info label="Type" value={formatTenantType(tenant.tenant_type)}/><Info label="Status" value={tenant.status}/><Info label="Branches" value={details.branchCount}/><Info label="Subscription" value={details.hasSubscription?'Assigned':'Not assigned'}/><Info label="Modules" value={details.moduleCount||0}/><Info label="Plan" value={details.onboardingPlan?.name||'Selected plan'}/><Info label="Next Step" value="Create tenant admin user"/></div><div className="mt-2 flex flex-wrap gap-2"><Button type="button" onClick={onClose}>View Tenants</Button><button type="button" onClick={onClose} className="rounded-2xl border px-4 py-3 text-sm font-bold">Close</button></div></div></Card></div>
}

function SubscriptionManagement({apiSession,plans,tenants,selectedId,setSelectedId,reloadPlans}:any){
 const [view,setView]=useState('list');
 const [filters,setFilters]=useState({tenant:'',plan:'all',status:'all',fromDate:'',toDate:''});
 const [page,setPage]=useState(1);
 const [usage,setUsage]=useState<any>(null);
 const [announcements,setAnnouncements]=useState<any[]>([]);
 const [subscriptions,setSubscriptions]=useState<any[]>([]);
 const [credits,setCredits]=useState<any[]>([]);
 const [invoices,setInvoices]=useState<any[]>([]);
 const [revenue,setRevenue]=useState<any>(null);
 const [message,setMessage]=useState('');
 const [loading,setLoading]=useState(false);
 const activePlans=plans.filter((plan:any)=>plan.is_active);
 const selectedTenant=tenants.find((tenant:any)=>tenant.id===selectedId);
 const planById=new Map(plans.map((plan:any)=>[plan.id,plan]));
 const tenantById=new Map(tenants.map((tenant:any)=>[tenant.id,tenant]));
 const pageSize=8;

 function openSubscriptionView(nextView:string){
  setView(nextView);
  requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}));
 }

 async function loadSubscriptionConsole(){
  if(!apiSession)return;
  setLoading(true);setMessage('');
  try{
   const scoped={...apiSession,tenantId:selectedId||apiSession.tenantId};
   const subscriptionCalls=tenants.map((tenant:any)=>
    apiFetch('/subscription-plans/tenant-subscriptions',{...apiSession,tenantId:tenant.id})
     .then((rows:any[])=>rows.map(row=>({...row,tenant_name:tenant.name})))
     .catch(()=>[])
   );
   const calls:any[]=[apiFetch('/subscription-plans/platform/revenue-summary',apiSession),Promise.all(subscriptionCalls)];
   if(selectedId){
    calls.push(apiFetch('/subscription-plans/usage',scoped));
    calls.push(apiFetch('/subscription-plans/announcements',scoped));
    calls.push(apiFetch('/subscription-plans/credits',scoped));
    calls.push(apiFetch('/subscription-plans/invoices',scoped));
   }
   const [revenueRows,allSubscriptionRows=[],usageRows=[],announcementRows=[],creditRows=[],invoiceRows=[]]=await Promise.all(calls);
   setRevenue(revenueRows);setUsage(selectedId?usageRows:null);setAnnouncements(selectedId?announcementRows:[]);
   setSubscriptions(allSubscriptionRows.flat().sort((a:any,b:any)=>new Date(b.created_at||b.starts_on).getTime()-new Date(a.created_at||a.starts_on).getTime()));
   setCredits(selectedId?creditRows:[]);setInvoices(selectedId?invoiceRows:[]);
  }catch(err:any){setMessage(err.message||'Could not load subscription details.')}finally{setLoading(false)}
 }

 useEffect(()=>{loadSubscriptionConsole()},[apiSession?.token,apiSession?.tenantId,selectedId,tenants.length]);
 useEffect(()=>{setPage(1)},[filters,subscriptions.length]);

 async function createPlan(e:any){
  e.preventDefault();if(!apiSession)return;
  const form=e.currentTarget;
  const fd=new FormData(form);
  setLoading(true);setMessage('');
  try{
   await apiFetch('/subscription-plans',apiSession,{method:'POST',body:JSON.stringify({
    key:String(fd.get('key')||'').trim().toLowerCase().replace(/\s+/g,'_'),
    name:fd.get('name'),
    monthly_patient_limit:Number(fd.get('monthlyPatientLimit')||0),
    included_branches:Number(fd.get('includedBranches')||1),
    included_doctors:Number(fd.get('includedDoctors')||1),
    price_inr_monthly:Number(fd.get('priceInrMonthly')||0),
    enabled_modules:String(fd.get('enabledModules')||'patients,appointments,queue,consultations,billing_basic').split(',').map(item=>item.trim()).filter(Boolean)
   })});
   form.reset();await reloadPlans();await loadSubscriptionConsole();openSubscriptionView('list');setMessage('Custom subscription plan created.');
  }catch(err:any){setMessage(err.message||'Could not create plan.')}finally{setLoading(false)}
 }

 async function changePlanStatus(plan:any){
  if(!apiSession)return;
  setLoading(true);setMessage('');
  try{
   await apiFetch(`/subscription-plans/${plan.id}/status`,apiSession,{method:'POST',body:JSON.stringify({is_active:!plan.is_active})});
   await reloadPlans();await loadSubscriptionConsole();setMessage(`${plan.name} ${plan.is_active?'deactivated':'activated'}.`);
  }catch(err:any){setMessage(err.message||'Could not change plan status.')}finally{setLoading(false)}
 }

 async function assignSubscription(e:any){
  e.preventDefault();if(!apiSession||!selectedId)return;
  const form=e.currentTarget;
  const fd=new FormData(form);
  setLoading(true);setMessage('');
  try{
   const scoped={...apiSession,tenantId:selectedId};
   await apiFetch('/subscription-plans/tenant-subscriptions',scoped,{method:'POST',body:JSON.stringify({
    plan_id:fd.get('planId'),
    starts_on:fd.get('startsOn'),
    ends_on:fd.get('endsOn')||null,
    billing_amount:Number(fd.get('billingAmount')||0),
    notes:fd.get('notes')||null
   })});
   form.reset();await loadSubscriptionConsole();openSubscriptionView('list');setMessage('Tenant subscription assigned. Future start dates stay scheduled until activation date.');
  }catch(err:any){setMessage(err.message||'Could not assign subscription.')}finally{setLoading(false)}
 }

 async function addCredits(e:any){
  e.preventDefault();if(!apiSession||!selectedId)return;
  const form=e.currentTarget;
  const fd=new FormData(form);
  setLoading(true);setMessage('');
  try{
   const scoped={...apiSession,tenantId:selectedId};
   await apiFetch('/subscription-plans/credits',scoped,{method:'POST',body:JSON.stringify({
    credit_type:fd.get('creditType')||'patients',
    quantity:Number(fd.get('quantity')||0),
    amount:Number(fd.get('amount')||0),
    starts_on:fd.get('startsOn')||new Date().toISOString().slice(0,10),
    expires_on:fd.get('expiresOn')||null,
    reason:fd.get('reason')||null
   })});
   form.reset();await loadSubscriptionConsole();openSubscriptionView('list');setMessage('Additional credits added and invoice generated.');
  }catch(err:any){setMessage(err.message||'Could not add credits.')}finally{setLoading(false)}
 }

 const filtered=subscriptions.filter((subscription:any)=>{
  const tenant=tenantById.get(subscription.tenant_id) as any;
  const plan=planById.get(subscription.plan_id) as any;
  const tenantText=[subscription.tenant_name,tenant?.name,subscription.tenant_id].join(' ').toLowerCase();
  const planMatch=filters.plan==='all'||subscription.plan_id===filters.plan;
  const statusMatch=filters.status==='all'||subscription.status===filters.status;
  const dateValue=subscription.updated_at||subscription.created_at||subscription.starts_on;
  const timestamp=dateValue?new Date(dateValue).getTime():0;
  const from=filters.fromDate?new Date(filters.fromDate).getTime():0;
  const to=filters.toDate?new Date(`${filters.toDate}T23:59:59`).getTime():Number.MAX_SAFE_INTEGER;
  return (!filters.tenant||tenantText.includes(filters.tenant.toLowerCase())||String(plan?.name||'').toLowerCase().includes(filters.tenant.toLowerCase()))&&planMatch&&statusMatch&&(!filters.fromDate||timestamp>=from)&&(!filters.toDate||timestamp<=to);
 });
 const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
 const safePage=Math.min(page,totalPages);
 const rows=filtered.slice((safePage-1)*pageSize,safePage*pageSize);

 if(view==='createPlan')return <SubscriptionCreatePlan loading={loading} createPlan={createPlan} back={()=>openSubscriptionView('list')}/>;
 if(view==='assign')return <SubscriptionAssignPlan loading={loading} tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId} plans={activePlans} selectedTenant={selectedTenant} assignSubscription={assignSubscription} back={()=>openSubscriptionView('list')}/>;
 if(view==='credits')return <SubscriptionCreditsPage loading={loading} tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId} usage={usage} credits={credits} invoices={invoices} addCredits={addCredits} back={()=>openSubscriptionView('list')}/>;

 return <div className="space-y-5">
  <Card><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h3 className="text-lg font-bold">Subscription Management</h3><p className="text-sm text-slate-500">Search tenant subscriptions, review SaaS revenue, and open focused pages for plan setup, upgrades, and credits.</p></div><div className="flex flex-wrap gap-2"><CreateActionButton label="Create Custom Plan" onClick={()=>openSubscriptionView('createPlan')}/><button type="button" onClick={()=>openSubscriptionView('assign')} className="rounded-2xl border px-4 py-3 text-sm font-bold">Assign / Upgrade</button><button type="button" onClick={()=>openSubscriptionView('credits')} className="rounded-2xl border px-4 py-3 text-sm font-bold">Additional Credits</button></div></div>{message&&<div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}{announcements.length>0&&<div className="mt-4 overflow-hidden rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800"><div className="animate-pulse whitespace-nowrap">{announcements.map(item=>item.message).join('  |  ')}</div></div>}</Card>
  <div className="grid gap-4 md:grid-cols-4"><Info label="Active Subscriptions" value={revenue?.total_active_subscriptions??'-'}/><Info label="Scheduled" value={revenue?.scheduled_subscriptions??'-'}/><Info label="Estimated MRR" value={`₹${revenue?.estimated_monthly_recurring_revenue??0}`}/><Info label="Pending Invoice" value={`₹${revenue?.pending_invoice_amount??0}`}/></div>
  <Card><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h4 className="font-bold">Subscriptions</h4><p className="text-sm text-slate-500">Latest created or updated subscription records appear first.</p></div><Badge tone="blue">{filtered.length} records</Badge></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Field label="Tenant / Plan"><Input value={filters.tenant} onChange={(e:any)=>setFilters({...filters,tenant:e.target.value})} placeholder="Search tenant or plan"/></Field><Field label="Plan"><Select value={filters.plan} onChange={(e:any)=>setFilters({...filters,plan:e.target.value})}><option value="all">All plans</option>{plans.map((plan:any)=><option key={plan.id} value={plan.id}>{plan.name}</option>)}</Select></Field><Field label="Status"><Select value={filters.status} onChange={(e:any)=>setFilters({...filters,status:e.target.value})}><option value="all">All status</option><option value="active">Active</option><option value="scheduled">Scheduled</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></Select></Field><Field label="From"><Input type="date" value={filters.fromDate} onChange={(e:any)=>setFilters({...filters,fromDate:e.target.value})}/></Field><Field label="To"><Input type="date" value={filters.toDate} onChange={(e:any)=>setFilters({...filters,toDate:e.target.value})}/></Field></div><div className="mt-4 overflow-hidden rounded-2xl border border-slate-200"><div className="hidden grid-cols-[1.3fr_1.05fr_.8fr_.85fr_.85fr_.85fr_1fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid"><span>Tenant</span><span>Plan</span><span>Status</span><span>Start</span><span>End</span><span>Amount</span><span>Actions</span></div><div className="divide-y divide-slate-200">{rows.length===0&&<Empty text={loading?'Loading subscriptions...':'No subscriptions match your search.'}/>} {rows.map((subscription:any)=>{const plan=planById.get(subscription.plan_id) as any;const tenant=tenantById.get(subscription.tenant_id) as any;return <div key={subscription.id} className="grid gap-3 px-4 py-4 text-sm xl:grid-cols-[1.3fr_1.05fr_.8fr_.85fr_.85fr_.85fr_1fr] xl:items-center"><div><b>{subscription.tenant_name||tenant?.name||subscription.tenant_id}</b><p className="break-all text-xs text-slate-500">{subscription.tenant_id}</p></div><div><b>{plan?.name||subscription.plan_id}</b><p className="text-xs text-slate-500">{plan?.key||''}</p></div><div><Badge tone={subscription.status==='active'?'green':subscription.status==='scheduled'?'amber':subscription.status==='expired'?'slate':'red'}>{subscription.status}</Badge></div><span>{formatDate(subscription.starts_on)}</span><span>{formatDate(subscription.ends_on)}</span><b>₹{subscription.billing_amount}</b><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>{setSelectedId(subscription.tenant_id);openSubscriptionView('assign')}} className="rounded-xl border px-3 py-2 text-xs font-bold">Upgrade</button><button type="button" onClick={()=>{setSelectedId(subscription.tenant_id);openSubscriptionView('credits')}} className="rounded-xl border px-3 py-2 text-xs font-bold">Credits</button></div></div>})}</div></div><Pagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={pageSize} onPage={setPage}/></Card>
  <Card><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><h4 className="font-bold">Plan Catalog</h4><p className="text-sm text-slate-500">Plans can be activated or deactivated here. Create/edit flows can be expanded into a full plan CRUD page next.</p></div><Badge tone="blue">{plans.length} plans</Badge></div><div className="mt-4 overflow-hidden rounded-2xl border border-slate-200"><div className="hidden grid-cols-[1.25fr_.9fr_.7fr_.7fr_.7fr_1fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid"><span>Plan</span><span>Price</span><span>Patients</span><span>Branches</span><span>Status</span><span>Actions</span></div><div className="divide-y divide-slate-200">{plans.map((plan:any)=><div key={plan.id} className="grid gap-3 px-4 py-4 text-sm xl:grid-cols-[1.25fr_.9fr_.7fr_.7fr_.7fr_1fr] xl:items-center"><div><b>{plan.name}</b><p className="text-xs text-slate-500">{plan.key}</p></div><b>₹{plan.price_inr_monthly}</b><span>{plan.monthly_patient_limit}</span><span>{plan.included_branches}</span><Badge tone={plan.is_active?'green':'slate'}>{plan.is_active?'Active':'Inactive'}</Badge><button type="button" onClick={()=>changePlanStatus(plan)} className="w-fit rounded-xl border px-3 py-2 text-xs font-bold">{plan.is_active?'Deactivate':'Activate'}</button></div>)}</div></div></Card>
 </div>
}

function SubscriptionCreatePlan({loading,createPlan,back}:any){
 return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">Create Custom Plan</h3><p className="text-sm text-slate-500">Create a reusable SaaS package with limits, pricing, and enabled modules.</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Subscriptions</button></div><form onSubmit={createPlan} className="mt-5 grid gap-3 md:grid-cols-2"><Field label="Plan Key"><Input name="key" required placeholder="growth_clinic"/></Field><Field label="Plan Name"><Input name="name" required placeholder="Growth Clinic"/></Field><Field label="Patient Limit"><Input name="monthlyPatientLimit" type="number" required min="1" defaultValue="300"/></Field><Field label="Monthly Price"><Input name="priceInrMonthly" type="number" required min="0" defaultValue="2999"/></Field><Field label="Included Branches"><Input name="includedBranches" type="number" min="1" defaultValue="1"/></Field><Field label="Included Doctors"><Input name="includedDoctors" type="number" min="1" defaultValue="3"/></Field><div className="md:col-span-2"><Field label="Enabled Modules"><Input name="enabledModules" defaultValue="patients,appointments,queue,consultations,billing_basic,patient_subscriptions" placeholder="lab,pharmacy,patient_subscriptions,whatsapp,voice,ai,ip"/></Field></div><div className="flex flex-wrap gap-2 md:col-span-2"><Button disabled={loading}>{loading?'Saving...':'Create Plan'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></form></Card>
}

function SubscriptionAssignPlan({loading,tenants,selectedId,setSelectedId,plans,selectedTenant,assignSubscription,back}:any){
 return <Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">Assign / Upgrade Tenant Plan</h3><p className="text-sm text-slate-500">Assign immediately, schedule renewal, or upgrade a tenant when limits are reached.</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Subscriptions</button></div><form onSubmit={assignSubscription} className="mt-5 grid gap-3 md:grid-cols-2"><TenantPicker tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId}/><Field label="Plan"><Select name="planId" required>{plans.map((plan:any)=><option key={plan.id} value={plan.id}>{plan.name} - ₹{plan.price_inr_monthly}</option>)}</Select></Field><Field label="Activation Date"><Input name="startsOn" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></Field><Field label="End Date"><Input name="endsOn" type="date"/></Field><Field label="Billing Amount"><Input name="billingAmount" type="number" min="0" defaultValue={plans[0]?.price_inr_monthly||0}/></Field><Field label="Notes"><Input name="notes" placeholder="Upgrade, renewal, scheduled migration"/></Field><div className="md:col-span-2">{selectedTenant&&<div className="mb-3 rounded-2xl bg-slate-50 p-4 text-sm"><b>Selected tenant:</b> {selectedTenant.name}</div>}<div className="flex flex-wrap gap-2"><Button disabled={loading||!selectedId||plans.length===0}>{loading?'Assigning...':'Save Subscription'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></div></form></Card>
}

function SubscriptionCreditsPage({loading,tenants,selectedId,setSelectedId,usage,credits,invoices,addCredits,back}:any){
 return <div className="space-y-5"><Card><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-lg font-bold">Additional Credits</h3><p className="text-sm text-slate-500">Add temporary patient credits and review tenant credit usage and SaaS invoices.</p></div><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Back to Subscriptions</button></div><form onSubmit={addCredits} className="mt-5 grid gap-3 md:grid-cols-2"><TenantPicker tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId}/><Field label="Credit Type"><Select name="creditType" defaultValue="patients"><option value="patients">Patients</option></Select></Field><Field label="Quantity"><Input name="quantity" type="number" required min="1" defaultValue="50"/></Field><Field label="Amount"><Input name="amount" type="number" min="0" defaultValue="0"/></Field><Field label="Starts On"><Input name="startsOn" type="date" defaultValue={new Date().toISOString().slice(0,10)}/></Field><Field label="Expires On"><Input name="expiresOn" type="date"/></Field><div className="md:col-span-2"><Field label="Reason"><Input name="reason" placeholder="Patient limit extension"/></Field></div><div className="flex flex-wrap gap-2 md:col-span-2"><Button disabled={loading||!selectedId}>{loading?'Adding...':'Add Credits'}</Button><button type="button" onClick={back} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button></div></form></Card><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Card><h4 className="font-bold">Current Usage</h4>{usage?<div className="mt-4 grid gap-3"><Info label="Plan" value={usage.plan_name}/><Info label="Patients" value={`${usage.current_patient_count}/${usage.effective_patient_limit}`}/><Info label="Available Credits" value={usage.additional_patient_credits}/></div>:<Empty text="Select a tenant with an active subscription."/>}</Card><SubscriptionTable title="Credit Purchases" rows={credits} columns={['credit_type','quantity','used_quantity','amount']}/><SubscriptionTable title="Invoices" rows={invoices} columns={['invoice_number','amount','status','due_on']}/></div></div>
}

function SubscriptionTable({title,rows,columns}:any){
 return <Card><div className="flex items-center justify-between gap-3"><h4 className="font-bold">{title}</h4><Badge tone="blue">{rows.length}</Badge></div><div className="mt-4 space-y-3">{rows.length===0&&<Empty text={`No ${title.toLowerCase()} yet.`}/>} {rows.slice(0,6).map((row:any)=><div key={row.id||row.invoice_number} className="rounded-2xl bg-slate-50 p-3 text-sm"><div className="grid gap-2 sm:grid-cols-2">{columns.map((column:string)=><div key={column}><p className="text-[11px] font-bold uppercase text-slate-500">{column.replaceAll('_',' ')}</p><p className="font-semibold">{String(row[column]??'-')}</p></div>)}</div></div>)}</div></Card>
}

function TenantBranchSettings({apiSession,selected,tenants,selectedId,setSelectedId,plans,modules,reloadPlans}:any){
 const [subscriptions,setSubscriptions]=useState<any[]>([]);
 const [selectedModules,setSelectedModules]=useState<string[]>([]);
 const [settings,setSettings]=useState<any[]>([]);
 const [numberingRules,setNumberingRules]=useState<any>(parseNumberingRules(null,'SUN'));
 const [settingsMessage,setSettingsMessage]=useState('');
 const [message,setMessage]=useState('');
 const [loading,setLoading]=useState(false);
 const [settingsLoading,setSettingsLoading]=useState(false);
 const planById=new Map((plans||[]).map((plan:any)=>[plan.id,plan]));
 const activeSubscription=subscriptions.find((item:any)=>item.status==='active'||item.is_active)||subscriptions[0];
 const activePlan=activeSubscription?planById.get(activeSubscription.plan_id) as any:null;
 const editableModules=(modules||[]).filter((module:any)=>module.entitlement_key).sort((a:any,b:any)=>String(a.category||'').localeCompare(String(b.category||''))||String(a.name).localeCompare(String(b.name)));
 const moduleByKey=new Map((modules||[]).map((module:any)=>[module.key,module]));
 const moduleByEntitlement=new Map((modules||[]).filter((module:any)=>module.entitlement_key).map((module:any)=>[module.entitlement_key,module]));

 async function loadTenantSubscription(){
  if(!apiSession||!selectedId){setSubscriptions([]);setSelectedModules([]);return}
  setLoading(true);setMessage('');
  try{
   const rows=await apiFetch('/subscription-plans/tenant-subscriptions',{...apiSession,tenantId:selectedId});
   setSubscriptions(rows);
   const current=rows.find((item:any)=>item.status==='active'||item.is_active)||rows[0];
   const plan=current?(plans||[]).find((item:any)=>item.id===current.plan_id):null;
   const enabled=plan?.enabled_modules?.length?plan.enabled_modules:editableModules.filter((module:any)=>module.default_enabled).map((module:any)=>module.entitlement_key);
   setSelectedModules(enabled);
  }catch(err:any){
   setSubscriptions([]);setSelectedModules(editableModules.filter((module:any)=>module.default_enabled).map((module:any)=>module.entitlement_key));
   setMessage(err.message||'Could not load tenant modules.');
  }finally{setLoading(false)}
 }

 async function loadTenantSettings(){
  if(!apiSession||!selectedId){setSettings([]);setNumberingRules(parseNumberingRules(null,'SUN'));return}
  setSettingsLoading(true);setSettingsMessage('');
  try{
   const rows=await apiFetch('/settings',{...apiSession,tenantId:selectedId});
   setSettings(rows);
   const find=(key:string)=>rows.find((setting:any)=>setting.key===key);
   setNumberingRules(parseNumberingRules(find('numbering.rules')?.value,find('invoice.prefix')?.value||'SUN'));
  }catch(err:any){
   setSettings([]);
   setNumberingRules(parseNumberingRules(null,'SUN'));
   setSettingsMessage(err.message||'Could not load numbering settings.');
  }finally{setSettingsLoading(false)}
 }

 useEffect(()=>{loadTenantSubscription();loadTenantSettings()},[apiSession?.token,selectedId,plans.length,modules.length]);

 function toggleModule(key:string,checked:boolean){
  setSelectedModules(previous=>checked?Array.from(new Set([...previous,key])):previous.filter(item=>item!==key));
 }

 async function saveModules(e:any){
  e.preventDefault();if(!apiSession||!selected)return;
  const withDependencies=new Set(selectedModules);
  selectedModules.forEach(key=>{
   const module=moduleByEntitlement.get(key) as any;
   (module?.dependencies||[]).forEach((dependency:string)=>{
    const dependencyModule=moduleByKey.get(dependency) as any;
    if(dependencyModule?.entitlement_key)withDependencies.add(dependencyModule.entitlement_key);
   });
  });
  const enabledModules=Array.from(withDependencies).filter(Boolean);
  const basePlan=activePlan||(plans||[]).find((plan:any)=>plan.is_active)||plans?.[0];
  setLoading(true);setMessage('');
  try{
   const safeTenantId=String(selected.id||'tenant').replace(/[^a-zA-Z0-9]/g,'_').slice(-24);
   const plan=await apiFetch('/subscription-plans',apiSession,{method:'POST',body:JSON.stringify({
    key:`tenant_modules_${safeTenantId}_${Date.now()}`.slice(0,80),
    name:`${selected.name} Module Access`,
    monthly_patient_limit:Number(basePlan?.monthly_patient_limit||300),
    included_branches:Number(basePlan?.included_branches||1),
    included_doctors:Number(basePlan?.included_doctors||1),
    price_inr_monthly:Number(basePlan?.price_inr_monthly||0),
    enabled_modules:enabledModules
   })});
   const subscription=await apiFetch('/subscription-plans/tenant-subscriptions',{...apiSession,tenantId:selected.id},{method:'POST',body:JSON.stringify({
    plan_id:plan.id,
    starts_on:new Date().toISOString().slice(0,10),
    billing_amount:Number(activeSubscription?.billing_amount??basePlan?.price_inr_monthly??0),
    notes:'Updated enabled modules from Tenant & Branch Settings'
   })});
   setSelectedModules(enabledModules);
   setSubscriptions(previous=>[subscription,...previous.filter((item:any)=>item.id!==subscription.id)]);
   window.localStorage.setItem('medizinhub.entitlements.refresh', String(Date.now()));
   await reloadPlans?.();
   setMessage('Tenant module access updated.');
  }catch(err:any){setMessage(err.message||'Could not save tenant modules.')}finally{setLoading(false)}
 }

 function setNumberRule(key:string,value:any){setNumberingRules({...numberingRules,[key]:value})}
 function setEntityCode(key:string,value:string){setNumberingRules({...numberingRules,entities:{...(numberingRules.entities||{}),[key]:value.toUpperCase()}})}
 async function saveNumberingSettings(e:any){
  e.preventDefault();if(!apiSession||!selected)return;
  setSettingsLoading(true);setSettingsMessage('');
  try{
   await Promise.all([
    apiFetch('/settings',{...apiSession,tenantId:selected.id},{method:'PUT',body:JSON.stringify({scope:'tenant',module:'numbering',key:'numbering.rules',value:numberingRules,actor_user_id:apiSession.user?.id})}),
    apiFetch('/settings',{...apiSession,tenantId:selected.id},{method:'PUT',body:JSON.stringify({scope:'tenant',module:'invoice',key:'invoice.prefix',value:numberingRules.prefix,actor_user_id:apiSession.user?.id})}),
   ]);
   await loadTenantSettings();
   setSettingsMessage('Document numbering settings saved.');
  }catch(err:any){setSettingsMessage(err.message||'Could not save numbering settings.')}finally{setSettingsLoading(false)}
 }

 return <div className="space-y-5"><Card><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><h3 className="text-lg font-bold">Tenant & Branch Settings</h3><p className="text-sm text-slate-500">Configuration page for tenant type, enabled modules, branch settings, queue rules, invoice prefix, and communication providers.</p></div><TenantPicker tenants={tenants} selectedId={selectedId} setSelectedId={setSelectedId}/></div>{selected&&<div className="mt-5 grid gap-3 md:grid-cols-3"><Info label="Tenant" value={selected.name}/><Info label="Type" value={formatTenantType(selected.tenant_type)}/><Info label="Status" value={selected.status}/><Info label="Email" value={selected.email||'-'}/><Info label="Phone" value={selected.phone||'-'}/><Info label="Timezone" value={selected.timezone||'-'}/></div>}</Card><Card><div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div><h4 className="font-bold">Document Numbering</h4><p className="text-sm text-slate-500">Set the tenant prefix, digit length, and module codes used for generated IDs.</p></div><Badge tone="blue">{settingsLoading?'Loading':'Tenant scoped'}</Badge></div>{settingsMessage&&<div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{settingsMessage}</div>}<form onSubmit={saveNumberingSettings} className="mt-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Prefix"><Input value={numberingRules.prefix||'SUN'} onChange={(e:any)=>setNumberRule('prefix',e.target.value.toUpperCase())} placeholder="SUN"/></Field><Field label="Digits"><Input type="number" min="1" max="12" value={numberingRules.digits||5} onChange={(e:any)=>setNumberRule('digits',Number(e.target.value||5))}/></Field><Info label="Example" value={`${numberingRules.prefix||'SUN'}-${numberingRules.entities?.patient||'PAT'}-${String(1).padStart(Number(numberingRules.digits||5),'0')}`}/></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">{Object.entries(numberingRules.entities||defaultNumberingEntities).map(([key,value]:any)=><Field key={key} label={`${numberEntityLabel(key)} Code`}><Input value={value} onChange={(e:any)=>setEntityCode(key,e.target.value)}/></Field>)}</div><div className="mt-5 flex flex-wrap items-center gap-3"><Button disabled={settingsLoading||!selected}>{settingsLoading?'Saving...':'Save Numbering'}</Button><span className="text-xs text-slate-500">Previous enabled modules and tenant settings remain unchanged.</span></div></form></Card><Card><div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div><h4 className="font-bold">Enabled Modules</h4><p className="text-sm text-slate-500">Enable Patient Membership here for the selected tenant. Changes create a tenant-specific subscription package and apply immediately.</p></div><div className="text-right">{activePlan?<><Badge tone="blue">{activePlan.name}</Badge><p className="mt-1 text-xs text-slate-500">Current plan</p></>:<Badge tone="amber">No active plan</Badge>}</div></div>{message&&<div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}<form onSubmit={saveModules} className="mt-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{editableModules.length===0&&<Empty text={loading?'Loading modules...':'No entitlement modules found.'}/>} {editableModules.map((module:any)=>{const key=module.entitlement_key;const checked=selectedModules.includes(key);return <label key={module.key} className={`flex min-h-[92px] cursor-pointer gap-3 rounded-2xl border p-4 text-sm ${checked?'border-blue-300 bg-blue-50':'border-slate-200 bg-white'}`}><input type="checkbox" checked={checked} onChange={(e:any)=>toggleModule(key,e.target.checked)} className="mt-1 h-4 w-4"/><span><span className="flex flex-wrap items-center gap-2"><b>{module.name}</b>{key==='patient_subscriptions'&&<Badge tone="green">Patient Membership</Badge>}</span><span className="mt-1 block text-xs text-slate-500">{key}</span></span></label>})}</div><div className="mt-5 flex flex-wrap items-center gap-3"><Button disabled={loading||!selected}>{loading?'Saving...':'Save Module Access'}</Button><span className="text-xs text-slate-500">{selectedModules.length} selected</span></div></form></Card><p className="text-xs text-slate-500">Detailed branch settings reuse the tenant admin settings APIs. A dedicated branch CRUD/settings API page can be added next.</p></div>
}

function CreateActionButton({label,onClick}:any){return <button type="button" onClick={onClick} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"><Plus size={16}/><span>{label}</span></button>}
function TenantPicker({tenants,selectedId,setSelectedId}:any){return <Field label="Selected Tenant"><Select value={selectedId} onChange={(e:any)=>setSelectedId(e.target.value)}>{tenants.map((tenant:any)=><option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</Select></Field>}
function Empty({text}:any){return <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">{text}</div>}
function Info({label,value}:any){return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 font-bold">{value}</p></div>}
function addressText(tenant:any){return [tenant.address,tenant.city,tenant.state].join(' ')}
function formatDate(value:any){return value?new Date(value).toLocaleDateString():'-'}
function formatTenantType(value:string){return String(value||'').split('_').map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(' ')}
function formatTitle(value:string){return String(value||'').split(' ').filter(Boolean).map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(' ')}
function SortButton({label,field,sort,onSort}:any){return <button type="button" onClick={()=>onSort(field)} className="text-left font-bold uppercase text-slate-500 hover:text-slate-900">{label}{sort.key===field?<span className="ml-1">{sort.dir==='asc'?'↑':'↓'}</span>:null}</button>}
function Pagination({page,totalPages,total,pageSize,onPage}:any){const start=total===0?0:(page-1)*pageSize+1;const end=Math.min(page*pageSize,total);return <div className="mt-4 flex flex-col justify-between gap-3 text-sm text-slate-500 sm:flex-row sm:items-center"><span>Showing {start}-{end} of {total}</span><div className="flex gap-2"><button type="button" onClick={()=>onPage(Math.max(1,page-1))} disabled={page<=1} className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300">Previous</button><span className="rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-700">Page {page} / {totalPages}</span><button type="button" onClick={()=>onPage(Math.min(totalPages,page+1))} disabled={page>=totalPages} className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300">Next</button></div></div>}

function roleScopeLabel(role:any){
 const key=String(role?.key||'');
 if(!key||['doctor','tenant_admin','super_admin'].includes(key))return 'All branches';
 const branchSpecific=/(_main_|_north_|_south_|_east_|_west_|main_|north_|south_|east_|west_)/.test(`_${key.toLowerCase()}_`);
 return branchSpecific?'Branch based':'All branches';
}

function groupRolesByName(roles:any[]){
 const groups=new Map<string,any[]>();
 for(const role of roles||[]){
  const key=normalizeOptionLabel(role.name||role.key||role.id);
  if(!key)continue;
  groups.set(key,[...(groups.get(key)||[]),role]);
 }
 return Array.from(groups.values()).map((rows:any[])=>{
  const sorted=[...rows].sort((a:any,b:any)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')));
  const primary=sorted.find((row:any)=>row.key==='tenant_admin'||row.key==='doctor'||row.key==='super_admin')||sorted.find((row:any)=>row.is_active)||sorted[0];
  const scopes=Array.from(new Set(sorted.map(roleScopeLabel)));
  const latestUpdated=sorted.map((row:any)=>row.updated_at||row.created_at).filter(Boolean).sort().at(-1);
  const earliestCreated=sorted.map((row:any)=>row.created_at).filter(Boolean).sort()[0];
  return {
   ...primary,
   id: sorted.map((row:any)=>row.id).join('|'),
   key: primary.key,
   primary,
   rows: sorted,
   display_key: scopes.length===1?scopes[0]:scopes.join(', '),
   is_active: sorted.some((row:any)=>row.is_active),
   is_global_template: sorted.some((row:any)=>row.is_global_template),
   locked: sorted.some((row:any)=>row.is_template_locked||row.source_template_role_id),
   created_at: earliestCreated||primary.created_at,
   updated_at: latestUpdated||primary.updated_at||primary.created_at,
  };
 });
}
