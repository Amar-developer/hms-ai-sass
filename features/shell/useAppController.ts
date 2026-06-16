'use client';

import {useEffect,useRef,useState} from 'react';
import {API_BASE,AUTH_SESSION_EXPIRED_EVENT,apiFetch,type ApiSession} from '@/lib/api';
import {demoUsers,loginPresets} from '@/lib/authPresets';
import {type LiveSummary,mapAppointment,mapPatient} from '@/lib/liveData';
import {canOpenModule} from '@/lib/moduleAccess';
import {nav,roleModules} from '@/lib/navigation';
import {uniqueDepartmentRows} from '@/lib/options';
import {normalizeSidebarModuleMap,resolveSidebarModules} from '@/lib/sidebarAccess';

const allModuleIds = nav.map(([id]) => id);
const defaultEntitlementModuleIds = Array.from(new Set([...allModuleIds, 'patient_subscriptions']));
const defaultBranch = {id: 'default-branch', name: 'Default Branch', city: ''};
const defaultDepartment = {id: 'general', name: 'General Medicine', prefix: 'GEN'};

type WorkspaceState = {
  active?: string;
  branchId?: string;
  departmentId?: string;
};

function workspaceKey(session: ApiSession) {
  const userKey = session.user?.id || session.email || 'user';
  return `medizinhub.workspace.${userKey}.${session.tenantId}`;
}

function readWorkspace(session: ApiSession): WorkspaceState {
  try {
    return JSON.parse(localStorage.getItem(workspaceKey(session)) || '{}');
  } catch {
    return {};
  }
}

