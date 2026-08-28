"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  API_BASE,
  AUTH_SESSION_EXPIRED_EVENT,
  LIVE_DATA_CHANGED_EVENT,
  LIVE_DATA_CHANGED_STORAGE_KEY,
  RequestTimeoutError,
  apiFetch,
  type ApiErrorLike,
  fetchWithTimeout,
  type ApiSession,
} from "@/lib/api";
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
import {
  fetchPractitioners,
  practitionersQueryKey,
} from "@/features/doctors/api/usePractitionersQuery";
import {
  APPOINTMENT_ROWS_STALE_MS,
  CONSULTATION_ROWS_STALE_MS,
  QUEUE_ROWS_STALE_MS,
  SCHEDULE_ROWS_STALE_MS,
  appointmentRowsQueryKey,
  consultationRowsQueryKey,
  queueRowsQueryKey,
  scheduleRowsQueryKey,
} from "@/features/appointments/api/appointmentWorkspaceQueries";
import {
  TENANT_REFERENCE_STALE_MS,
  tenantBranchesQueryKey,
  tenantDepartmentsQueryKey,
} from "@/features/tenants/api/tenantReferenceQueries";
import { parseNumberingRules } from "@/features/admin/constants";
import { getResolvedSetting } from "@/features/settings/api/resolvedSettingQueries";

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
  lastPath?: string;
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
  const queryClient = useQueryClient();
  const [authenticated, setAuthenticated] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [apiSession, setApiSession] = useState<ApiSession | null>(null);
  const [liveSummary, setLiveSummary] = useState<LiveSummary | null>(null);
  const [liveBranchId, setLiveBranchId] = useState("");
  const [liveBranches, setLiveBranches] = useState<any[]>([]);
  const [liveDepartments, setLiveDepartments] = useState<any[]>([]);
  const [liveTenants, setLiveTenants] = useState<any[]>([]);
  const [doctorScope, setDoctorScope] = useState<any | null>(null);
  const [liveInvoices, setLiveInvoices] = useState<any[]>([]);
  const [numberingRules, setNumberingRules] = useState<any>(null);
  const [enabledModules, setEnabledModules] = useState<string[]>(
    defaultEntitlementModuleIds,
  );
  const [liveStatus, setLiveStatus] = useState("Not connected");
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [role, setRole] = useState("tenant_admin");
  const [showPassword, setShowPassword] = useState(false);
  const [active, setActive] = useState("dashboard");
  const [clinicId, setClinicId] = useState("preview");
  const [branchId, setBranchId] = useState(defaultBranch.id);
  const [departmentId, setDepartmentId] = useState(defaultDepartment.id);
  const [patients, setPatients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
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

  function rememberWorkspacePath(path: string) {
    if (!apiSession) return;
    if (!path || !path.startsWith("/") || path.startsWith("//")) return;
    if (path.startsWith("/login")) return;
    saveWorkspace(apiSession, { lastPath: path });
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
    const isTenantAdmin = Boolean(
      session.user?.user_type === "tenant_admin" ||
        session.user?.roles?.includes("tenant_admin"),
    );
    return (
      session.user?.is_super_admin ||
      keys.includes("*") ||
      keys.includes(permission) ||
      (isTenantAdmin && !permission.startsWith("platform."))
    );
  }

  function sessionHasAnyPermission(session: ApiSession, permissions: string[]) {
    return permissions.some((permission) => hasPermission(session, permission));
  }

  function isPlatformWorkspaceUser(session: ApiSession) {
    return Boolean(
      session.user?.is_super_admin ||
        session.user?.user_type === "platform_admin" ||
        session.user?.user_type === "support_admin",
    );
  }

  function primaryWorkspaceSection(session: ApiSession) {
    return isPlatformWorkspaceUser(session) ? "superadmin" : "dashboard";
  }

  function basePermissionKeys(session: ApiSession) {
    return session.basePermissions || session.user?.permissions || [];
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
      return await apiFetch(path, session, {
        suppressErrorReportStatuses: [402, 403, 404],
      });
    } catch (error) {
      const apiError = error as ApiErrorLike;
      if (
        apiError.permissionDenied ||
        apiError.status === 404 ||
        apiError.status === 402
      )
        return fallback;
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
    setPatients([]);
    setAppointments([]);
    activeRef.current = "dashboard";
    liveBranchIdRef.current = "";
    departmentIdRef.current = defaultDepartment.id;
    setActive("dashboard");
    setRole("tenant_admin");
    setShowPassword(false);
    setLiveStatus(status);
  }

  async function loadLiveData(
    session: ApiSession,
    options: { initial?: boolean } = {},
  ) {
    if (mutationRefreshTimerRef.current) {
      clearTimeout(mutationRefreshTimerRef.current);
      mutationRefreshTimerRef.current = null;
    }
    const requestRevision = ++liveDataRequestRef.current;
    if (options.initial) setIsInitialLoading(true);
    try {
      await loadLiveDataInner(session, requestRevision);
    } finally {
      if (options.initial) setIsInitialLoading(false);
    }
  }

  async function loadLiveDataInner(
    session: ApiSession,
    requestRevision: number,
  ) {
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
    const tenantRowsPromise = sessionHasAnyPermission(session, [
      "platform.tenants.manage",
      "platform.subscriptions.manage",
      "platform.templates.manage",
    ])
      ? apiFetchIfAllowed<any[]>(
          "/tenants",
          session,
          "platform.tenants.manage",
          [],
        )
      : Promise.resolve<any[]>([]);
    const numberingRulesPromise = sessionHasAnyPermission(session, [
      "settings.manage",
      "settings.read",
      "billing.manage",
      "invoices.read",
      "payments.manage",
    ])
      ? getResolvedSetting(
          queryClient,
          session,
          "numbering",
          "numbering.rules",
        )
          .then((setting: any) => parseNumberingRules(setting?.value, ""))
          .catch(() => null)
      : Promise.resolve(null);
    const [tenantRows, branchRows, departmentRows, resolvedNumberingRules] =
      await Promise.all([
      tenantRowsPromise,
      sessionHasAnyPermission(session, referenceReadPermissions)
        ? queryClient.fetchQuery({
            queryKey: tenantBranchesQueryKey(session.tenantId),
            queryFn: () =>
              apiFetchIfAllowed<any[]>(
                `/tenants/${session.tenantId}/branches`,
                session,
                referenceReadPermissions,
                [],
              ),
            staleTime: TENANT_REFERENCE_STALE_MS,
          })
        : Promise.resolve<any[]>([]),
      sessionHasAnyPermission(session, referenceReadPermissions)
        ? queryClient.fetchQuery({
            queryKey: tenantDepartmentsQueryKey(session.tenantId),
            queryFn: () =>
              apiFetchIfAllowed<any[]>(
                `/tenants/${session.tenantId}/departments`,
                session,
                referenceReadPermissions,
                [],
              ),
            staleTime: TENANT_REFERENCE_STALE_MS,
          })
        : Promise.resolve<any[]>([]),
      numberingRulesPromise,
    ]);
    if (requestRevision !== liveDataRequestRef.current) return;
    setNumberingRules(resolvedNumberingRules);
    const activeTenant = tenantRows.find(
      (tenant: any) => tenant.id === session.tenantId,
    );
    const isPlatformPrimaryTenant = Boolean(
      isPlatformWorkspaceUser(session) &&
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

    let entitlements: any = null;
    let subscriptionUnavailable = false;
    const entitlementReadPermissions = [
      "reports.read",
      "settings.manage",
      "identity.users.manage",
      "identity.users.read",
      "identity.roles.manage",
      "branches.manage",
      "branches.read",
      "departments.manage",
      "departments.read",
      "patient_subscriptions.manage",
      "patient_subscriptions.read",
      "patient_subscriptions.create",
      "home_care.manage",
      "home_care.read",
      "home_care.create",
      "platform.subscriptions.manage",
    ];
    if (
      !isPlatformPrimaryTenant &&
      sessionHasAnyPermission(session, entitlementReadPermissions)
    ) {
      try {
        entitlements = await apiFetch<any>(
          "/subscription-plans/entitlements",
          session,
          { suppressErrorReportStatuses: [402, 403, 404] },
        );
      } catch (error) {
        const apiError = error as ApiErrorLike;
        if (apiError.status === 402) {
          subscriptionUnavailable = true;
          entitlements = null;
        } else if (apiError.permissionDenied || apiError.status === 404) {
          entitlements = null;
        } else {
          throw error;
        }
      }
    }
    const enabledModuleKeys = new Set<string>(entitlements?.enabled_modules || []);
    const moduleAvailable = (...moduleKeys: string[]) => {
      if (isPlatformPrimaryTenant) return false;
      if (subscriptionUnavailable) return false;
      if (!entitlements?.enabled_modules?.length) return true;
      return moduleKeys.some((moduleKey) => enabledModuleKeys.has(moduleKey));
    };
    const [
      patientCountResult,
      appointmentRows,
      queueRows,
      consultationRows,
      invoiceRows,
      ipRows,
      practitionerRows,
      scheduleRows,
    ] = await Promise.all([
      !moduleAvailable("patients")
        ? Promise.resolve<{ total: number }>({ total: 0 })
        : apiFetchIfAllowed<{ total: number }>(
            "/patients/count",
            session,
            ["patients.read", "patients.create", "patients.write"],
            { total: 0 },
          ),
      !moduleAvailable("appointments")
        ? Promise.resolve<any[]>([])
        : sessionHasAnyPermission(session, [
              "appointments.manage",
              "appointments.read",
              "appointments.create",
            ])
          ? queryClient.fetchQuery({
              queryKey: appointmentRowsQueryKey(session.tenantId),
              queryFn: () =>
                apiFetchIfAllowed<any[]>(
                  "/appointments",
                  session,
                  [
                    "appointments.manage",
                    "appointments.read",
                    "appointments.create",
                  ],
                  [],
                ),
              staleTime: APPOINTMENT_ROWS_STALE_MS,
            })
          : Promise.resolve<any[]>([]),
      !moduleAvailable("queue")
        ? Promise.resolve<any[]>([])
        : sessionHasAnyPermission(session, ["queue.manage", "queue.read"])
          ? queryClient.fetchQuery({
              queryKey: queueRowsQueryKey(session.tenantId),
              queryFn: () =>
                apiFetchIfAllowed<any[]>(
                  "/queue?include_completed=true",
                  session,
                  ["queue.manage", "queue.read"],
                  [],
                ),
              staleTime: QUEUE_ROWS_STALE_MS,
            })
          : Promise.resolve<any[]>([]),
      !moduleAvailable("consultations")
        ? Promise.resolve<any[]>([])
        : sessionHasAnyPermission(session, ["consultations.read"])
          ? queryClient.fetchQuery({
              queryKey: consultationRowsQueryKey(session.tenantId),
              queryFn: () =>
                apiFetchIfAllowed<any[]>(
                  "/consultations",
                  session,
                  ["consultations.read"],
                  [],
                ),
              staleTime: CONSULTATION_ROWS_STALE_MS,
            })
          : Promise.resolve<any[]>([]),
      !moduleAvailable("billing_basic", "billing_advanced", "billing")
        ? Promise.resolve<any[]>([])
        : apiFetchIfAllowed<any[]>(
            "/billing/invoices?limit=200",
            session,
            ["billing.manage", "billing.read", "invoices.read"],
            [],
          ),
      // Admission rows themselves now come from useIpAdmissionsQuery (IP,
      // Physiotherapy, Reports all share that query's cache) — this fetch
      // stays only to feed IP-only-referenced patient ids into
      // referencedPatientIds below, until patients get their own migration.
      !moduleAvailable("ip")
        ? Promise.resolve<any[]>([])
        : apiFetchIfAllowed<any[]>(
            "/ip/admissions",
            session,
            ["ip.manage", "ip.read"],
            [],
          ),
      // The practitioner list itself now comes from usePractitionersQuery
      // (Doctors, Dashboard, DoctorConsultation, Reports all share that
      // query's cache) — this fetch stays only to compute practitionerMap
      // for appointment mapping and doctorScope below.
      !moduleAvailable("practitioners")
        ? Promise.resolve<any[]>([])
        : sessionHasAnyPermission(
              session,
              [...referenceReadPermissions, "practitioners.create"],
            )
          ? queryClient.fetchQuery({
              queryKey: practitionersQueryKey(session),
              queryFn: () => fetchPractitioners(session),
              staleTime: 60_000,
            })
          : Promise.resolve<any[]>([]),
      !moduleAvailable("scheduling")
        ? Promise.resolve<any[]>([])
        : sessionHasAnyPermission(session, [
              "scheduling.manage",
              "scheduling.read",
              "practitioners.manage",
            ])
          ? queryClient.fetchQuery({
              queryKey: scheduleRowsQueryKey(session.tenantId),
              queryFn: () =>
                apiFetchIfAllowed<any[]>(
                  "/practitioners/schedules?is_active=true",
                  session,
                  [
                    "scheduling.manage",
                    "scheduling.read",
                    "practitioners.manage",
                  ],
                  [],
                ),
              staleTime: SCHEDULE_ROWS_STALE_MS,
            })
          : Promise.resolve<any[]>([]),
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
    setAppointments(mappedAppointments);
    setLiveInvoices(invoiceRows);
    setEnabledModules(
      subscriptionUnavailable
        ? []
        : entitlements?.enabled_modules?.length
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
    let cancelled = false;

    async function restoreSession() {
      const raw = localStorage.getItem("medizinhub.session");
      if (!raw) {
        if (!cancelled) setInitializing(false);
        return;
      }
      try {
        const saved = JSON.parse(raw);
        if (!saved.basePermissions) {
          saved.basePermissions = saved.user?.permissions || [];
        }
        // Local storage is only a workspace snapshot. Prefer validating the
        // HTTP-only cookie before mounting authenticated children such as
        // notification polling. In local/dev reloads the cookie can be missing
        // even while the saved bearer token is still valid, so fall back to the
        // bearer token before treating the session as expired.
        let freshUser;
        try {
          freshUser = await apiFetch("/auth/me", saved, {
            suppressErrorReportStatuses: [401],
            omitAuthorization: true,
          });
        } catch (error: any) {
          if (error?.status !== 401 || !saved.accessToken) throw error;
          freshUser = await apiFetch("/auth/me", saved, {
            suppressErrorReportStatuses: [401],
          });
        }
        if (cancelled) return;
        const restored = { ...saved, user: freshUser };
        localStorage.setItem("medizinhub.session", JSON.stringify(restored));
        const workspace = readWorkspace(restored);
        const restoredActive =
          workspace.active ||
          primaryWorkspaceSection(restored);
        const restoredBranchId = workspace.branchId || "";
        const restoredDepartmentId =
          workspace.departmentId || defaultDepartment.id;
        activeRef.current = restoredActive;
        liveBranchIdRef.current = restoredBranchId;
        departmentIdRef.current = restoredDepartmentId;
        setActive(restoredActive);
        setLiveBranchId(restoredBranchId);
        setDepartmentId(restoredDepartmentId);
        setApiSession(restored);
        const savedRole =
          restored.user?.roles?.[0] ||
          (restored.user?.is_super_admin ? "super_admin" : "tenant_admin");
        setRole(savedRole);
        setAuthenticated(true);
        void loadLiveData(restored, { initial: true }).catch((err: any) => {
          setLiveStatus(
            err.message || "Connected, but live data could not be loaded.",
          );
        });
      } catch {
        if (!cancelled) clearLocalSession("Session expired. Please sign in again.");
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
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
    const refreshSession = () => {
      if (document.visibilityState === "hidden") return;
      refreshCurrentUser();
    };
    const refreshEntitlementsAndWorkspace = () => {
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
        refreshEntitlementsAndWorkspace();
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
    // `storage` only fires in OTHER tabs — apiFetch also dispatches this
    // same-tab CustomEvent on every mutation so the tab that made the change
    // (e.g. creating/activating a branch) refreshes its own header/liveData
    // snapshot too, instead of only picking it up via react-query cache
    // invalidation (QueryProvider) which this hook's own fetchQuery doesn't
    // subscribe to.
    const handleLiveDataChanged = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { tenantId?: string }
        | undefined;
      if (detail?.tenantId && detail.tenantId !== apiSession.tenantId) return;
      scheduleMutationRefresh();
    };
    window.addEventListener("focus", refreshSession);
    window.addEventListener("storage", handleStorage);
    window.addEventListener(LIVE_DATA_CHANGED_EVENT, handleLiveDataChanged);
    window.addEventListener(
      "medizinhub.entitlements.refresh",
      refreshEntitlementsAndWorkspace,
    );
    document.addEventListener("visibilitychange", refreshSession);
    return () => {
      if (mutationRefreshTimerRef.current) {
        clearTimeout(mutationRefreshTimerRef.current);
        mutationRefreshTimerRef.current = null;
      }
      window.removeEventListener("focus", refreshSession);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(LIVE_DATA_CHANGED_EVENT, handleLiveDataChanged);
      window.removeEventListener(
        "medizinhub.entitlements.refresh",
        refreshEntitlementsAndWorkspace,
      );
      document.removeEventListener("visibilitychange", refreshSession);
    };
    // }, [apiSession?.tenantId]);
  }, [apiSession, apiSession?.tenantId]);

  async function handleLogin(input: { identifier: string; password: string }) {
    setLiveStatus("Signing in...");
    let res: Response;
    try {
      res = await fetchWithTimeout(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: input.identifier,
          password: input.password,
        }),
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
    const loginSessionUser = body.user || {};
    // Only true super admins lack a meaningful home tenant and need the
    // full tenant list to pick a default. Non-super-admin users (e.g. the
    // primary tenant's tenant_admin, who inherits platform.* permissions
    // via the global role template) already have their own tenant_id above
    // and hitting GET /tenants without an X-Tenant-ID header would 400.
    const canLoadPlatformTenants = Boolean(loginSessionUser.is_super_admin);
    if (canLoadPlatformTenants) {
      let tenantsRes: Response;
      try {
        tenantsRes = await fetchWithTimeout(`${API_BASE}/tenants`, {
          credentials: "include",
          headers: body.access_token
            ? { Authorization: `Bearer ${body.access_token}` }
            : undefined,
        });
      } catch (error) {
        if (error instanceof RequestTimeoutError) {
          throw new Error("Sign-in succeeded, but loading tenants timed out.");
        }
        throw new Error(
          `Login succeeded, but tenants could not sessionbe loaded from ${API_BASE}/tenants.`,
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

    const session: ApiSession = {
      tenantId,
      email: body.user?.email || input.identifier,
      accessToken: body.access_token,
      basePermissions: body.user?.permissions || [],
      user: body.user,
    };
    localStorage.setItem("medizinhub.session", JSON.stringify(session));
    const workspace = readWorkspace(session);
    setApiSession(session);
    const nextRole =
      body.user.roles?.[0] ||
      (body.user.is_super_admin ? "super_admin" : "tenant_admin");
    const nextActive = primaryWorkspaceSection(session);
    activeRef.current = nextActive;
    liveBranchIdRef.current = workspace.branchId || "";
    departmentIdRef.current = workspace.departmentId || defaultDepartment.id;
    setRole(nextRole);
    setActive(nextActive);
    saveWorkspace(session, { active: nextActive });
    setLiveBranchId(liveBranchIdRef.current);
    setDepartmentId(departmentIdRef.current);
    setAuthenticated(true);
    void loadLiveData(session, { initial: true }).catch((err: any) => {
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

  async function switchTenant(tenantId: string, grantedPermissions?: string[]) {
    if (!apiSession || !tenantId) return;
    const basePermissions = basePermissionKeys(apiSession);
    const nextPermissions = grantedPermissions || basePermissions;
    const next = {
      ...apiSession,
      basePermissions,
      tenantId,
      user: {
        ...apiSession.user,
        permissions: nextPermissions,
      },
    };
    const workspace = readWorkspace(next);
    localStorage.setItem("medizinhub.session", JSON.stringify(next));
    setApiSession(next);
    const nextActive =
      workspace.active ||
      primaryWorkspaceSection(next);
    activeRef.current = nextActive;
    liveBranchIdRef.current = workspace.branchId || "";
    departmentIdRef.current = workspace.departmentId || defaultDepartment.id;
    setActive(nextActive);
    setLiveBranchId(liveBranchIdRef.current);
    setDepartmentId(departmentIdRef.current);
    setLiveBranches([]);
    setLiveDepartments([]);
    setLiveStatus(`Switching to ${tenantId}...`);
    await loadLiveData(next, { initial: true }).catch((err: any) => {
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
  const preferredBranchId = liveBranchId || branchId;
  const effectiveBranchId = apiSession
    ? branchOptions.some((branch: any) => branch.id === preferredBranchId)
      ? preferredBranchId
      : ""
    : preferredBranchId || defaultBranch.id;
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
    enabledModules,
    branch,
    branchId: effectiveBranchId,
    departmentId,
    setDepartmentId: updateDepartment,
    allowedDepartments,
    doctorScope,
    patients,
    setPatients,
    appointments,
    setAppointments,
    scopedAppointments,
    apiSession,
    loadLiveData: refreshLiveDataInBackground,
    liveInvoices,
    numberingRules,
    isInitialLoading,
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
    initializing,
    authScreenProps: {
      onLogin: handleLogin,
    },
    shellProps: {
      active,
      lastPath: apiSession ? readWorkspace(apiSession).lastPath : "",
      rememberWorkspacePath,
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
      liveStatus,
      showPassword,
      setShowPassword,
      handleLogout,
      switchTenant,
      ctx,
      liveSummary,
      isInitialLoading,
    },
  };
}
