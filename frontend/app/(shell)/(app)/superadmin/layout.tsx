"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { SuperAdminDashboard } from "@/features/superAdmin/SuperAdminDashboard";
import { useShellChrome } from "@/features/shell/AppShell";
import {
  parseSuperAdminSegments,
  SUPER_ADMIN_SETTINGS_SECTIONS,
} from "@/features/superAdmin/routing";

// Renders SuperAdminDashboard here instead of in page.tsx — layouts persist
// across navigations within /superadmin/** (only their params update), while
// pages are torn down and recreated on every navigation. SuperAdminDashboard
// owns "which tenant am I managing" as component state (data.selectedId,
// via useSuperAdminData) — with it in page.tsx, opening a row's edit view
// (a real navigation to /superadmin/{section}/{id}/edit) fully remounted the
// dashboard, resetting the tenant selection to the default tenant. The
// freshly-reset instance's record list then didn't contain the id from the
// URL, so the "record still exists?" guard bounced straight back to the
// list — same tenant-reset symptom reported for /clinic's users module,
// same root cause; see ../(tenant-admin)/clinic/layout.tsx for that one.
export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  const { apiSession, switchTenant, setSuperAdminSection } = useShellChrome();
  const router = useRouter();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const { section, id } = parseSuperAdminSegments(segments, {
    defaultSection: "overview",
    allowedSections: SUPER_ADMIN_SETTINGS_SECTIONS,
  });

  useEffect(() => {
    if (segments.length === 0) router.replace("/superadmin/overview");
  }, [segments.length, router]);

  return (
    <>
      <SuperAdminDashboard
        apiSession={apiSession}
        switchTenant={switchTenant}
        section={section}
        setSection={setSuperAdminSection}
        selectedDetailId={id}
      />
      {children}
    </>
  );
}
