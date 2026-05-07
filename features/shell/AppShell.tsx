'use client';

import {useState} from 'react';
import {Bell,ChevronDown,HeartPulse,KeyRound,LogOut,Settings} from 'lucide-react';
import {Badge,Card,Field,Select} from '@/components/ui';
import {ChangePassword} from '@/features/auth/ChangePassword';
import {AppointmentCalendarBooking} from '@/features/appointments/AppointmentCalendarBooking';
import {TenantAdmin,canUseTenantAdminSection,tenantAdminSections} from '@/features/admin/TenantAdmin';
import {Billing} from '@/features/billing/Billing';
import {Dashboard} from '@/features/dashboard/Dashboard';
import {DoctorConsultation} from '@/features/doctor/DoctorConsultation';
import {IPAdmission} from '@/features/ip/IPAdmission';
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

export function AppShell(props:any) {
  const {
    active,
    setActive,
    nav,
    enabled,
    clinic,
    clinics,
    clinicId,
    changeClinic,
    branchId,
    setBranchId,
    departmentId,
    setDepartmentId,
    allowedDepartments,
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

  const visibleNav = nav.filter(([id]:any) => enabled(id));
  const activePage = visibleNav.some(([id]:any) => id === active) ? active : visibleNav[0]?.[0] || 'dashboard';
  const roleLabel = apiSession?.user?.roles?.[0] || demoUsers.find((u:any) => u[0] === role)?.[1] || 'User';
  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const [superAdminSection,setSuperAdminSection]=useState('overview');
  const [superAdminSettingsOpen,setSuperAdminSettingsOpen]=useState(true);
  const [tenantAdminSection,setTenantAdminSection]=useState('users');
  const [tenantAdminSettingsOpen,setTenantAdminSettingsOpen]=useState(true);
  const visibleTenantAdminSections=tenantAdminSections.filter(([sectionId]:any)=>canUseTenantAdminSection(sectionId,apiSession?.user));

  function renderPage() {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard {...ctx} liveSummary={liveSummary} />;
      case 'superadmin':
        return <SuperAdminDashboard apiSession={apiSession} switchTenant={switchTenant} section={superAdminSection} setSection={setSuperAdminSection} />;
      case 'appointments':
        return <AppointmentCalendarBooking {...ctx} />;
      case 'queue':
        return <TokenQueue {...ctx} />;
      case 'patients':
        return <Patient {...ctx} />;
      case 'practitioners':
        return <Doctors {...ctx} />;
      case 'scheduling':
        return <Scheduling {...ctx} />;
      case 'ip':
        return <IPAdmission {...ctx} />;
      case 'doctor':
        return <DoctorConsultation {...ctx} view="dashboard" setActive={setActive} />;
      case 'consultation':
        return <DoctorConsultation {...ctx} view="workspace" setActive={setActive} />;
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
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="lg:flex">
        <aside className="hidden min-h-screen w-72 shrink-0 border-r border-slate-200 bg-white p-4 lg:block">
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
                        setActive(id);
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
                              setActive('superadmin');
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
                        setActive(id);
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
                              setActive('admin');
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
                  onClick={() => setActive(id)}
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

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 p-4 backdrop-blur lg:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="lg:hidden">
                    <BrandBlock compact/>
                  </div>
                  <h2 className="mt-3 text-xl font-bold lg:mt-0">
                    {isSuperAdmin ? 'Super Admin Platform' : 'Hospital Management System'}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {isSuperAdmin ? 'Tenant, subscription, user, branch, and platform reporting.' : 'Tenant, branch, department, patient, and care workflow.'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={isSuperAdmin ? 'blue' : 'green'}>{roleLabel}</Badge>
                  <button type="button" onClick={() => setShowPassword(true)} className="rounded-xl border p-3" title="Change password">
                    <KeyRound size={18}/>
                  </button>
                  <button type="button" onClick={handleLogout} className="rounded-xl border p-3" title="Logout">
                    <LogOut size={18}/>
                  </button>
                  <Bell className="hidden text-slate-500 sm:block"/>
                </div>
              </div>

              <div className="lg:hidden">
                <Field label="Module">
                  <Select value={activePage} onChange={(e:any) => setActive(e.target.value)}>
                    {visibleNav.map(([id,label]:any) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </Select>
                </Field>
                {isSuperAdmin&&activePage==='superadmin'&&(
                  <div className="mt-3">
                    <Field label="Super Admin Settings">
                      <Select value={superAdminSection} onChange={(e:any)=>setSuperAdminSection(e.target.value)}>
                        {superAdminSections.map(([id,label]:any)=>(
                          <option key={id} value={id}>{label}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}
                {!isSuperAdmin&&activePage==='admin'&&(
                  <div className="mt-3">
                    <Field label="Tenant Admin Settings">
                      <Select value={tenantAdminSection} onChange={(e:any)=>setTenantAdminSection(e.target.value)}>
                        {tenantAdminSections.map(([id,label]:any)=>(
                          <option key={id} value={id}>{label}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}
              </div>

              {!isSuperAdmin && (
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Clinic / Tenant">
                    {apiSession ? (
                      <div className="min-h-[46px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                        {clinic.name} - {clinic.type}
                      </div>
                    ) : (
                      <Select value={clinicId} onChange={(e:any) => changeClinic(e.target.value)}>
                        {clinics.map((c:any) => (
                          <option key={c.id} value={c.id}>{c.name} - {c.type}</option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Branch">
                    <Select value={branchId} onChange={(e:any) => setBranchId(e.target.value)}>
                      {clinic.branches.map((b:any) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Department / Specialty">
                    <Select value={departmentId} onChange={(e:any) => setDepartmentId(e.target.value)}>
                      {allowedDepartments.map((d:any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge tone={apiSession ? 'green' : 'amber'}>{liveStatus}</Badge>
                {apiSession && <span className="break-all">Tenant: {apiSession.tenantId}</span>}
              </div>
            </div>
          </header>

          {showPassword && <ChangePassword apiSession={apiSession} onClose={() => setShowPassword(false)}/>}

          <section className="p-4 lg:p-8">
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
