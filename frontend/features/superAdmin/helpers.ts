import { normalizeOptionLabel } from "@/lib/options";
import { displayDate } from "@/utils/helper";
import { tenantTypes } from "./constants";

export function addressText(tenant: any) {
  return [tenant.address, tenant.city, tenant.state].join(" ");
}

export function formatDate(value: any) {
  return displayDate(value);
}

export function formatTenantType(value: string) {
  return String(value || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatTitle(value: string) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function limitLabel(value: any) {
  const number = Number(value || 0);
  return number >= 999999 ? "Unlimited" : String(number);
}

export function invoiceLimitLabel(plan: any) {
  return plan?.key === "monthly_clinic" ? "300" : "Unlimited";
}

export function catalogSubscriptionPlans(plans: any[]) {
  const catalogKeys = new Set([
    "free_trial",
    "monthly_clinic",
    "half_yearly_clinic",
    "yearly_clinic",
  ]);
  const legacyKeys = new Set(["starter", "growth", "pro", "hospital"]);
  return (plans || []).filter((plan: any) => {
    const key = String(plan.key || "");
    const name = String(plan.name || "").toLowerCase();
    if (catalogKeys.has(key)) return true;
    if (legacyKeys.has(key)) return false;
    if (key.startsWith("tenant_") || key.startsWith("tenant_modules_"))
      return false;
    if (name.includes("module access") || name.includes("onboarding plan"))
      return false;
    return true;
  });
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
  return labels[module] || formatTitle(
    String(module || "").replaceAll("_", " ").replaceAll(".", " "),
  );
}

export function tenantSelectOptions(tenants: any[]) {
  const seen = new Set<string>();
  return (tenants || []).filter((tenant: any) => {
    if (tenant.status === "suspended") return false;
    const key = normalizeOptionLabel(tenant.name || tenant.id);
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
}

export function entitlementModules(modules: any[]) {
  return (modules || [])
    .filter((module: any) => module.entitlement_key)
    .sort(
      (a: any, b: any) =>
        String(a.category || "").localeCompare(String(b.category || "")) ||
        String(a.name || "").localeCompare(String(b.name || "")),
    );
}

export function defaultModuleKeys(modules: any[]) {
  return entitlementModules(modules)
    .filter((module: any) => module.default_enabled)
    .map((module: any) => module.entitlement_key);
}

export function moduleKeysWithDependencies(rawKeys: string[], modules: any[]) {
  const moduleByKey = new Map(
    (modules || []).map((module: any) => [module.key, module]),
  );
  const moduleByEntitlement = new Map(
    entitlementModules(modules).map((module: any) => [
      module.entitlement_key,
      module,
    ]),
  );
  const selected = new Set((rawKeys || []).filter(Boolean));
  if (!selected.size)
    defaultModuleKeys(modules).forEach((key: string) => selected.add(key));
  Array.from(selected).forEach((key: string) => {
    const module = moduleByEntitlement.get(key) as any;
    (module?.dependencies || []).forEach((dependency: string) => {
      const dependencyModule = moduleByKey.get(dependency) as any;
      if (dependencyModule?.entitlement_key)
        selected.add(dependencyModule.entitlement_key);
    });
  });
  return Array.from(selected).sort();
}

export function roleDisplayName(role: any) {
  return (
    role?.name ||
    formatTitle(
      String(role?.key || "Role")
        .replaceAll("_", " ")
        .replaceAll(".", " "),
    )
  );
}

export function dedupeRoleOptions(roles: any[], selectedSet: Set<string>) {
  const byLabel = new Map<string, any>();
  for (const role of roles || []) {
    const labelKey = normalizeOptionLabel(roleDisplayName(role));
    if (!labelKey) continue;
    const existing = byLabel.get(labelKey);
    const roleSelected = selectedSet.has(role.key);
    const existingSelected = existing && selectedSet.has(existing.key);
    if (
      !existing ||
      (roleSelected && !existingSelected) ||
      (role.key === labelKey && !existingSelected)
    ) {
      byLabel.set(labelKey, role);
    }
  }
  return Array.from(byLabel.values());
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
  return unique.map((role: any) =>
    formatTitle(String(role).replaceAll("_", " ").replaceAll(".", " ")),
  );
}

export function branchDisplayName(branch: any) {
  const location = [branch.area, branch.city].filter(Boolean).join(", ");
  return location ? `${branch.name} - ${location}` : branch.name;
}

export function roleScopeLabel(role: any) {
  const key = String(role?.key || "");
  if (!key || ["doctor", "tenant_admin", "super_admin"].includes(key))
    return "All branches";
  const branchSpecific =
    /(_main_|_north_|_south_|_east_|_west_|main_|north_|south_|east_|west_)/.test(
      `_${key.toLowerCase()}_`,
    );
  return branchSpecific ? "Branch based" : "All branches";
}

export function groupRolesByName(roles: any[]) {
  const groups = new Map<string, any[]>();
  for (const role of roles || []) {
    const key = normalizeOptionLabel(role.name || role.key || role.id);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), role]);
  }
  return Array.from(groups.values()).map((rows: any[]) => {
    const sorted = [...rows].sort((a: any, b: any) =>
      String(b.updated_at || b.created_at || "").localeCompare(
        String(a.updated_at || a.created_at || ""),
      ),
    );
    const primary =
      sorted.find(
        (row: any) =>
          row.key === "tenant_admin" ||
          row.key === "doctor" ||
          row.key === "super_admin",
      ) ||
      sorted.find((row: any) => row.is_active) ||
      sorted[0];
    const scopes = Array.from(new Set(sorted.map(roleScopeLabel)));
    const latestUpdated = sorted
      .map((row: any) => row.updated_at || row.created_at)
      .filter(Boolean)
      .sort()
      .at(-1);
    const earliestCreated = sorted
      .map((row: any) => row.created_at)
      .filter(Boolean)
      .sort()[0];
    return {
      ...primary,
      id: sorted.map((row: any) => row.id).join("|"),
      key: primary.key,
      primary,
      rows: sorted,
      display_key: scopes.length === 1 ? scopes[0] : scopes.join(", "),
      is_active: sorted.some((row: any) => row.is_active),
      is_global_template: sorted.some((row: any) => row.is_global_template),
      locked: sorted.some(
        (row: any) => row.is_template_locked || row.source_template_role_id,
      ),
      created_at: earliestCreated || primary.created_at,
      updated_at: latestUpdated || primary.updated_at || primary.created_at,
    };
  });
}

export function readTenantOnboardingDraft(
  form: HTMLFormElement | null,
  branches: any[],
  plans: any[],
  modules: any[],
  templates: any,
) {
  const fd = form ? new FormData(form) : null;
  const value = (key: string, fallback = "") =>
    String(fd?.get(key) ?? fallback).trim();
  const values = (key: string) =>
    fd ? fd.getAll(key).map((item) => String(item)) : ([] as string[]);
  const branchRows = branches.map((branch: any, index: number) => ({
    index,
    name: value(`branchName_${index}`, index === 0 ? "Main Branch" : ""),
    code: value(`branchCode_${index}`, index === 0 ? "MAIN" : ""),
    city: value(`branchCity_${index}`),
    area: value(`branchArea_${index}`),
    state: value(`branchState_${index}`),
    address: value(`branchAddress_${index}`),
  }));
  const selectedPlanId = value("planId", plans[0]?.id || "");
  const selectedPlan = plans.find((plan: any) => plan.id === selectedPlanId);
  const logoFile = fd?.get("logoFile") as File | null;
  const enabledModules = selectedPlan?.enabled_modules || [];
  const roleTemplateIds = values("roleTemplateIds");
  const departmentTemplateIds = values("departmentTemplateIds");
  const branchTemplateIds = values("branchTemplateIds");
  const moduleLabels = enabledModules.map((key: string) => {
    const module = (modules || []).find(
      (item: any) => (item.entitlement_key || item.key) === key,
    );
    return module?.name || key;
  });
  const labelTemplates = (rows: any[], ids: string[]) =>
    ids.map((id) => rows.find((item: any) => item.id === id)?.name || id);
  return {
    name: value("name"),
    legalName: value("legalName"),
    tenantType: value("tenantType", "clinic"),
    tenantTypeLabel:
      tenantTypes.find(([key]) => key === value("tenantType", "clinic"))?.[1] ||
      value("tenantType", "clinic"),
    status: value("status", "trial"),
    logoName: logoFile?.name || "No logo selected",
    email: value("email"),
    phone: value("phone"),
    country: value("country", "IN"),
    timezone: value("timezone", "Asia/Kolkata"),
    address: value("address"),
    description: value("description"),
    planId: selectedPlanId,
    planName: selectedPlan?.name || "No plan selected",
    branches: branchRows,
    enabledModules,
    moduleLabels,
    roleTemplates: labelTemplates(templates?.roles || [], roleTemplateIds),
    departmentTemplates: labelTemplates(
      templates?.departments || [],
      departmentTemplateIds,
    ),
    branchTemplates: labelTemplates(
      templates?.branches || [],
      branchTemplateIds,
    ),
    adminName: value("adminName", "Tenant Admin"),
    adminEmail: value("adminEmail"),
    adminPassword: value("adminPassword"),
    adminMobile: value("adminMobile"),
    adminMustChangePassword:
      value("adminMustChangePassword", "true") === "true" ? "Yes" : "No",
  };
}

export function canResetUserPassword(
  apiSession: any,
  user: any,
  selected: any,
) {
  if (!apiSession?.user || !user) return false;
  if (apiSession.user.id === user.id) return false;
  const tenantId = user.tenant_id || selected?.id;
  if (apiSession.user.is_super_admin) {
    return Boolean(
      selected?.id &&
        tenantId === selected.id &&
        !user.is_super_admin,
    );
  }
  return false;
}
