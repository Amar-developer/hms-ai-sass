/**
 * Maps the platform workspace's flat section names (overview, roleEdit,
 * branchAssign, ...) onto real nested URLs and back, so every Super Admin
 * screen is bookmarkable and survives refresh / back-forward.
 */

export const PLAIN_SUPER_ADMIN_SECTIONS = [
  "overview",
  "privilegedAccess",
  "tenants",
  "roles",
  "users",
  "departments",
  "branches",
  "subscriptions",
  "settings",
  "whatsappSettings",
];

export type SuperAdminRouteIds = {
  tenantId?: string;
  roleId?: string;
  userId?: string;
  departmentId?: string;
  branchId?: string;
};

/** Plural URL segment -> the singular prefix used in section names. */
const ENTITY_SEGMENTS: Record<string, string> = {
  tenants: "tenant",
  roles: "role",
  users: "user",
  departments: "department",
  branches: "branch",
};

const DETAIL_SUFFIXES: Record<string, string> = {
  edit: "Edit",
  permissions: "Permissions",
  assign: "Assign",
};

export function superAdminPath(
  section: string,
  ids: SuperAdminRouteIds = {},
): string {
  console.log(section,'sections')
  console.log(ids,'ids')
  const detail = (
    segment: string,
    id: string | undefined,
    suffix: string,
  ) => (id ? `/superadmin/${segment}/${id}/${suffix}` : `/superadmin/${segment}`);

  switch (section) {
    // Tenant create is the one section that doesn't follow <entity><Verb>.
    case "createTenant":
      return "/superadmin/tenants/new";
    case "tenantEdit":
      return detail("tenants", ids.tenantId, "edit");
    case "roleCreate":
      return "/superadmin/roles/new";
    case "roleEdit":
      return detail("roles", ids.roleId, "edit");
    case "rolePermissions":
      return detail("roles", ids.roleId, "permissions");
    case "roleAssign":
      return detail("roles", ids.roleId, "assign");
    case "userCreate":
      return "/superadmin/users/new";
    case "userEdit":
      return detail("users", ids.userId, "edit");
    case "departmentCreate":
      return "/superadmin/departments/new";
    case "departmentEdit":
      return detail("departments", ids.departmentId, "edit");
    case "departmentAssign":
      return detail("departments", ids.departmentId, "assign");
    case "branchCreate":
      return "/superadmin/branches/new";
    case "branchEdit":
      return detail("branches", ids.branchId, "edit");
    case "branchAssign":
      return detail("branches", ids.branchId, "assign");
    default:
      return PLAIN_SUPER_ADMIN_SECTIONS.includes(section)
        ? `/superadmin/${section}`
        : "/superadmin/overview";
  }
}

export function parseSuperAdminSegments(segments: string[]): {
  section: string;
  id: string;
} {
  const [first, second, third] = segments;
  if (!first) return { section: "overview", id: "" };

  const entity = ENTITY_SEGMENTS[first];
  if (entity) {
    if (second === "new") {
      return {
        section: entity === "tenant" ? "createTenant" : `${entity}Create`,
        id: "",
      };
    }
    const suffix = third ? DETAIL_SUFFIXES[third] : undefined;
    if (second && suffix) {
      return { section: `${entity}${suffix}`, id: second };
    }
  }

  return {
    section: PLAIN_SUPER_ADMIN_SECTIONS.includes(first) ? first : "overview",
    id: "",
  };
}
