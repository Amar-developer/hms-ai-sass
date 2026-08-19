"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminDataProvider } from "@/features/admin/AdminDataContext";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

// Doctors/Scheduling/Items are full standalone modules nested under /clinic
// only for their URL (see AppShell's clinicModuleIds) — they don't use
// useAdminData(), so they're excluded from the AdminDataProvider wrap below
// to avoid firing its tenant-admin data fetch for every role that can view
// them (receptionists, doctors, etc.), not just tenant admins.
const CLINIC_MODULE_SEGMENTS = ["practitioners", "scheduling", "items"];

/**
 * Shared by /admin/* and /clinic/* (tenant-admin branch) so both keep using
 * one AdminDataProvider instance — a layout survives navigation between its
 * children without remounting, unlike page.tsx under a catch-all route (see
 * AdminDataContext.tsx). Super-admin/platform sessions render
 * SuperAdminDashboard under /clinic instead, which never calls
 * useAdminData(), so the fetch is skipped for them.
 */
export default function TenantAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { apiSession } = useWorkspace();
  const pathname = usePathname();
  const isPlatformWorkspaceUser = Boolean(
    apiSession?.user?.is_super_admin ||
      apiSession?.user?.user_type === "platform_admin" ||
      apiSession?.user?.user_type === "support_admin",
  );
  const isClinicModuleRoute = CLINIC_MODULE_SEGMENTS.some(
    (segment) => pathname.split("/")[2] === segment,
  );
  if (isPlatformWorkspaceUser || isClinicModuleRoute) return <>{children}</>;
  return <AdminDataProvider>{children}</AdminDataProvider>;
}
