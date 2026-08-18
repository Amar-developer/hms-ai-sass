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
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, HeartPulse, Home, Menu } from "lucide-react";
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
import { activeTenantOptions } from "@/utils/helper";
import { useNavigationSkeleton } from "@/app/components/common/loader/useNavigationSkeleton";
import { ModuleSkeleton } from "@/app/components/common/loader/ModuleSkeleton";
import { BreadcrumbBarSkeleton } from "@/app/components/common/loader/BreadcrumbBarSkeleton";
import type { AppNavigationTarget } from "@/lib/navigationTarget";
import { opdAppointmentPath } from "@/features/opd/routing";

type ShellChromeValue = {
  navigatePage: (target: AppNavigationTarget) => void;
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

export function AppShell({
  children,
  ...props
}: { children: ReactNode } & Record<string, any>) {
  const {
    setActive,
    nav,
    enabled,
    clinic,
    clinics,
    tenants = [],
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
  } = props;
  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const canAccessPlatformWorkspace = Boolean(
    isSuperAdmin ||
    apiSession?.user?.user_type === "platform_admin" ||
    apiSession?.user?.user_type === "support_admin",
  );
  const canManagePlatformTenants = Boolean(
    isSuperAdmin ||
    apiSession?.user?.permissions?.includes("platform.tenants.manage"),
  );
  const visiblePlatformSections = platformSectionsForUser(apiSession?.user);
  const passwordChangeRequired = Boolean(
    apiSession?.user?.must_change_password,
  );
  const visibleNav = nav.filter(
    ([id]: any) => enabled(id) && !(isSuperAdmin && id === "admin"),
  );
  const canAccessErrorLogs = enabled("error_logs");
  const router = useRouter();
  const pathname = usePathname();
  const [pendingPage, setPendingPage] = useState("");
  const [clinicOpen, setClinicOpen] = useState(false);

  // Sidebar navigation uses router.push() on click rather than <Link>, so it
  // gets none of Next.js's automatic hover/viewport prefetching — every
  // click was a cold fetch, which is why the URL and page appeared to hang
  // on the old route until the new one finished loading. Warm the cache for
  // every reachable module route up front so clicks resolve instantly.
  useEffect(() => {
    for (const [id] of visibleNav) {
      router.prefetch(`/${id}`);
    }
    if (canAccessErrorLogs) {
      router.prefetch("/error_logs");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNav.map(([id]: any) => id).join(","), canAccessErrorLogs]);
  const routeSegment =
    pathname === "/" ? "dashboard" : pathname.split("/")[1] || "dashboard";
  const legacyOPDRoute = ["appointments", "consultation"].includes(
    routeSegment,
  );
  const effectiveRouteSegment =
    routeSegment === "doctor" ? "queue" : legacyOPDRoute ? "opd" : routeSegment;
  const resolvedActivePage =
    effectiveRouteSegment === "error_logs" && canAccessErrorLogs
      ? effectiveRouteSegment
      : visibleNav.some(([id]: any) => id === effectiveRouteSegment)
        ? effectiveRouteSegment
        : canAccessPlatformWorkspace
          ? "superadmin"
          : visibleNav[0]?.[0] || "dashboard";
  const activePage = pendingPage || resolvedActivePage;
  // pendingPage is set the instant a nav click fires and cleared once the
  // pathname actually lands (see the effect below) — that window is exactly
  // "a route change or module switch is in flight", independent of the
  // sidebar, which keeps rendering the live nav state throughout. Next's
  // own loading.tsx Suspense fallback only fires for server data fetches,
  // so client-rendered modules swap with no transition state at all unless
  // we drive the header + content skeletons off this signal ourselves.
  const showNavigationSkeleton = useNavigationSkeleton(Boolean(pendingPage));
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
  const visibleTenantOptions = activeTenantOptions(tenants);
  const tenantOptions = canManagePlatformTenants
    ? visibleTenantOptions.length
      ? visibleTenantOptions.map((tenant: any) => ({
          value: tenant.id,
          label: tenant.name || tenant.id,
        }))
      : [
          {
            value: apiSession?.tenantId || clinic.id,
            label: displayClinicName,
          },
        ]
    : clinics;
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
    router.push(superAdminPath(value));
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
    router.push(`/admin/${value}`);
  }

  // Clinic section (only /clinic/...)
  const clinicSection = pathname.startsWith("/clinic/")
    ? pathname.split("/")[2] || "users"
    : "users";

  function setClinicSection(value: string) {
    router.push(`/clinic/${value}`);
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
  // Doctors/Scheduling/Items are full standalone modules with their own
  // routes (/practitioners, /scheduling, /items) — nested visually under
  // the Clinic dropdown rather than moved into it, so they keep their
  // existing route and permission gating (enabled("practitioners")/etc.).
  const clinicModuleIds = ["practitioners", "scheduling", "items"];
  const clinicModuleSections = nav.filter(
    ([id]: any) => clinicModuleIds.includes(id) && enabled(id),
  );
  // Sidebar renders these nested inside Clinic instead of as their own
  // top-level row — visibleNav itself stays untouched since prefetching,
  // the search palette, and activePage resolution all still need them.
  const sidebarVisibleNav = visibleNav.filter(
    ([id]: any) => !clinicModuleIds.includes(id),
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
  const [reportsOpen, setReportsOpen] = useState(true);
  // Report tabs are real nested routes (/reports/metrix, /reports/lab, ...),
  // so the active tab is derived from the URL rather than tracked separately
  // — that keeps the breadcrumb and sidebar highlight correct on
  // back/forward and on direct navigation.
  const reportsSection = pathname.startsWith("/reports/")
    ? pathname.split("/")[2] || "metrix"
    : "metrix";
  function setReportsSection(value: string) {
    router.push(`/reports/${value}`);
  }
  const [sideBarOpen, setSidebarOpen] = useState(true);
  const [tabletCollapsed, setTabletCollapsed] = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);
  const profileOpenRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeNavLabel =
    activePage === "error_logs"
      ? "Error Logs"
      : visibleNav.find(([id]: any) => id === activePage)?.[1] || "Dashboard";

  const activeSectionLabel =
    activePage === "superadmin"
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
      consultation: "/opd",
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
                    : `/${id}`);

    if (id === activePage && pathname === destinationPath) return;

    setPendingPage(id);
    setActive(id);
    router.push(destinationPath);
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
          : "/opd";
      router.replace(legacyDestination);
    } else if (resolvedActivePage !== routeSegment) {
      router.replace(`/${resolvedActivePage}`);
    }
  }, [legacyOPDRoute, pathname, resolvedActivePage, routeSegment, router]);

  useEffect(() => {
    setPendingPage("");
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

  useEffect(() => {
    const highTrafficRoutes = new Set([
      "dashboard",
      "appointments",
      "patients",
      "practitioners",
      "queue",
      "billing",
    ]);
    visibleNav.forEach(([id]: any) => {
      if (highTrafficRoutes.has(id) && id !== activePage) {
        router.prefetch(`/${id}`);
      }
    });
  }, [activePage, router, visibleNav.map(([id]: any) => id).join("|")]);

  const shellChromeValue: ShellChromeValue = {
    navigatePage,
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
    <div className="h-screen overflow-hidden bg-white text-slate-900">
      {/* {isInitialLoading && <PageLoader label={"Loading"} />} */}
      {/* Sidebar */}
      {!isDesktop && (
        <div
          className={`
    fixed left-0 top-0 z-40 h-screen border-r border-slate-200 bg-white
    transition-all duration-300

    md:w-14
    ${!tabletCollapsed ? "md:w-64" : ""}

    lg:hidden lg:w-50
  `}
        >
          {/* Tablet view Sidebar */}
          <div className="w-fit scrollbar-hidden h-full overflow-y-auto  ">
            <Sidebar
              visibleNav={sidebarVisibleNav}
              activePage={activePage}
              navigatePage={navigatePage}
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
              superAdminSections={visiblePlatformSections}
              tabletCollapsed={tabletCollapsed}
              setTabletCollapsed={setTabletCollapsed}
              clinicOpen={clinicOpen}
              setClinicOpen={setClinicOpen}
            />
          </div>
        </div>
      )}
      <div className="h-full lg:flex">
        <aside
          className={`scrollbar-hidden hidden h-screen shrink-0 overflow-y-auto overflow-x-hidden border-r border-slate-200 bg-white p-2 px-0 md:w-64 lg:block lg:w-64`}
        >
          {/* Desktop view */}
          {isDesktop && (
            <div
              className={`fixed left-0 top-0 z-40 h-screen w-fit transform bg-white transition-transform duration-300 lg:static lg:translate-x-0 ${
                sideBarOpen ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <Sidebar
                visibleNav={sidebarVisibleNav}
                activePage={activePage}
                navigatePage={navigatePage}
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
                superAdminSections={visiblePlatformSections}
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
          className={`
    scrollbar-hidden h-screen min-w-0 flex-1 overflow-y-auto bg-white
    md:ml-14
    lg:ml-0
  `}
        >
          <AppHeader
            isSuperAdmin={canManagePlatformTenants}
            apiSession={apiSession}
            tenantOptions={tenantOptions}
            switchTenant={switchTenant}
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
            setReportsOpen={setReportsOpen}
            navigatePage={navigatePage}
            // setTabletCollapsed={setTabletCollapsed}
          />

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

          {showNavigationSkeleton ? (
            <BreadcrumbBarSkeleton />
          ) : (
            <div className=" border-slate-100 bg-white px-4 py-3 lg:px-5 ">
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
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigatePage("dashboard")}
                      disabled={
                        activePage === "dashboard" || !enabled("dashboard")
                      }
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 disabled:cursor-default disabled:text-slate-900 disabled:hover:bg-transparent"
                    >
                      <Home size={14} /> Dashboard
                    </button>

                    {activePage !== "dashboard" && (
                      <>
                        <span className="text-slate-300">/</span>
                        <span className="truncate text-[11px] font-bold text-slate-900">
                          {activeNavLabel}
                        </span>
                      </>
                    )}

                    {activeSectionLabel && (
                      <>
                        <span className="hidden text-slate-300 sm:inline">
                          /
                        </span>
                        <span className="hidden truncate text-[11px] text-slate-500 sm:inline">
                          {activeSectionLabel}
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

                {activePage === "clinic" &&
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
                  )}

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
          )}

          <section
            className=" py-2 px-6"
            aria-busy={showNavigationSkeleton}
            aria-live="polite"
          >
            <ShellChromeContext.Provider value={shellChromeValue}>
              {showNavigationSkeleton ? (
                <ModuleSkeleton label="Loading page" />
              ) : (
                children
              )}
            </ShellChromeContext.Provider>
          </section>
        </main>
      </div>
    </div>
  );
}

type BrandBlockProps = {
  compact?: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export function BrandBlock({
  compact = false,
  setSidebarOpen,
}: BrandBlockProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`${compact ? "rounded-xl p-2" : "rounded-2xl p-3"} bg-brand text-brand-fg`}
      >
        <HeartPulse size={compact ? 20 : 24} />
      </div>
      <div className="min-w-0">
        <h1 className={`${compact ? "text-base" : "text-sm"} font-bold`}>
          MedizinHub HMS
        </h1>
        <p className="truncate text-sm text-slate-500">
          Healthcare SaaS Workspace
        </p>
      </div>
    </div>
  );
}
