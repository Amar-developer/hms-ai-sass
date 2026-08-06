import { serviceScopes } from "./constants";
import { humanizeOptionLabel, normalizeOptionLabel } from "@/lib/options";
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

export function tenantRoleOptions(
  roles: any[],
  _branches: any[],
  _selectedBranchId: string,
  selectedKeys: string[],
) {
  const selectedSet = new Set(selectedKeys || []);
  const withTenantAdmin = (roles || []).some(
    (role: any) => role.key === "tenant_admin",
  )
    ? roles || []
    : [
        {
          id: "tenant_admin_default",
          key: "tenant_admin",
          name: "Tenant Admin",
          permission_keys: [],
        },
        ...(roles || []),
      ];
  const byName = new Map<string, any>();
  for (const role of withTenantAdmin) {
    const roleKey = String(role?.key || "").trim();
    if (!roleKey) continue;
    const roleName = String(role.name || roleKeyLabel(roleKey)).trim();
    const key = normalizeOptionLabel(roleName);
    if (!key) continue;
    const next = { ...role, name: roleName, branchLabel: "" };
    const existing = byName.get(key);
    if (!existing || selectedSet.has(roleKey)) {
      byName.set(key, next);
    }
  }
  return Array.from(byName.values()).sort((a: any, b: any) =>
    String(a.name).localeCompare(String(b.name)),
  );
}

export function permissionModuleTitle(module: string) {
  const labels: Record<string, string> = {
    dashboard: "Dashboard / Overview",
    departments: "Medical Departments",
    "identity.users": "Users",
    "identity.roles": "Roles",
    "platform.tenants": "Tenant Management",
    "platform.subscriptions": "Subscription Management",
    "subscriptions.reports": "Subscription Reports",
    practitioners: "Doctors & Practitioners",
    scheduling: "Doctor Scheduling",
    consultations: "Doctor Workspace & Consultations",
    patients: "EMR / Patient Management",
    queue: "Token Queue",
    service_items: "Items / Service Catalog",
    billing: "Billing",
    "billing.discounts": "Billing Discounts",
    "billing.refunds": "Billing Refunds",
    invoices: "Invoices & Receipts",
    payments: "Payments",
    settlements: "Doctor Settlements",
    lab: "Lab & Services",
    "lab.results": "Lab Results",
    pharmacy: "Pharmacy / Prescriptions",
    patient_subscriptions: "Patient Membership",
    home_care: "Home Care",
    ip: "IP Admission",
    audit: "Audit & Compliance",
    reports: "Reports",
    "reports.revenue": "Revenue Reports",
    error_logs: "Error Logs",
    communications: "Communications",
    "communications.whatsapp": "WhatsApp Communications",
    "communications.sms": "SMS Communications",
    "communications.voice": "Voice Communications",
    "ai.assist": "AI Assist",
  };
  if (labels[module]) return labels[module];
  return title(module.replaceAll("_", " ").replaceAll(".", " "));
}

export function userRoleLabels(user: any, tenantRoles: any[] = []) {
  const roleLabelByValue = new Map<string, string>();
  for (const role of tenantRoles || []) {
    const label = String(role?.name || roleKeyLabel(role?.key)).trim();
    if (!label) continue;
    [role?.key, role?.id, role?.name]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .forEach((value) => roleLabelByValue.set(value, label));
  }

  const rawRoles = Array.isArray(user?.roles)
    ? user.roles
    : String(user?.roles || "").split(",");
  const roles = rawRoles
    .map((role: any) => String(role || "").trim())
    .filter(Boolean);
  const fallback = String(user?.user_type || "").trim();
  const unique = Array.from(
    new Set<string>(roles.length ? roles : fallback ? [fallback] : []),
  );
  return unique.map(
    (role) => roleLabelByValue.get(role) || roleKeyLabel(role) || "Staff",
  );
}
