/**
 * Maps the platform workspace's flat section names (overview, roleEdit,
 * branchAssign, ...) onto real nested URLs and back, so every Super Admin
 * screen is bookmarkable and survives refresh / back-forward.
 */

import { CLINIC_SECTION_IDS } from "@/lib/clinicSections";

const CLINIC_IDS: readonly string[] = CLINIC_SECTION_IDS;

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

/** Clinic ids (users/branches/departments) route under /clinic instead of
 * /superadmin — everything else stays under /superadmin. */
function basePathFor(segment: string): string {
  return CLINIC_IDS.includes(segment) ? "/clinic" : "/superadmin";
}

// The plain sections that still live under /superadmin (i.e. everything
// except the ones Clinic owns) — used to scope /superadmin's own segment
// parsing so it doesn't also answer for /clinic's ids.
export const SUPER_ADMIN_SETTINGS_SECTIONS = PLAIN_SUPER_ADMIN_SECTIONS.filter(
  (id) => !CLINIC_IDS.includes(id),
);

export function superAdminPath(
  section: string,
  ids: SuperAdminRouteIds = {},
): string {
  const detail = (
    segment: string,
    id: string | undefined,
    suffix: string,
  ) => {
    const base = basePathFor(segment);
    return id ? `${base}/${segment}/${id}/${suffix}` : `${base}/${segment}`;
  };

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
      return "/clinic/users/new";
    case "userEdit":
      return detail("users", ids.userId, "edit");
    case "departmentCreate":
      return "/clinic/departments/new";
    case "departmentEdit":
      return detail("departments", ids.departmentId, "edit");
    case "departmentAssign":
      return detail("departments", ids.departmentId, "assign");
    case "branchCreate":
      return "/clinic/branches/new";
    case "branchEdit":
      return detail("branches", ids.branchId, "edit");
    case "branchAssign":
      return detail("branches", ids.branchId, "assign");
    default:
      return PLAIN_SUPER_ADMIN_SECTIONS.includes(section)
        ? `${basePathFor(section)}/${section}`
        : "/superadmin/overview";
  }
}

export function parseSuperAdminSegments(
  segments: string[],
  {
    defaultSection = "overview",
    allowedSections = PLAIN_SUPER_ADMIN_SECTIONS,
  }: { defaultSection?: string; allowedSections?: readonly string[] } = {},
): {
  section: string;
  id: string;
} {
  const [first, second, third] = segments;
  if (!first) return { section: defaultSection, id: "" };

  const entity = allowedSections.includes(first) ? ENTITY_SEGMENTS[first] : undefined;
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
    section: allowedSections.includes(first) ? first : defaultSection,
    id: "",
  };
}
