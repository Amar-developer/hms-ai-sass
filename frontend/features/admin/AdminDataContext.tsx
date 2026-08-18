"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import { activeTenantOptions } from "@/utils/helper";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useTenantAdminData } from "./api/useTenantAdminData";

type AdminData = ReturnType<typeof useTenantAdminData> & {
  tenantId: string;
  setTenantId: (id: string) => void;
  tenants: any[];
  scopedApiSession: any;
};

const AdminDataContext = createContext<AdminData | null>(null);

/**
 * Mounted once by the (tenant-admin) route group's layout.tsx, which Next.js
 * keeps alive across every nested /admin/* and /clinic/* navigation (unlike
 * page.tsx, which can remount between segment changes even under the same
 * catch-all route). Fetching admin data here — instead of inside TenantAdmin
 * itself — is what stops list/create/edit navigation from resetting and
 * re-fetching everything on every click, and what lets the super-admin
 * tenant switcher stay put across sections.
 */
export function AdminDataProvider({ children }: { children: ReactNode }) {
  const ctx = useWorkspace();
  const [tenantId, setTenantId] = useState(ctx.apiSession?.tenantId || "");
  const [tenants, setTenants] = useState<any[]>([]);

  // Following the workspace's own tenant (via the header switcher) resets
  // the admin-section tenant override back to it too, rather than leaving
  // the previous override pinned after the whole app moved elsewhere.
  useEffect(() => {
    setTenantId(ctx.apiSession?.tenantId || "");
  }, [ctx.apiSession?.tenantId]);

  useEffect(() => {
    if (!ctx.apiSession?.user?.is_super_admin) return;
    apiFetch("/tenants", ctx.apiSession)
      .then((rows: any[]) => setTenants(activeTenantOptions(rows)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.apiSession?.user?.is_super_admin, ctx.apiSession?.email]);

  const scopedApiSession =
    ctx.apiSession && tenantId && tenantId !== ctx.apiSession.tenantId
      ? { ...ctx.apiSession, tenantId }
      : ctx.apiSession;

  const data = useTenantAdminData(scopedApiSession, ctx.clinic);

  return (
    <AdminDataContext.Provider
      value={{ ...data, tenantId, setTenantId, tenants, scopedApiSession }}
    >
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
