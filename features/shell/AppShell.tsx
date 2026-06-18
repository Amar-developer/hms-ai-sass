"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, ArrowRight, HeartPulse, Home, Menu } from "lucide-react";
import { Card } from "@/components/common/ui";
import { ChangePassword } from "@/features/auth/ChangePassword";
import { AppointmentCalendarBooking } from "@/features/appointments/AppointmentCalendarBooking";
import { TenantAdmin } from "@/features/admin/TenantAdmin";
import { canUseTenantAdminSection } from "@/utils/tenantAdmin/permissions";
import { tenantAdminSections } from "@/utils/tenantAdmin/constants";
import { Billing } from "@/features/billing/Billing";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { DoctorConsultation } from "@/features/doctor/DoctorConsultation";
import { IPAdmission } from "@/features/ip/IPAdmission";
import { HomeCare } from "@/features/home-care/HomeCare";
import { Items } from "@/features/items/Items";
import { Lab } from "@/features/lab/Lab";
import { Patient } from "@/features/patients/Patient";
import { Pharmacy } from "@/features/pharmacy/Pharmacy";
import { Physiotherapy } from "@/features/physiotherapy/Physiotherapy";
import {
  SuperAdminDashboard,
  superAdminSections,
} from "@/features/platform/SuperAdminDashboard";
import { Doctors } from "@/features/doctors/Doctors";
import { TokenQueue } from "@/features/queue/TokenQueue";
import { Reports, reportSections } from "@/features/reports/Reports";
import { Scheduling } from "@/features/scheduling/Scheduling";
import { PatientSubscriptions } from "@/features/patient_subscriptions/PatientSubscriptions";
import { uniqueDepartmentRows } from "@/lib/options";
import { Sidebar } from "@/components/common/Sidebar";
import AppHeader from "@/components/common/AppHeader";
import { DepartmentFilterCard } from "@/components/common/DepartmentFilterCard";

