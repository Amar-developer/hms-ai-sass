const ROLE_ALIASES: Record<string, string> = {
  receptionist: "reception",
  lab_technician: "lab",
  pharmacist: "pharmacy",
  billing_executive: "billing",
  ward_coordinator: "back_office",
};

export function normalizeSidebarRole(value: unknown) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return ROLE_ALIASES[key] || key;
}

export function normalizeSidebarModuleMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce<Record<string, string[]>>(
    (result, [role, modules]) => {
      if (Array.isArray(modules)) {
        result[normalizeSidebarRole(role)] = modules.map(String);
      }
      return result;
    },
    {},
  );
}

export function sidebarRolesForUser(
  user: any,
  fallbackRole?: string,
): string[] {
  const assignedRoles = Array.isArray(user?.roles)
    ? user.roles.filter(Boolean)
    : [];
  const values = assignedRoles.length
    ? [...assignedRoles, fallbackRole]
    : [user?.user_type, fallbackRole];
  return Array.from(
    new Set(values.map(normalizeSidebarRole).filter(Boolean)),
  );
}

export function resolveSidebarModules({
  user,
  fallbackRole,
  defaults,
  overrides,
  permissionModules,
}: {
  user: any;
  fallbackRole?: string;
  defaults: Record<string, string[]>;
  overrides: Record<string, string[]>;
  permissionModules: Iterable<string>;
}) {
  const effective = {
    ...normalizeSidebarModuleMap(defaults),
    ...normalizeSidebarModuleMap(overrides),
  };
  const configuredRoles = sidebarRolesForUser(user, fallbackRole).filter(
    (role) => Object.prototype.hasOwnProperty.call(effective, role),
  );
  if (configuredRoles.length === 0) {
    return Array.from(new Set(permissionModules));
  }
  return Array.from(
    new Set(configuredRoles.flatMap((role) => effective[role] || [])),
  );
}
