import type { ApiSession } from "@/lib/api";

export function canReadPatientLinkedModule(
  session: ApiSession | null,
  enabledModules: string[] | undefined,
  moduleKey: "ip" | "physiotherapy",
) {
  if (!session) return false;
  if (enabledModules && !enabledModules.includes(moduleKey)) return false;

  const user = session.user;
  const permissions = user?.permissions || [];
  const tenantAdmin = Boolean(
    user?.user_type === "tenant_admin" || user?.roles?.includes("tenant_admin"),
  );
  return Boolean(
    user?.is_super_admin ||
      tenantAdmin ||
      permissions.includes("*") ||
      permissions.includes(`${moduleKey}.manage`) ||
      permissions.includes(`${moduleKey}.read`),
  );
}
