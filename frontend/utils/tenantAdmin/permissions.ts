export function canUseTenantAdminSection(section: string, user: any) {
  const permissions = user?.permissions || [];
  if (
    user?.is_super_admin ||
    permissions.includes("*") ||
    user?.roles?.includes("tenant_admin")
  )
    return true;
  if (section === "users")
    return [
      "identity.users.manage",
      "identity.users.create",
      "identity.users.read",
      "identity.users.edit",
      "identity.users.delete",
    ].some((permission) => permissions.includes(permission));
  if (section === "roles")
    return (
      permissions.includes("identity.roles.manage") ||
      permissions.includes("identity.roles.read")
    );
  if (section === "departments")
    return [
      "departments.manage",
      "departments.create",
      "departments.read",
      "departments.edit",
      "departments.delete",
      "settings.manage",
    ].some((permission) => permissions.includes(permission));
  if (section === "branches")
    return [
      "branches.manage",
      "branches.create",
      "branches.read",
      "branches.edit",
      "branches.delete",
      "settings.manage",
    ].some((permission) => permissions.includes(permission));
  if (section === "suppliers")
    return [
      "suppliers.manage",
      "suppliers.create",
      "suppliers.read",
      "suppliers.edit",
      "suppliers.delete",
      "settings.manage",
      "pharmacy.manage",
    ].some((permission) => permissions.includes(permission));
  if (section === "tax")
    return [
      "tax.manage",
      "tax.create",
      "tax.read",
      "tax.edit",
      "tax.delete",
      "billing.manage",
      "settings.manage",
    ].some((permission) => permissions.includes(permission));
  if (section === "offers")
    return [
      "discounts.manage",
      "discounts.create",
      "discounts.read",
      "discounts.edit",
      "discounts.delete",
      "billing.manage",
      "settings.manage",
    ].some((permission) => permissions.includes(permission));
  if (section === "membership")
    return [
      "patient_subscriptions.manage",
      "patient_subscriptions.create",
      "patient_subscriptions.read",
      "settings.manage",
    ].some((permission) => permissions.includes(permission));
  if (section === "files")
    return [
      "files.manage",
      "files.create",
      "files.read",
      "files.edit",
      "files.delete",
      "settings.manage",
      "settings.read",
      "patients.read",
      "ip.read",
      "physiotherapy.read",
      "lab.read",
      "reports.read",
      "invoices.read",
    ].some((permission) => permissions.includes(permission));
  if (section === "settings") return permissions.includes("settings.manage");
  return false;
}

export function canResetTenantUserPassword(apiSession: any, user: any) {
  if (!apiSession?.user || !user) return false;
  if (apiSession.user.id === user.id) return false;
  if (user.is_super_admin) return false;
  return Boolean(apiSession.tenantId && user.tenant_id === apiSession.tenantId);
}
