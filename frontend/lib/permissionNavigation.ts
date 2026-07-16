const NAV_PERMISSION_PREFIXES: Record<string, string[]> = {
  admin: [
    "identity.users",
    "identity.roles",
    "branches",
    "departments",
    "settings",
    "files",
    "suppliers",
    "tax",
    "discounts",
    "notifications",
    "communications",
  ],
  appointments: ["appointments"],
  queue: ["queue"],
  patients: ["patients"],
  practitioners: ["practitioners"],
  scheduling: ["scheduling"],
  items: ["service_items"],
  ip: ["ip"],
  doctor: ["consultations"],
  consultation: ["consultations"],
  lab: ["lab"],
  pharmacy: ["pharmacy"],
  physiotherapy: ["physiotherapy"],
  home_care: ["home_care"],
  billing: ["billing", "invoices", "payments", "settlements"],
  subscriptions: ["patient_subscriptions"],
  reports: ["reports", "audit", "subscriptions.reports"],
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
    if (
      hasAllPermissions ||
      keys.some((permission) =>
        prefixes.some((prefix) => permissionMatchesPrefix(permission, prefix)),
      )
    ) {
      modules.add(moduleId);
    }
  }

  if (modules.has("admin")) modules.add("dashboard");
  if (isSuperAdmin) modules.add("superadmin");

  return Array.from(modules);
}
