'use client';

import {useState} from 'react';
import {ArrowLeft,ArrowRight,Bell,ChevronDown,HeartPulse,Home,KeyRound,LogOut,Settings} from 'lucide-react';
import {Badge,Card,Field,Select} from '@/components/ui';
import {ChangePassword} from '@/features/auth/ChangePassword';
import {AppointmentCalendarBooking} from '@/features/appointments/AppointmentCalendarBooking';
import {TenantAdmin,canUseTenantAdminSection,tenantAdminSections} from '@/features/admin/TenantAdmin';
import {Billing} from '@/features/billing/Billing';
import {Dashboard} from '@/features/dashboard/Dashboard';
import {DoctorConsultation} from '@/features/doctor/DoctorConsultation';
import {IPAdmission} from '@/features/ip/IPAdmission';
import {Items} from '@/features/items/Items';
import {Lab} from '@/features/lab/Lab';
import {Patient} from '@/features/patients/Patient';
import {Pharmacy} from '@/features/pharmacy/Pharmacy';
import {Physiotherapy} from '@/features/physiotherapy/Physiotherapy';
import {SuperAdminDashboard,superAdminSections} from '@/features/platform/SuperAdminDashboard';
import {Doctors} from '@/features/doctors/Doctors';
import {TokenQueue} from '@/features/queue/TokenQueue';
import {Reports} from '@/features/reports/Reports';
import {Scheduling} from '@/features/scheduling/Scheduling';
import {Subscriptions} from '@/features/subscriptions/Subscriptions';
import {uniqueDepartmentRows} from '@/lib/options';

function userInitials(user:any,email:string){
  const source=String(user?.name||email||'User').trim();
  const parts=source.split(/[\s.@_-]+/).filter(Boolean);
  return (parts[0]?.[0]||'U').toUpperCase()+((parts[1]?.[0]||'') as string).toUpperCase();
}