export function AppShell(props: any) {
  const {
    active,
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
  const visibleNav = nav.filter(
    ([id]: any) => enabled(id) && !(isSuperAdmin && id === "admin"),
  );
  const activePage = visibleNav.some(([id]: any) => id === active)
    ? active
    : isSuperAdmin
      ? "superadmin"
      : visibleNav[0]?.[0] || "dashboard";
  const primaryRole = apiSession?.user?.roles?.[0] || role;
  const roleLabel =
    demoUsers.find((u: any) => u[0] === primaryRole)?.[1] ||
    primaryRole?.replace(/_/g, " ") ||
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
  const departmentName =
    departmentOptions.find((d: any) => d.id === departmentId)?.name ||
    departmentOptions[0]?.name ||
    "Assigned medical department";
  const displayClinicName = clinic.name || "Hospital / Clinic";
  const visibleTenantOptions = activeTenantOptions(tenants);
  const tenantOptions = isSuperAdmin
    ? visibleTenantOptions.length
      ? visibleTenantOptions
      : [{ id: apiSession?.tenantId || clinic.id, name: displayClinicName }]
    : clinics;
  const [superAdminSection, setSuperAdminSection] = useState("overview");
  const [superAdminSettingsOpen, setSuperAdminSettingsOpen] = useState(true);
  const [tenantAdminSection, setTenantAdminSection] = useState("users");
  const [tenantAdminSettingsOpen, setTenantAdminSettingsOpen] = useState(false);
  const visibleTenantAdminSections = tenantAdminSections.filter(
    ([sectionId]: any) => canUseTenantAdminSection(sectionId, apiSession?.user),
  );
  const [pageHistory, setPageHistory] = useState<string[]>([activePage]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(true);
  const [reportsSection, setReportsSection] = useState("metrix");
  const [sideBarOpen, setSidebarOpen] = useState(true);
  const [tabletCollapsed, setTabletCollapsed] = useState(true);
  const profileOpenRef = useRef<HTMLDivElement>(null);
  const activeNavLabel =
    visibleNav.find(([id]: any) => id === activePage)?.[1] || "Dashboard";

  const activeSectionLabel =
    activePage === "superadmin"
      ? String(
          superAdminSections.find(
            ([id]: any) => id === superAdminSection,
          )?.[1] ?? "",
        )
      : activePage === "admin"
        ? String(
            tenantAdminSections.find(
              ([id]: any) => id === tenantAdminSection,
            )?.[1] ?? "",
          )
        : activePage === "reports"
          ? String(
              reportSections.find(([id]: any) => id === reportsSection)?.[1] ??
                "",
            )
          : "";

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < pageHistory.length - 1;
  const searchItems = [
    ...visibleNav.map(([id, label]: any) => ({
      id: `module-${id}`,
      label,
      description: "Module",
      keywords: `${label} page form list`,
      action: () => navigatePage(id),
    })),
    ...tenantAdminSections
      .filter(([sectionId]: any) =>
        visibleTenantAdminSections.some(([id]: any) => id === sectionId),
      )
      .map(([id, label]: any) => ({
        id: `admin-${id}`,
        label: `${label}`,
        description: "Tenant Admin",
        keywords: `settings admin ${label}`,
        action: () => navigatePage({ id: "admin", section: id }),
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
    ...(isSuperAdmin
      ? superAdminSections.map(([id, label]: any) => ({
          id: `superadmin-${id}`,
          label: `${label}`,
          description: "Super Admin",
          keywords: `platform super admin ${label}`,
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

  function navigatePage(target: string | { id: string; section?: string }) {
    const id = typeof target === "string" ? target : target.id;
    const section = typeof target === "string" ? undefined : target.section;
    if (!id) return;
    if (id === "admin" && section) {
      setTenantAdminSettingsOpen(true);
      setTenantAdminSection(section);
    }
    if (id === "reports" && section) {
      setReportsOpen(true);
      setReportsSection(section);
    }
    if (id === "superadmin" && section) {
      setSuperAdminSettingsOpen(true);
      setSuperAdminSection(section);
    }
    if (id === activePage) return;
    setActive(id);
    setPageHistory((prev) => {
      const next = [...prev.slice(0, historyIndex + 1), id];
      setHistoryIndex(next.length - 1);
      return next;
    });
  }

  function goHistory(direction: -1 | 1) {
    const nextIndex = historyIndex + direction;
    const nextPage = pageHistory[nextIndex];
    if (nextPage === undefined) return;
    setHistoryIndex(nextIndex);
    setActive(nextPage);
  }

  // useEffect(() => {
  //   const handleClickOutside = (event: MouseEvent) => {
  //     if (
  //       profileOpenRef.current &&
  //       !profileOpenRef.current.contains(event.target as Node)
  //     ) {
  //       setProfileOpen(false);
  //       if (sideBarOpen) {
  //         setSidebarOpen(false);
  //       }
  //     }
  //   };
  //   document.addEventListener("mousedown", handleClickOutside);
  //   return () => document.addEventListener("mousedown", handleClickOutside);
  // }, [sideBarOpen, profileOpenRef.current]);

  useEffect(() => {
    if (window.innerWidth > 1024) {
      setSidebarOpen(true);
      setTabletCollapsed(false);
    }
  }, [window.innerWidth]);

  function renderPage() {
    switch (activePage) {
      case "dashboard":
        return (
          <Dashboard
            {...ctx}
            liveSummary={liveSummary}
            setActive={navigatePage}
            nav={nav}
            enabled={enabled}
          />
        );
      case "superadmin":
        return (
          <SuperAdminDashboard
            apiSession={apiSession}
            switchTenant={switchTenant}
            section={superAdminSection}
            setSection={setSuperAdminSection}
          />
        );
      case "appointments":
        return <AppointmentCalendarBooking {...ctx} setActive={navigatePage} />;
      case "queue":
        return <TokenQueue {...ctx} setActive={navigatePage} />;
      case "patients":
        return <Patient {...ctx} />;
      case "practitioners":
        return <Doctors {...ctx} />;
      case "scheduling":
        return <Scheduling {...ctx} />;
      case "items":
        return <Items {...ctx} />;
      case "ip":
        return <IPAdmission {...ctx} />;
      case "doctor":
        return (
          <DoctorConsultation
            {...ctx}
            view="dashboard"
            setActive={navigatePage}
          />
        );
      case "consultation":
        return (
          <DoctorConsultation
            {...ctx}
            view="workspace"
            setActive={navigatePage}
          />
        );
      case "lab":
        return <Lab {...ctx} />;
      case "pharmacy":
        return <Pharmacy {...ctx} />;
      case "physiotherapy":
        return <Physiotherapy {...ctx} />;
      case "home_care":
        return <HomeCare {...ctx} setActive={navigatePage} />;
      case "billing":
        return <Billing {...ctx} />;
      case "admin":
        return (
          <TenantAdmin
            {...ctx}
            section={tenantAdminSection}
            setSection={setTenantAdminSection}
          />
        );
      case "subscriptions":
        return <PatientSubscriptions {...ctx} />;
      case "reports":
        return <Reports {...ctx} section={reportsSection} />;
      default:
        return (
          <Card>
            <h3 className="text-lg font-bold">Module unavailable</h3>
            <p className="mt-2 text-sm text-slate-500">
              This module is not enabled for the current role or tenant.
            </p>
          </Card>
        );
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-white text-slate-900">
      {/* Sidebar */}
      <div
        className={`
    fixed left-0 top-0 z-40 h-screen bg-white border-r border-slate-200
    transition-all duration-300

    md:w-14
    ${!tabletCollapsed ? "md:w-64" : ""}

    lg:w-72
  `}
      >
        {/* Tablet view Sidebar */}
        <div className="w-fit lg:w-full scrollbar-hidden h-full overflow-y-auto  ">
          <Sidebar
            visibleNav={visibleNav}
            activePage={activePage}
            navigatePage={navigatePage}
            isSuperAdmin={isSuperAdmin}
            reportsOpen={reportsOpen}
            setReportsOpen={setReportsOpen}
            reportsSection={reportsSection}
            setReportsSection={setReportsSection}
            tenantAdminSettingsOpen={tenantAdminSettingsOpen}
            setTenantAdminSettingsOpen={setTenantAdminSettingsOpen}
            tenantAdminSection={tenantAdminSection}
            setTenantAdminSection={setTenantAdminSection}
            superAdminSettingsOpen={superAdminSettingsOpen}
            setSuperAdminSettingsOpen={setSuperAdminSettingsOpen}
            superAdminSection={superAdminSection}
            setSuperAdminSection={setSuperAdminSection}
            visibleTenantAdminSections={visibleTenantAdminSections}
            enabled={enabled}
            clinic={clinic}
            setSidebarOpen={setSidebarOpen}
            sideBarOpen={sideBarOpen}
            reportSections={reportSections}
            reportSection={reportsSection}
            superAdminSections={superAdminSections}
            tabletCollapsed={tabletCollapsed}
            setTabletCollapsed={setTabletCollapsed}
          />
        </div>
      </div>
      <div className="h-full lg:flex ">
        <aside className="scrollbar-hidden hidden h-screen w-64 lg:w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4 lg:block">
          Desktop view
          <div
            className={`fixed left-0 top-0 z-40 h-screen w-64 lg:w-72 transform bg-white transition-transform duration-300 lg:static lg:translate-x-0 ${
              sideBarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <Sidebar
              visibleNav={visibleNav}
              activePage={activePage}
              navigatePage={navigatePage}
              isSuperAdmin={isSuperAdmin}
              reportsOpen={reportsOpen}
              setReportsOpen={setReportsOpen}
              reportsSection={reportsSection}
              setReportsSection={setReportsSection}
              tenantAdminSettingsOpen={tenantAdminSettingsOpen}
              setTenantAdminSettingsOpen={setTenantAdminSettingsOpen}
              tenantAdminSection={tenantAdminSection}
              setTenantAdminSection={setTenantAdminSection}
              superAdminSettingsOpen={superAdminSettingsOpen}
              setSuperAdminSettingsOpen={setSuperAdminSettingsOpen}
              superAdminSection={superAdminSection}
              setSuperAdminSection={setSuperAdminSection}
              visibleTenantAdminSections={visibleTenantAdminSections}
              enabled={enabled}
              clinic={clinic}
              setSidebarOpen={setSidebarOpen}
              sideBarOpen={sideBarOpen}
              reportSections={reportSections}
              reportSection={reportsSection}
              superAdminSections={superAdminSections}
              tabletCollapsed={tabletCollapsed}
              setTabletCollapsed={setTabletCollapsed}
            />
          </div>
          <div className="mt-8 rounded-lg bg-slate-50 p-4 text-xs leading-5 text-slate-500">
            <b className="text-slate-900">
              {isSuperAdmin ? "Primary Tenant" : clinic.type}
            </b>
            <br />
            {isSuperAdmin
              ? "Global platform access"
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
            isSuperAdmin={isSuperAdmin}
            apiSession={apiSession}
            tenantOptions={tenantOptions}
            switchTenant={switchTenant}
            branchId={branchId}
            setBranchId={setBranchId}
            clinic={clinic}
            canChangeBranch={canChangeBranch}
            branchName={branchName}
            departmentName={departmentName}
            displayClinicName={displayClinicName}
            searchItems={searchItems}
            profileOpen={profileOpen}
            setProfileOpen={setProfileOpen}
            profileOpenRef={profileOpenRef}
            roleLabel={roleLabel}
            handleLogout={handleLogout}
            setShowPassword={setShowPassword}
            setReportsOpen={setReportsOpen}
            // setTabletCollapsed={setTabletCollapsed}
          />

          {showPassword && (
            <ChangePassword
              apiSession={apiSession}
              onClose={() => setShowPassword(false)}
            />
          )}

          <div className="bg-white px-4 py-2 lg:px-6">
            <div className="flex min-w-0 flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
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
                    onClick={() => navigatePage("dashboard")}
                    disabled={
                      activePage === "dashboard" || !enabled("dashboard")
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-default disabled:text-slate-900 disabled:hover:bg-transparent"
                  >
                    <Home size={14} /> Dashboard
                  </button>

                  {activePage !== "dashboard" && (
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

              {activePage === "admin" &&
                visibleTenantAdminSections.length > 0 && (
                  <div className="flex shrink-0 items-center justify-end gap-2">
                    <span className="hidden text-[11px] font-bold uppercase tracking-wide text-slate-400 md:inline">
                      Tenant Admin
                    </span>
                    <select
                      value={tenantAdminSection}
                      onChange={(event) => {
                        setTenantAdminSettingsOpen(true);
                        setTenantAdminSection(event.target.value);
                      }}
                      className="h-9 min-w-[190px] rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-900 outline-none transition  bg-white"
                    >
                      {visibleTenantAdminSections.map(([id, label]: any) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
            </div>
          </div>

          <section className="space-y-4 py-4 px-6">
            {pageNeedsDepartmentFilter && (
              <DepartmentFilterCard
                departmentId={departmentId}
                setDepartmentId={setDepartmentId}
                departmentOptions={departmentOptions}
                disabled={!canChangeDepartment}
              />
            )}
            {renderPage()}
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
        className={`${compact ? "rounded-xl p-2" : "rounded-2xl p-3"} bg-slate-900 text-white`}
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

function activeTenantOptions(tenants: any[]) {
  const seen = new Set<string>();
  return (tenants || []).filter((tenant: any) => {
    if (tenant.status === "suspended") return false;
    const key = String(tenant.name || tenant.id || "")
      .trim()
      .toLowerCase();
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
}
