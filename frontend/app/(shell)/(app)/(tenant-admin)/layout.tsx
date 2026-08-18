"use client";

import type { ReactNode } from "react";
import { AdminDataProvider } from "@/features/admin/AdminDataContext";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

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
  const isPlatformWorkspaceUser = Boolean(
    apiSession?.user?.is_super_admin ||
      apiSession?.user?.user_type === "platform_admin" ||
      apiSession?.user?.user_type === "support_admin",
  );
  if (isPlatformWorkspaceUser) return <>{children}</>;
  return <AdminDataProvider>{children}</AdminDataProvider>;
}
