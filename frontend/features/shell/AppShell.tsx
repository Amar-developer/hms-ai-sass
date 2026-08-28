"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { SearchableSelect } from "@/app/components/common/ui";
import { ChangePassword } from "@/features/auth/ChangePassword";
import { canUseTenantAdminSection } from "../admin/permissions";
import { tenantAdminSections, clinic_sections } from "../admin/constants";
import { platformSectionsForUser } from "@/features/superAdmin/SuperAdminDashboard";
import { superAdminClinicSections } from "@/features/superAdmin/constants";
import {
  parseSuperAdminSegments,
  superAdminPath,
} from "@/features/superAdmin/routing";
import { reportSections } from "@/features/reports/constants";
import { uniqueDepartmentRows } from "@/lib/options";
import { Sidebar } from "@/app/components/common/Sidebar";
import AppHeader from "@/app/components/common/AppHeader";
import type { AppNavigationTarget } from "@/lib/navigationTarget";
import {
  opdAppointmentPath,
  opdSectionFromSegment,
} from "@/features/opd/routing";
import { isNewSegment, isEditSegment } from "@/lib/routeSlugs";
import { Button } from "@/app/components/common/ui";

type ShellChromeValue = {
  navigatePage: (target: AppNavigationTarget) => void;
  beginNavigation: (page: string, path: string) => void;
  activePage: string;
  enabled: (id: string) => boolean;
  nav: any;
  liveSummary: any;
  apiSession: any;
  switchTenant: any;
  tenantAdminSection: string;
  setTenantAdminSection: (value: string) => void;
  clinicSection: string;
  setClinicSection: (value: string) => void;
  reportsSection: string;
  setReportsSection: (value: string) => void;
  superAdminSection: string;
  setSuperAdminSection: (value: string) => void;
  breadcrumbSlotEl: HTMLDivElement | null;
};

const ShellChromeContext = createContext<ShellChromeValue | null>(null);

/** Everything module routes need beyond the workspace `ctx` data blob — chrome-owned navigation and sub-section state. */
export function useShellChrome(): ShellChromeValue {
  const value = useContext(ShellChromeContext);
  if (!value) {
    throw new Error("useShellChrome must be used within AppShell");
  }
  return value;
}

// Lets a module page render into the breadcrumb row's right corner (e.g. an
// AdaptiveFilterTrigger) without AppShell needing a per-page special case.
// Portals straight into the DOM node AppShell owns, rather than routing the
// content through React state — state would mean every render of the calling
// page re-registers a brand-new element, which never stabilizes and loops.
// Render nothing (or null children) while the page has nothing to show here
// (e.g. a detail view).
export function BreadcrumbSlot({ children }: { children: ReactNode }) {
  const { breadcrumbSlotEl } = useShellChrome();
  if (!breadcrumbSlotEl) return null;
  return createPortal(children, breadcrumbSlotEl);
}

function BreadcrumbSeparator({ className = "" }: { className?: string }) {
  return (
    <ChevronRight
      aria-hidden="true"
      size={12}
      className={`shrink-0 text-slate-900 ${className}`}
    />
  );
}

