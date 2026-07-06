export function canUseTenantAdminSection(_section: string, user: any) {
  // Every Tenant Admin console section (Users, Roles, Departments, Branches,
  // Suppliers, Tax, Offers, Membership, Files, Settings) is reserved for the
  // tenant admin role — never a clinical or front-desk role, even if a stray
  // admin permission was left on the role. The API still enforces per-endpoint
  // permission keys as the real security boundary; this only governs the menu.
  const permissions = user?.permissions || [];
  return Boolean(
    user?.is_super_admin ||
      permissions.includes("*") ||
      user?.roles?.includes("tenant_admin") ||
      user?.user_type === "tenant_admin",
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
