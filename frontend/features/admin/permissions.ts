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
  const prefixes = SECTION_PERMISSION_PREFIXES[section] || [];
  return permissions.some((permission: string) =>
    prefixes.some((prefix) => permission.startsWith(`${prefix}.`)),
  );
}

function isTenantAdminAccount(user: any) {
  return Boolean(
    user?.user_type === "tenant_admin" || user?.roles?.includes("tenant_admin"),
  );
}

export function canResetTenantUserPassword(apiSession: any, user: any) {
  if (!apiSession?.user || !user) return false;
  if (apiSession.user.id === user.id) return false;
  if (user.is_super_admin) return false;
  if (!Boolean(apiSession.tenantId && user.tenant_id === apiSession.tenantId))
    return false;
  const actor = apiSession.user;
  const actorIsTenantAdmin =
    actor.is_super_admin || isTenantAdminAccount(actor);
  // Only a tenant admin may reset another tenant admin's password. Anyone
  // else needs identity.users.manage/edit, which governs ordinary staff
  // accounts only — mirrors the backend's _assert_can_target_user_for_management.
  if (isTenantAdminAccount(user) && !actorIsTenantAdmin) return false;
  if (actorIsTenantAdmin) return true;
  const permissions = actor.permissions || [];
  return (
    permissions.includes("identity.users.manage") ||
    permissions.includes("identity.users.edit")
  );
}