function saveWorkspace(session: ApiSession, patch: WorkspaceState) {
  const current = readWorkspace(session);
  localStorage.setItem(
    workspaceKey(session),
    JSON.stringify({...current, ...patch}),
  );
}

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
  const [enabledModules, setEnabledModules] = useState<string[]>(defaultEntitlementModuleIds);
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
  const [roleModuleOverrides, setRoleModuleOverrides] = useState<Record<string, string[]>>({});
  const activeRef = useRef(active);
  const branchIdRef = useRef(branchId);
  const liveBranchIdRef = useRef(liveBranchId);
  const departmentIdRef = useRef(departmentId);

  function updateActive(value: string) {
    activeRef.current = value;
    setActive(value);
    if (apiSession) saveWorkspace(apiSession, {active: value});
  }

  function updateDepartment(value: string) {
    departmentIdRef.current = value;
    setDepartmentId(value);
    if (apiSession) saveWorkspace(apiSession, {departmentId: value});
  }

  function setCurrentLiveBranch(value: string) {
    liveBranchIdRef.current = value;
    setLiveBranchId(value);
  }

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

  function clearLocalSession(status = 'Logged out') {
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
    setRoleModuleOverrides({});
    activeRef.current = 'dashboard';
    liveBranchIdRef.current = '';
    departmentIdRef.current = defaultDepartment.id;
    setActive('dashboard');
    setRole('tenant_admin');
    setShowPassword(false);
    setLiveStatus(status);
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
    const activeTenant = tenantRows.find((tenant: any) => tenant.id === session.tenantId);
    const isPlatformPrimaryTenant = Boolean(session.user?.is_super_admin && (activeTenant?.is_primary || session.user?.tenant_id === session.tenantId));
    const isDoctorUser = session.user?.user_type === 'doctor' || session.user?.roles?.includes('doctor');
    let scopedBranchRows = branchRows;
    const preferredDepartmentId = departmentIdRef.current;
    let scopedDepartmentRows = uniqueDepartmentRows(
      departmentRows,
      preferredDepartmentId,
    );

    const entitlementsPromise = isPlatformPrimaryTenant ? Promise.resolve<any>(null) : apiFetchIfAllowed<any>('/subscription-plans/entitlements', session, [
      'reports.read',
      'settings.manage',
      'identity.users.manage',
      'identity.users.read',
      'identity.roles.manage',
      'branches.manage',
      'departments.manage',
      'patient_subscriptions.manage',
      'patient_subscriptions.read',
      'patient_subscriptions.create',
      'home_care.manage',
      'home_care.read',
      'home_care.create',
      'platform.subscriptions.manage',
    ], null);
    const [
      patientRows,
      appointmentRows,
      queueRows,
      consultationRows,
      invoiceRows,
      ipRows,
      practitionerRows,
      scheduleRows,
      entitlements,
      sidebarRoleMap,
    ] = await Promise.all([
      isPlatformPrimaryTenant ? Promise.resolve<any[]>([]) : apiFetchIfAllowed<any[]>('/patients', session, ['patients.read', 'patients.create', 'patients.write'], []),
      isPlatformPrimaryTenant ? Promise.resolve<any[]>([]) : apiFetchIfAllowed<any[]>('/appointments', session, ['appointments.manage', 'appointments.read', 'appointments.create'], []),
      isPlatformPrimaryTenant ? Promise.resolve<any[]>([]) : apiFetchIfAllowed<any[]>('/queue?include_completed=true', session, 'queue.manage', []),
      isPlatformPrimaryTenant ? Promise.resolve<any[]>([]) : apiFetchIfAllowed<any[]>('/consultations', session, 'consultations.read', []),
      isPlatformPrimaryTenant ? Promise.resolve<any[]>([]) : apiFetchIfAllowed<any[]>('/billing/invoices', session, 'billing.manage', []),
      isPlatformPrimaryTenant ? Promise.resolve<any[]>([]) : apiFetchIfAllowed<any[]>('/ip/admissions', session, ['ip.manage', 'ip.read'], []),
      apiFetchIfAllowed<any[]>('/practitioners', session, [...referenceReadPermissions, 'practitioners.create'], []),
      apiFetchIfAllowed<any[]>('/practitioners/schedules?is_active=true', session, [...referenceReadPermissions, 'practitioners.create'], []),
      entitlementsPromise,
      apiFetch('/settings/sidebar-modules', session).catch(() => ({})),
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
      scopedDepartmentRows = doctorDepartmentIds.size ? uniqueDepartmentRows(departmentRows.filter((row: any) => doctorDepartmentIds.has(row.id)), preferredDepartmentId) : [];
      setDoctorScope({
        practitionerId: linkedPractitioner?.id || null,
        branchIds: Array.from(doctorBranchIds),
        departmentIds: Array.from(doctorDepartmentIds),
      });
    } else {
      setDoctorScope(null);
    }

    setLiveTenants(activeTenantOptions(tenantRows));
    setLiveBranches(scopedBranchRows);
    setLiveDepartments(scopedDepartmentRows);
    const currentPreferredBranchId =
      liveBranchIdRef.current || branchIdRef.current;
    const currentPreferredDepartmentId = departmentIdRef.current;
    const backendBranchId =
      scopedBranchRows.find(
        (row: any) => row.id === currentPreferredBranchId,
      )?.id ||
      scopedBranchRows.find((row: any) => row.id === session.user?.branch_id)
        ?.id ||
      scopedBranchRows[0]?.id ||
      '';
    if (backendBranchId) {
      setCurrentLiveBranch(backendBranchId);
      saveWorkspace(session, {branchId: backendBranchId});
    }
    const nextDepartmentId =
      scopedDepartmentRows.find(
        (row: any) => row.id === currentPreferredDepartmentId,
      )?.id ||
      scopedDepartmentRows[0]?.id ||
      '';
    if (nextDepartmentId && nextDepartmentId !== departmentIdRef.current) {
      departmentIdRef.current = nextDepartmentId;
      setDepartmentId(nextDepartmentId);
      saveWorkspace(session, {departmentId: nextDepartmentId});
    }

    const mappedPatients = patientRows.map(mapPatient);
    const patientMap = new Map<string, any>(mappedPatients.map((p: any) => [p.id, p]));
    const practitionerMap = new Map<string, any>(practitionerRows.map((practitioner: any) => [practitioner.id, practitioner]));
    const mappedAppointments = appointmentRows.map((a: any) =>
      mapAppointment(a, queueRows, consultationRows, patientMap, practitionerMap, session.tenantId, backendBranchId, scheduleRows),
    );

    setPatients(mappedPatients);
    setLivePractitioners(practitionerRows);
    setAppointments(mappedAppointments);
    setIpAdmissions(ipRows);
    setLiveInvoices(invoiceRows);
    setEnabledModules(entitlements?.enabled_modules?.length ? entitlements.enabled_modules : defaultEntitlementModuleIds);
    setRoleModuleOverrides(normalizeSidebarModuleMap(sidebarRoleMap));
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
    function handleSessionExpired() {
      clearLocalSession('Session expired. Please sign in again.');
    }

    window.addEventListener('unhandledrejection', handleUnhandled);
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    const raw = localStorage.getItem('medizinhub.session');
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        const workspace = readWorkspace(saved);
        const restoredActive =
          workspace.active ||
          (saved.user?.is_super_admin ? 'superadmin' : 'dashboard');
        const restoredBranchId = workspace.branchId || '';
        const restoredDepartmentId =
          workspace.departmentId || defaultDepartment.id;
        activeRef.current = restoredActive;
        liveBranchIdRef.current = restoredBranchId;
        departmentIdRef.current = restoredDepartmentId;
        setActive(restoredActive);
        setLiveBranchId(restoredBranchId);
        setDepartmentId(restoredDepartmentId);
        setApiSession(saved);
        const savedRole = saved.user?.roles?.[0] || (saved.user?.is_super_admin ? 'super_admin' : 'tenant_admin');
        setRole(savedRole);
        setAuthenticated(true);
        loadLiveData(saved).catch((err:any) => {
          setLiveStatus(err.message || 'Connected, but live data could not be loaded.');
        });
      } catch {
        localStorage.removeItem('medizinhub.session');
      }
    }

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandled);
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  useEffect(() => {
    if (!apiSession) return;
    const refreshLiveData = () => {
      if (document.visibilityState === 'hidden') return;
      loadLiveData(apiSession).catch((err:any) => {
        setLiveStatus(err.message || 'Connected, but live data could not be refreshed.');
      });
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'medizinhub.entitlements.refresh') refreshLiveData();
    };
    window.addEventListener('focus', refreshLiveData);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('medizinhub.entitlements.refresh', refreshLiveData);
    document.addEventListener('visibilitychange', refreshLiveData);
    return () => {
      window.removeEventListener('focus', refreshLiveData);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('medizinhub.entitlements.refresh', refreshLiveData);
      document.removeEventListener('visibilitychange', refreshLiveData);
    };
  }, [apiSession?.token, apiSession?.tenantId]);

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
        `Backend is not reachable at ${API_BASE}. Start the FastAPI backend, then open ${API_BASE}/health.`
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
    const workspace = readWorkspace(session);
    setApiSession(session);
    const nextRole = body.user.roles?.[0] || (body.user.is_super_admin ? 'super_admin' : 'tenant_admin');
    const nextActive =
      workspace.active ||
      (nextRole === 'super_admin' ? 'superadmin' : 'dashboard');
    activeRef.current = nextActive;
    liveBranchIdRef.current = workspace.branchId || '';
    departmentIdRef.current =
      workspace.departmentId || defaultDepartment.id;
    setRole(nextRole);
    setActive(nextActive);
    setLiveBranchId(liveBranchIdRef.current);
    setDepartmentId(departmentIdRef.current);
    setAuthenticated(true);
    await loadLiveData(session).catch((err:any) => {
      setLiveStatus(err.message || 'Connected, but live data could not be loaded.');
    });
  }

  async function handleLogout() {
    const sessionToRevoke = apiSession;
    clearLocalSession('Logged out');
    if (sessionToRevoke) {
      apiFetch('/auth/logout', sessionToRevoke, {method: 'POST'}).catch(() => {});
    }
  }

  async function switchTenant(tenantId: string) {
    if (!apiSession || !tenantId) return;
    const next = {...apiSession, tenantId};
    const workspace = readWorkspace(next);
    localStorage.setItem('medizinhub.session', JSON.stringify(next));
    setApiSession(next);
    const nextActive =
      workspace.active ||
      (next.user?.is_super_admin ? 'superadmin' : 'dashboard');
    activeRef.current = nextActive;
    liveBranchIdRef.current = workspace.branchId || '';
    departmentIdRef.current =
      workspace.departmentId || defaultDepartment.id;
    setActive(nextActive);
    setLiveBranchId(liveBranchIdRef.current);
    setDepartmentId(departmentIdRef.current);
    setLiveBranches([]);
    setLiveDepartments([]);
    setLiveStatus(`Switching to ${tenantId}...`);
    await loadLiveData(next).catch((err:any) => {
      setLiveStatus(err.message || 'Tenant switched, but live data could not be loaded.');
    });
  }

  function changeClinic(id: string) {
    setClinicId(id);
    if (!apiSession && activeRef.current !== 'dashboard')
      updateActive('dashboard');
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
    modules: enabledModules,
    branches: branchOptions,
    departments: departmentOptions.map((department: any) => department.id),
    consultationFees: {},
  };
  const branch = branchOptions.find((b: any) => b.id === effectiveBranchId) || branchOptions[0] || defaultBranch;
  const allowedDepartments = departmentOptions;

  function selectBranch(id: string) {
    if (liveBranches.length) {
      setCurrentLiveBranch(id);
    } else {
      branchIdRef.current = id;
      setBranchId(id);
    }
    if (apiSession) saveWorkspace(apiSession, {branchId: id});
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
    setDepartmentId: updateDepartment,
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
  const permissionModules = new Set<string>();
  const permissionKeys = apiSession?.user?.permissions || [];
  const navHasAnyPermission = (...keys: string[]) =>
    Boolean(apiSession?.user?.is_super_admin || permissionKeys.includes('*') || keys.some((key) => permissionKeys.includes(key)));
  const isTenantAdminUser = Boolean(!isSuperAdmin && (role === 'tenant_admin' || apiSession?.user?.roles?.includes('tenant_admin') || apiSession?.user?.user_type === 'tenant_admin'));
  const canOpenTenantAdmin = Boolean(!isSuperAdmin && navHasAnyPermission('identity.users.manage', 'identity.users.create', 'identity.users.read', 'identity.users.edit', 'identity.users.delete', 'identity.roles.manage', 'identity.roles.read', 'settings.manage', 'branches.manage', 'branches.read', 'departments.manage', 'departments.read'));
  if (canOpenTenantAdmin) permissionModules.add('admin');
  if (navHasAnyPermission('appointments.manage', 'appointments.create', 'appointments.read', 'appointments.edit')) permissionModules.add('appointments');
  if (navHasAnyPermission('queue.manage')) permissionModules.add('queue');
  if (navHasAnyPermission('patients.read', 'patients.write', 'patients.create', 'patients.edit')) permissionModules.add('patients');
  if (navHasAnyPermission('practitioners.manage', 'practitioners.read', 'practitioners.create', 'practitioners.edit')) permissionModules.add('practitioners');
  if (navHasAnyPermission('scheduling.manage', 'scheduling.read', 'scheduling.create', 'scheduling.edit', 'scheduling.delete')) permissionModules.add('scheduling');
  if (navHasAnyPermission('pharmacy.manage', 'pharmacy.read', 'pharmacy.create', 'pharmacy.edit', 'lab.manage', 'lab.read', 'lab.create', 'lab.edit', 'physiotherapy.manage', 'physiotherapy.read', 'physiotherapy.create', 'physiotherapy.edit', 'home_care.manage', 'home_care.read', 'home_care.create', 'home_care.edit')) permissionModules.add('items');
  if (navHasAnyPermission('ip.manage', 'ip.read', 'ip.create', 'ip.edit', 'ip.delete')) permissionModules.add('ip');
  if (navHasAnyPermission('consultations.read', 'consultations.write', 'consultations.sign')) {
    permissionModules.add('doctor');
    permissionModules.add('consultation');
  }
  if (navHasAnyPermission('lab.manage', 'lab.read', 'lab.create', 'lab.edit')) permissionModules.add('lab');
  if (navHasAnyPermission('pharmacy.manage', 'pharmacy.read', 'pharmacy.create', 'pharmacy.edit')) permissionModules.add('pharmacy');
  if (navHasAnyPermission('physiotherapy.manage', 'physiotherapy.read', 'physiotherapy.create', 'physiotherapy.edit', 'physiotherapy.delete')) permissionModules.add('physiotherapy');
  if (navHasAnyPermission('home_care.manage', 'home_care.read', 'home_care.create', 'home_care.edit', 'home_care.delete')) permissionModules.add('home_care');
  if (navHasAnyPermission('billing.manage', 'invoices.read', 'invoices.create', 'payments.manage')) permissionModules.add('billing');
  if (isTenantAdminUser || canOpenTenantAdmin || navHasAnyPermission('patient_subscriptions.manage', 'patient_subscriptions.read', 'patient_subscriptions.create')) permissionModules.add('subscriptions');
  if ((isSuperAdmin || isTenantAdminUser) && navHasAnyPermission('reports.read', 'audit.read')) permissionModules.add('reports');
  const isTenantAdminDashboardUser = Boolean(!isSuperAdmin && (role === 'tenant_admin' || apiSession?.user?.roles?.includes('tenant_admin') || apiSession?.user?.user_type === 'tenant_admin'));
  // Role-based sidebar control: when the user has one or more predefined roles, the
  // sidebar is gated strictly by those roles' module lists (e.g. reception never sees
  // the doctor module, even if a stray permission would otherwise expose it). Only
  // users with no recognized role fall back to permission-derived modules.
  // Tenant-admin-configurable per-role sidebar modules override the built-in defaults
  // (lib/navigation.ts). Unconfigured roles keep their defaults.
  const roleAllowedModules = resolveSidebarModules({
    user: apiSession?.user,
    fallbackRole: role,
    defaults: roleModules,
    overrides: roleModuleOverrides,
    permissionModules,
  });
  const enabled = (id: string) => {
    if (id === 'dashboard') return isTenantAdminDashboardUser;
    if (id === 'reports') return Boolean(isSuperAdmin || isTenantAdminUser) && canOpenModule(id, roleAllowedModules, clinic);
    return canOpenModule(id, roleAllowedModules, clinic);
  };

  return {
    authenticated,
    authScreenProps: {role, setRole, onLogin: handleLogin, demoUsers, loginPresets},
    shellProps: {
      active,
      setActive: updateActive,
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
      setDepartmentId: updateDepartment,
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

function activeTenantOptions(tenants: any[]) {
  const seen = new Set<string>();
  return (tenants || []).filter((tenant: any) => {
    if (tenant.status === "suspended") return false;
    const key = String(tenant.name || tenant.id || "").trim().toLowerCase();
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
}