export function AppShell(props:any) {
  const {
    active,
    setActive,
    nav,
    enabled,
    clinic,
    clinics,
    tenants=[],
    clinicId,
    changeClinic,
    branchId,
    setBranchId,
    departmentId,
    setDepartmentId,
    allowedDepartments,
    isDoctorUser,
    doctorScope,
    apiSession,
    role,
    demoUsers,
    liveStatus,
    showPassword,
    setShowPassword,
    handleLogout,
    switchTenant,
    ctx,
    liveSummary,
  } = props;

  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const visibleNav = nav.filter(([id]:any) => enabled(id) && !(isSuperAdmin && id === 'admin'));
  const activePage = visibleNav.some(([id]:any) => id === active) ? active : (isSuperAdmin ? 'superadmin' : visibleNav[0]?.[0] || 'dashboard');
  const primaryRole = apiSession?.user?.roles?.[0] || role;
  const roleLabel = demoUsers.find((u:any) => u[0] === primaryRole)?.[1] || primaryRole?.replace(/_/g,' ') || 'User';
  const isTenantAdmin = Boolean(apiSession?.user?.roles?.includes('tenant_admin') || primaryRole === 'tenant_admin');
  const isReceptionist = Boolean(
    apiSession?.user?.user_type === 'receptionist' ||
    apiSession?.user?.roles?.some((row:string)=>['receptionist','reception'].includes(row)) ||
    apiSession?.user?.roles?.some((row:string)=>String(row).includes('receptionist')) ||
    ['receptionist','reception'].includes(primaryRole) ||
    String(primaryRole).includes('receptionist')
  );
  const canChangeBranch = Boolean(isSuperAdmin || isTenantAdmin);
  const canChangeDepartment = Boolean((isSuperAdmin || isTenantAdmin || isReceptionist) && !isDoctorUser);
  const branchName = clinic.branches.find((b:any)=>b.id===branchId)?.name || clinic.branches[0]?.name || 'Assigned branch';
  const departmentOptions = uniqueDepartmentRows(allowedDepartments || [], departmentId);
  const departmentName = departmentOptions.find((d:any)=>d.id===departmentId)?.name || departmentOptions[0]?.name || 'Assigned department';
  const displayClinicName = clinic.name || 'Hospital / Clinic';
  const tenantOptions = isSuperAdmin
    ? (tenants.length ? tenants : [{id: apiSession?.tenantId || clinic.id, name: displayClinicName}])
    : clinics;
  const [superAdminSection,setSuperAdminSection]=useState('overview');
  const [superAdminSettingsOpen,setSuperAdminSettingsOpen]=useState(true);
  const [tenantAdminSection,setTenantAdminSection]=useState('users');
  const [tenantAdminSettingsOpen,setTenantAdminSettingsOpen]=useState(true);
  const visibleTenantAdminSections=tenantAdminSections.filter(([sectionId]:any)=>canUseTenantAdminSection(sectionId,apiSession?.user));
  const [pageHistory,setPageHistory]=useState<string[]>([activePage]);
  const [historyIndex,setHistoryIndex]=useState(0);
  const [profileOpen,setProfileOpen]=useState(false);
  const activeNavLabel=visibleNav.find(([id]:any)=>id===activePage)?.[1] || 'Dashboard';
  const activeSectionLabel=activePage==='superadmin'
    ? superAdminSections.find(([id]:any)=>id===superAdminSection)?.[1]
    : activePage==='admin'
      ? tenantAdminSections.find(([id]:any)=>id===tenantAdminSection)?.[1]
      : null;
  const canGoBack=historyIndex>0;
  const canGoForward=historyIndex<pageHistory.length-1;

  function navigatePage(id:string){
    if(!id||id===activePage)return;
    setActive(id);
    setPageHistory((prev)=>{
      const next=[...prev.slice(0,historyIndex+1),id];
      setHistoryIndex(next.length-1);
      return next;
    });
  }

  function goHistory(direction:-1|1){
    const nextIndex=historyIndex+direction;
    const nextPage=pageHistory[nextIndex];
    if(nextPage===undefined)return;
    setHistoryIndex(nextIndex);
    setActive(nextPage);
  }

  function renderPage() {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard {...ctx} liveSummary={liveSummary} setActive={navigatePage} />;
      case 'superadmin':
        return <SuperAdminDashboard apiSession={apiSession} switchTenant={switchTenant} section={superAdminSection} setSection={setSuperAdminSection} />;
      case 'appointments':
        return <AppointmentCalendarBooking {...ctx} setActive={navigatePage} />;
      case 'queue':
        return <TokenQueue {...ctx} setActive={navigatePage} />;
      case 'patients':
        return <Patient {...ctx} />;
      case 'practitioners':
        return <Doctors {...ctx} />;
      case 'scheduling':
        return <Scheduling {...ctx} />;
      case 'items':
        return <Items {...ctx} />;
      case 'ip':
        return <IPAdmission {...ctx} />;
      case 'doctor':
        return <DoctorConsultation {...ctx} view="dashboard" setActive={navigatePage} />;
      case 'consultation':
        return <DoctorConsultation {...ctx} view="workspace" setActive={navigatePage} />;
      case 'lab':
        return <Lab {...ctx} />;
      case 'pharmacy':
        return <Pharmacy {...ctx} />;
      case 'physiotherapy':
        return <Physiotherapy {...ctx} />;
      case 'billing':
        return <Billing {...ctx} />;
      case 'admin':
        return <TenantAdmin {...ctx} section={tenantAdminSection} setSection={setTenantAdminSection} />;
      case 'subscriptions':
        return <Subscriptions {...ctx} />;
      case 'reports':
        return <Reports {...ctx} />;
      default:
        return (
          <Card>
            <h3 className="text-lg font-bold">Module unavailable</h3>
            <p className="mt-2 text-sm text-slate-500">This module is not enabled for the current role or tenant.</p>
          </Card>
        );
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-white text-slate-900">
      <div className="h-full lg:flex">
        <aside className="scrollbar-hidden hidden h-screen w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4 lg:block">
          <BrandBlock/>
          <nav className="mt-8 space-y-2">
            {visibleNav.map(([id,label,Icon]:any) => {
              const isActive=activePage===id;
              if(id==='superadmin'&&isSuperAdmin){
                return (
                  <div key={id}>
                    <button
                      type="button"
                      onClick={() => {
                        navigatePage(id);
                        setSuperAdminSettingsOpen(!superAdminSettingsOpen);
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold ${
                        isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Icon size={18}/>
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <ChevronDown size={16} className={superAdminSettingsOpen?'rotate-180':''}/>
                    </button>
                    {isActive&&superAdminSettingsOpen&&(
                      <div className="mt-2 grid gap-1 pl-5">
                        <div className="mb-1 flex items-center gap-2 px-3 text-xs font-bold uppercase text-slate-400">
                          <Settings size={13}/>
                          Settings
                        </div>
                        {superAdminSections.map(([sectionId,sectionLabel,SectionIcon]:any)=>(
                          <button
                            key={sectionId}
                            type="button"
                            onClick={()=>{
                              navigatePage('superadmin');
                              setSuperAdminSection(sectionId);
                            }}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold ${
                              superAdminSection===sectionId ? 'bg-slate-100 text-slate-950' : 'text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            <SectionIcon size={15}/>
                            <span className="truncate">{sectionLabel}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              if(id==='admin'&&!isSuperAdmin){
                return (
                  <div key={id}>
                    <button
                      type="button"
                      onClick={() => {
                        navigatePage(id);
                        setTenantAdminSettingsOpen(!tenantAdminSettingsOpen);
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold ${
                        isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Icon size={18}/>
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <ChevronDown size={16} className={tenantAdminSettingsOpen?'rotate-180':''}/>
                    </button>
                    {isActive&&tenantAdminSettingsOpen&&(
                      <div className="mt-2 grid gap-1 pl-5">
                        <div className="mb-1 flex items-center gap-2 px-3 text-xs font-bold uppercase text-slate-400">
                          <Settings size={13}/>
                          Settings
                        </div>
                        {visibleTenantAdminSections.map(([sectionId,sectionLabel,SectionIcon]:any)=>(
                          <button
                            key={sectionId}
                            type="button"
                            onClick={()=>{
                              navigatePage('admin');
                              setTenantAdminSection(sectionId);
                            }}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-bold ${
                              tenantAdminSection===sectionId ? 'bg-slate-100 text-slate-950' : 'text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            <SectionIcon size={15}/>
                            <span className="truncate">{sectionLabel}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigatePage(id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold ${
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon size={18}/>
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </nav>
          <div className="mt-8 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
            <b className="text-slate-900">{isSuperAdmin ? 'Primary Tenant' : clinic.type}</b>
            <br/>
            {isSuperAdmin ? 'Global platform access' : clinic.multiBranch ? 'Multi-branch enabled' : 'Single branch mode'}
            <br/>
            MedizinHub HMS API workspace.
          </div>
        </aside>

        <main className="scrollbar-hidden h-screen min-w-0 flex-1 overflow-y-auto bg-white">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur lg:px-5">
            <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(260px,1.25fr)_minmax(180px,.9fr)_minmax(180px,.9fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="lg:hidden">
                  <BrandBlock compact/>
                </div>
                {isSuperAdmin&&apiSession ? (
                  <CompactControl label="Tenant">
                    <select value={apiSession.tenantId} onChange={(e:any) => switchTenant(e.target.value)} className="w-full bg-transparent text-sm font-semibold outline-none">
                      {tenantOptions.map((tenant:any) => (
                        <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                      ))}
                    </select>
                  </CompactControl>
                ) : (
                  <div className="grid h-12 content-center">
                    <span className="text-[10px] font-bold uppercase leading-none text-slate-500">Tenant</span>
                    <h2 className="mt-1 truncate text-lg font-bold leading-tight">{displayClinicName}</h2>
                  </div>
                )}
              </div>

              <CompactControl label="Branch">
                {canChangeBranch ? (
                  <select value={branchId} onChange={(e:any) => setBranchId(e.target.value)} className="w-full bg-transparent text-sm font-semibold outline-none">
                    {clinic.branches.map((b:any) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="truncate">{branchName}</span>
                )}
              </CompactControl>

              <CompactControl label="Department">
                {canChangeDepartment ? (
                  <select value={departmentId} onChange={(e:any) => setDepartmentId(e.target.value)} className="w-full bg-transparent text-sm font-semibold outline-none">
                    {departmentOptions.map((d:any) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="truncate">{departmentName}</span>
                )}
              </CompactControl>

              <div className="flex shrink-0 items-center justify-end gap-2">
                <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500" title="Notifications">
                  <Bell size={18}/>
                </button>
                <div className="relative">
                  <button type="button" onClick={()=>setProfileOpen(!profileOpen)} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-sm font-black text-white" title="Profile">
                    {userInitials(apiSession?.user,apiSession?.email)}
                  </button>
                  {profileOpen&&(
                    <div className="absolute right-0 top-12 z-40 w-80 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-xl">
                      <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                        <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-900 font-black text-white">{userInitials(apiSession?.user,apiSession?.email)}</div>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-900">{apiSession?.user?.name||roleLabel}</p>
                          <p className="truncate text-xs text-slate-500">{apiSession?.email||'Not connected'}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs">
                        <ProfileRow label="Role" value={roleLabel}/>
                        <ProfileRow label="Tenant" value={apiSession?.tenantId||clinic.id}/>
                        <ProfileRow label="Branch" value={branchName}/>
                        <ProfileRow label="Department" value={departmentName}/>
                      </div>
                      <div className="mt-4 grid gap-2 border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          onClick={()=>{
                            setProfileOpen(false);
                            setShowPassword(true);
                          }}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
                        >
                          <KeyRound size={16}/> Change Password
                        </button>
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-sm font-bold text-red-600 hover:bg-red-50"
                        >
                          <LogOut size={16}/> Logout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:hidden lg:col-span-5">
                <Field label="Module">
                  <Select value={activePage} onChange={(e:any) => navigatePage(e.target.value)}>
                    {visibleNav.map(([id,label]:any) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          </header>

          {showPassword && <ChangePassword apiSession={apiSession} onClose={() => setShowPassword(false)}/>}

          <div className="bg-white px-4 py-2 lg:px-6">
            <div className="flex min-w-0 items-center gap-3 text-sm">
              {/* Back / Forward group */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => goHistory(-1)}
                  disabled={!canGoBack}
                  title="Back"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none"
                >
                  <ArrowLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => goHistory(1)}
                  disabled={!canGoForward}
                  title="Forward"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none"
                >
                  <ArrowRight size={14} />
                </button>
              </div>

              {/* Divider */}
              <span className="h-5 w-px bg-slate-200" />

              {/* Breadcrumb */}
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigatePage('dashboard')}
                  disabled={activePage === 'dashboard' || !enabled('dashboard')}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-default disabled:text-slate-900 disabled:hover:bg-transparent"
                >
                  <Home size={14} /> Dashboard
                </button>

                {activePage !== 'dashboard' && (
                  <>
                    <span className="text-slate-300">/</span>
                    <span className="truncate text-xs font-bold text-slate-900">
                      {activeNavLabel}
                    </span>
                  </>
                )}

                {activeSectionLabel && (
                  <>
                    <span className="hidden text-slate-300 sm:inline">/</span>
                    <span className="hidden truncate text-xs text-slate-500 sm:inline">
                      {activeSectionLabel}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <section className="py-4 px-6">
            {renderPage()}
          </section>
        </main>
      </div>
    </div>
  );
}

function BrandBlock({compact=false}:{compact?:boolean}) {
  return (
    <div className="flex items-center gap-3">
      <div className={`${compact ? 'rounded-xl p-2' : 'rounded-2xl p-3'} bg-slate-900 text-white`}>
        <HeartPulse size={compact ? 20 : 24}/>
      </div>
      <div className="min-w-0">
        <h1 className={`${compact ? 'text-base' : 'text-sm'} font-bold`}>MedizinHub HMS</h1>
        <p className="truncate text-sm text-slate-500">Healthcare SaaS Workspace</p>
      </div>
    </div>
  );
}

function CompactControl({label,children}:any){
  return (
    <label className="grid h-12 min-w-0 content-center rounded-xl border border-slate-200 bg-white px-3">
      <span className="text-[10px] font-bold uppercase leading-none text-slate-500">{label}</span>
      <span className="mt-1 min-w-0 truncate text-sm font-semibold text-slate-800">{children}</span>
    </label>
  );
}

function ProfileRow({label,value}:any){
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-2">
      <span className="font-bold uppercase text-slate-400">{label}</span>
      <span className="truncate font-semibold text-slate-700">{value||'-'}</span>
    </div>
  );
}
