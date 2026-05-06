'use client';

import {useEffect,useState} from 'react';
import {API_BASE,apiFetch,type ApiSession} from '@/lib/api';
import {demoUsers,loginPresets} from '@/lib/authPresets';
import {type LiveSummary,mapAppointment,mapPatient} from '@/lib/liveData';
import {canOpenModule} from '@/lib/moduleAccess';
import {clinics,departments,initialAppointments,initialIpAdmissions,initialPatients} from '@/lib/mockData';
import {nav,roleModules} from '@/lib/navigation';

export function useAppController() {
  const [authenticated, setAuthenticated] = useState(false);
  const [apiSession, setApiSession] = useState<ApiSession | null>(null);
  const [liveSummary, setLiveSummary] = useState<LiveSummary | null>(null);
  const [liveBranchId, setLiveBranchId] = useState('');
  const [liveBranches, setLiveBranches] = useState<any[]>([]);
  const [liveDepartments, setLiveDepartments] = useState<any[]>([]);
  const [liveInvoices, setLiveInvoices] = useState<any[]>([]);
  const [liveStatus, setLiveStatus] = useState('Not connected');
  const [role, setRole] = useState('tenant_admin');
  const [showPassword, setShowPassword] = useState(false);
  const [active, setActive] = useState('dashboard');
  const [clinicId, setClinicId] = useState('c3');
  const baseClinic = clinics.find((c) => c.id === clinicId)!;
  const [branchId, setBranchId] = useState(baseClinic.branches[0].id);
  const baseAllowedDepartments = departments.filter((d) => baseClinic.departments.includes(d.id));
  const [departmentId, setDepartmentId] = useState(baseAllowedDepartments[0].id);
  const [patients, setPatients] = useState<any[]>(initialPatients);
  const [appointments, setAppointments] = useState<any[]>(initialAppointments);
  const [ipAdmissions, setIpAdmissions] = useState<any[]>(initialIpAdmissions);

  function hasPermission(session: ApiSession, permission: string) {
    const keys = session.user?.permissions || [];
    return session.user?.is_super_admin || keys.includes('*') || keys.includes(permission);
  }

  async function apiFetchIfAllowed<T>(
    path: string,
    session: ApiSession,
    permission: string,
    fallback: T,
  ): Promise<T> {
    if (!hasPermission(session, permission)) return fallback;
    try {
      return await apiFetch(path, session);
    } catch {
      return fallback;
    }
  }

  async function loadLiveData(session: ApiSession) {
    setLiveStatus('Loading seeded backend data...');
    const [branchRows, departmentRows] = await Promise.all([
      apiFetchIfAllowed<any[]>(`/tenants/${session.tenantId}/branches`, session, 'settings.manage', []),
      apiFetchIfAllowed<any[]>(`/tenants/${session.tenantId}/departments`, session, 'settings.manage', []),
    ]);
    setLiveBranches(branchRows);
    setLiveDepartments(departmentRows);
    const backendBranchId = session.user?.branch_id || branchRows[0]?.id || liveBranchId || branchId;
    if (backendBranchId) setLiveBranchId(backendBranchId);
    if (departmentRows.length && !departmentRows.some((row: any) => row.id === departmentId)) {
      setDepartmentId(departmentRows[0].id);
    }

    const [patientRows, appointmentRows, queueRows, consultationRows, invoiceRows] = await Promise.all([
      apiFetchIfAllowed<any[]>('/patients', session, 'patients.read', []),
      apiFetchIfAllowed<any[]>('/appointments', session, 'appointments.manage', []),
      apiFetchIfAllowed<any[]>('/queue?include_completed=true', session, 'queue.manage', []),
      apiFetchIfAllowed<any[]>('/consultations', session, 'consultations.read', []),
      apiFetchIfAllowed<any[]>('/billing/invoices', session, 'billing.manage', []),
    ]);

    const mappedPatients = patientRows.map(mapPatient);
    const patientMap = new Map<string, any>(mappedPatients.map((p: any) => [p.id, p]));
    const mappedAppointments = appointmentRows.map((a: any) =>
      mapAppointment(a, queueRows, consultationRows, patientMap, clinicId, backendBranchId),
    );

    setPatients(mappedPatients.length ? mappedPatients : initialPatients);
    setAppointments(mappedAppointments.length ? mappedAppointments : initialAppointments);
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
    const next = clinics.find((c) => c.id === id)!;
    setClinicId(id);
    setBranchId(next.branches[0].id);
    setDepartmentId(next.departments[0]);
    if (active !== 'dashboard' && !next.modules.includes(active)) setActive('dashboard');
  }

  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const branchOptions = liveBranches.length
    ? liveBranches.map((row: any) => ({id: row.id, name: row.name, city: row.city}))
    : baseClinic.branches;
  const departmentOptions = liveDepartments.length
    ? liveDepartments.map((row: any) => ({id: row.id, name: row.name, prefix: row.code}))
    : baseAllowedDepartments;
  const effectiveClinicId = apiSession && !isSuperAdmin ? apiSession.tenantId : clinicId;
  const effectiveBranchId = liveBranchId || branchId;
  const clinic = apiSession && !isSuperAdmin
    ? {
        ...baseClinic,
        id: apiSession.tenantId,
        name: apiSession.user?.tenant_name || 'Current Tenant',
        type: branchOptions.length > 1 ? 'Multi Branch Tenant' : 'Single Branch Tenant',
        multiBranch: branchOptions.length > 1,
        branches: branchOptions,
        departments: departmentOptions.map((department: any) => department.id),
      }
    : baseClinic;
  const branch = branchOptions.find((b: any) => b.id === effectiveBranchId) || branchOptions[0];
  const allowedDepartments = departmentOptions;

  function selectBranch(id: string) {
    if (liveBranches.length) {
      setLiveBranchId(id);
    } else {
      setBranchId(id);
    }
  }

  const scopedAppointments = appointments.filter((a) => a.clinicId === effectiveClinicId && a.branchId === effectiveBranchId);
  const ctx = {
    clinic,
    branch,
    branchId: effectiveBranchId,
    departmentId,
    setDepartmentId,
    allowedDepartments,
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
  const enabled = (id: string) => canOpenModule(id, allowedForRole, clinic);

  return {
    authenticated,
    authScreenProps: {role, setRole, onLogin: handleLogin, demoUsers, loginPresets},
    shellProps: {
      active,
      setActive,
      nav,
      enabled,
      clinic,
      clinics,
      clinicId: effectiveClinicId,
      changeClinic,
      branchId: effectiveBranchId,
      setBranchId: selectBranch,
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
    },
  };
}
