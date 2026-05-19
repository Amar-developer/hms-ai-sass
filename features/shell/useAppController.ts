'use client';

import {useEffect,useState} from 'react';
import {API_BASE,apiFetch,type ApiSession} from '@/lib/api';
import {demoUsers,loginPresets} from '@/lib/authPresets';
import {type LiveSummary,mapAppointment,mapPatient} from '@/lib/liveData';
import {canOpenModule} from '@/lib/moduleAccess';
import {nav,roleModules} from '@/lib/navigation';
import {uniqueDepartmentRows} from '@/lib/options';

const allModuleIds = nav.map(([id]) => id);
const defaultBranch = {id: 'default-branch', name: 'Default Branch', city: ''};
const defaultDepartment = {id: 'general', name: 'General Medicine', prefix: 'GEN'};

export function useAppController() {
  const [authenticated, setAuthenticated] = useState(false);
  const [apiSession, setApiSession] = useState<ApiSession | null>(null);
  const [liveSummary, setLiveSummary] = useState<LiveSummary | null>(null);
  const [liveBranchId, setLiveBranchId] = useState('');
  const [liveBranches, setLiveBranches] = useState<any[]>([]);
  const [liveDepartments, setLiveDepartments] = useState<any[]>([]);
  const [liveTenants, setLiveTenants] = useState<any[]>([]);
  const [doctorScope, setDoctorScope] = useState<any | null>(null);
  const [livePractitioners, setLivePractitioners] = useState<any[]>([]);
  const [liveInvoices, setLiveInvoices] = useState<any[]>([]);
  const [liveStatus, setLiveStatus] = useState('Not connected');
  const [role, setRole] = useState('tenant_admin');
  const [showPassword, setShowPassword] = useState(false);
  const [active, setActive] = useState('dashboard');
  const [clinicId, setClinicId] = useState('preview');
  const [branchId, setBranchId] = useState(defaultBranch.id);
  const [departmentId, setDepartmentId] = useState(defaultDepartment.id);
  const [patients, setPatients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [ipAdmissions, setIpAdmissions] = useState<any[]>([]);

  function hasPermission(session: ApiSession, permission: string) {
    const keys = session.user?.permissions || [];
    return session.user?.is_super_admin || keys.includes('*') || keys.includes(permission);
  }

  function sessionHasAnyPermission(session: ApiSession, permissions: string[]) {
    return permissions.some((permission) => hasPermission(session, permission));
  }

  async function apiFetchIfAllowed<T>(
    path: string,
    session: ApiSession,
    permission: string | string[],
    fallback: T,
  ): Promise<T> {
    const permissions = Array.isArray(permission) ? permission : [permission];
    if (!sessionHasAnyPermission(session, permissions)) return fallback;
    try {
      return await apiFetch(path, session);
    } catch {
      return fallback;
    }
  }

  async function loadLiveData(session: ApiSession) {
    setLiveStatus('Loading seeded backend data...');
    const referenceReadPermissions = [
      'settings.manage',
      'settings.read',
      'branches.manage',
      'branches.read',
      'departments.manage',
      'departments.read',
      'appointments.manage',
      'appointments.create',
      'appointments.read',
      'scheduling.manage',
      'scheduling.read',
      'practitioners.manage',
      'practitioners.read',
    ];
    const tenantRowsPromise = session.user?.is_super_admin
      ? apiFetchIfAllowed<any[]>('/tenants', session, 'platform.tenants.manage', [])
      : Promise.resolve<any[]>([]);
    const [tenantRows, branchRows, departmentRows] = await Promise.all([
      tenantRowsPromise,
      apiFetchIfAllowed<any[]>(`/tenants/${session.tenantId}/branches`, session, referenceReadPermissions, []),
      apiFetchIfAllowed<any[]>(`/tenants/${session.tenantId}/departments`, session, referenceReadPermissions, []),
    ]);
    const isDoctorUser = session.user?.user_type === 'doctor' || session.user?.roles?.includes('doctor');
    let scopedBranchRows = branchRows;
    let scopedDepartmentRows = uniqueDepartmentRows(departmentRows, departmentId);

    const [patientRows, appointmentRows, queueRows, consultationRows, invoiceRows, ipRows, practitionerRows] = await Promise.all([
      apiFetchIfAllowed<any[]>('/patients', session, 'patients.read', []),
      apiFetchIfAllowed<any[]>('/appointments', session, ['appointments.manage', 'appointments.read'], []),
      apiFetchIfAllowed<any[]>('/queue?include_completed=true', session, 'queue.manage', []),
      apiFetchIfAllowed<any[]>('/consultations', session, 'consultations.read', []),
      apiFetchIfAllowed<any[]>('/billing/invoices', session, 'billing.manage', []),
      apiFetchIfAllowed<any[]>('/ip/admissions', session, ['ip.manage', 'ip.read'], []),
      apiFetchIfAllowed<any[]>('/practitioners', session, referenceReadPermissions, []),
    ]);

    const linkedPractitioner = isDoctorUser
      ? practitionerRows.find((practitioner: any) => practitioner.user_id === session.user?.id)
      : null;
    const doctorBranchIds = new Set([
      ...(linkedPractitioner?.branch_ids || []),
      session.user?.branch_id,
    ].filter(Boolean));
    const doctorDepartmentIds = new Set((linkedPractitioner?.department_ids || []).filter(Boolean));
    if (isDoctorUser) {
      scopedBranchRows = doctorBranchIds.size ? branchRows.filter((row: any) => doctorBranchIds.has(row.id)) : [];
      scopedDepartmentRows = doctorDepartmentIds.size ? uniqueDepartmentRows(departmentRows.filter((row: any) => doctorDepartmentIds.has(row.id)), departmentId) : [];
      setDoctorScope({
        practitionerId: linkedPractitioner?.id || null,
        branchIds: Array.from(doctorBranchIds),
        departmentIds: Array.from(doctorDepartmentIds),
      });
    } else {
      setDoctorScope(null);
    }

    setLiveTenants(tenantRows);
    setLiveBranches(scopedBranchRows);
    setLiveDepartments(scopedDepartmentRows);
    const backendBranchId = session.user?.is_super_admin
      ? (scopedBranchRows[0]?.id || liveBranchId || branchId)
      : (session.user?.branch_id || scopedBranchRows[0]?.id || liveBranchId || branchId);
    if (backendBranchId) setLiveBranchId(backendBranchId);
    if (scopedDepartmentRows.length && !scopedDepartmentRows.some((row: any) => row.id === departmentId)) {
      setDepartmentId(scopedDepartmentRows[0].id);
    }

    const mappedPatients = patientRows.map(mapPatient);
    const patientMap = new Map<string, any>(mappedPatients.map((p: any) => [p.id, p]));
    const practitionerMap = new Map<string, any>(practitionerRows.map((practitioner: any) => [practitioner.id, practitioner]));
    const mappedAppointments = appointmentRows.map((a: any) =>
      mapAppointment(a, queueRows, consultationRows, patientMap, practitionerMap, session.tenantId, backendBranchId),
    );

    setPatients(mappedPatients);
    setLivePractitioners(practitionerRows);
    setAppointments(mappedAppointments);
    setIpAdmissions(ipRows);
    setLiveInvoices(invoiceRows);
    setLiveSummary({
      patients: patientRows.length,
      appointments: appointmentRows.length,
      queue: queueRows.length,
      invoices: invoiceRows.length,
      invoiceBalance: invoiceRows.reduce((sum: number, row: any) => sum + Number(row.balance_amount || 0), 0),
    });
    setLiveStatus(`Connected to ${session.email}`);
  }

  useEffect(() => {
    function handleUnhandled(event: PromiseRejectionEvent) {
      event.preventDefault();
      const reason = event.reason;
      setLiveStatus(reason?.message || 'A backend request failed, but the app is still running.');
    }

    window.addEventListener('unhandledrejection', handleUnhandled);
    const raw = localStorage.getItem('medizinhub.session');
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        setApiSession(saved);
        const savedRole = saved.user?.roles?.[0] || (saved.user?.is_super_admin ? 'super_admin' : 'tenant_admin');
        setRole(savedRole);
        if (savedRole === 'super_admin') setActive('superadmin');
        setAuthenticated(true);
        loadLiveData(saved).catch((err:any) => {
          setLiveStatus(err.message || 'Connected, but live data could not be loaded.');
        });
      } catch {
        localStorage.removeItem('medizinhub.session');
      }
    }

    return () => window.removeEventListener('unhandledrejection', handleUnhandled);
  }, []);

  async function handleLogin(input: {email: string; password: string}) {
    setLiveStatus('Signing in...');
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email: input.email, password: input.password}),
      });
    } catch {
      throw new Error(
        `Backend is not reachable at ${API_BASE}. Start the FastAPI backend on port 8000, then open ${API_BASE}/health.`
      );
    }
    if (!res.ok) {
      let detail = 'Login failed';
      try {
        const body = await res.json();
        detail = body.detail || detail;
      } catch {}
      throw new Error(detail);
    }

    const body = await res.json();
    let tenantId = body.user?.tenant_id || '';
    if (body.user?.is_super_admin) {
      let tenantsRes: Response;
      try {
        tenantsRes = await fetch(`${API_BASE}/tenants`, {headers: {Authorization: `Bearer ${body.access_token}`}});
      } catch {
        throw new Error(`Login succeeded, but tenants could not be loaded from ${API_BASE}/tenants.`);
      }
      if (tenantsRes.ok) {
        const tenants = await tenantsRes.json();
        tenantId = tenants[0]?.id || '';
      } else {
        let detail = 'Could not load tenants for super admin.';
        try {
          const body = await tenantsRes.json();
          detail = body.detail || detail;
        } catch {}
        throw new Error(detail);
      }
    }
    if (!tenantId) throw new Error('No tenant is available for this user.');

    const session = {token: body.access_token, tenantId, email: input.email, user: body.user};
    localStorage.setItem('medizinhub.session', JSON.stringify(session));
    setApiSession(session);
    const nextRole = body.user.roles?.[0] || (body.user.is_super_admin ? 'super_admin' : 'tenant_admin');
    setRole(nextRole);
    setActive(nextRole === 'super_admin' ? 'superadmin' : 'dashboard');
    setAuthenticated(true);
    await loadLiveData(session).catch((err:any) => {
      setLiveStatus(err.message || 'Connected, but live data could not be loaded.');
    });
  }

  async function handleLogout() {
    const sessionToRevoke = apiSession;
    localStorage.removeItem('medizinhub.session');
    sessionStorage.removeItem('medizinhub.session');
    setApiSession(null);
    setAuthenticated(false);
    setLiveSummary(null);
    setLiveInvoices([]);
    setLiveBranchId('');
    setLiveBranches([]);
    setLiveDepartments([]);
    setLiveTenants([]);
    setDoctorScope(null);
    setLivePractitioners([]);
    setPatients([]);
    setAppointments([]);
    setIpAdmissions([]);
    setActive('dashboard');
    setRole('tenant_admin');
    setShowPassword(false);
    setLiveStatus('Logged out');
    if (sessionToRevoke) {
      apiFetch('/auth/logout', sessionToRevoke, {method: 'POST'}).catch(() => {});
    }
  }

  async function switchTenant(tenantId: string) {
    if (!apiSession || !tenantId) return;
    const next = {...apiSession, tenantId};
    localStorage.setItem('medizinhub.session', JSON.stringify(next));
    setApiSession(next);
    setLiveBranchId('');
    setLiveBranches([]);
    setLiveDepartments([]);
    setLiveStatus(`Switching to ${tenantId}...`);
    await loadLiveData(next).catch((err:any) => {
      setLiveStatus(err.message || 'Tenant switched, but live data could not be loaded.');
    });
  }

  function changeClinic(id: string) {
    setClinicId(id);
    if (!apiSession && active !== 'dashboard') setActive('dashboard');
  }

  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const isDoctorUser = Boolean(apiSession && (apiSession.user?.user_type === 'doctor' || apiSession.user?.roles?.includes('doctor')));
  const branchOptions = liveBranches.length
    ? liveBranches.map((row: any) => ({id: row.id, name: row.name, city: row.city}))
    : apiSession ? [] : [defaultBranch];
  const departmentOptions = liveDepartments.length
    ? liveDepartments.map((row: any) => ({id: row.id, name: row.name, prefix: row.code}))
    : apiSession ? [] : [defaultDepartment];
  const effectiveClinicId = apiSession && !isSuperAdmin ? apiSession.tenantId : clinicId;
  const effectiveBranchId = liveBranchId || branchId;
  const selectedTenant = liveTenants.find((tenant: any) => tenant.id === apiSession?.tenantId);
  const clinic = {
    id: apiSession ? apiSession.tenantId : clinicId,
    name: selectedTenant?.name || apiSession?.user?.tenant_name || (isSuperAdmin ? 'MedizinHub HMS' : 'Current Tenant'),
    type: branchOptions.length > 1 ? 'Multi Branch Tenant' : 'Single Branch Tenant',
    multiBranch: branchOptions.length > 1,
    modules: allModuleIds,
    branches: branchOptions,
    departments: departmentOptions.map((department: any) => department.id),
    consultationFees: {},
  };
  const branch = branchOptions.find((b: any) => b.id === effectiveBranchId) || branchOptions[0] || defaultBranch;
  const allowedDepartments = departmentOptions;

  function selectBranch(id: string) {
    if (liveBranches.length) {
      setLiveBranchId(id);
    } else {
      setBranchId(id);
    }
  }

  const scopedAppointments = appointments.filter((a) => {
    if (isSuperAdmin) return true;
    return a.clinicId === effectiveClinicId && (!effectiveBranchId || a.branchId === effectiveBranchId);
  });
  const ctx = {
    clinic,
    branch,
    branchId: effectiveBranchId,
    departmentId,
    setDepartmentId,
    allowedDepartments,
    doctorScope,
    livePractitioners,
    patients,
    setPatients,
    appointments,
    setAppointments,
    ipAdmissions,
    setIpAdmissions,
    scopedAppointments,
    apiSession,
    loadLiveData,
    liveInvoices,
  };
  const allowedForRole = roleModules[role] || roleModules.tenant_admin;
  const permissionModules = new Set<string>();
  const permissionKeys = apiSession?.user?.permissions || [];
  const navHasAnyPermission = (...keys: string[]) =>
    Boolean(apiSession?.user?.is_super_admin || permissionKeys.includes('*') || keys.some((key) => permissionKeys.includes(key)));
  if (!isSuperAdmin && navHasAnyPermission('identity.users.manage', 'identity.users.create', 'identity.users.read', 'identity.users.edit', 'identity.users.delete', 'identity.roles.manage', 'identity.roles.read', 'settings.manage', 'branches.manage', 'branches.read', 'departments.manage', 'departments.read')) permissionModules.add('admin');
  if (navHasAnyPermission('appointments.manage', 'appointments.create', 'appointments.read', 'appointments.edit')) permissionModules.add('appointments');
  if (navHasAnyPermission('queue.manage')) permissionModules.add('queue');
  if (navHasAnyPermission('patients.read', 'patients.write', 'patients.create', 'patients.edit')) permissionModules.add('patients');
  if (navHasAnyPermission('practitioners.manage', 'practitioners.read', 'practitioners.create', 'practitioners.edit')) permissionModules.add('practitioners');
  if (navHasAnyPermission('scheduling.manage', 'scheduling.read', 'scheduling.create', 'scheduling.edit', 'scheduling.delete')) permissionModules.add('scheduling');
  if (navHasAnyPermission('pharmacy.manage', 'pharmacy.read', 'pharmacy.create', 'pharmacy.edit', 'lab.manage', 'lab.read', 'lab.create', 'lab.edit', 'physiotherapy.manage', 'physiotherapy.read', 'physiotherapy.create', 'physiotherapy.edit')) permissionModules.add('items');
  if (navHasAnyPermission('ip.manage', 'ip.read', 'ip.create', 'ip.edit', 'ip.delete')) permissionModules.add('ip');
  if (navHasAnyPermission('consultations.read', 'consultations.write', 'consultations.sign')) {
    permissionModules.add('doctor');
    permissionModules.add('consultation');
  }
  if (navHasAnyPermission('lab.manage', 'lab.read', 'lab.create', 'lab.edit')) permissionModules.add('lab');
  if (navHasAnyPermission('pharmacy.manage', 'pharmacy.read', 'pharmacy.create', 'pharmacy.edit')) permissionModules.add('pharmacy');
  if (navHasAnyPermission('physiotherapy.manage', 'physiotherapy.read', 'physiotherapy.create', 'physiotherapy.edit', 'physiotherapy.delete')) permissionModules.add('physiotherapy');
  if (navHasAnyPermission('billing.manage', 'invoices.read', 'invoices.create', 'payments.manage')) permissionModules.add('billing');
  const isTenantAdminUser = Boolean(!isSuperAdmin && (role === 'tenant_admin' || apiSession?.user?.roles?.includes('tenant_admin') || apiSession?.user?.user_type === 'tenant_admin'));
  if ((isSuperAdmin || isTenantAdminUser) && navHasAnyPermission('reports.read', 'audit.read')) permissionModules.add('reports');
  const isTenantAdminDashboardUser = Boolean(!isSuperAdmin && (role === 'tenant_admin' || apiSession?.user?.roles?.includes('tenant_admin') || apiSession?.user?.user_type === 'tenant_admin'));
  const enabled = (id: string) => {
    if (id === 'dashboard') return isTenantAdminDashboardUser;
    if (id === 'reports') return Boolean(isSuperAdmin || isTenantAdminUser) && canOpenModule(id, Array.from(new Set([...allowedForRole, ...Array.from(permissionModules)])), clinic);
    return canOpenModule(id, Array.from(new Set([...allowedForRole, ...Array.from(permissionModules)])), clinic);
  };

  return {
    authenticated,
    authScreenProps: {role, setRole, onLogin: handleLogin, demoUsers, loginPresets},
    shellProps: {
      active,
      setActive,
      nav,
      enabled,
      clinic,
      clinics: [clinic],
      tenants: liveTenants,
      clinicId: effectiveClinicId,
      changeClinic,
      branchId: effectiveBranchId,
      setBranchId: selectBranch,
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
    },
  };
}
