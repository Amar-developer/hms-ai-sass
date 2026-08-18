"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { TenantAdmin } from "@/features/admin/TenantAdmin";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";
import { clinic_sections } from "@/features/admin/constants";
import { canUseTenantAdminSection } from "@/features/admin/permissions";
import { SuperAdminDashboard } from "@/features/superAdmin/SuperAdminDashboard";
import { parseSuperAdminSegments } from "@/features/superAdmin/routing";
import { CLINIC_SECTION_IDS } from "@/lib/clinicSections";

const SECTION_IDS = clinic_sections.map(([id]) => id);

/**
 * One route serves "Clinic" (Users, Branches, Medical Departments) for both
 * roles that have it — a tenant admin gets tenant-scoped TenantAdmin
 * sections here (shares the same AdminDataProvider instance as /admin via
 * the (tenant-admin) route group layout), a platform/super-admin user gets
 * the same SuperAdminDashboard component /superadmin uses, just scoped to
 * the 3 clinic ids and rooted at /clinic instead (see superAdminPath in
 * routing.ts, which already knows to build /clinic/... URLs for these ids
 * regardless of which route triggered the navigation).
 */
export default function ClinicPage() {
  const ctx = useWorkspace();
  const shellChrome = useShellChrome();
  const router = useRouter();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];

  const isPlatformWorkspaceUser = Boolean(
    ctx.apiSession?.user?.is_super_admin ||
      ctx.apiSession?.user?.user_type === "platform_admin" ||
      ctx.apiSession?.user?.user_type === "support_admin",
  );

  if (isPlatformWorkspaceUser) {
    return (
      <ClinicSuperAdmin
        apiSession={shellChrome.apiSession}
        switchTenant={shellChrome.switchTenant}
        setSuperAdminSection={shellChrome.setSuperAdminSection}
        segments={segments}
        router={router}
      />
    );
  }

  return <ClinicTenantAdmin ctx={ctx} segments={segments} router={router} />;
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
  const isEditPath = third === "edit";
  const isViewPath = Boolean(second) && second !== "new" && !third;
  const view = isEditPath
    ? "edit"
    : isViewPath
      ? "view"
      : second === "new"
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
