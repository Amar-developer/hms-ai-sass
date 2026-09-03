const NAV_PERMISSION_PREFIXES: Record<string, string[]> = {
  dashboard: ["dashboard"],
  admin: [
    "identity.roles",
    "settings",
    "files",
    "suppliers",
    "tax",
    "discounts",
    "notifications",
    "communications",
    "patient_subscriptions",
  ],
  clinic: ["identity.users", "branches", "departments",],
  opd: ["appointments", "consultations", "queue"],
  queue: ["queue"],
  patients: ["patients"],
  patient_history: ["patients"],
  practitioners: ["practitioners"],
  scheduling: ["scheduling"],
  items: ["service_items"],
  ip: ["ip"],
  lab: ["lab"],
  pharmacy: ["pharmacy"],
  physiotherapy: ["physiotherapy"],
  home_care: ["home_care"],
  billing: ["billing", "invoices", "payments", "settlements"],
  subscriptions: ["patient_subscriptions"],
  reports: ["reports", "audit", "subscriptions.reports"],
  expense: ["expense", "expenses", "expense_"],
  error_logs: ["error_logs"],
};

function permissionMatchesPrefix(permission: string, prefix: string) {
  return permission === prefix || permission.startsWith(`${prefix}.`);
}

export function navigationModulesForPermissions(
  permissionKeys: Iterable<string>,
  { isSuperAdmin = false }: { isSuperAdmin?: boolean } = {},
) {
  const keys = Array.from(permissionKeys || []).map(String);
  const hasAllPermissions = keys.includes("*");
  const modules = new Set<string>();

  for (const [moduleId, prefixes] of Object.entries(NAV_PERMISSION_PREFIXES)) {
    const matchingPermissions = keys.filter((permission) =>
      prefixes.some((prefix) => permissionMatchesPrefix(permission, prefix)),
    );
    const hasMatch =
      moduleId === "dashboard"
        ? matchingPermissions.includes("dashboard.access")
        : matchingPermissions.length > 0;
    if (hasAllPermissions || hasMatch) {
      modules.add(moduleId);
    }
  }

  if (isSuperAdmin || keys.some((key) => key.startsWith("platform."))) {
    modules.add("superadmin");
    modules.add("clinic");
  }

  return Array.from(modules);
}
