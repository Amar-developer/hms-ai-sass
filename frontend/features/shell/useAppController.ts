"use client";

import { useEffect, useRef, useState } from "react";
import {
  API_BASE,
  AUTH_SESSION_EXPIRED_EVENT,
  LIVE_DATA_CHANGED_STORAGE_KEY,
  RequestTimeoutError,
  apiFetch,
  type ApiErrorLike,
  fetchWithTimeout,
  type ApiSession,
} from "@/lib/api";
import { demoUsers, loginPresets } from "@/lib/authPresets";
import { type LiveSummary, mapAppointment, mapPatient } from "@/lib/liveData";
import { canOpenModule } from "@/lib/moduleAccess";
import { fetchPatientReferences } from "@/features/patients/components/PatientSearchSelect";
import {
  formatClientLogArguments,
  reportClientError,
  storedClientLogSession,
} from "@/lib/clientLogging";
import { nav } from "@/lib/navigation";
import { uniqueDepartmentRows } from "@/lib/options";
import { navigationModulesForPermissions } from "@/lib/permissionNavigation";
import { activeTenantOptions } from "@/utils/helper";

const allModuleIds = nav.map(([id]) => id);
const defaultEntitlementModuleIds = Array.from(
  new Set([...allModuleIds, "patient_subscriptions"]),
);
const defaultBranch = {
  id: "default-branch",
  name: "Default Branch",
  city: "",
};
const defaultDepartment = {
  id: "general",
  name: "General Medicine",
  prefix: "GEN",
};

type WorkspaceState = {
  active?: string;
  branchId?: string;
  departmentId?: string;
};

function workspaceKey(session: ApiSession) {
  const userKey = session.user?.id || session.email || "user";
  return `medizinhub.workspace.${userKey}.${session.tenantId}`;
}

function readWorkspace(session: ApiSession): WorkspaceState {
  try {
    return JSON.parse(localStorage.getItem(workspaceKey(session)) || "{}");
  } catch {
    return {};
  }
}

function saveWorkspace(session: ApiSession, patch: WorkspaceState) {
  const current = readWorkspace(session);
  localStorage.setItem(
    workspaceKey(session),
    JSON.stringify({ ...current, ...patch }),
  );
}

