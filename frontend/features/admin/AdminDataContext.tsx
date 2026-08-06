"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useTenantAdminData } from "./api/useTenantAdminData";

type AdminData = ReturnType<typeof useTenantAdminData>;

const AdminDataContext = createContext<AdminData | null>(null);

/**
 * Mounted once by app/(shell)/(app)/admin/layout.tsx, which Next.js keeps
 * alive across every nested /admin/* navigation (unlike page.tsx, which can
 * remount between segment changes even under the same catch-all route).
 * Fetching admin data here — instead of inside TenantAdmin itself — is what
 * stops list/create/edit navigation from resetting and re-fetching
 * everything on every click.
 */
export function AdminDataProvider({ children }: { children: ReactNode }) {
  const ctx = useWorkspace();
  const data = useTenantAdminData(ctx.apiSession, ctx.clinic);
  return (
    <AdminDataContext.Provider value={data}>
      {children}
    </AdminDataContext.Provider>
  );
}

export function useAdminData(): AdminData {
  const value = useContext(AdminDataContext);
  if (!value) {
    throw new Error("useAdminData must be used within AdminDataProvider");
  }
  return value;
}
