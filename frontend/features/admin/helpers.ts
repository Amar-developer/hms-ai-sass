import { serviceScopes } from "./constants";
import { humanizeOptionLabel,normalizeOptionLabel } from "@/lib/options";
import { uploadAssetUrl } from "@/lib/api";
import { displayDate } from "@/utils/helper";

export function title(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDate(value: any) {
  return displayDate(value);
}

export function isLocked(row: any) {
  return Boolean(
    row?.is_template_locked ||
    row?.source_template_role_id ||
    row?.source_template_department_id ||
    row?.source_template_branch_id,
  );
}

export function scopeLabel(value: any) {
  return (
    serviceScopes.find(([scope]) => scope === value)?.[1] ||
    title(String(value || "all").replaceAll("_", " "))
  );
}

export function roleKeyLabel(value: any) {
  return humanizeOptionLabel(
    String(value || "")
      .replace(/^sun_[a-z0-9]+_/i, "")
      .replace(/^tenant_/i, "tenant "),
  );
}

export function settingLabel(value: any) {
  return humanizeOptionLabel(
    String(value || "")
      .split(".")
      .pop() || value,
  );
}

export function settingValueLabel(value: any) {
  if (Array.isArray(value))
    return (
      value.map((item: any) => humanizeOptionLabel(item)).join(", ") || "-"
    );
  if (value && typeof value === "object")
    return Object.entries(value)
      .map(
        ([key, item]) =>
          `${humanizeOptionLabel(key)}: ${settingValueLabel(item)}`,
      )
      .join(", ");
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        return settingValueLabel(JSON.parse(trimmed));
      } catch {}
    }
    return humanizeOptionLabel(trimmed);
  }
  if (value === true) return "Yes";
  if (value === false) return "No";
  return value ?? "-";
}


export function dateToInput(value: any) {
  return value ? String(value).slice(0, 10) : "";
}

export function dateInputToIso(value: any) {
  const raw = String(value || "");
  return raw ? `${raw}T00:00:00Z` : null;
}


export function patientLabel(patients: any[], patientId: any) {
  const patient = patients.find((row: any) => row.id === patientId);
  return patient
    ? [patient.full_name || patient.name, patient.patient_number]
        .filter(Boolean)
        .join(" - ")
    : patientId || "-";
}

export function assetUrl(value: string) {
  return uploadAssetUrl(value);
}

export function listValue(value: string) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function asOptionList(values: string[]) {
  return values.map((value) => ({ value, label: humanizeOptionLabel(value) }));
}


export function groupDepartmentsByName(departments: any[], branches: any[]) {
  const branchName = (id: string) =>
    branches.find((branch: any) => branch.id === id)?.name || "All branches";
  const groups = new Map<string, any[]>();
  for (const department of departments || []) {
    const key = normalizeOptionLabel(
      department.name || department.code || department.id,
    );
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), department]);
  }
  return Array.from(groups.values()).map((rows: any[]) => {
    const sorted = [...rows].sort((a: any, b: any) =>
      String(a.branch_id || "").localeCompare(String(b.branch_id || "")),
    );
    const primary =
      sorted.find((row: any) => row.is_active) !== undefined
        ? sorted.find((row: any) => row.is_active)
        : sorted[0];
    const branchNames = Array.from(
      new Set(
        sorted.map((row: any) => branchName(row.branch_id)).filter(Boolean),
      ),
    );
    return {
      ...primary,
      id: sorted.map((row: any) => row.id).join("|"),
      primary,
      rows: sorted,
      branch_names: branchNames.join(", "),
      is_active: sorted.some((row: any) => row.is_active),
      locked: sorted.some((row: any) => isLocked(row)),
    };
  });
}

export function roleBranchToken(branch: any) {
  const code = String(branch?.code || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const name = String(branch?.name || "")
    .toLowerCase()
    .replace(/sunrise|centre|center|clinic|branch|wing/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return [code, name].filter(Boolean);
}

export function roleMatchesBranch(role: any, branch: any) {
  if (!branch) return true;
  const key = String(role.key || "").toLowerCase();
  const tokens = roleBranchToken(branch);
  if (tokens.length === 0) return true;
  const hasBranchToken = tokens.some((token) => token && key.includes(token));
  const isBranchSpecific =
    /(_main_|_north_|_south_|_east_|_west_|main_|north_|south_|east_|west_)/.test(
      `_${key}_`,
    );
  return hasBranchToken || !isBranchSpecific;
}

export function filterRolesForBranch(
  roles: any[],
  branches: any[],
  selectedBranchId: string,
  selectedKeys: string[],
) {
  const branch = branches.find((row: any) => row.id === selectedBranchId);
  const selectedSet = new Set(selectedKeys || []);
  const byName = new Map<string, any>();
  for (const role of roles || []) {
    if (!roleMatchesBranch(role, branch) && !selectedSet.has(role.key))
      continue;
    const key = normalizeOptionLabel(role.name || role.key);
    const next = { ...role, branchLabel: selectedBranchId ? branch?.name : "" };
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, next);
      continue;
    }
    const existingSelected = selectedSet.has(existing.key);
    const nextSelected = selectedSet.has(role.key);
    if (existingSelected && !nextSelected) continue;
    if (
      nextSelected !== existingSelected ||
      (!roleMatchesBranch(existing, branch) && roleMatchesBranch(role, branch))
    ) {
      byName.set(key, next);
    }
  }
  return Array.from(byName.values()).sort((a: any, b: any) =>
    String(a.name).localeCompare(String(b.name)),
  );
}

export function permissionModuleTitle(module: string) {
  const labels: Record<string, string> = {
    departments: "Medical Departments",
    "identity.users": "Users",
    "identity.roles": "Roles",
    "platform.tenants": "Tenant Management",
    "platform.subscriptions": "Subscription Management",
    patient_subscriptions: "Patient Membership",
    home_care: "Home Care",
    ip: "IP Admission",
  };
  if (labels[module]) return labels[module];
  return title(module.replaceAll("_", " "));
}

export function userRoleLabels(user: any) {
  const rawRoles = Array.isArray(user?.roles)
    ? user.roles
    : String(user?.roles || "").split(",");
  const roles = rawRoles
    .map((role: any) => String(role || "").trim())
    .filter(Boolean);
  const fallback = String(user?.user_type || "").trim();
  const unique = Array.from(
    new Set(roles.length ? roles : fallback ? [fallback] : []),
  );
  return unique.map((role) => humanizeOptionLabel(role, "Staff"));
}