export function useAppController() {
  const [authenticated, setAuthenticated] = useState(false);
  const [apiSession, setApiSession] = useState<ApiSession | null>(null);
  const [liveSummary, setLiveSummary] = useState<LiveSummary | null>(null);
  const [liveBranchId, setLiveBranchId] = useState("");
  const [liveBranches, setLiveBranches] = useState<any[]>([]);
  const [liveDepartments, setLiveDepartments] = useState<any[]>([]);
  const [liveTenants, setLiveTenants] = useState<any[]>([]);
  const [doctorScope, setDoctorScope] = useState<any | null>(null);
  const [livePractitioners, setLivePractitioners] = useState<any[]>([]);
  const [liveInvoices, setLiveInvoices] = useState<any[]>([]);
  const [enabledModules, setEnabledModules] = useState<string[]>(
    defaultEntitlementModuleIds,
  );
  const [liveStatus, setLiveStatus] = useState("Not connected");
  const [role, setRole] = useState("tenant_admin");
  const [showPassword, setShowPassword] = useState(false);
  const [active, setActive] = useState("dashboard");
  const [clinicId, setClinicId] = useState("preview");
  const [branchId, setBranchId] = useState(defaultBranch.id);
  const [departmentId, setDepartmentId] = useState(defaultDepartment.id);
  const [patients, setPatients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [ipAdmissions, setIpAdmissions] = useState<any[]>([]);
  const activeRef = useRef(active);
  const branchIdRef = useRef(branchId);
  const liveBranchIdRef = useRef(liveBranchId);
  const departmentIdRef = useRef(departmentId);
  const liveDataRequestRef = useRef(0);
  const mutationRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  function updateActive(value: string) {
    activeRef.current = value;
    setActive(value);
    if (apiSession) saveWorkspace(apiSession, { active: value });
  }

  function updateDepartment(value: string) {
    departmentIdRef.current = value;
    setDepartmentId(value);
    if (apiSession) saveWorkspace(apiSession, { departmentId: value });
  }

  function setCurrentLiveBranch(value: string) {
    liveBranchIdRef.current = value;
    setLiveBranchId(value);
  }

  function hasPermission(session: ApiSession, permission: string) {
    const keys = session.user?.permissions || [];
    return (
      session.user?.is_super_admin ||
      keys.includes("*") ||
      keys.includes(permission)
    );
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
    } catch (error) {
      const apiError = error as ApiErrorLike;
      if (apiError.permissionDenied || apiError.status === 404) return fallback;
      throw error;
    }
  }

  function clearLocalSession(status = "Logged out") {
    localStorage.removeItem("medizinhub.session");
    sessionStorage.removeItem("medizinhub.session");
    setApiSession(null);
    setAuthenticated(false);
    setLiveSummary(null);
    setLiveInvoices([]);
    setLiveBranchId("");
    setLiveBranches([]);
    setLiveDepartments([]);
    setLiveTenants([]);
    setDoctorScope(null);
    setLivePractitioners([]);
    setPatients([]);
    setAppointments([]);
    setIpAdmissions([]);
    activeRef.current = "dashboard";
    liveBranchIdRef.current = "";
    departmentIdRef.current = defaultDepartment.id;
    setActive("dashboard");
    setRole("tenant_admin");
    setShowPassword(false);
    setLiveStatus(status);
  }

  async function loadLiveData(session: ApiSession) {
    if (mutationRefreshTimerRef.current) {
      clearTimeout(mutationRefreshTimerRef.current);
      mutationRefreshTimerRef.current = null;
    }
    const requestRevision = ++liveDataRequestRef.current;
    setLiveStatus("Refreshing application data...");
    const referenceReadPermissions = [
      "settings.manage",
      "settings.read",
      "branches.manage",
      "branches.read",
      "departments.manage",
      "departments.read",
      "appointments.manage",
      "appointments.create",
      "appointments.read",
      "scheduling.manage",
      "scheduling.read",
      "practitioners.manage",
      "practitioners.read",
    ];
    const tenantRowsPromise = session.user?.is_super_admin
      ? apiFetchIfAllowed<any[]>(
          "/tenants",
          session,
          "platform.tenants.manage",
          [],
        )
      : Promise.resolve<any[]>([]);
    const [tenantRows, branchRows, departmentRows] = await Promise.all([
      tenantRowsPromise,
      apiFetchIfAllowed<any[]>(
        `/tenants/${session.tenantId}/branches`,
        session,
        referenceReadPermissions,
        [],
      ),
      apiFetchIfAllowed<any[]>(
        `/tenants/${session.tenantId}/departments`,
        session,
        referenceReadPermissions,
        [],
      ),
    ]);
    if (requestRevision !== liveDataRequestRef.current) return;
    const activeTenant = tenantRows.find(
      (tenant: any) => tenant.id === session.tenantId,
    );
    const isPlatformPrimaryTenant = Boolean(
      session.user?.is_super_admin &&
      (activeTenant?.is_primary ||
        session.user?.tenant_id === session.tenantId),
    );
    const isDoctorUser =
      session.user?.user_type === "doctor" ||
      session.user?.roles?.includes("doctor");
    let scopedBranchRows = branchRows;
    const preferredDepartmentId = departmentIdRef.current;
    let scopedDepartmentRows = uniqueDepartmentRows(
      departmentRows,
      preferredDepartmentId,
    );

    const entitlementsPromise = isPlatformPrimaryTenant
      ? Promise.resolve<any>(null)
      : apiFetchIfAllowed<any>(
          "/subscription-plans/entitlements",
          session,
          [
            "reports.read",
            "settings.manage",
            "identity.users.manage",
            "identity.users.read",
            "identity.roles.manage",
            "branches.manage",
            "departments.manage",
            "patient_subscriptions.manage",
            "patient_subscriptions.read",
            "patient_subscriptions.create",
            "home_care.manage",
            "home_care.read",
            "home_care.create",
            "platform.subscriptions.manage",
          ],
          null,
        );
    const [
      patientCountResult,
      appointmentRows,
      queueRows,
      consultationRows,
      invoiceRows,
      ipRows,
      practitionerRows,
      scheduleRows,
      entitlements,
    ] = await Promise.all([
      isPlatformPrimaryTenant
        ? Promise.resolve<{ total: number }>({ total: 0 })
        : apiFetchIfAllowed<{ total: number }>(
            "/patients/count",
            session,
            ["patients.read", "patients.create", "patients.write"],
            { total: 0 },
          ),
      isPlatformPrimaryTenant
        ? Promise.resolve<any[]>([])
        : apiFetchIfAllowed<any[]>(
            "/appointments",
            session,
            ["appointments.manage", "appointments.read", "appointments.create"],
            [],
          ),
      isPlatformPrimaryTenant
        ? Promise.resolve<any[]>([])
        : apiFetchIfAllowed<any[]>(
            "/queue?include_completed=true",
            session,
            ["queue.manage", "queue.read"],
            [],
          ),
      isPlatformPrimaryTenant
        ? Promise.resolve<any[]>([])
        : apiFetchIfAllowed<any[]>(
            "/consultations",
            session,
            "consultations.read",
            [],
          ),
      isPlatformPrimaryTenant
        ? Promise.resolve<any[]>([])
        : apiFetchIfAllowed<any[]>(
            "/billing/invoices",
            session,
            ["billing.manage", "billing.read", "invoices.read"],
            [],
          ),
      isPlatformPrimaryTenant
        ? Promise.resolve<any[]>([])
        : apiFetchIfAllowed<any[]>(
            "/ip/admissions",
            session,
            ["ip.manage", "ip.read"],
            [],
          ),
      apiFetchIfAllowed<any[]>(
        "/practitioners",
        session,
        [...referenceReadPermissions, "practitioners.create"],
        [],
      ),
      apiFetchIfAllowed<any[]>(
        "/practitioners/schedules?is_active=true",
        session,
        ["scheduling.manage", "scheduling.read", "practitioners.manage"],
        [],
      ),
      entitlementsPromise,
    ]);
    const referencedPatientIds = [
      ...appointmentRows.map((row: any) => row.patient_id),
      ...invoiceRows.map((row: any) => row.patient_id),
      ...ipRows.map((row: any) => row.patient_id || row.patientId),
    ];
    const patientRows = isPlatformPrimaryTenant
      ? []
      : await fetchPatientReferences(session, referencedPatientIds).catch(
          () => [],
        );
    // Focus, navigation, and mutation events can request overlapping refreshes.
    // Only the newest response may update shared state, otherwise a slower old
    // request can overwrite a just-saved record with stale data.
    if (requestRevision !== liveDataRequestRef.current) return;

    const linkedPractitioner = isDoctorUser
      ? practitionerRows.find(
          (practitioner: any) => practitioner.user_id === session.user?.id,
        )
      : null;
    const doctorBranchIds = new Set(
      [
        ...(linkedPractitioner?.branch_ids || []),
        session.user?.branch_id,
      ].filter(Boolean),
    );
    const doctorDepartmentIds = new Set(
      (linkedPractitioner?.department_ids || []).filter(Boolean),
    );
    if (isDoctorUser) {
      scopedBranchRows = doctorBranchIds.size
        ? branchRows.filter((row: any) => doctorBranchIds.has(row.id))
        : [];
      scopedDepartmentRows = doctorDepartmentIds.size
        ? uniqueDepartmentRows(
            departmentRows.filter((row: any) =>
              doctorDepartmentIds.has(row.id),
            ),
            preferredDepartmentId,
          )
        : [];
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
      scopedBranchRows.find((row: any) => row.id === currentPreferredBranchId)
        ?.id ||
      scopedBranchRows.find((row: any) => row.id === session.user?.branch_id)
        ?.id ||
      scopedBranchRows[0]?.id ||
      "";
    if (backendBranchId) {
      setCurrentLiveBranch(backendBranchId);
      saveWorkspace(session, { branchId: backendBranchId });
    }
    const nextDepartmentId =
      scopedDepartmentRows.find(
        (row: any) => row.id === currentPreferredDepartmentId,
      )?.id ||
      scopedDepartmentRows[0]?.id ||
      "";
    if (nextDepartmentId && nextDepartmentId !== departmentIdRef.current) {
      departmentIdRef.current = nextDepartmentId;
      setDepartmentId(nextDepartmentId);
      saveWorkspace(session, { departmentId: nextDepartmentId });
    }

    const mappedPatients = patientRows.map(mapPatient);
    const patientMap = new Map<string, any>(
      mappedPatients.map((p: any) => [p.id, p]),
    );
    const practitionerMap = new Map<string, any>(
      practitionerRows.map((practitioner: any) => [
        practitioner.id,
        practitioner,
      ]),
    );
    const mappedAppointments = appointmentRows.map((a: any) =>
      mapAppointment(
        a,
        queueRows,
        consultationRows,
        patientMap,
        practitionerMap,
        session.tenantId,
        backendBranchId,
        scheduleRows,
      ),
    );

    setPatients(mappedPatients);
    setLivePractitioners(practitionerRows);
    setAppointments(mappedAppointments);
    setIpAdmissions(ipRows);
    setLiveInvoices(invoiceRows);
    setEnabledModules(
      entitlements?.enabled_modules?.length
        ? entitlements.enabled_modules
        : defaultEntitlementModuleIds,
    );
    setLiveSummary({
      patients: Number(patientCountResult?.total || 0),
      appointments: appointmentRows.length,
      queue: queueRows.length,
      invoices: invoiceRows.length,
      invoiceBalance: invoiceRows.reduce(
        (sum: number, row: any) => sum + Number(row.balance_amount || 0),
        0,
      ),
    });
    setLiveStatus(`Connected to ${session.email}`);
  }

  useEffect(() => {
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;
    console.warn = (...values: unknown[]) => {
      originalConsoleWarn(...values);
      reportClientError(
        new Error(formatClientLogArguments(values)),
        {
          event: "frontend.console_warning",
          module: "console",
          level: "warning",
          category: "frontend",
        },
        storedClientLogSession(),
      );
    };
    console.error = (...values: unknown[]) => {
      originalConsoleError(...values);
      reportClientError(
        new Error(formatClientLogArguments(values)),
        {
          event: "frontend.console_error",
          module: "console",
          level: "error",
          category: "frontend",
        },
        storedClientLogSession(),
      );
    };

    function handleUnhandled(event: PromiseRejectionEvent) {
      event.preventDefault();
      const reason = event.reason;
      reportClientError(
        reason,
        {
          event: "frontend.unhandled_rejection",
          module: "shell",
        },
        storedClientLogSession(),
      );
      setLiveStatus(
        reason?.message ||
          "A backend request failed, but the app is still running.",
      );
    }
    function handleWindowError(event: ErrorEvent) {
      reportClientError(
        event.error || event.message,
        {
          event: "frontend.window_error",
          module: "shell",
        },
        storedClientLogSession(),
      );
    }
    function handleSessionExpired() {
      clearLocalSession("Session expired. Please sign in again.");
    }

    window.addEventListener("unhandledrejection", handleUnhandled);
    window.addEventListener("error", handleWindowError);
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    const raw = localStorage.getItem("medizinhub.session");
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        const workspace = readWorkspace(saved);
        const restoredActive =
          workspace.active ||
          (saved.user?.is_super_admin ? "superadmin" : "dashboard");
        const restoredBranchId = workspace.branchId || "";
        const restoredDepartmentId =
          workspace.departmentId || defaultDepartment.id;
        activeRef.current = restoredActive;
        liveBranchIdRef.current = restoredBranchId;
        departmentIdRef.current = restoredDepartmentId;
        setActive(restoredActive);
        setLiveBranchId(restoredBranchId);
        setDepartmentId(restoredDepartmentId);
        setApiSession(saved);
        const savedRole =
          saved.user?.roles?.[0] ||
          (saved.user?.is_super_admin ? "super_admin" : "tenant_admin");
        setRole(savedRole);
        setAuthenticated(true);
        loadLiveData(saved).catch((err: any) => {
          setLiveStatus(
            err.message || "Connected, but live data could not be loaded.",
          );
        });
      } catch {
        localStorage.removeItem("medizinhub.session");
      }
    }

    return () => {
      console.warn = originalConsoleWarn;
      console.error = originalConsoleError;
      window.removeEventListener("unhandledrejection", handleUnhandled);
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener(
        AUTH_SESSION_EXPIRED_EVENT,
        handleSessionExpired,
      );
    };
  }, []);

  useEffect(() => {
    if (!apiSession) return;
    const refreshCurrentUser = async () => {
      try {
        const freshUser = await apiFetch("/auth/me", apiSession);
        const next = { ...apiSession, user: freshUser };
        localStorage.setItem("medizinhub.session", JSON.stringify(next));
        setApiSession(next);
      } catch {
        // Session may have been revoked; loadLiveData below will surface any auth error.
      }
    };
    const refreshLiveData = () => {
      if (document.visibilityState === "hidden") return;
      refreshCurrentUser();
      loadLiveData(apiSession).catch((err: any) => {
        setLiveStatus(
          err.message || "Connected, but live data could not be refreshed.",
        );
      });
    };
    const scheduleMutationRefresh = () => {
      if (document.visibilityState === "hidden") return;
      if (mutationRefreshTimerRef.current) {
        clearTimeout(mutationRefreshTimerRef.current);
      }
      // Most modules already call loadLiveData after their own save. The short
      // delay lets that explicit refresh cancel this fallback while coalescing
      // multi-request operations into one shared refresh.
      mutationRefreshTimerRef.current = setTimeout(() => {
        mutationRefreshTimerRef.current = null;
        refreshLiveData();
      }, 50);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "medizinhub.entitlements.refresh") {
        scheduleMutationRefresh();
        return;
      }
      if (event.key !== LIVE_DATA_CHANGED_STORAGE_KEY || !event.newValue)
        return;
      try {
        const detail = JSON.parse(event.newValue);
        if (detail?.tenantId && detail.tenantId !== apiSession.tenantId) return;
        scheduleMutationRefresh();
      } catch {
        scheduleMutationRefresh();
      }
    };
    window.addEventListener("focus", refreshLiveData);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("medizinhub.entitlements.refresh", refreshLiveData);
    document.addEventListener("visibilitychange", refreshLiveData);
    return () => {
      if (mutationRefreshTimerRef.current) {
        clearTimeout(mutationRefreshTimerRef.current);
        mutationRefreshTimerRef.current = null;
      }
      window.removeEventListener("focus", refreshLiveData);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        "medizinhub.entitlements.refresh",
        refreshLiveData,
      );
      document.removeEventListener("visibilitychange", refreshLiveData);
    };
    // }, [apiSession?.tenantId]);
  }, [apiSession, apiSession?.tenantId]);

  async function handleLogin(input: { email: string; password: string }) {
    setLiveStatus("Signing in...");
    let res: Response;
    try {
      res = await fetchWithTimeout(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: input.email, password: input.password }),
      });
    } catch (error) {
      if (error instanceof RequestTimeoutError) {
        throw new Error("Sign-in timed out. Please try again.");
      }
      throw new Error(
        `Backend is not reachable at ${API_BASE}. Start the FastAPI backend, then open ${API_BASE}/health.`,
      );
    }
    if (!res.ok) {
      let detail = "Login failed";
      try {
        const body = await res.json();
        detail = body.detail || detail;
      } catch {}
      throw new Error(detail);
    }

    const body = await res.json();
    let tenantId = body.user?.tenant_id || "";
    if (body.user?.is_super_admin) {
      let tenantsRes: Response;
      try {
        tenantsRes = await fetchWithTimeout(`${API_BASE}/tenants`, {
          credentials: "include",
        });
      } catch (error) {
        if (error instanceof RequestTimeoutError) {
          throw new Error("Sign-in succeeded, but loading tenants timed out.");
        }
        throw new Error(
          `Login succeeded, but tenants could not be loaded from ${API_BASE}/tenants.`,
        );
      }
      if (tenantsRes.ok) {
        const tenants = await tenantsRes.json();
        tenantId = tenants[0]?.id || "";
      } else {
        let detail = "Could not load tenants for super admin.";
        try {
          const body = await tenantsRes.json();
          detail = body.detail || detail;
        } catch {}
        throw new Error(detail);
      }
    }
    if (!tenantId) throw new Error("No tenant is available for this user.");

    const session = {
      tenantId,
      email: input.email,
      user: body.user,
    };
    localStorage.setItem("medizinhub.session", JSON.stringify(session));
    const workspace = readWorkspace(session);
    setApiSession(session);
    const nextRole =
      body.user.roles?.[0] ||
      (body.user.is_super_admin ? "super_admin" : "tenant_admin");
    const nextActive = nextRole === "super_admin" ? "superadmin" : "dashboard";
    activeRef.current = nextActive;
    liveBranchIdRef.current = workspace.branchId || "";
    departmentIdRef.current = workspace.departmentId || defaultDepartment.id;
    setRole(nextRole);
    setActive(nextActive);
    saveWorkspace(session, { active: nextActive });
    setLiveBranchId(liveBranchIdRef.current);
    setDepartmentId(departmentIdRef.current);
    setAuthenticated(true);
    void loadLiveData(session).catch((err: any) => {
      setLiveStatus(
        err.message || "Connected, but live data could not be loaded.",
      );
    });
  }

  function refreshLiveDataInBackground(session: ApiSession): Promise<void> {
    void loadLiveData(session).catch((err: any) => {
      setLiveStatus(
        err.message || "Saved, but application data could not be refreshed.",
      );
    });
    return Promise.resolve();
  }

  async function handleLogout() {
    const sessionToRevoke = apiSession;
    clearLocalSession("Logged out");
    if (sessionToRevoke) {
      apiFetch("/auth/logout", sessionToRevoke, { method: "POST" }).catch(
        () => {},
      );
    }
  }

  async function switchTenant(tenantId: string) {
    if (!apiSession || !tenantId) return;
    const next = { ...apiSession, tenantId };
    const workspace = readWorkspace(next);
    localStorage.setItem("medizinhub.session", JSON.stringify(next));
    setApiSession(next);
    const nextActive =
      workspace.active ||
      (next.user?.is_super_admin ? "superadmin" : "dashboard");
    activeRef.current = nextActive;
    liveBranchIdRef.current = workspace.branchId || "";
    departmentIdRef.current = workspace.departmentId || defaultDepartment.id;
    setActive(nextActive);
    setLiveBranchId(liveBranchIdRef.current);
    setDepartmentId(departmentIdRef.current);
    setLiveBranches([]);
    setLiveDepartments([]);
    setLiveStatus(`Switching to ${tenantId}...`);
    await loadLiveData(next).catch((err: any) => {
      setLiveStatus(
        err.message || "Tenant switched, but live data could not be loaded.",
      );
    });
  }

  function changeClinic(id: string) {
    setClinicId(id);
    if (!apiSession && activeRef.current !== "dashboard")
      updateActive("dashboard");
  }

  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const isDoctorUser = Boolean(
    apiSession &&
    (apiSession.user?.user_type === "doctor" ||
      apiSession.user?.roles?.includes("doctor")),
  );
  const branchOptions = liveBranches.length
    ? liveBranches.map((row: any) => ({
        id: row.id,
        name: row.name,
        city: row.city,
      }))
    : apiSession
      ? []
      : [defaultBranch];
  const departmentOptions = liveDepartments.length
    ? liveDepartments.map((row: any) => ({
        id: row.id,
        name: row.name,
        prefix: row.code,
      }))
    : apiSession
      ? []
      : [defaultDepartment];
  const effectiveClinicId =
    apiSession && !isSuperAdmin ? apiSession.tenantId : clinicId;
  const effectiveBranchId = liveBranchId || branchId;
  const selectedTenant = liveTenants.find(
    (tenant: any) => tenant.id === apiSession?.tenantId,
  );
  const clinic = {
    id: apiSession ? apiSession.tenantId : clinicId,
    name:
      selectedTenant?.name ||
      apiSession?.user?.tenant_name ||
      (isSuperAdmin ? "MedizinHub HMS" : "Current Tenant"),
    type:
      branchOptions.length > 1 ? "Multi Branch Tenant" : "Single Branch Tenant",
    multiBranch: branchOptions.length > 1,
    modules: enabledModules,
    branches: branchOptions,
    departments: departmentOptions.map((department: any) => department.id),
    consultationFees: {},
  };
  const branch =
    branchOptions.find((b: any) => b.id === effectiveBranchId) ||
    branchOptions[0] ||
    defaultBranch;
  const allowedDepartments = departmentOptions;

  function selectBranch(id: string) {
    if (liveBranches.length) {
      setCurrentLiveBranch(id);
    } else {
      branchIdRef.current = id;
      setBranchId(id);
    }
    if (apiSession) saveWorkspace(apiSession, { branchId: id });
  }

  const scopedAppointments = appointments.filter((a) => {
    if (isSuperAdmin) return true;
    return (
      a.clinicId === effectiveClinicId &&
      (!effectiveBranchId || a.branchId === effectiveBranchId)
    );
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
    setLivePractitioners,
    patients,
    setPatients,
    appointments,
    setAppointments,
    ipAdmissions,
    setIpAdmissions,
    scopedAppointments,
    apiSession,
    loadLiveData: refreshLiveDataInBackground,
    liveInvoices,
  };
  const permissionKeys = apiSession?.user?.permissions || [];
  const roleAllowedModules = navigationModulesForPermissions(permissionKeys, {
    isSuperAdmin,
  });
  const enabled = (id: string) => {
    return canOpenModule(id, roleAllowedModules, clinic);
  };

  return {
    authenticated,
    authScreenProps: {
      role,
      setRole,
      onLogin: handleLogin,
      demoUsers,
      loginPresets,
    },
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
