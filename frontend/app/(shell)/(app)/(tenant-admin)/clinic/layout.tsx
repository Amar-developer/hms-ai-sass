"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { TenantAdmin } from "@/features/admin/TenantAdmin";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";
import { clinic_sections } from "@/features/admin/constants";
import { canUseTenantAdminSection } from "@/features/admin/permissions";
import { SuperAdminDashboard } from "@/features/superAdmin/SuperAdminDashboard";
import { parseSuperAdminSegments } from "@/features/superAdmin/routing";
import { CLINIC_SECTION_IDS } from "@/lib/clinicSections";
import { isNewSegment, isEditSegment } from "@/lib/routeSlugs";

const SECTION_IDS = clinic_sections.map(([id]) => id);

// Doctors/Scheduling/Items/Expense live at /clinic/{id} as their own static
// (non-catch-all) routes, sibling to this [[...segments]] catch-all's
// folder — see the sibling page.tsx files. A layout.tsx here wraps every
// route under /clinic/*, those included, so this must not render the
// dashboard for their paths (their own page.tsx already renders as
// `children`); only route through ClinicSuperAdmin/ClinicTenantAdmin for
// paths this catch-all itself owns (/clinic, /clinic/users, /clinic/branches,
// /clinic/departments, and their create/edit/view sub-paths).
const CLINIC_MODULE_ROUTE_IDS = ["practitioners", "scheduling", "items", "expense"];

/**
 * One route serves "Clinic" (Users, Branches, Medical Departments) for both
 * roles that have it — a tenant admin gets tenant-scoped TenantAdmin
 * sections here (shares the same AdminDataProvider instance as /admin via
 * the (tenant-admin) route group layout), a platform/super-admin user gets
 * the same SuperAdminDashboard component /superadmin uses, just scoped to
 * the 3 clinic ids and rooted at /clinic instead (see superAdminPath in
 * routing.ts, which already knows to build /clinic/... URLs for these ids
 * regardless of which route triggered the navigation).
 *
 * Rendered here in the layout, not in page.tsx: layouts persist across
 * navigations within /clinic/** (only their params update), while pages are
 * recreated on every navigation. SuperAdminDashboard owns "which tenant am I
 * managing" as component state (data.selectedId, via useSuperAdminData) —
 * with it in page.tsx, opening a row's edit view (a real navigation to
 * /clinic/{section}/{id}/edit) fully remounted the dashboard, resetting the
 * tenant selection to the default tenant. The freshly-reset instance's
 * record list then didn't contain the id from the URL, so the "record still
 * exists?" guard bounced straight back to the list — that's what caused the
 * reported "edit a user, it instantly goes back and the tenant filter
 * resets" bug in the Users module.
 */
export default function ClinicLayout({ children }: { children: ReactNode }) {
  const ctx = useWorkspace();
  const shellChrome = useShellChrome();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const segments = (params?.segments as string[] | undefined) || [];

  const isModuleRoute = CLINIC_MODULE_ROUTE_IDS.includes(
    pathname.split("/")[2],
  );
  if (isModuleRoute) return <>{children}</>;

  const isPlatformWorkspaceUser = Boolean(
    ctx.apiSession?.user?.is_super_admin ||
      ctx.apiSession?.user?.user_type === "platform_admin" ||
      ctx.apiSession?.user?.user_type === "support_admin",
  );

  return isPlatformWorkspaceUser ? (
    <ClinicSuperAdmin
      apiSession={shellChrome.apiSession}
      switchTenant={shellChrome.switchTenant}
      setSuperAdminSection={shellChrome.setSuperAdminSection}
      segments={segments}
      router={router}
    />
  ) : (
    <ClinicTenantAdmin ctx={ctx} segments={segments} router={router} />
  );
}

function ClinicSuperAdmin({
  apiSession,
  switchTenant,
  setSuperAdminSection,
  segments,
  router,
}: {
  apiSession: any;
  switchTenant: any;
  setSuperAdminSection: (value: string) => void;
  segments: string[];
  router: ReturnType<typeof useRouter>;
}) {
  const { section, id } = parseSuperAdminSegments(segments, {
    defaultSection: "users",
    allowedSections: CLINIC_SECTION_IDS,
  });

  useEffect(() => {
    if (segments.length === 0) router.replace("/clinic/users");
  }, [segments.length, router]);

  return (
    <SuperAdminDashboard
      apiSession={apiSession}
      switchTenant={switchTenant}
      section={section}
      setSection={setSuperAdminSection}
      selectedDetailId={id}
    />
  );
}

function ClinicTenantAdmin({
  ctx,
  segments,
  router,
}: {
  ctx: any;
  segments: string[];
  router: ReturnType<typeof useRouter>;
}) {
  const defaultSection =
    clinic_sections.find(([id]) =>
      canUseTenantAdminSection(id, ctx.apiSession?.user),
    )?.[0] || "users";

  const [rawSection, second, third] = segments;
  const section = SECTION_IDS.includes(rawSection as any)
    ? (rawSection as string)
    : defaultSection;
  const isEditPath = isEditSegment(third);
  const isViewPath = Boolean(second) && !isNewSegment(second) && !third;
  const view = isEditPath
    ? "edit"
    : isViewPath
      ? "view"
      : isNewSegment(second)
        ? "create"
        : "list";
  const selectedId = view === "edit" || view === "view" ? second : "";

  useEffect(() => {
    if (segments.length === 0 || !SECTION_IDS.includes(rawSection as any)) {
      router.replace(`/clinic/${defaultSection}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments.join("/"), defaultSection]);

  return (
    <TenantAdmin
      {...ctx}
      section={section}
      view={view}
      selectedId={selectedId}
      sections={clinic_sections}
      basePath="/clinic"
    />
  );
}
