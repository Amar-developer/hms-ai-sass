const SECTION_PERMISSION_PREFIXES: Record<string, string[]> = {
  users: ["identity.users"],
  roles: ["identity.roles"],
  departments: ["departments"],
  branches: ["branches"],
  suppliers: ["suppliers"],
  tax: ["tax"],
  offers: ["discounts"],
  membership: ["patient_subscriptions"],
  files: ["files"],
  settings: ["settings"],
  "patient-intelligence": ["patient_intelligence"],
  whatsapp: ["communications.whatsapp"],
};

export function canUseTenantAdminSection(section: string, user: any) {
  const permissions = user?.permissions || [];
  if (
    user?.is_super_admin ||
    permissions.includes("*") ||
    user?.roles?.includes("tenant_admin") ||
    user?.user_type === "tenant_admin"
  ) {
    return true;
  }
  if (section === "whatsapp") {
    return (
      permissions.includes("communications.read") &&
      (permissions.includes("communications.manage") ||
        permissions.includes("communications.whatsapp.manage"))
    );
  }
  const prefixes = SECTION_PERMISSION_PREFIXES[section] || [];
  const matching = permissions.filter((permission: string) =>
    prefixes.some((prefix) => permission.startsWith(`${prefix}.`)),
  );
  const isRead = (permission: string) => permission.split(".").at(-1) === "read";
  return matching.some(isRead) && matching.some((permission: string) => !isRead(permission));
}

export function canResetTenantUserPassword(apiSession: any, user: any) {
  if (!apiSession?.user || !user) return false;
  if (apiSession.user.id === user.id) return false;
  if (user.is_super_admin) return false;
  if (!Boolean(apiSession.tenantId && user.tenant_id === apiSession.tenantId))
    return false;
  const actor = apiSession.user;
  return Boolean(
    actor.is_super_admin ||
      actor.user_type === "tenant_admin" ||
      actor.roles?.includes("tenant_admin"),
  );
}
