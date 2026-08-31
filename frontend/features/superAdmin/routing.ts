/**
 * Maps the platform workspace's flat section names (overview, roleEdit,
 * branchAssign, ...) onto real nested URLs and back, so every Super Admin
 * screen is bookmarkable and survives refresh / back-forward.
 */

import { CLINIC_SECTION_IDS } from "@/lib/clinicSections";
import { newSegment, editSegment, isNewSegment, isEditSegment } from "@/lib/routeSlugs";

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
  "smsSettings",
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
    const finalSuffix =
      suffix === "edit" ? editSegment(ENTITY_SEGMENTS[segment] || segment) : suffix;
    return id ? `${base}/${segment}/${id}/${finalSuffix}` : `${base}/${segment}`;
  };

  switch (section) {
    // Tenant create is the one section that doesn't follow <entity><Verb>.
    case "createTenant":
      return `/superadmin/tenants/${newSegment(ENTITY_SEGMENTS.tenants)}`;
    case "tenantEdit":
      return detail("tenants", ids.tenantId, "edit");
    case "roleCreate":
      return `/superadmin/roles/${newSegment(ENTITY_SEGMENTS.roles)}`;
    case "roleEdit":
      return detail("roles", ids.roleId, "edit");
    case "rolePermissions":
      return detail("roles", ids.roleId, "permissions");
    case "roleAssign":
      return detail("roles", ids.roleId, "assign");
    case "userCreate":
      return `/clinic/users/${newSegment(ENTITY_SEGMENTS.users)}`;
    case "userEdit":
      return detail("users", ids.userId, "edit");
    case "departmentCreate":
      return `/clinic/departments/${newSegment(ENTITY_SEGMENTS.departments)}`;
    case "departmentEdit":
      return detail("departments", ids.departmentId, "edit");
    case "departmentAssign":
      return detail("departments", ids.departmentId, "assign");
    case "branchCreate":
      return `/clinic/branches/${newSegment(ENTITY_SEGMENTS.branches)}`;
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
    if (isNewSegment(second)) {
      return {
        section: entity === "tenant" ? "createTenant" : `${entity}Create`,
        id: "",
      };
    }
    const suffix = third
      ? isEditSegment(third)
        ? DETAIL_SUFFIXES.edit
        : DETAIL_SUFFIXES[third]
      : undefined;
    if (second && suffix) {
      return { section: `${entity}${suffix}`, id: second };
    }
  }

  return {
    section: allowedSections.includes(first) ? first : defaultSection,
    id: "",
  };
}