function humanizeRouteSlug(value: string): string {
  return value
    .replace(/^(new|edit)-/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function routeActionLabel(segment: string, fallbackEntity = ""): string {
  if (segment === "new") return `Create ${fallbackEntity}`.trim();
  if (isNewSegment(segment)) return `Create ${humanizeRouteSlug(segment)}`;
  if (isEditSegment(segment)) return `Edit ${humanizeRouteSlug(segment)}`;
  return "";
}

function BreadcrumbCrumb({
  label,
  onClick,
  current = false,
  className = "",
}: {
  label: string;
  onClick: () => void;
  current?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={current}
      className={`truncate rounded-md py-2 text-[11px] font-bold text-brand hover:bg-slate-100 disabled:cursor-default disabled:text-slate-900 disabled:hover:bg-transparent ${className}`}
    >
      {label}
    </button>
  );
}

const OPD_SECTION_LABELS: Record<string, string> = {
  appointments: "Appointments",
  schedule: "Doctor Schedule",
  consultation: "Consultation",
  "lab-services": "Lab & Services",
  prescriptions: "Prescriptions",
  invoices: "Billing",
  payments: "Payments",
  templates: "Templates",
};

const OPD_SECTION_HREFS: Record<string, string> = {
  appointments: "/opd/appointments",
  schedule: "/opd/schedule",
  consultation: "/opd/consultation",
  "lab-services": "/opd/lab-services",
  prescriptions: "/opd/prescriptions",
  invoices: "/opd/billing",
  payments: "/opd/payments",
  templates: "/opd/templates",
};

export function AppShell({
  children,
  ...props
}: { children: ReactNode } & Record<string, any>) {
  const {
    nav,
    enabled,
    clinic,
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
    liveStatus,
    showPassword,
    setShowPassword,
    handleLogout,
    switchTenant,
    liveSummary,
    isInitialLoading,
    rememberWorkspacePath,
  } = props;
  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const canAccessPlatformWorkspace = Boolean(
    isSuperAdmin ||
    apiSession?.user?.user_type === "platform_admin" ||
    apiSession?.user?.user_type === "support_admin",
  );
  const visiblePlatformSections = platformSectionsForUser(apiSession?.user);
  // The Sidebar's "Settings" dropdown (superadmin) must not repeat the
  // users/branches/departments sections Clinic Setup already shows — those
  // ids are the CLINIC_SECTION_IDS excluded here (see superAdminClinicSections
  // above, which is the flip side of this same filter).
  const visiblePlatformSettingsSections = visiblePlatformSections.filter(
    ([id]: any) =>
      !superAdminClinicSections.some(([clinicId]: any) => clinicId === id),
  );
  const passwordChangeRequired = Boolean(
    apiSession?.user?.must_change_password,
  );
  const visibleNav = nav.filter(
    ([id]: any) => enabled(id) && !(isSuperAdmin && id === "admin"),
  );
  const canAccessErrorLogs = enabled("error_logs");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [clinicOpen, setClinicOpen] = useState(false);
  // Doctors/Scheduling/Items/Expense are full standalone modules with their
  // own routes, now rooted at /clinic/{id} — nested visually under the
  // Clinic dropdown rather than moved into it, so they keep their existing
  // permission gating (enabled("practitioners")/etc.).
  const clinicModuleIds = ["practitioners", "scheduling", "items", "expense"];
  const clinicModulePath = (id: string) => `/clinic/${id}`;

  const routeSegment =
    pathname === "/" ? "dashboard" : pathname.split("/")[1] || "dashboard";
  const clinicRouteModuleId =
    routeSegment === "clinic" &&
    clinicModuleIds.includes(pathname.split("/")[2])
      ? pathname.split("/")[2]
      : "";
  const legacyOPDRoute = ["appointments", "consultation"].includes(
    routeSegment,
  );
  const effectiveRouteSegment =
    routeSegment === "doctor"
      ? "queue"
      : legacyOPDRoute
        ? "opd"
        : clinicRouteModuleId || routeSegment;
  const knownRouteSegments = new Set([
    ...nav.map(([id]: any) => id),
    "error_logs",
  ]);
  const isKnownRouteSegment = knownRouteSegments.has(effectiveRouteSegment);
  const resolvedActivePage =
    effectiveRouteSegment === "error_logs" && canAccessErrorLogs
      ? effectiveRouteSegment
      : visibleNav.some(([id]: any) => id === effectiveRouteSegment)
        ? effectiveRouteSegment
        : canAccessPlatformWorkspace
          ? "superadmin"
          : visibleNav[0]?.[0] || "dashboard";
  const activePage = isKnownRouteSegment
    ? effectiveRouteSegment
    : resolvedActivePage;
  const primaryRole = apiSession?.user?.roles?.[0] || role;
  const roleLabel =
    primaryRole
      ?.replace(/_/g, " ")
      .replace(/\b\w/g, (character: string) => character.toUpperCase()) ||
    "User";
  const isTenantAdmin = Boolean(
    apiSession?.user?.roles?.includes("tenant_admin") ||
    primaryRole === "tenant_admin",
  );
  const isReceptionist = Boolean(
    apiSession?.user?.user_type === "receptionist" ||
    apiSession?.user?.roles?.some((row: string) =>
      ["receptionist", "reception"].includes(row),
    ) ||
    apiSession?.user?.roles?.some((row: string) =>
      String(row).includes("receptionist"),
    ) ||
    ["receptionist", "reception"].includes(primaryRole) ||
    String(primaryRole).includes("receptionist"),
  );
  const canChangeBranch = Boolean(isSuperAdmin || isTenantAdmin);
  const canChangeDepartment = Boolean(
    (isSuperAdmin || isTenantAdmin || isReceptionist) && !isDoctorUser,
  );
  const branchName =
    clinic.branches.find((b: any) => b.id === branchId)?.name ||
    clinic.branches[0]?.name ||
    "Assigned branch";
  const departmentOptions = uniqueDepartmentRows(
    allowedDepartments || [],
    departmentId,
  );
  const departmentNames = departmentOptions
    .map((department: any) => department.name)
    .filter(Boolean);
  const displayClinicName = clinic.name || "Hospital / Clinic";
  const superAdminSectionParents: Record<string, string> = {
    tenantEdit: "tenants",
    createTenant: "tenants",
    roleCreate: "roles",
    roleEdit: "roles",
    rolePermissions: "roles",
    roleAssign: "roles",
    userCreate: "users",
    userEdit: "users",
    departmentCreate: "departments",
    departmentEdit: "departments",
    departmentAssign: "departments",
    branchCreate: "branches",
    branchEdit: "branches",
    branchAssign: "branches",
  };
  const isVisibleSuperAdminSection = (sectionId: string) => {
    const parentSection = superAdminSectionParents[sectionId] || sectionId;
    return visiblePlatformSections.some(([id]: any) => id === parentSection);
  };
  // Platform sections are real nested routes (/superadmin/roles,
  // /superadmin/roles/{id}/edit, ...), so the active section is derived from
  // the URL instead of tracked separately.
  const superAdminSection = pathname.startsWith("/superadmin")
    ? parseSuperAdminSegments(pathname.split("/").slice(2)).section
    : "overview";
  function setSuperAdminSection(value: string) {
    const path = superAdminPath(value);
    beginNavigation("superadmin", path);
    router.push(path);
  }
  const activeSuperAdminSection = isVisibleSuperAdminSection(superAdminSection)
    ? superAdminSection
    : visiblePlatformSections[0]?.[0] || superAdminSection;
  const [breadcrumbSlotEl, setBreadcrumbSlotEl] =
    useState<HTMLDivElement | null>(null);
  const [superAdminSettingsOpen, setSuperAdminSettingsOpen] = useState(true);
  // Tenant Admin sections are real nested routes (/admin/users, /admin/roles,
  // ...) now, so the current section is derived from the URL instead of
  // tracked as independent state — that's what keeps the breadcrumb and
  // sidebar highlight correct on back/forward and direct navigation too.
  const tenantAdminSection = pathname.startsWith("/admin/")
    ? pathname.split("/")[2] || "files"
    : "files";
  function setTenantAdminSection(value: string) {
    const path = `/admin/${value}`;
    beginNavigation("admin", path);
    router.push(path);
  }

  // Clinic section (only /clinic/...)
  const clinicSection = pathname.startsWith("/clinic/")
    ? pathname.split("/")[2] || "users"
    : "users";

  function setClinicSection(value: string) {
    const path = `/clinic/${value}`;
    beginNavigation("clinic", path);
    router.push(path);
  }
  const [tenantAdminSettingsOpen, setTenantAdminSettingsOpen] = useState(false);
  const visibleTenantAdminSections = tenantAdminSections.filter(
    ([sectionId]: any) =>
      canUseTenantAdminSection(sectionId, apiSession?.user) &&
      (sectionId !== "whatsapp" || clinic.modules?.includes("whatsapp")) &&
      (sectionId !== "patient-intelligence" ||
        clinic.modules?.includes("patient_intelligence")),
  );
  // Clinic is one shared dropdown for both roles — tenant admins get
  // tenant-scoped sections, platform/super-admin users get the platform
  // template sections (users/branches/departments), both routed under
  // /clinic/{section} (see superAdminPath in routing.ts for how the two
  // stay disambiguated).
  const visibleClinicSections = canAccessPlatformWorkspace
    ? superAdminClinicSections.filter(([id]: any) =>
        visiblePlatformSections.some(([visibleId]: any) => visibleId === id),
      )
    : clinic_sections.filter(([sectionId]: any) =>
        canUseTenantAdminSection(sectionId, apiSession?.user),
      );
  const clinicModuleSections = nav.filter(
    ([id]: any) => clinicModuleIds.includes(id) && enabled(id),
  );
  // Sidebar renders these nested inside Clinic instead of as their own
  // top-level row — visibleNav itself stays untouched since prefetching,
  // the search palette, and activePage resolution all still need them.
  const sidebarVisibleNav = visibleNav.filter(
    ([id]: any) =>
      !clinicModuleIds.includes(id) && !["admin", "superadmin"].includes(id),
  );
  const activeTenantAdminSection = visibleTenantAdminSections.some(
    ([id]: any) => id === tenantAdminSection,
  )
    ? tenantAdminSection
    : visibleTenantAdminSections[0]?.[0] || tenantAdminSection;

  const activeClinicSection = visibleClinicSections.some(
    ([id]: any) => id === clinicSection,
  )
    ? clinicSection
    : visibleClinicSections[0]?.[0] || clinicSection;

  const [profileOpen, setProfileOpen] = useState(false);
  const mainScrollRef = useRef<HTMLElement>(null);
  const [reportsOpen, setReportsOpen] = useState(true);
  // Report tabs are real nested routes (/reports/metrix, /reports/lab, ...),
  // so the active tab is derived from the URL rather than tracked separately
  // — that keeps the breadcrumb and sidebar highlight correct on
  // back/forward and on direct navigation.
  const reportsSection = pathname.startsWith("/reports/")
    ? pathname.split("/")[2] || "metrix"
    : "metrix";
  function setReportsSection(value: string) {
    const path = `/reports/${value}`;
    beginNavigation("reports", path);
    router.push(path);
  }
  const [sideBarOpen, setSidebarOpen] = useState(true);
  const [tabletCollapsed, setTabletCollapsed] = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);
  const profileOpenRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const pathSegments = pathname.split("/").filter(Boolean);
  const activeNavLabel =
    activePage === "error_logs"
      ? "Error Logs"
      : visibleNav.find(([id]: any) => id === activePage)?.[1] || "Dashboard";
  const activeOPDSection =
    activePage === "opd"
      ? opdSectionFromSegment(pathSegments[1])
      : "";
  const activeOPDBreadcrumbSection =
    activeOPDSection === "new" ? "appointments" : activeOPDSection;

  const activeSectionLabel =
    activePage === "opd"
      ? OPD_SECTION_LABELS[activeOPDBreadcrumbSection] || ""
      : activePage === "superadmin"
      ? String(
          visiblePlatformSections.find(
            ([id]: any) =>
              id ===
              (superAdminSectionParents[activeSuperAdminSection] ||
                activeSuperAdminSection),
          )?.[1] ?? "",
        )
      : activePage === "admin"
        ? String(
            visibleTenantAdminSections.find(
              // only pure admin sections
              ([id]: any) => id === activeTenantAdminSection,
            )?.[1] ?? "",
          )
        : activePage === "clinic"
          ? String(
              visibleClinicSections.find(
                ([id]: any) => id === activeClinicSection,
              )?.[1] ?? "",
            )
          : activePage === "reports"
            ? String(
                reportSections.find(
                  ([id]: any) => id === reportsSection,
                )?.[1] ?? "",
              )
            : "";
  const activeSectionHref =
    activePage === "opd"
      ? OPD_SECTION_HREFS[activeOPDBreadcrumbSection] || "/opd/consultation"
      : activePage === "superadmin"
        ? superAdminPath(
            superAdminSectionParents[activeSuperAdminSection] ||
              activeSuperAdminSection,
          )
        : activePage === "admin"
          ? `/admin/${activeTenantAdminSection}`
          : activePage === "clinic"
            ? `/clinic/${activeClinicSection}`
            : activePage === "reports"
              ? `/reports/${reportsSection}`
              : "";
  const activeModuleHref =
    activePage === "error_logs"
      ? "/error_logs"
      : activePage === "opd"
        ? "/opd/consultation"
        : activePage === "admin"
          ? "/admin"
          : activePage === "clinic"
            ? "/clinic"
            : activePage === "reports"
              ? "/reports"
              : activePage === "superadmin"
                ? "/superadmin"
                : clinicModuleIds.includes(activePage)
                  ? clinicModulePath(activePage)
                  : `/${activePage}`;

  // The trailing "new-{slug}"/"edit-{slug}" URL segment self-describes its
  // action for every module/submodule alike, so the breadcrumb's "Create"/
  // "Edit" crumb is derived straight from the URL instead of needing each
  // module to report its own view state up to the shell.
  const lastPathSegment = pathSegments.at(-1) || "";
  const activeViewLabel =
    activePage === "opd" && activeOPDSection === "new"
      ? "Create Appointment"
      : routeActionLabel(lastPathSegment);
  function navigateBreadcrumb(href: string) {
    if (!href || href === pathname) return;
    router.push(href);
  }

  const searchItems = [
    ...visibleNav.map(([id, label]: any) => ({
      id: `module-${id}`,
      label,
      description: "Module",
      keywords: `${label} page form list`,
      action: () => navigatePage(id),
    })),
    ...(canAccessErrorLogs
      ? [
          {
            id: "module-error_logs",
            label: "Error Logs",
            description: "Module",
            keywords:
              "errors warnings api permission denied frontend backend logs",
            action: () => navigatePage("error_logs"),
          },
        ]
      : []),
    ...visibleTenantAdminSections.map(([id, label]: any) => ({
      id: `admin-${id}`,
      label: `${label}`,
      description: "Settings",
      keywords: `settings admin ${label}`,
      action: () => navigatePage({ id: "admin", section: id }),
    })),
    ...visibleClinicSections.map(([id, label]: any) => ({
      id: `clinic-${id}`,
      label: `${label}`,
      description: "Clinic",
      keywords: `clinic ${label}`,
      action: () => navigatePage({ id: "clinic", section: id }),
    })),
    ...(visibleNav.some(([id]: any) => id === "reports")
      ? reportSections.map(([id, label]: any) => ({
          id: `reports-${id}`,
          label: `${label}`,
          description: "Reports",
          keywords: `report analytics ${label}`,
          action: () => navigatePage({ id: "reports", section: id }),
        }))
      : []),
    ...(canAccessPlatformWorkspace
      ? visiblePlatformSections.map(([id, label]: any) => ({
          id: `superadmin-${id}`,
          label: `${label}`,
          description: "Platform Access",
          keywords: `platform privileged support root ${label}`,
          action: () => navigatePage({ id: "superadmin", section: id }),
        }))
      : []),
  ];
  const pageNeedsDepartmentFilter = [
    "queue",
    "doctor",
    "consultation",
    "ip",
    "physiotherapy",
  ].includes(activePage);
  function navigatePage(target: AppNavigationTarget) {
    const requestedId = typeof target === "string" ? target : target.id;
    const section = typeof target === "string" ? undefined : target.section;
    const appointmentId =
      typeof target === "string" ? undefined : target.appointmentId;

    const legacyOPDPath: Record<string, string> = {
      appointments: "/opd/appointments",
      consultation: "/opd/consultation",
    };
    const id =
      requestedId === "doctor"
        ? "queue"
        : legacyOPDPath[requestedId]
          ? "opd"
          : requestedId;

    if (!id) return;

    // Settings
    if (id === "admin") {
      setTenantAdminSettingsOpen(true);
      setClinicOpen(false);
      if (section) {
        setTenantAdminSection(section); // → /admin/{section}
      } else {
        setTenantAdminSection(activeTenantAdminSection);
      }
      return;
    }

    // Clinic
    if (id === "clinic") {
      setClinicOpen(true);
      setTenantAdminSettingsOpen(false);
      if (section) {
        setClinicSection(section); // → /clinic/{section}
      } else {
        setClinicSection(activeClinicSection);
      }
      return;
    }
    // ---- Reports ----
    if (id === "reports" && section) {
      setReportsOpen(true);
      setClinicOpen(false);
      setReportsSection(section);
      return;
    }

    // ---- Super-admin ----
    if (id === "superadmin" && section) {
      setSuperAdminSettingsOpen(true);
      if (isVisibleSuperAdminSection(section)) {
        setSuperAdminSection(section);
        return;
      }
    }

    // ---- normal modules ----
    const destinationPath =
      id === "opd" && appointmentId
        ? opdAppointmentPath(appointmentId)
        : requestedId === "doctor"
          ? "/queue"
          : legacyOPDPath[requestedId] ||
            (id === "admin"
              ? `/admin/${tenantAdminSection}`
              : id === "clinic"
                ? `/clinic/${clinicSection}`
                : id === "reports"
                  ? `/reports/${reportsSection}`
                  : id === "superadmin"
                    ? superAdminPath(superAdminSection)
                    : clinicModuleIds.includes(id)
                      ? clinicModulePath(id)
                      : id === "opd"
                        ? "/opd/consultation"
                      : `/${id}`);

    if (id === activePage && pathname === destinationPath) return;

    beginNavigation(id, destinationPath);
    router.push(destinationPath);
  }

  function beginNavigation(page: string, path: string) {
    // Link/router navigation owns the transition. Keeping the mounted route
    // visible avoids masking a stalled development server behind a loader.
    void page;
    void path;
  }

  // Permission/entitlement gating can make the pathname's module unavailable
  // (e.g. after a role/tenant switch) — redirect to the computed fallback
  // rather than silently rendering a different module under a stale URL.
  useEffect(() => {
    if (routeSegment === "doctor" && resolvedActivePage === "queue") {
      router.replace("/queue");
    } else if (legacyOPDRoute && resolvedActivePage === "opd") {
      const legacyDestination = pathname.startsWith("/appointments/new")
        ? "/opd/new"
        : routeSegment === "appointments"
          ? "/opd/appointments"
          : "/opd/consultation";
      router.replace(legacyDestination);
    } else if (
      !isKnownRouteSegment &&
      resolvedActivePage !== effectiveRouteSegment
    ) {
      router.replace(
        clinicModuleIds.includes(resolvedActivePage)
          ? clinicModulePath(resolvedActivePage)
          : resolvedActivePage === "opd"
            ? "/opd/consultation"
          : `/${resolvedActivePage}`,
      );
    }
  }, [
    legacyOPDRoute,
    pathname,
    resolvedActivePage,
    routeSegment,
    effectiveRouteSegment,
    isKnownRouteSegment,
    router,
  ]);

  useEffect(() => {
    if (!rememberWorkspacePath || !pathname || pathname === "/login") return;
    const query = searchParams.toString();
    rememberWorkspacePath(query ? `${pathname}?${query}` : pathname);
  }, [pathname, rememberWorkspacePath, searchParams]);

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);

  // Direct/bookmarked navigation into Clinic (or into Doctors/Scheduling/
  // Items, now nested under it) should land with the dropdown already
  // expanded, not just highlighted.
  useEffect(() => {
    if (activePage === "clinic" || clinicModuleIds.includes(activePage))
      setClinicOpen(true);
  }, [activePage]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(true);
        setTabletCollapsed(false);
        setIsDesktop(true);
      } else {
        setTabletCollapsed(true);
        setIsDesktop(false);
      }
    };

    handleResize();

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileOpen &&
        profileOpenRef.current &&
        !profileOpenRef.current.contains(event.target as Node)
      ) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileOpen]);

  const shellChromeValue: ShellChromeValue = {
    navigatePage,
    beginNavigation,
    activePage,
    enabled,
    nav,
    liveSummary,
    apiSession,
    switchTenant,
    tenantAdminSection: activeTenantAdminSection,
    setTenantAdminSection,
    clinicSection: activeClinicSection,
    setClinicSection,
    reportsSection,
    setReportsSection,
    superAdminSection: activeSuperAdminSection,
    setSuperAdminSection,
    breadcrumbSlotEl,
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white text-slate-900">
      {/* {isInitialLoading && <PageLoader label={"Loading"} />} */}
      <AppHeader
        isPlatformWorkspace={canAccessPlatformWorkspace}
        apiSession={apiSession}
        branchId={branchId}
        setBranchId={setBranchId}
        clinic={clinic}
        canChangeBranch={canChangeBranch}
        isDoctorUser={isDoctorUser}
        branchName={branchName}
        departmentNames={departmentNames}
        displayClinicName={displayClinicName}
        searchItems={searchItems}
        profileOpen={profileOpen}
        setProfileOpen={setProfileOpen}
        profileOpenRef={profileOpenRef}
        roleLabel={roleLabel}
        handleLogout={handleLogout}
        setShowPassword={setShowPassword}
        navigatePage={navigatePage}
        settingsSections={
          canAccessPlatformWorkspace
            ? visiblePlatformSettingsSections
            : visibleTenantAdminSections
        }
        activeSettingsSection={
          canAccessPlatformWorkspace
            ? activeSuperAdminSection
            : activeTenantAdminSection
        }
        tabletCollapsed={tabletCollapsed}
        setTabletCollapsed={setTabletCollapsed}
        setSidebarOpen={setSidebarOpen}
        sideBarOpen={sideBarOpen}
      />
      {/* Sidebar */}
      {!isDesktop && (
        <div
          className={`
    fixed bottom-0 left-0 top-14 z-40 bg-white
    transition-all duration-300

    md:w-16
    ${!tabletCollapsed ? "md:w-64" : ""}

    hidden md:block lg:hidden lg:w-64
  `}
        >
          {/* Tablet view Sidebar */}
          <div className="w-fit scrollbar-hidden h-full overflow-y-auto  ">
            <Sidebar
              visibleNav={sidebarVisibleNav}
              activePage={activePage}
              navigatePage={navigatePage}
              beginNavigation={beginNavigation}
              isSuperAdmin={isSuperAdmin}
              canAccessPlatformWorkspace={canAccessPlatformWorkspace}
              reportsOpen={reportsOpen}
              setReportsOpen={setReportsOpen}
              reportsSection={reportsSection}
              setReportsSection={setReportsSection}
              tenantAdminSettingsOpen={tenantAdminSettingsOpen}
              setTenantAdminSettingsOpen={setTenantAdminSettingsOpen}
              tenantAdminSection={activeTenantAdminSection}
              setTenantAdminSection={setTenantAdminSection}
              clinicSection={activeClinicSection} // new
              setClinicSection={setClinicSection}
              superAdminSettingsOpen={superAdminSettingsOpen}
              setSuperAdminSettingsOpen={setSuperAdminSettingsOpen}
              superAdminSection={activeSuperAdminSection}
              setSuperAdminSection={setSuperAdminSection}
              visibleTenantAdminSections={visibleTenantAdminSections}
              visibleClinicSections={visibleClinicSections}
              clinicModuleSections={clinicModuleSections}
              enabled={enabled}
              clinic={clinic}
              setSidebarOpen={setSidebarOpen}
              sideBarOpen={sideBarOpen}
              reportSections={reportSections}
              reportSection={reportsSection}
              superAdminSections={visiblePlatformSettingsSections}
              tabletCollapsed={tabletCollapsed}
              setTabletCollapsed={setTabletCollapsed}
              clinicOpen={clinicOpen}
              setClinicOpen={setClinicOpen}
            />
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 lg:flex">
        <aside
          className="scrollbar-hidden hidden h-full w-64 shrink-0 overflow-y-auto overflow-x-hidden bg-white px-0 py-2 lg:block"
        >
          {/* Desktop view */}
          {isDesktop && (
            <div
              className={`h-full w-fit transform bg-white transition-transform duration-300 lg:static lg:translate-x-0 ${
                sideBarOpen ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <Sidebar
                visibleNav={sidebarVisibleNav}
                activePage={activePage}
                navigatePage={navigatePage}
                beginNavigation={beginNavigation}
                isSuperAdmin={isSuperAdmin}
                canAccessPlatformWorkspace={canAccessPlatformWorkspace}
                reportsOpen={reportsOpen}
                setReportsOpen={setReportsOpen}
                reportsSection={reportsSection}
                setReportsSection={setReportsSection}
                tenantAdminSettingsOpen={tenantAdminSettingsOpen}
                setTenantAdminSettingsOpen={setTenantAdminSettingsOpen}
                tenantAdminSection={activeTenantAdminSection}
                setTenantAdminSection={setTenantAdminSection}
                clinicSection={activeClinicSection} // new
                setClinicSection={setClinicSection}
                superAdminSettingsOpen={superAdminSettingsOpen}
                setSuperAdminSettingsOpen={setSuperAdminSettingsOpen}
                superAdminSection={activeSuperAdminSection}
                setSuperAdminSection={setSuperAdminSection}
                visibleTenantAdminSections={visibleTenantAdminSections}
                visibleClinicSections={visibleClinicSections}
                clinicModuleSections={clinicModuleSections}
                enabled={enabled}
                clinic={clinic}
                setSidebarOpen={setSidebarOpen}
                sideBarOpen={sideBarOpen}
                reportSections={reportSections}
                reportSection={reportsSection}
                superAdminSections={visiblePlatformSettingsSections}
                tabletCollapsed={tabletCollapsed}
                setTabletCollapsed={setTabletCollapsed}
                clinicOpen={clinicOpen}
                setClinicOpen={setClinicOpen}
              />
            </div>
          )}
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500">
            <b className="text-slate-900">
              {canAccessPlatformWorkspace ? "Platform Access" : clinic.type}
            </b>
            <br />
            {canAccessPlatformWorkspace
              ? isSuperAdmin
                ? "Root platform access"
                : "Permission-scoped access"
              : clinic.multiBranch
                ? "Multi-branch enabled"
                : "Single branch mode"}
            <br />
            MedizinHub HMS API workspace.
          </div>
        </aside>

        <main
          ref={mainScrollRef}
          className={`
    scrollbar-hidden relative h-full min-w-0 flex-1 overflow-y-auto bg-white [scrollbar-gutter:stable]
    md:ml-16
    lg:ml-0
  `}
        >
          {(showPassword || passwordChangeRequired) && (
            <ChangePassword
              apiSession={apiSession}
              required={passwordChangeRequired}
              onChanged={(updated: any) => {
                if (apiSession?.user && updated) {
                  Object.assign(apiSession.user, updated);
                }
                setShowPassword(false);
              }}
              onClose={() => {
                if (!passwordChangeRequired) setShowPassword(false);
              }}
            />
          )}

          <div className=" border-slate-100  px-4 py-2 lg:px-5 bg-[#f4f6f5d9]">
              <div className="flex min-w-0 flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  {/* Back / Forward group */}
                  {/* <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    title="Previous page"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm"
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => router.forward()}
                    title="Forward"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm"
                  >
                    <ArrowRight size={14} />
                  </button>
                </div> */}

                  {/* Divider */}

                  {/* Breadcrumb */}
                  <div className="flex min-w-0 items-center gap-2 p-2 rounded-lg">
                    <Button
                      type="button"
                      onClick={() => navigatePage("dashboard")}
                      disabled={
                        activePage === "dashboard" || !enabled("dashboard")
                      }
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold text-brand hover:bg-slate-100 disabled:cursor-default disabled:text-slate-900 disabled:hover:bg-transparent"
                    >
                      <Home size={14} /> Dashboard
                    </Button>

                    {activePage !== "dashboard" && (
                      <>
                        <BreadcrumbSeparator />
                        <BreadcrumbCrumb
                          label={activeNavLabel}
                          onClick={() => navigateBreadcrumb(activeModuleHref)}
                          current={!activeSectionLabel && !activeViewLabel}
                        />
                      </>
                    )}

                    {activeSectionLabel && (
                      <>
                        <BreadcrumbSeparator className="hidden sm:block" />
                        <BreadcrumbCrumb
                          label={activeSectionLabel}
                          onClick={() => navigateBreadcrumb(activeSectionHref)}
                          current={!activeViewLabel}
                          className="hidden sm:inline"
                        />
                      </>
                    )}

                    {activeViewLabel && (
                      <>
                        <BreadcrumbSeparator />
                        <span className="truncate text-[11px] font-bold text-slate-900">
                          {activeViewLabel}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {activePage === "admin" &&
                  visibleTenantAdminSections.length > 0 && (
                    <div className="flex shrink-0 items-center justify-end gap-2">
                      <span className="hidden text-[11px] font-bold uppercase tracking-wide text-slate-400 md:inline">
                        Settings
                      </span>
                      <SearchableSelect
                        value={activeTenantAdminSection}
                        onChange={(value: string) => {
                          setTenantAdminSettingsOpen(true);
                          setTenantAdminSection(value);
                        }}
                        options={visibleTenantAdminSections.map(
                          ([id, label]: any) => ({
                            label,
                            value: id,
                          }),
                        )}
                        searchable={false}
                        className="min-w-[200px] scrollbar-thin"
                      />
                    </div>
                  )}

                {/* {activePage === "clinic" &&
                  visibleClinicSections.length > 0 && (
                    <div className="flex shrink-0 items-center justify-end gap-2">
                      <span className="hidden text-[11px] font-bold uppercase tracking-wide text-slate-400 md:inline">
                        Clinic
                      </span>
                      <SearchableSelect
                        value={activeClinicSection}
                        onChange={(value: string) => {
                          setClinicOpen(true);
                          setClinicSection(value);
                        }}
                        options={visibleClinicSections.map(
                          ([id, label]: any) => ({
                            label,
                            value: id,
                          }),
                        )}
                        searchable={false}
                        className="min-w-[200px] scrollbar-thin"
                      />
                    </div>
                  )} */}

                {pageNeedsDepartmentFilter && departmentOptions.length > 0 && (
                  <div className="flex shrink-0 items-center justify-end gap-2">
                    <span className="hidden text-[11px] font-bold uppercase tracking-wide text-slate-400 md:inline">
                      Department
                    </span>
                    <SearchableSelect
                      value={departmentId}
                      onChange={(value) => setDepartmentId(value)}
                      options={departmentOptions.map((department: any) => ({
                        value: department.id,
                        label: department.name,
                      }))}
                      disabled={!canChangeDepartment}
                      className=" min-w-[170px] "
                      placeholder="Select department"
                      searchable={false}
                    />
                  </div>
                )}

                <div
                  ref={setBreadcrumbSlotEl}
                  className="flex shrink-0 items-center justify-end gap-2 empty:hidden"
                />
              </div>
            </div>

          <section
            className=" py-2 px-6 bg-[#f4f6f5d9]"
          >
            <ShellChromeContext.Provider value={shellChromeValue}>
              {children}
            </ShellChromeContext.Provider>
          </section>
        </main>
      </div>
    </div>
  );
}
