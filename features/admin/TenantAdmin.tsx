"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ClipboardList,
  FileText,
  Percent,
  Plus,
  Settings,
  ShieldCheck,
  Tags,
  Truck,
  Users,
} from "lucide-react";
import {
  ActionButton,
  ActionGroup,
  Badge,
  Button,
  Card,
  Field,
  Input,
  SearchableSelect,
  Select,
} from "@/components/ui";
import { PatientSubscriptions } from "@/features/patient_subscriptions/PatientSubscriptions";
import { UPLOADS_BASE, apiFetch, apiUpload } from "@/lib/api";
import {
  humanizeOptionLabel,
  normalizeOptionLabel,
  publicDisplayValue,
} from "@/lib/options";

const sections = [
  ["users", "Users", Users],
  ["roles", "Roles", ShieldCheck],
  ["departments", "Departments", ClipboardList],
  ["branches", "Branches", Building2],
  ["suppliers", "Suppliers", Truck],
  ["tax", "Tax", Percent],
  ["offers", "Discounts & Offers", Tags],
  ["membership", "Patient Membership", ShieldCheck],
  ["files", "Files", FileText],
  ["settings", "Tenant & Branch Settings", Settings],
] as const;

const defaultNumberingEntities: any = {
  user: "USR",
  patient: "PAT",
  doctor: "DOC",
  department: "DEPT",
  lab_order: "LAB",
  pharmacy_issue: "PHM",
  invoice: "INV",
  ip_admission: "IP",
  physiotherapy_case: "PHY",
  supplier: "SUP",
};
const parseNumberingRules = (value: any, fallbackPrefix = "SUN") => ({
  prefix: String(value?.prefix || fallbackPrefix || "SUN").toUpperCase(),
  digits: Number(value?.digits || 5),
  entities: { ...defaultNumberingEntities, ...(value?.entities || {}) },
});

export const tenantAdminSections = sections;
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
    return ["settings.manage", "pharmacy.manage"].some((permission) =>
      permissions.includes(permission),
    );
  if (section === "tax")
    return ["billing.manage", "settings.manage"].some((permission) =>
      permissions.includes(permission),
    );
  if (section === "offers")
    return ["billing.manage", "settings.manage"].some((permission) =>
      permissions.includes(permission),
    );
  if (section === "membership")
    return [
      "patient_subscriptions.manage",
      "patient_subscriptions.create",
      "patient_subscriptions.read",
      "settings.manage",
    ].some((permission) => permissions.includes(permission));
  if (section === "files")
    return [
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
const userTypes = [
  ["tenant_admin", "Tenant Admin"],
  ["doctor", "Doctor"],
  ["reception", "Reception"],
  ["nurse", "Staff Nurse"],
  ["lab", "Lab Technician"],
  ["pharmacy", "Pharmacy User"],
  ["billing", "Billing Staff"],
  ["back_office", "Back Office Staff"],
  ["staff", "General Staff"],
] as const;

const requiredRolePermissions = [
  {
    key: "identity.users.manage",
    module: "identity.users",
    action: "manage",
    description: "Users Manage",
  },
  {
    key: "identity.users.create",
    module: "identity.users",
    action: "create",
    description: "Users Create",
  },
  {
    key: "identity.users.read",
    module: "identity.users",
    action: "read",
    description: "Users Read",
  },
  {
    key: "identity.users.edit",
    module: "identity.users",
    action: "edit",
    description: "Users Edit",
  },
  {
    key: "identity.users.delete",
    module: "identity.users",
    action: "delete",
    description: "Users Delete",
  },
  {
    key: "departments.manage",
    module: "departments",
    action: "manage",
    description: "Departments Manage",
  },
  {
    key: "departments.create",
    module: "departments",
    action: "create",
    description: "Departments Create",
  },
  {
    key: "departments.read",
    module: "departments",
    action: "read",
    description: "Departments Read",
  },
  {
    key: "departments.edit",
    module: "departments",
    action: "edit",
    description: "Departments Edit",
  },
  {
    key: "departments.delete",
    module: "departments",
    action: "delete",
    description: "Departments Delete",
  },
  {
    key: "branches.manage",
    module: "branches",
    action: "manage",
    description: "Branches Manage",
  },
  {
    key: "branches.create",
    module: "branches",
    action: "create",
    description: "Branches Create",
  },
  {
    key: "branches.read",
    module: "branches",
    action: "read",
    description: "Branches Read",
  },
  {
    key: "branches.edit",
    module: "branches",
    action: "edit",
    description: "Branches Edit",
  },
  {
    key: "branches.delete",
    module: "branches",
    action: "delete",
    description: "Branches Delete",
  },
  {
    key: "billing.manage",
    module: "billing",
    action: "manage",
    description: "Billing Manage",
  },
  {
    key: "payments.manage",
    module: "payments",
    action: "manage",
    description: "Payments Manage",
  },
  {
    key: "scheduling.manage",
    module: "scheduling",
    action: "manage",
    description: "Scheduling Manage",
  },
  {
    key: "scheduling.create",
    module: "scheduling",
    action: "create",
    description: "Scheduling Create",
  },
  {
    key: "scheduling.read",
    module: "scheduling",
    action: "read",
    description: "Scheduling Read",
  },
  {
    key: "scheduling.edit",
    module: "scheduling",
    action: "edit",
    description: "Scheduling Edit",
  },
  {
    key: "scheduling.delete",
    module: "scheduling",
    action: "delete",
    description: "Scheduling Delete",
  },
] as const;

export function TenantAdmin({
  apiSession,
  clinic,
  branchId,
  patients,
  section: externalSection,
  setSection: externalSetSection,
}: any) {
  const [localSection, setLocalSection] = useState("users");
  const section = externalSection || localSection;
  const setSection = externalSetSection || setLocalSection;
  const [view, setView] = useState("list");
  const [roles, setRoles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [taxRules, setTaxRules] = useState<any[]>([]);
  const [discountOffers, setDiscountOffers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<any>(null);
  const [invoicePrefix, setInvoicePrefix] = useState("MHD");
  const [invoiceLogoUrl, setInvoiceLogoUrl] = useState("");
  const [numberingRules, setNumberingRules] = useState<any>(
    parseNumberingRules(null, "MHD"),
  );
  const [requeueAfter, setRequeueAfter] = useState(2);
  const [noShowAfter, setNoShowAfter] = useState(3);
  const [slotIntervalsEnabled, setSlotIntervalsEnabled] = useState(false);
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState(5);
  const [payments, setPayments] = useState(
    "cash,credit_card,debit_card,upi,gpay,paytm",
  );
  const [providers, setProviders] = useState("whatsapp,sms,voice");
  const [reportEnabled, setReportEnabled] = useState(false);
  const [reportRecipients, setReportRecipients] = useState("");
  const [reportCc, setReportCc] = useState("");
  const [reportSendDay, setReportSendDay] = useState(1);
  const [reportFilters, setReportFilters] = useState<any>({
    overall: true,
    doctor: true,
    department: true,
    invoice: true,
  });
  const [reportJobs, setReportJobs] = useState<any[]>([]);
  const [reportBusy, setReportBusy] = useState("");
  const selectedRole = roles.find((row: any) => row.id === selectedId);
  const selectedUser = users.find((row: any) => row.id === selectedId);
  const departmentGroups = useMemo(
    () => groupDepartmentsByName(departments, branches),
    [departments, branches],
  );
  const selectedDepartment = departments.find(
    (row: any) => row.id === selectedId,
  );
  const selectedBranch = branches.find((row: any) => row.id === selectedId);
  const selectedSupplier = suppliers.find((row: any) => row.id === selectedId);
  const selectedTaxRule = taxRules.find((row: any) => row.id === selectedId);
  const selectedOffer = discountOffers.find(
    (row: any) => row.id === selectedId,
  );
  const visibleSections = sections.filter(([sectionId]) =>
    canUseTenantAdminSection(sectionId, apiSession?.user),
  );

  function open(nextSection: string, nextView = "list") {
    setSection(nextSection);
    setView(nextView);
    setSelectedId("");
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  async function loadAdmin() {
    if (!apiSession) return;
    setBusy(true);
    setMessage("");
    try {
      const scoped = { ...apiSession, tenantId: apiSession.tenantId };
      const canUsers = canUseTenantAdminSection("users", apiSession.user);
      const canRoles =
        canUseTenantAdminSection("roles", apiSession.user) || canUsers;
      const canDepartments = canUseTenantAdminSection(
        "departments",
        apiSession.user,
      );
      const canBranches = canUseTenantAdminSection("branches", apiSession.user);
      const canSuppliers = canUseTenantAdminSection(
        "suppliers",
        apiSession.user,
      );
      const canTax = canUseTenantAdminSection("tax", apiSession.user);
      const canOffers = canUseTenantAdminSection("offers", apiSession.user);
      const canSettings = canUseTenantAdminSection("settings", apiSession.user);
      const canFiles = canUseTenantAdminSection("files", apiSession.user);
      const safeFetch = async (path: string, enabled = true) =>
        enabled ? apiFetch(path, scoped).catch(() => []) : Promise.resolve([]);
      const [
        roleRows,
        userRows,
        departmentRows,
        branchRows,
        supplierRows,
        taxRows,
        offerRows,
        settingRows,
        fileRows,
        permissionRows,
        reportConfig,
        reportJobRows,
      ] = await Promise.all([
        safeFetch("/identity/roles", canRoles),
        safeFetch("/identity/users", canUsers),
        safeFetch(
          `/tenants/${apiSession.tenantId}/departments`,
          canDepartments,
        ),
        safeFetch(`/tenants/${apiSession.tenantId}/branches`, canBranches),
        safeFetch("/pharmacy/suppliers?include_inactive=true", canSuppliers),
        safeFetch("/billing/tax-rules", canTax),
        safeFetch("/billing/discount-offers", canOffers),
        safeFetch("/settings", canSettings),
        safeFetch("/files?limit=200", canFiles),
        apiFetch("/identity/permissions", scoped).catch(() => []),
        canSettings
          ? apiFetch("/reports/monthly-email/config", scoped).catch(() => null)
          : Promise.resolve(null),
        canSettings
          ? apiFetch("/reports/monthly-email/jobs?limit=5", scoped).catch(
              () => [],
            )
          : Promise.resolve([]),
      ]);
      setRoles(roleRows);
      setUsers(userRows);
      setDepartments(departmentRows);
      setBranches(branchRows);
      setSuppliers(supplierRows);
      setTaxRules(taxRows);
      setDiscountOffers(offerRows);
      setSettings(settingRows);
      setFiles(fileRows);
      setPermissions(permissionRows);
      const find = (key: string) => settingRows.find((x: any) => x.key === key);
      if (find("invoice.prefix"))
        setInvoicePrefix(find("invoice.prefix").value);
      if (find("invoice.logo_url"))
        setInvoiceLogoUrl(String(find("invoice.logo_url").value || ""));
      if (find("numbering.rules"))
        setNumberingRules(
          parseNumberingRules(
            find("numbering.rules").value,
            find("invoice.prefix")?.value || invoicePrefix,
          ),
        );
      if (find("queue.requeue_after_patients"))
        setRequeueAfter(Number(find("queue.requeue_after_patients").value));
      if (find("queue.auto_no_show_after_missed_calls"))
        setNoShowAfter(
          Number(find("queue.auto_no_show_after_missed_calls").value),
        );
      if (find("appointment.slot_intervals_enabled"))
        setSlotIntervalsEnabled(
          Boolean(find("appointment.slot_intervals_enabled").value),
        );
      if (find("appointment.slot_interval_minutes"))
        setSlotIntervalMinutes(
          Number(find("appointment.slot_interval_minutes").value || 5),
        );
      if (find("payment.methods_enabled"))
        setPayments((find("payment.methods_enabled").value || []).join(","));
      if (find("communication.providers_enabled"))
        setProviders(
          (find("communication.providers_enabled").value || []).join(","),
        );
      if (reportConfig) {
        setReportEnabled(Boolean(reportConfig.enabled));
        setReportRecipients((reportConfig.recipients || []).join(","));
        setReportCc((reportConfig.cc || []).join(","));
        setReportSendDay(Number(reportConfig.send_day || 1));
        setReportFilters(
          reportConfig.filters || {
            overall: true,
            doctor: true,
            department: true,
            invoice: true,
          },
        );
      }
      setReportJobs(reportJobRows || []);
    } catch (err: any) {
      setMessage(err.message || "Could not load tenant admin data.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAdmin();
  }, [apiSession?.token, apiSession?.tenantId]);
  useEffect(() => {
    if (
      apiSession &&
      visibleSections.length &&
      !visibleSections.some(([sectionId]) => sectionId === section)
    ) {
      open(visibleSections[0][0]);
    }
  }, [apiSession?.token, section, visibleSections.length]);

  async function createRole(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch("/identity/roles", apiSession, {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          key: fd.get("key"),
          permission_keys: fd.getAll("permissionKeys").map(String),
        }),
      });
      form.reset();
      setRoles((previous) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("roles");
      await loadAdmin();
      setMessage(`Role created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create role.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(e: any) {
    e.preventDefault();
    if (!selectedRole) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/identity/roles/${selectedRole.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: fd.get("name"),
            key: fd.get("key"),
            is_active: fd.get("isActive") === "true",
            permission_keys: fd.getAll("permissionKeys").map(String),
          }),
        },
      );
      setRoles((previous) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("roles");
      await loadAdmin();
      setMessage("Role updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update role.");
    } finally {
      setBusy(false);
    }
  }

  async function createUser(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch("/identity/users", apiSession, {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          password: fd.get("password"),
          mobile: fd.get("mobile") || null,
          user_type: fd.get("userType") || "staff",
          branch_id: fd.get("branchId") || null,
          role_keys: fd.getAll("roleKeys").map(String),
          must_change_password: fd.get("mustChangePassword") === "true",
        }),
      });
      form.reset();
      setUsers((previous) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("users");
      await loadAdmin();
      setMessage(`User created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create user.");
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(e: any) {
    e.preventDefault();
    if (!selectedUser) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/identity/users/${selectedUser.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: fd.get("name"),
            email: fd.get("email"),
            user_type: fd.get("userType") || "staff",
            mobile: fd.get("mobile") || null,
            branch_id: fd.get("branchId") || null,
            role_keys: fd.getAll("roleKeys").map(String),
            is_active: fd.get("isActive") === "true",
            must_change_password: fd.get("mustChangePassword") === "true",
          }),
        },
      );
      setUsers((previous) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("users");
      await loadAdmin();
      setMessage("User updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update user.");
    } finally {
      setBusy(false);
    }
  }

  async function createDepartment(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch(
        `/tenants/${apiSession.tenantId}/departments`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            name: fd.get("name"),
            description: fd.get("description") || null,
            branch_id: fd.get("branchId") || null,
          }),
        },
      );
      form.reset();
      setDepartments((previous) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("departments");
      await loadAdmin();
      setMessage(`Department created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create department.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDepartment(e: any) {
    e.preventDefault();
    if (!selectedDepartment) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/tenants/${apiSession.tenantId}/departments/${selectedDepartment.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: fd.get("name"),
            description: fd.get("description") || null,
            branch_id: fd.get("branchId") || null,
            is_active: fd.get("isActive") === "true",
          }),
        },
      );
      setDepartments((previous) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("departments");
      await loadAdmin();
      setMessage("Department updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update department.");
    } finally {
      setBusy(false);
    }
  }

  async function createBranch(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch(
        `/tenants/${apiSession.tenantId}/branches`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            name: fd.get("name"),
            code: fd.get("code"),
            address: fd.get("address") || null,
            city: fd.get("city") || null,
            state: fd.get("state") || null,
          }),
        },
      );
      form.reset();
      setBranches((previous) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("branches");
      await loadAdmin();
      setMessage(`Branch created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create branch.");
    } finally {
      setBusy(false);
    }
  }

  async function updateBranch(e: any) {
    e.preventDefault();
    if (!selectedBranch) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/tenants/${apiSession.tenantId}/branches/${selectedBranch.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: fd.get("name"),
            code: fd.get("code"),
            address: fd.get("address") || null,
            city: fd.get("city") || null,
            state: fd.get("state") || null,
            is_active: fd.get("isActive") === "true",
          }),
        },
      );
      setBranches((previous) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("branches");
      await loadAdmin();
      setMessage("Branch updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update branch.");
    } finally {
      setBusy(false);
    }
  }

  async function createSupplier(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch("/pharmacy/suppliers", apiSession, {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          gstin: fd.get("gstin") || null,
          phone: fd.get("phone") || null,
          email: fd.get("email") || null,
          address: fd.get("address") || null,
          created_by_user_id: apiSession.user?.id,
        }),
      });
      form.reset();
      setSuppliers((previous) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("suppliers");
      await loadAdmin();
      setMessage(`Supplier created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create supplier.");
    } finally {
      setBusy(false);
    }
  }

  async function updateSupplier(e: any) {
    e.preventDefault();
    if (!selectedSupplier) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/pharmacy/suppliers/${selectedSupplier.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: fd.get("name"),
            gstin: fd.get("gstin") || null,
            phone: fd.get("phone") || null,
            email: fd.get("email") || null,
            address: fd.get("address") || null,
            is_active: fd.get("isActive") === "true",
          }),
        },
      );
      setSuppliers((previous) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("suppliers");
      await loadAdmin();
      setMessage("Supplier updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update supplier.");
    } finally {
      setBusy(false);
    }
  }

  async function createTaxRule(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch("/billing/tax-rules", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: fd.get("branchId") || null,
          name: fd.get("name"),
          tax_percentage: Number(fd.get("taxPercentage") || 0),
          tax_label: fd.get("taxLabel") || "GST",
          service_scope: fd.get("serviceScope") || "all",
          created_by_user_id: apiSession.user?.id,
        }),
      });
      form.reset();
      setTaxRules((previous) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("tax");
      await loadAdmin();
      setMessage(`Tax rule created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create tax rule.");
    } finally {
      setBusy(false);
    }
  }

  async function updateTaxRule(e: any) {
    e.preventDefault();
    if (!selectedTaxRule) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/billing/tax-rules/${selectedTaxRule.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            branch_id: fd.get("branchId") || null,
            name: fd.get("name"),
            tax_percentage: Number(fd.get("taxPercentage") || 0),
            tax_label: fd.get("taxLabel") || "GST",
            service_scope: fd.get("serviceScope") || "all",
            is_active: fd.get("isActive") === "true",
          }),
        },
      );
      setTaxRules((previous) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("tax");
      await loadAdmin();
      setMessage("Tax rule updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update tax rule.");
    } finally {
      setBusy(false);
    }
  }

  async function createDiscountOffer(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch("/billing/discount-offers", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: fd.get("branchId") || null,
          name: fd.get("name"),
          code: fd.get("code") || null,
          service_scope: fd.get("serviceScope") || "all",
          discount_type: fd.get("discountType") || "percentage",
          value: Number(fd.get("value") || 0),
          minimum_bill_amount: Number(fd.get("minimumBillAmount") || 0),
          max_discount_amount: fd.get("maxDiscountAmount")
            ? Number(fd.get("maxDiscountAmount"))
            : null,
          valid_from: dateInputToIso(fd.get("validFrom")),
          valid_until: dateInputToIso(fd.get("validUntil")),
          created_by_user_id: apiSession.user?.id,
        }),
      });
      form.reset();
      setDiscountOffers((previous) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      open("offers");
      await loadAdmin();
      setMessage(`Offer created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create discount offer.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDiscountOffer(e: any) {
    e.preventDefault();
    if (!selectedOffer) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/billing/discount-offers/${selectedOffer.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            branch_id: fd.get("branchId") || null,
            name: fd.get("name"),
            code: fd.get("code") || null,
            service_scope: fd.get("serviceScope") || "all",
            discount_type: fd.get("discountType") || "percentage",
            value: Number(fd.get("value") || 0),
            minimum_bill_amount: Number(fd.get("minimumBillAmount") || 0),
            max_discount_amount: fd.get("maxDiscountAmount")
              ? Number(fd.get("maxDiscountAmount"))
              : null,
            valid_from: dateInputToIso(fd.get("validFrom")),
            valid_until: dateInputToIso(fd.get("validUntil")),
            is_active: fd.get("isActive") === "true",
          }),
        },
      );
      setDiscountOffers((previous) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      open("offers");
      await loadAdmin();
      setMessage("Discount offer updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update discount offer.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(entity: string, row: any) {
    const paths: any = {
      roles: `/identity/roles/${row.id}/status`,
      users: `/identity/users/${row.id}/status`,
      departments: `/tenants/${apiSession.tenantId}/departments/${row.id}/status`,
      branches: `/tenants/${apiSession.tenantId}/branches/${row.id}/status`,
    };
    setBusy(true);
    setMessage("");
    try {
      if (entity === "suppliers")
        await apiFetch(`/pharmacy/suppliers/${row.id}`, apiSession, {
          method: "PATCH",
          body: JSON.stringify({ is_active: !row.is_active }),
        });
      else if (entity === "tax")
        await apiFetch(`/billing/tax-rules/${row.id}`, apiSession, {
          method: "PATCH",
          body: JSON.stringify({ is_active: !row.is_active }),
        });
      else if (entity === "offers")
        await apiFetch(`/billing/discount-offers/${row.id}`, apiSession, {
          method: "PATCH",
          body: JSON.stringify({ is_active: !row.is_active }),
        });
      else
        await apiFetch(paths[entity], apiSession, {
          method: "POST",
          body: JSON.stringify({ is_active: !row.is_active }),
        });
      await loadAdmin();
      setMessage(`${title(entity)} status updated.`);
    } catch (err: any) {
      setMessage(err.message || "Could not change status.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function deleteRow(entity: string, row: any) {
    const paths: any = {
      roles: `/identity/roles/${row.id}`,
      users: `/identity/users/${row.id}`,
      departments: `/tenants/${apiSession.tenantId}/departments/${row.id}`,
      branches: `/tenants/${apiSession.tenantId}/branches/${row.id}`,
      suppliers: `/pharmacy/suppliers/${row.id}`,
    };
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(paths[entity], apiSession, { method: "DELETE" });
      await loadAdmin();
      setMessage(`${title(entity)} deactivated.`);
    } catch (err: any) {
      setMessage(err.message || "Could not delete record.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function saveSettings() {
    setMessage("");
    setBusy(true);
    const list = (v: string) =>
      v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    try {
      await Promise.all([
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "branch",
            scope_id: branchId,
            module: "invoice",
            key: "invoice.prefix",
            value: numberingRules.prefix || invoicePrefix,
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "branch",
            scope_id: branchId,
            module: "numbering",
            key: "numbering.rules",
            value: numberingRules,
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "branch",
            scope_id: branchId,
            module: "invoice",
            key: "invoice.logo_url",
            value: invoiceLogoUrl,
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "branch",
            scope_id: branchId,
            module: "queue",
            key: "queue.requeue_after_patients",
            value: Number(requeueAfter),
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "branch",
            scope_id: branchId,
            module: "queue",
            key: "queue.auto_no_show_after_missed_calls",
            value: Number(noShowAfter),
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "branch",
            scope_id: branchId,
            module: "appointments",
            key: "appointment.slot_intervals_enabled",
            value: slotIntervalsEnabled,
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "branch",
            scope_id: branchId,
            module: "appointments",
            key: "appointment.slot_interval_minutes",
            value: Number(slotIntervalMinutes),
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "tenant",
            module: "payment",
            key: "payment.methods_enabled",
            value: list(payments),
            actor_user_id: apiSession.user?.id,
          }),
        }),
        apiFetch("/settings", apiSession, {
          method: "PUT",
          body: JSON.stringify({
            scope: "tenant",
            module: "communication",
            key: "communication.providers_enabled",
            value: list(providers),
            actor_user_id: apiSession.user?.id,
          }),
        }),
      ]);
      await loadAdmin();
      setMessage("Settings saved.");
    } catch (err: any) {
      setMessage(err.message || "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  async function saveReportSettings() {
    const list = (v: string) =>
      v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    setReportBusy("save");
    setMessage("");
    try {
      await apiFetch("/reports/monthly-email/config", apiSession, {
        method: "PUT",
        body: JSON.stringify({
          enabled: reportEnabled,
          recipients: list(reportRecipients),
          cc: list(reportCc),
          send_day: Number(reportSendDay || 1),
          filters: reportFilters,
        }),
      });
      await loadAdmin();
      setMessage("Monthly report email settings saved.");
    } catch (err: any) {
      setMessage(err.message || "Could not save monthly report settings.");
    } finally {
      setReportBusy("");
    }
  }

  async function sendMonthlyReportNow() {
    const list = (v: string) =>
      v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    setReportBusy("send");
    setMessage("");
    try {
      const job = await apiFetch("/reports/monthly-email/send", apiSession, {
        method: "POST",
        body: JSON.stringify({
          recipients: list(reportRecipients),
          cc: list(reportCc),
          filters: reportFilters,
        }),
      });
      await loadAdmin();
      setMessage(
        job.status === "failed"
          ? `Report job failed to queue: ${job.failure_reason}`
          : "Monthly report job queued.",
      );
    } catch (err: any) {
      setMessage(err.message || "Could not queue monthly report.");
    } finally {
      setReportBusy("");
    }
  }

  if (!apiSession)
    return (
      <Card>
        <h3 className="text-lg font-bold">Tenant Admin</h3>
        <p className="mt-2 text-sm text-slate-500">
          Login to manage tenant settings.
        </p>
      </Card>
    );
  if (visibleSections.length === 0)
    return (
      <Card>
        <h3 className="text-lg font-bold">Tenant Admin</h3>
        <p className="mt-2 text-sm text-slate-500">
          Your role does not include tenant administration permissions.
        </p>
      </Card>
    );

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h3 className="text-xl font-bold">
              {clinic?.name || "Tenant"} Administration
            </h3>
            <p className="text-sm text-slate-500">
              Manage only this tenant’s users, roles, departments, branches, and
              settings.
            </p>
          </div>
          <Badge tone="green">Tenant scoped</Badge>
        </div>
      </Card>
      {message && (
        <div className="rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">
          {message}
        </div>
      )}
      {section === "users" && view === "list" && (
        <ListCard
          title="Users"
          rows={users}
          searchKeys={["name", "email", "mobile", "user_type", "id"]}
          createLabel="Create User"
          onCreate={() => setView("create")}
          columns={[
            "Name",
            "Email",
            "Type",
            "Branch",
            "Status",
            "Created",
            "Actions",
          ]}
          render={(user: any) => (
            <UserRow
              key={user.id}
              user={user}
              branches={branches}
              onEdit={() => {
                setSelectedId(user.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "users", kind: "status", row: user })
              }
              onDelete={() =>
                setConfirm({ entity: "users", kind: "delete", row: user })
              }
            />
          )}
        />
      )}
      {section === "users" && view === "create" && (
        <UserForm
          title="Create User"
          roles={roles}
          branches={branches}
          busy={busy}
          onSubmit={createUser}
          back={() => open("users")}
        />
      )}
      {section === "users" && view === "edit" && selectedUser && (
        <UserForm
          title="Edit User"
          user={selectedUser}
          roles={roles}
          branches={branches}
          busy={busy}
          onSubmit={updateUser}
          back={() => open("users")}
        />
      )}

      {section === "roles" && view === "list" && (
        <ListCard
          title="Roles"
          rows={roles}
          searchKeys={["name", "key", "id"]}
          createLabel="Create Role"
          onCreate={() => setView("create")}
          columns={["Role", "Key", "Status", "Modified", "Actions"]}
          render={(role: any) => (
            <RoleRow
              key={role.id}
              role={role}
              onEdit={() => {
                setSelectedId(role.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "roles", kind: "status", row: role })
              }
              onDelete={() =>
                setConfirm({ entity: "roles", kind: "delete", row: role })
              }
            />
          )}
        />
      )}
      {section === "roles" && view === "create" && (
        <RoleForm
          title="Create Role"
          permissions={permissions}
          busy={busy}
          onSubmit={createRole}
          back={() => open("roles")}
        />
      )}
      {section === "roles" && view === "edit" && selectedRole && (
        <RoleForm
          title="Edit Role"
          role={selectedRole}
          permissions={permissions}
          busy={busy}
          onSubmit={updateRole}
          back={() => open("roles")}
        />
      )}

      {section === "departments" && view === "list" && (
        <ListCard
          title="Departments"
          rows={departmentGroups}
          searchKeys={["name", "code", "branch_names", "description", "id"]}
          createLabel="Create Department"
          onCreate={() => setView("create")}
          columns={["Department", "Code", "Branches", "Status", "Actions"]}
          render={(department: any) => (
            <DepartmentRow
              key={department.id}
              department={department}
              branches={branches}
              onEdit={() => {
                setSelectedId(department.primary.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({
                  entity: "departments",
                  kind: "status",
                  row: department.primary,
                })
              }
              onDelete={() =>
                setConfirm({
                  entity: "departments",
                  kind: "delete",
                  row: department.primary,
                })
              }
            />
          )}
        />
      )}
      {section === "departments" && view === "create" && (
        <DepartmentForm
          title="Create Department"
          branches={branches}
          busy={busy}
          onSubmit={createDepartment}
          back={() => open("departments")}
        />
      )}
      {section === "departments" && view === "edit" && selectedDepartment && (
        <DepartmentForm
          title="Edit Department"
          department={selectedDepartment}
          branches={branches}
          busy={busy}
          onSubmit={updateDepartment}
          back={() => open("departments")}
        />
      )}

      {section === "branches" && view === "list" && (
        <ListCard
          title="Branches"
          rows={branches}
          searchKeys={["name", "code", "city", "state", "id"]}
          createLabel="Create Branch"
          onCreate={() => setView("create")}
          columns={["Branch", "Code", "Location", "Status", "Actions"]}
          render={(branch: any) => (
            <BranchRow
              key={branch.id}
              branch={branch}
              onEdit={() => {
                setSelectedId(branch.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "branches", kind: "status", row: branch })
              }
              onDelete={() =>
                setConfirm({ entity: "branches", kind: "delete", row: branch })
              }
            />
          )}
        />
      )}
      {section === "branches" && view === "create" && (
        <BranchForm
          title="Create Branch"
          branchCount={branches.length}
          busy={busy}
          onSubmit={createBranch}
          back={() => open("branches")}
        />
      )}
      {section === "branches" && view === "edit" && selectedBranch && (
        <BranchForm
          title="Edit Branch"
          branch={selectedBranch}
          busy={busy}
          onSubmit={updateBranch}
          back={() => open("branches")}
        />
      )}

      {section === "suppliers" && view === "list" && (
        <ListCard
          title="Suppliers"
          rows={suppliers}
          searchKeys={["name", "gstin", "phone", "email", "address", "id"]}
          createLabel="Create Supplier"
          onCreate={() => setView("create")}
          columns={["Supplier", "GSTIN", "Contact", "Status", "Actions"]}
          render={(supplier: any) => (
            <SupplierRow
              key={supplier.id}
              supplier={supplier}
              onEdit={() => {
                setSelectedId(supplier.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({
                  entity: "suppliers",
                  kind: "status",
                  row: supplier,
                })
              }
              onDelete={() =>
                setConfirm({
                  entity: "suppliers",
                  kind: "delete",
                  row: supplier,
                })
              }
            />
          )}
        />
      )}
      {section === "suppliers" && view === "create" && (
        <SupplierForm
          title="Create Supplier"
          busy={busy}
          onSubmit={createSupplier}
          back={() => open("suppliers")}
        />
      )}
      {section === "suppliers" && view === "edit" && selectedSupplier && (
        <SupplierForm
          title="Edit Supplier"
          supplier={selectedSupplier}
          busy={busy}
          onSubmit={updateSupplier}
          back={() => open("suppliers")}
        />
      )}

      {section === "tax" && view === "list" && (
        <ListCard
          title="Tax Rules"
          rows={taxRules}
          searchKeys={["name", "tax_label", "service_scope", "id"]}
          createLabel="Create Tax Rule"
          onCreate={() => setView("create")}
          columns={["Tax Rule", "Scope", "Percentage", "Status", "Actions"]}
          render={(rule: any) => (
            <TaxRuleRow
              key={rule.id}
              rule={rule}
              branches={branches}
              onEdit={() => {
                setSelectedId(rule.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "tax", kind: "status", row: rule })
              }
              onDelete={() =>
                setConfirm({ entity: "tax", kind: "status", row: rule })
              }
            />
          )}
        />
      )}
      {section === "tax" && view === "create" && (
        <TaxRuleForm
          title="Create Tax Rule"
          branches={branches}
          busy={busy}
          onSubmit={createTaxRule}
          back={() => open("tax")}
        />
      )}
      {section === "tax" && view === "edit" && selectedTaxRule && (
        <TaxRuleForm
          title="Edit Tax Rule"
          rule={selectedTaxRule}
          branches={branches}
          busy={busy}
          onSubmit={updateTaxRule}
          back={() => open("tax")}
        />
      )}

      {section === "offers" && view === "list" && (
        <ListCard
          title="Discounts & Offers"
          rows={discountOffers}
          searchKeys={["name", "code", "service_scope", "discount_type", "id"]}
          createLabel="Create Offer"
          onCreate={() => setView("create")}
          columns={["Offer", "Scope", "Value", "Status", "Actions"]}
          render={(offer: any) => (
            <DiscountOfferRow
              key={offer.id}
              offer={offer}
              branches={branches}
              onEdit={() => {
                setSelectedId(offer.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "offers", kind: "status", row: offer })
              }
              onDelete={() =>
                setConfirm({ entity: "offers", kind: "status", row: offer })
              }
            />
          )}
        />
      )}
      {section === "offers" && view === "create" && (
        <DiscountOfferForm
          title="Create Discount Offer"
          branches={branches}
          busy={busy}
          onSubmit={createDiscountOffer}
          back={() => open("offers")}
        />
      )}
      {section === "offers" && view === "edit" && selectedOffer && (
        <DiscountOfferForm
          title="Edit Discount Offer"
          offer={selectedOffer}
          branches={branches}
          busy={busy}
          onSubmit={updateDiscountOffer}
          back={() => open("offers")}
        />
      )}

      {section === "membership" && (
        <PatientSubscriptions
          apiSession={apiSession}
          branchId={branchId}
          branches={branches}
          patients={patients}
        />
      )}

      {section === "files" && (
        <FilesPanel
          apiSession={apiSession}
          files={files}
          setFiles={setFiles}
          setMessage={setMessage}
          branches={branches}
          patients={patients}
          busy={busy}
          setBusy={setBusy}
        />
      )}

      {section === "settings" && (
        <SettingsPanel
          settings={settings}
          invoicePrefix={invoicePrefix}
          setInvoicePrefix={setInvoicePrefix}
          numberingRules={numberingRules}
          setNumberingRules={setNumberingRules}
          invoiceLogoUrl={invoiceLogoUrl}
          setInvoiceLogoUrl={setInvoiceLogoUrl}
          requeueAfter={requeueAfter}
          setRequeueAfter={setRequeueAfter}
          noShowAfter={noShowAfter}
          setNoShowAfter={setNoShowAfter}
          slotIntervalsEnabled={slotIntervalsEnabled}
          setSlotIntervalsEnabled={setSlotIntervalsEnabled}
          slotIntervalMinutes={slotIntervalMinutes}
          setSlotIntervalMinutes={setSlotIntervalMinutes}
          payments={payments}
          setPayments={setPayments}
          providers={providers}
          setProviders={setProviders}
          busy={busy}
          saveSettings={saveSettings}
          reportEnabled={reportEnabled}
          setReportEnabled={setReportEnabled}
          reportRecipients={reportRecipients}
          setReportRecipients={setReportRecipients}
          reportCc={reportCc}
          setReportCc={setReportCc}
          reportSendDay={reportSendDay}
          setReportSendDay={setReportSendDay}
          reportFilters={reportFilters}
          setReportFilters={setReportFilters}
          reportJobs={reportJobs}
          reportBusy={reportBusy}
          saveReportSettings={saveReportSettings}
          sendMonthlyReportNow={sendMonthlyReportNow}
        />
      )}
      {confirm && (
        <ConfirmModal
          action={confirm}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            confirm.kind === "delete"
              ? deleteRow(confirm.entity, confirm.row)
              : changeStatus(confirm.entity, confirm.row)
          }
        />
      )}
    </div>
  );
}

function ListCard({
  title,
  rows,
  searchKeys,
  createLabel,
  onCreate,
  columns,
  render,
}: any) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const filtered = useMemo(
    () =>
      rows.filter((row: any) =>
        searchKeys.some((key: string) =>
          String(row[key] || "")
            .toLowerCase()
            .includes(query.toLowerCase()),
        ),
      ),
    [rows, query, searchKeys],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  useEffect(() => {
    setPage(1);
  }, [query, rows.length]);
  const gridClass =
    columns.length === 7
      ? "grid-cols-[1.05fr_1.15fr_.75fr_1fr_.65fr_.7fr_1.45fr]"
      : columns.length === 6
        ? "grid-cols-[1.2fr_1.2fr_1fr_.7fr_.75fr_1.45fr]"
        : "grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]";
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-slate-500">
            Latest created or updated records appear first. Click a row to open
            it, or use the action buttons.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
        >
          <Plus size={16} />
          {createLabel}
        </button>
      </div>
      <div className="mt-4 max-w-md">
        <Field label={`Search ${title}`}>
          <Input
            value={query}
            onChange={(e: any) => setQuery(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}`}
          />
        </Field>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <div className="min-w-[1040px]">
          <div
            className={`hidden gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid ${gridClass}`}
          >
            {columns.map((column: string, index: number) => (
              <span
                key={column}
                className={index === columns.length - 1 ? "text-right" : ""}
              >
                {column}
              </span>
            ))}
          </div>
          <div className="divide-y divide-slate-200">
            {pageRows.length === 0 && (
              <Empty text="No records match your search." />
            )}
            {pageRows.map(render)}
          </div>
        </div>
      </div>
      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={filtered.length}
        pageSize={pageSize}
        onPage={setPage}
      />
    </Card>
  );
}

function RoleForm({ title, role, permissions, busy, onSubmit, back }: any) {
  return (
    <Card>
      <Header
        title={title}
        subtitle={role?.key || "Select permissions by module action."}
        back={back}
      />
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Role Name">
          <Input
            name="name"
            defaultValue={role?.name || ""}
            required
            disabled={isLocked(role)}
          />
        </Field>
        <Field label="Role Key">
          <Input
            name="key"
            defaultValue={role?.key || ""}
            required
            disabled={isLocked(role)}
          />
        </Field>
        {role && (
          <Field label="Status">
            <Select
              name="isActive"
              defaultValue={String(role.is_active)}
              disabled={isLocked(role)}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
        )}
        <div className="md:col-span-2">
          <PermissionCheckboxes
            permissions={permissions}
            selected={role?.permission_keys || []}
            disabled={isLocked(role)}
          />
        </div>
        <Actions
          busy={busy}
          back={back}
          disabled={isLocked(role)}
          label={role ? "Save Role" : "Create Role"}
        />
      </form>
    </Card>
  );
}

function UserForm({ title, user, roles, branches, busy, onSubmit, back }: any) {
  const [selectedBranch, setSelectedBranch] = useState(user?.branch_id || "");
  const roleOptions = useMemo(
    () =>
      filterRolesForBranch(roles, branches, selectedBranch, user?.roles || []),
    [roles, branches, selectedBranch, user?.roles],
  );
  return (
    <Card>
      <Header
        title={title}
        subtitle={user?.email || "Create tenant-scoped users only."}
        back={back}
      />
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <Input name="name" defaultValue={user?.name || ""} required />
        </Field>
        <Field label="Email">
          <Input
            name="email"
            type="email"
            defaultValue={user?.email || ""}
            required
          />
        </Field>
        <Field label="User Type">
          <Select name="userType" defaultValue={user?.user_type || "staff"}>
            {userTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Mobile">
          <Input name="mobile" defaultValue={user?.mobile || ""} />
        </Field>
        <Field label="Branch">
          <Select
            name="branchId"
            value={selectedBranch}
            onChange={(event: any) => setSelectedBranch(event.target.value)}
          >
            <option value="">All branches</option>
            {branches.map((branch: any) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>
        {!user && (
          <Field label="Temporary Password">
            <Input
              name="password"
              type="text"
              defaultValue="TempPass123"
              required
            />
          </Field>
        )}
        <Field label="Must Change Password">
          <Select
            name="mustChangePassword"
            defaultValue={String(user?.must_change_password ?? true)}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Select>
        </Field>
        {user && (
          <Field label="Status">
            <Select name="isActive" defaultValue={String(user.is_active)}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
        )}
        <div className="md:col-span-2">
          <CheckboxList
            title="Role Access"
            name="roleKeys"
            rows={roleOptions}
            selected={user?.roles || []}
            valueKey="key"
            labelKey="name"
          />
        </div>
        <Actions
          busy={busy}
          back={back}
          label={user ? "Save User" : "Create User"}
        />
      </form>
    </Card>
  );
}

function DepartmentForm({
  title,
  department,
  branches,
  busy,
  onSubmit,
  back,
}: any) {
  return (
    <Card>
      <Header
        title={title}
        subtitle={department?.code || "Departments belong to this tenant only."}
        back={back}
      />
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <Input
            name="name"
            defaultValue={department?.name || ""}
            required
            disabled={isLocked(department)}
          />
        </Field>
        <Field label="Branch">
          <Select
            name="branchId"
            defaultValue={department?.branch_id || ""}
            disabled={isLocked(department)}
          >
            <option value="">All branches</option>
            {branches.map((branch: any) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>
        {department && (
          <Field label="Status">
            <Select
              name="isActive"
              defaultValue={String(department.is_active)}
              disabled={isLocked(department)}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
        )}
        <div className="md:col-span-2">
          <Field label="Description">
            <Input
              name="description"
              defaultValue={department?.description || ""}
              disabled={isLocked(department)}
            />
          </Field>
        </div>
        <Actions
          busy={busy}
          back={back}
          disabled={isLocked(department)}
          label={department ? "Save Department" : "Create Department"}
        />
      </form>
    </Card>
  );
}

function BranchForm({ title, branch, branchCount, busy, onSubmit, back }: any) {
  return (
    <Card>
      <Header
        title={title}
        subtitle={
          branch
            ? "Update branch details."
            : "Branch creation is checked against the active subscription limit."
        }
        back={back}
      />
      {!branch && branchCount >= 1 && (
        <div className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          Single-clinic plans usually allow one branch. If this tenant is on a
          single-branch plan, the API will ask for a subscription upgrade before
          creating another branch.
        </div>
      )}
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Branch Name">
          <Input
            name="name"
            defaultValue={branch?.name || ""}
            required
            disabled={isLocked(branch)}
          />
        </Field>
        <Field label="Code">
          <Input
            name="code"
            defaultValue={branch?.code || ""}
            required
            disabled={isLocked(branch)}
          />
        </Field>
        <Field label="City">
          <Input
            name="city"
            defaultValue={branch?.city || ""}
            disabled={isLocked(branch)}
          />
        </Field>
        <Field label="State">
          <Input
            name="state"
            defaultValue={branch?.state || ""}
            disabled={isLocked(branch)}
          />
        </Field>
        {branch && (
          <Field label="Status">
            <Select
              name="isActive"
              defaultValue={String(branch.is_active)}
              disabled={isLocked(branch)}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
        )}
        <div className="md:col-span-2">
          <Field label="Address">
            <Input
              name="address"
              defaultValue={branch?.address || ""}
              disabled={isLocked(branch)}
            />
          </Field>
        </div>
        <Actions
          busy={busy}
          back={back}
          disabled={isLocked(branch)}
          label={branch ? "Save Branch" : "Create Branch"}
        />
      </form>
    </Card>
  );
}

function SupplierForm({ title, supplier, busy, onSubmit, back }: any) {
  return (
    <Card>
      <Header
        title={title}
        subtitle={
          supplier?.id ||
          "Suppliers can be used by medicines, lab tests, lab packages, and physiotherapy equipment."
        }
        back={back}
      />
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Supplier Name">
          <Input name="name" defaultValue={supplier?.name || ""} required />
        </Field>
        <Field label="GSTIN">
          <Input name="gstin" defaultValue={supplier?.gstin || ""} />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={supplier?.phone || ""} />
        </Field>
        <Field label="Email">
          <Input
            name="email"
            type="email"
            defaultValue={supplier?.email || ""}
          />
        </Field>
        {supplier && (
          <Field label="Status">
            <Select name="isActive" defaultValue={String(supplier.is_active)}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
        )}
        <div className="md:col-span-2">
          <Field label="Address">
            <Input name="address" defaultValue={supplier?.address || ""} />
          </Field>
        </div>
        <Actions
          busy={busy}
          back={back}
          label={supplier ? "Save Supplier" : "Create Supplier"}
        />
      </form>
    </Card>
  );
}

const serviceScopes = [
  ["all", "All billable modules"],
  ["consultation", "Consultation"],
  ["lab", "Lab / Scan"],
  ["pharmacy", "Pharmacy"],
  ["items", "Items"],
] as const;

function TaxRuleForm({ title, rule, branches, busy, onSubmit, back }: any) {
  return (
    <Card>
      <Header
        title={title}
        subtitle="Tax is selected by branch and service scope during invoice generation."
        back={back}
      />
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <Input name="name" defaultValue={rule?.name || ""} required />
        </Field>
        <Field label="Branch">
          <Select name="branchId" defaultValue={rule?.branch_id || ""}>
            <option value="">All branches</option>
            {branches.map((branch: any) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Service Scope">
          <Select
            name="serviceScope"
            defaultValue={rule?.service_scope || "all"}
          >
            {serviceScopes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tax Label">
          <Input
            name="taxLabel"
            defaultValue={rule?.tax_label || "GST"}
            required
          />
        </Field>
        <Field label="Tax Percentage">
          <Input
            name="taxPercentage"
            type="number"
            min="0"
            max="100"
            defaultValue={rule?.tax_percentage ?? 0}
            required
          />
        </Field>
        {rule && (
          <Field label="Status">
            <Select name="isActive" defaultValue={String(rule.is_active)}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
        )}
        <Actions
          busy={busy}
          back={back}
          label={rule ? "Save Tax Rule" : "Create Tax Rule"}
        />
      </form>
    </Card>
  );
}

function DiscountOfferForm({
  title,
  offer,
  branches,
  busy,
  onSubmit,
  back,
}: any) {
  return (
    <Card>
      <Header
        title={title}
        subtitle="Offers can be applied to consultation, lab, pharmacy, or item invoices with an optional minimum bill amount."
        back={back}
      />
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Offer Name">
          <Input name="name" defaultValue={offer?.name || ""} required />
        </Field>
        <Field label="Code">
          <Input
            name="code"
            defaultValue={offer?.code || ""}
            placeholder="HEALTH10"
          />
        </Field>
        <Field label="Branch">
          <Select name="branchId" defaultValue={offer?.branch_id || ""}>
            <option value="">All branches</option>
            {branches.map((branch: any) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Service Scope">
          <Select
            name="serviceScope"
            defaultValue={offer?.service_scope || "all"}
          >
            {serviceScopes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Discount Type">
          <Select
            name="discountType"
            defaultValue={offer?.discount_type || "percentage"}
          >
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </Select>
        </Field>
        <Field label="Value">
          <Input
            name="value"
            type="number"
            min="0"
            defaultValue={offer?.value ?? 0}
            required
          />
        </Field>
        <Field label="Minimum Bill Amount">
          <Input
            name="minimumBillAmount"
            type="number"
            min="0"
            defaultValue={offer?.minimum_bill_amount ?? 0}
          />
        </Field>
        <Field label="Max Discount">
          <Input
            name="maxDiscountAmount"
            type="number"
            min="0"
            defaultValue={offer?.max_discount_amount ?? ""}
          />
        </Field>
        <Field label="Valid From">
          <Input
            name="validFrom"
            type="date"
            defaultValue={dateToInput(offer?.valid_from)}
          />
        </Field>
        <Field label="Valid Until">
          <Input
            name="validUntil"
            type="date"
            defaultValue={dateToInput(offer?.valid_until)}
          />
        </Field>
        {offer && (
          <Field label="Status">
            <Select name="isActive" defaultValue={String(offer.is_active)}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
        )}
        <Actions
          busy={busy}
          back={back}
          label={offer ? "Save Offer" : "Create Offer"}
        />
      </form>
    </Card>
  );
}

const fileCategoryOptions = [
  { value: "general", label: "General" },
  { value: "logo", label: "Logo" },
  { value: "patient_photo", label: "Patient Photo" },
  { value: "admission", label: "Admission" },
  { value: "consent", label: "Consent" },
  { value: "discharge", label: "Discharge" },
  { value: "lab_report", label: "Lab Report" },
  { value: "invoice", label: "Invoice" },
  { value: "report", label: "Report" },
];

type FileCategoryRule = {
  modules: string[];
  doctypes: string[];
  fields: string[];
  labels: string[];
  folders: string[];
};
const fileCategoryRules: Record<string, FileCategoryRule> = {
  general: {
    modules: [
      "tenants",
      "patients",
      "ip",
      "lab",
      "billing",
      "physiotherapy",
      "reports",
    ],
    doctypes: [
      "Tenant",
      "Patient",
      "IPAdmission",
      "LabOrder",
      "Invoice",
      "PhysiotherapyCase",
    ],
    fields: ["attachment", "document", "reference"],
    labels: ["Attachment", "Document", "Reference"],
    folders: ["General", "Documents"],
  },
  logo: {
    modules: ["tenants"],
    doctypes: ["Tenant"],
    fields: ["logo_url", "invoice_logo_url"],
    labels: ["Tenant Logo", "Invoice Logo"],
    folders: ["Branding"],
  },
  patient_photo: {
    modules: ["patients"],
    doctypes: ["Patient"],
    fields: ["photo_url"],
    labels: ["Patient Photo"],
    folders: ["Patients"],
  },
  admission: {
    modules: ["ip"],
    doctypes: ["IPAdmission"],
    fields: [
      "admission_document_url",
      "insurance_card_url",
      "identity_proof_url",
    ],
    labels: ["Admission Document", "Insurance Card", "Identity Proof"],
    folders: ["Admissions"],
  },
  consent: {
    modules: ["ip", "physiotherapy", "patients"],
    doctypes: ["IPAdmission", "PhysiotherapyCase", "Patient"],
    fields: ["consent_files_json", "treatment_consent"],
    labels: ["Consent Form", "Treatment Consent", "Procedure Consent"],
    folders: ["Consents"],
  },
  discharge: {
    modules: ["ip"],
    doctypes: ["IPAdmission"],
    fields: ["discharge_summary_url"],
    labels: ["Discharge Summary"],
    folders: ["Discharge"],
  },
  lab_report: {
    modules: ["lab"],
    doctypes: ["LabOrder"],
    fields: ["report_url", "attachment_url"],
    labels: ["Lab Report", "Diagnostic Report"],
    folders: ["Lab Reports"],
  },
  invoice: {
    modules: ["billing"],
    doctypes: ["Invoice"],
    fields: ["invoice_pdf", "receipt_url"],
    labels: ["Invoice PDF", "Receipt", "Statement"],
    folders: ["Invoices", "Receipts"],
  },
  report: {
    modules: ["reports"],
    doctypes: ["Report", "MonthlyReport"],
    fields: ["report_url", "attachment"],
    labels: ["Monthly Report", "Custom Report"],
    folders: ["Reports"],
  },
};

const doctypeFetchPaths: Record<
  string,
  { path: string; label: (row: any) => string; sublabel?: (row: any) => string }
> = {
  IPAdmission: {
    path: "/ip/admissions",
    label: (row: any) => row.admission_number || row.id,
    sublabel: (row: any) => row.id,
  },
  LabOrder: {
    path: "/lab/orders",
    label: (row: any) => row.lab_order_number || row.id,
    sublabel: (row: any) => row.id,
  },
  Invoice: {
    path: "/billing/invoices?limit=200",
    label: (row: any) => row.invoice_number || row.id,
    sublabel: (row: any) => row.id,
  },
  PhysiotherapyCase: {
    path: "/physiotherapy/cases",
    label: (row: any) => row.case_number || row.id,
    sublabel: (row: any) => row.id,
  },
};

function asOptionList(values: string[]) {
  return values.map((value) => ({ value, label: humanizeOptionLabel(value) }));
}

function FilesPanel({
  apiSession,
  files,
  setFiles,
  setMessage,
  branches,
  patients,
  busy,
  setBusy,
}: any) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("general");
  const [branchId, setBranchId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [sourceModule, setSourceModule] = useState("");
  const [doctype, setDoctype] = useState("");
  const [recordId, setRecordId] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [labelValue, setLabelValue] = useState("");
  const [folder, setFolder] = useState("");
  const [notes, setNotes] = useState("");
  const [recordOptions, setRecordOptions] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const rule = fileCategoryRules[category] || fileCategoryRules.general;

  useEffect(() => {
    setSourceModule(rule.modules[0] || "");
    setDoctype(rule.doctypes[0] || "");
    setFieldName(rule.fields[0] || "");
    setLabelValue(rule.labels[0] || "");
    setFolder(rule.folders[0] || "");
    setRecordId("");
  }, [category]);

  const patientOptions = useMemo(
    () =>
      patients.slice(0, 500).map((patient: any) => {
        const name = patient.full_name || patient.name || patient.id;
        return {
          value: patient.id,
          label:
            name +
            (patient.patient_number ? ` — ${patient.patient_number}` : ""),
          sublabel: patient.id,
        };
      }),
    [patients],
  );

  useEffect(() => {
    if (!apiSession || !doctype) {
      setRecordOptions([]);
      return;
    }
    if (doctype === "Patient") {
      setRecordOptions(patientOptions);
      return;
    }
    if (doctype === "Tenant") {
      setRecordOptions(
        apiSession.tenantId
          ? [
              {
                value: apiSession.tenantId,
                label: "This tenant",
                sublabel: apiSession.tenantId,
              },
            ]
          : [],
      );
      return;
    }
    const fetcher = doctypeFetchPaths[doctype];
    if (!fetcher) {
      setRecordOptions([]);
      return;
    }
    let cancelled = false;
    setRecordsLoading(true);
    apiFetch(fetcher.path, apiSession)
      .then((rows: any) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setRecordOptions(
          list
            .slice(0, 500)
            .map((row: any) => ({
              value: row.id,
              label: fetcher.label(row),
              sublabel: fetcher.sublabel ? fetcher.sublabel(row) : row.id,
            })),
        );
      })
      .catch(() => {
        if (!cancelled) setRecordOptions([]);
      })
      .finally(() => {
        if (!cancelled) setRecordsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiSession?.token, apiSession?.tenantId, doctype, patientOptions]);

  const visible = files.filter((file: any) =>
    [
      file.file_name,
      file.category,
      file.source_module,
      file.attached_to_doctype,
      file.attached_to_name,
      file.attached_to_field,
      file.attached_to_label,
      file.folder,
      file.file_url,
    ].some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  );

  function resetUploadForm(form?: HTMLFormElement) {
    setCategory("general");
    setBranchId("");
    setPatientId("");
    setNotes("");
    if (form) form.reset();
  }

  async function handleSubmit(event: any) {
    event.preventDefault();
    if (!apiSession) return;
    const form = event.currentTarget as HTMLFormElement;
    const fileInput = form.elements.namedItem(
      "file",
    ) as HTMLInputElement | null;
    const file = fileInput?.files?.[0] || null;
    if (!file) {
      setMessage("Choose a file to upload.");
      return;
    }
    const upload = new FormData();
    upload.append("file", file);
    const fields: Record<string, string> = {
      category,
      source_module: sourceModule,
      attached_to_doctype: doctype,
      attached_to_name: recordId,
      attached_to_field: fieldName,
      attached_to_label: labelValue,
      folder,
      notes,
      branch_id: branchId,
      patient_id: patientId,
    };
    Object.entries(fields).forEach(([key, value]) => {
      const trimmed = String(value || "").trim();
      if (trimmed) upload.append(key, trimmed);
    });
    setBusy(true);
    setMessage("");
    try {
      const created = await apiUpload("/files", apiSession, upload);
      setFiles((previous: any[]) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      resetUploadForm(form);
      setMessage(`File uploaded: ${created.file_name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not upload file.");
    } finally {
      setBusy(false);
    }
  }

  async function syncUploadsFolder() {
    if (!apiSession) return;
    setSyncing(true);
    setMessage("");
    try {
      const created = await apiFetch("/files/sync-uploads", apiSession, {
        method: "POST",
      });
      const list = Array.isArray(created) ? created : [];
      if (list.length) {
        setFiles((previous: any[]) => {
          const map = new Map(
            previous.map((row: any) => [row.id, row] as [string, any]),
          );
          list.forEach((row: any) => map.set(row.id, row));
          return Array.from(map.values()).sort((a: any, b: any) =>
            String(b.created_at || "").localeCompare(
              String(a.created_at || ""),
            ),
          );
        });
      }
      setMessage(
        list.length
          ? `Registered ${list.length} file(s) from uploads folder.`
          : "Uploads folder is already in sync.",
      );
    } catch (err: any) {
      setMessage(err.message || "Could not sync uploads folder.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="text-lg font-bold">Files</h3>
            <p className="text-sm text-slate-500">
              Central file registry for logos, patient photos, consent forms,
              discharge documents, reports, and module attachments. Pick a
              category and the dependent fields auto-fill with the matching
              modules and doctypes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">{files.length} files</Badge>
            <ActionButton
              type="button"
              onClick={syncUploadsFolder}
              disabled={syncing || !apiSession}
            >
              {syncing ? "Syncing..." : "Sync Uploads Folder"}
            </ActionButton>
          </div>
        </div>
        <form
          onSubmit={handleSubmit}
          className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        >
          <Field label="Upload File">
            <Input name="file" type="file" required />
          </Field>
          <Field label="Category">
            <SearchableSelect
              name="category"
              value={category}
              onChange={setCategory}
              options={fileCategoryOptions}
              searchPlaceholder="Search categories..."
            />
          </Field>
          <Field label="Branch">
            <SearchableSelect
              name="branch_id"
              value={branchId}
              onChange={setBranchId}
              placeholder="Tenant level"
              options={branches.map((branch: any) => ({
                value: branch.id,
                label: branch.name,
                sublabel: branch.code || branch.id,
              }))}
              searchPlaceholder="Search branches..."
            />
          </Field>
          <Field label="Patient">
            <SearchableSelect
              name="patient_id"
              value={patientId}
              onChange={setPatientId}
              placeholder="No patient link"
              options={patientOptions}
              searchPlaceholder="Search patients..."
            />
          </Field>
          <Field label="Source Module">
            <SearchableSelect
              name="source_module"
              value={sourceModule}
              onChange={setSourceModule}
              options={asOptionList(rule.modules)}
              searchPlaceholder="Search modules..."
              allowCustom
            />
          </Field>
          <Field label="Linked Doctype">
            <SearchableSelect
              name="attached_to_doctype"
              value={doctype}
              onChange={setDoctype}
              options={asOptionList(rule.doctypes)}
              searchPlaceholder="Search doctypes..."
              allowCustom
            />
          </Field>
          <Field label="Linked Record ID">
            <SearchableSelect
              name="attached_to_name"
              value={recordId}
              onChange={setRecordId}
              options={recordOptions}
              placeholder={
                recordsLoading
                  ? "Loading records..."
                  : recordOptions.length
                    ? "Select a record"
                    : "Type a record id"
              }
              searchPlaceholder="Search records..."
              allowCustom
              emptyText={recordsLoading ? "Loading..." : "No matching records."}
            />
          </Field>
          <Field label="Linked Field">
            <SearchableSelect
              name="attached_to_field"
              value={fieldName}
              onChange={setFieldName}
              options={asOptionList(rule.fields)}
              searchPlaceholder="Search fields..."
              allowCustom
            />
          </Field>
          <Field label="Label">
            <SearchableSelect
              name="attached_to_label"
              value={labelValue}
              onChange={setLabelValue}
              options={rule.labels.map((label) => ({ value: label, label }))}
              searchPlaceholder="Search labels..."
              allowCustom
            />
          </Field>
          <Field label="Folder">
            <SearchableSelect
              name="folder"
              value={folder}
              onChange={setFolder}
              options={rule.folders.map((name) => ({
                value: name,
                label: name,
              }))}
              searchPlaceholder="Search folders..."
              allowCustom
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Notes">
              <Input
                name="notes"
                value={notes}
                onChange={(e: any) => setNotes(e.target.value)}
                placeholder="Optional notes"
              />
            </Field>
          </div>
          <div className="flex items-end">
            <Button disabled={busy}>
              {busy ? "Uploading..." : "Upload File"}
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h4 className="font-bold">File Registry</h4>
            <p className="text-sm text-slate-500">
              Files created from module uploads appear here automatically. Use
              Sync Uploads Folder to register pre-existing files from the server
              uploads directory.
            </p>
          </div>
          <Field label="Search">
            <Input
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              placeholder="Search files"
            />
          </Field>
        </div>
        <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">File</th>
                <th>Category</th>
                <th>Attached To</th>
                <th>Patient</th>
                <th>Created</th>
                <th className="pr-4">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-slate-500">
                    No files found.
                  </td>
                </tr>
              )}
              {visible.map((file: any) => (
                <tr key={file.id} className="align-top">
                  <td className="px-4 py-4">
                    <b>{file.file_name}</b>
                    <p className="break-all text-xs text-slate-500">
                      {file.file_url}
                    </p>
                  </td>
                  <td>
                    <Badge tone="blue">
                      {humanizeOptionLabel(file.category)}
                    </Badge>
                    <p className="mt-1 text-xs text-slate-500">
                      {file.source_module || "-"}
                    </p>
                  </td>
                  <td>
                    <b>{file.attached_to_doctype || "-"}</b>
                    <p className="break-all text-xs text-slate-500">
                      {[file.attached_to_name, file.attached_to_field]
                        .filter(Boolean)
                        .join(" / ") || "-"}
                    </p>
                  </td>
                  <td>{patientLabel(patients, file.patient_id)}</td>
                  <td>
                    {file.created_at
                      ? new Date(file.created_at).toLocaleString()
                      : "-"}
                  </td>
                  <td className="pr-4">
                    <a
                      href={
                        file.file_url?.startsWith("/uploads/")
                          ? `${UPLOADS_BASE}${file.file_url}`
                          : file.file_url
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-blue-700 underline"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SettingsPanel(props: any) {
  const {
    settings,
    invoicePrefix,
    setInvoicePrefix,
    numberingRules,
    setNumberingRules,
    invoiceLogoUrl,
    setInvoiceLogoUrl,
    requeueAfter,
    setRequeueAfter,
    noShowAfter,
    setNoShowAfter,
    slotIntervalsEnabled,
    setSlotIntervalsEnabled,
    slotIntervalMinutes,
    setSlotIntervalMinutes,
    payments,
    setPayments,
    providers,
    setProviders,
    busy,
    saveSettings,
    reportEnabled,
    setReportEnabled,
    reportRecipients,
    setReportRecipients,
    reportCc,
    setReportCc,
    reportSendDay,
    setReportSendDay,
    reportFilters,
    setReportFilters,
    reportJobs,
    reportBusy,
    saveReportSettings,
    sendMonthlyReportNow,
  } = props;
  const toggleReportFilter = (key: string) => (event: any) =>
    setReportFilters({ ...reportFilters, [key]: event.target.checked });
  const setRule = (key: string, value: any) =>
    setNumberingRules({ ...numberingRules, [key]: value });
  const setEntity = (key: string, value: string) =>
    setNumberingRules({
      ...numberingRules,
      entities: {
        ...(numberingRules.entities || {}),
        [key]: value.toUpperCase(),
      },
    });
  return (
    <div className="space-y-5">
      <Card>
        <h3 className="text-lg font-bold">Tenant & Branch Settings</h3>
        <p className="text-sm text-slate-500">
          Configuration affects invoice numbering, queue behavior, appointment
          slots, payments, and communications for this tenant.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Document Prefix">
            <Input
              value={numberingRules.prefix || invoicePrefix}
              onChange={(e: any) => {
                setInvoicePrefix(e.target.value);
                setRule("prefix", e.target.value.toUpperCase());
              }}
              placeholder="SUN"
            />
          </Field>
          <Field label="Number Digits">
            <Input
              type="number"
              min="1"
              max="12"
              value={numberingRules.digits || 5}
              onChange={(e: any) =>
                setRule("digits", Number(e.target.value || 5))
              }
            />
          </Field>
          <Field label="Invoice Logo URL">
            <Input
              value={invoiceLogoUrl}
              onChange={(e: any) => setInvoiceLogoUrl(e.target.value)}
              placeholder="/uploads/logo.jpg"
            />
          </Field>
          <Field label="Requeue After">
            <Input
              type="number"
              value={requeueAfter}
              onChange={(e: any) => setRequeueAfter(Number(e.target.value))}
            />
          </Field>
          <Field label="No-show Calls">
            <Input
              type="number"
              value={noShowAfter}
              onChange={(e: any) => setNoShowAfter(Number(e.target.value))}
            />
          </Field>
          <Field label="Slot Display">
            <Select
              value={slotIntervalsEnabled ? "intervals" : "sessions"}
              onChange={(e: any) =>
                setSlotIntervalsEnabled(e.target.value === "intervals")
              }
            >
              <option value="sessions">Consultation timings only</option>
              <option value="intervals">Detailed interval slots</option>
            </Select>
          </Field>
          <Field label="Interval Minutes">
            <Input
              type="number"
              min="5"
              step="5"
              value={slotIntervalMinutes}
              onChange={(e: any) =>
                setSlotIntervalMinutes(Number(e.target.value))
              }
              disabled={!slotIntervalsEnabled}
            />
          </Field>
          <Field label="Payment Methods">
            <Input
              value={payments}
              onChange={(e: any) => setPayments(e.target.value)}
            />
          </Field>
          <Field label="Communication">
            <Input
              value={providers}
              onChange={(e: any) => setProviders(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {Object.entries(
            numberingRules.entities || defaultNumberingEntities,
          ).map(([key, value]: any) => (
            <Field key={key} label={`${humanizeOptionLabel(key)} Code`}>
              <Input
                value={value}
                onChange={(e: any) => setEntity(key, e.target.value)}
              />
            </Field>
          ))}
        </div>
        <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          Example:{" "}
          {(numberingRules.prefix || invoicePrefix || "SUN").toUpperCase()}-
          {numberingRules.entities?.patient || "PAT"}-
          {String(1).padStart(Number(numberingRules.digits || 5), "0")}
        </div>
        <Button onClick={saveSettings} disabled={busy} className="mt-4">
          Save Settings
        </Button>
        <div className="mt-5 grid gap-2 md:grid-cols-2">
          {settings.slice(0, 10).map((setting: any) => (
            <div
              key={setting.id}
              className="rounded-2xl bg-slate-50 p-3 text-sm"
            >
              <b>{settingLabel(setting.key)}</b>
              <p className="break-words text-slate-500">
                {settingValueLabel(setting.value)}
              </p>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="text-lg font-bold">Monthly Email Reports</h3>
            <p className="text-sm text-slate-500">
              Send last month revenue, doctor settlement, department revenue,
              and paid invoice profit as an Excel-compatible spreadsheet through
              the Redis report worker.
            </p>
          </div>
          <Badge tone={reportEnabled ? "green" : "slate"}>
            {reportEnabled ? "Automatic" : "Manual"}
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Target Emails">
            <Input
              value={reportRecipients}
              onChange={(e: any) => setReportRecipients(e.target.value)}
              placeholder="owner@clinic.com, accounts@clinic.com"
            />
          </Field>
          <Field label="CC Emails">
            <Input
              value={reportCc}
              onChange={(e: any) => setReportCc(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Send Day">
            <Input
              type="number"
              min="1"
              max="28"
              value={reportSendDay}
              onChange={(e: any) => setReportSendDay(Number(e.target.value))}
            />
          </Field>
          <Field label="Auto Send">
            <Select
              value={reportEnabled ? "enabled" : "disabled"}
              onChange={(e: any) =>
                setReportEnabled(e.target.value === "enabled")
              }
            >
              <option value="disabled">Manual only</option>
              <option value="enabled">Every month</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["overall", "Overall summary"],
            ["doctor", "Doctor revenue"],
            ["department", "Department revenue"],
            ["invoice", "Paid invoice details"],
          ].map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 text-sm font-bold text-slate-700"
            >
              <input
                type="checkbox"
                checked={Boolean(reportFilters?.[key])}
                onChange={toggleReportFilter(key)}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={saveReportSettings}
            disabled={reportBusy === "save"}
          >
            {reportBusy === "save" ? "Saving..." : "Save Report Settings"}
          </Button>
          <button
            type="button"
            onClick={sendMonthlyReportNow}
            disabled={reportBusy === "send"}
            className="rounded-2xl border px-4 py-3 text-sm font-bold text-slate-700 disabled:text-slate-300"
          >
            {reportBusy === "send" ? "Queueing..." : "Send Last Month Now"}
          </button>
        </div>
        <div className="mt-5 overflow-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th>Status</th>
                <th>Period</th>
                <th>Recipients</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reportJobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-slate-500">
                    No monthly report jobs yet.
                  </td>
                </tr>
              )}
              {reportJobs.map((job: any, index: number) => (
                <tr key={job.id}>
                  <td className="px-4 py-4">
                    <b>Report {index + 1}</b>
                    <p className="text-xs text-slate-500">
                      {new Date(job.created_at).toLocaleString()}
                    </p>
                  </td>
                  <td>
                    <Badge
                      tone={
                        job.status === "sent"
                          ? "green"
                          : job.status === "failed"
                            ? "red"
                            : job.status === "running"
                              ? "blue"
                              : "amber"
                      }
                    >
                      {humanizeOptionLabel(job.status)}
                    </Badge>
                  </td>
                  <td>
                    {job.period_start} to {job.period_end}
                  </td>
                  <td>{(job.recipients || []).join(", ")}</td>
                  <td className="pr-4 text-slate-500">
                    {job.failure_reason || job.attachment_filename || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PermissionCheckboxes({ permissions, selected, disabled }: any) {
  const catalog = [...permissions];
  for (const permission of requiredRolePermissions) {
    if (!catalog.some((item: any) => item.key === permission.key))
      catalog.push(permission);
  }
  const grouped = catalog.reduce((acc: any, permission: any) => {
    acc[permission.module] = [...(acc[permission.module] || []), permission];
    return acc;
  }, {});
  const buckets = [
    ["manage", "Manage", ["manage", "sign", "approve", "export"]],
    ["create", "Create", ["create"]],
    ["read", "Read", ["read", "view"]],
    ["edit", "Edit", ["edit", "write"]],
    ["delete", "Delete", ["delete", "cancel"]],
  ];
  const modules = Object.keys(grouped).sort();
  const selectedSet = new Set(selected || []);
  const normalizedAction = (permission: any) =>
    String(permission.action || "manage")
      .split(".")
      .pop() || "manage";
  const bucketFor = (permission: any) =>
    buckets.find((bucket: any) =>
      bucket[2].includes(normalizedAction(permission)),
    ) || buckets[0];
  const labelFor = (permission: any) =>
    title(
      String(permission.action || "manage")
        .replaceAll("_", " ")
        .replaceAll(".", " "),
    );
  return (
    <div>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h4 className="font-bold">Module Permissions</h4>
          <p className="text-sm text-slate-500">
            Enable permissions by module. Use Manage for full workflow/action
            access, then Create, Read, Edit, and Delete as needed.
          </p>
        </div>
        <Badge tone="slate">{selectedSet.size} selected</Badge>
      </div>
      <div className="mt-3 grid gap-4 xl:grid-cols-2">
        {modules.map((module) => (
          <div
            key={module}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div>
                <h5 className="font-bold">
                  {title(module.replaceAll("_", " "))}
                </h5>
                <p className="text-xs text-slate-500">
                  {grouped[module].length} permissions
                </p>
              </div>
              <Badge tone="slate">Module</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {buckets.map((bucket: any) => {
                const bucketPermissions = grouped[module]
                  .filter(
                    (permission: any) => bucketFor(permission)[0] === bucket[0],
                  )
                  .sort((a: any, b: any) => a.key.localeCompare(b.key));
                return (
                  <div
                    key={`${module}-${bucket[0]}`}
                    className="rounded-2xl bg-slate-50 p-3"
                  >
                    <p className="mb-2 text-xs font-bold uppercase text-slate-500">
                      {bucket[1]}
                    </p>
                    <div className="grid gap-2">
                      {bucketPermissions.length ? (
                        bucketPermissions.map((permission: any) => (
                          <label
                            key={permission.key}
                            className="flex items-start gap-2 text-sm"
                          >
                            <input
                              name="permissionKeys"
                              type="checkbox"
                              value={permission.key}
                              defaultChecked={selectedSet.has(permission.key)}
                              disabled={disabled}
                              className="mt-1 h-4 w-4"
                            />
                            <span>
                              <span className="font-semibold">
                                {labelFor(permission)}
                              </span>
                              <span className="block break-all text-xs text-slate-400">
                                {permission.key}
                              </span>
                            </span>
                          </label>
                        ))
                      ) : (
                        <span className="text-xs text-slate-300">
                          No access
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckboxList({
  title,
  name,
  rows,
  selected,
  valueKey,
  labelKey,
}: any) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase text-slate-500">{title}</p>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row: any) => (
          <label
            key={row.id}
            className="flex items-start gap-2 rounded-2xl border border-slate-200 p-3 text-sm"
          >
            <input
              name={name}
              type="checkbox"
              value={row[valueKey]}
              defaultChecked={selected.includes(row[valueKey])}
              className="mt-1 h-4 w-4"
            />
            <span>
              <b>{row[labelKey]}</b>
              {row.branchLabel && (
                <span className="block text-xs text-slate-500">
                  {row.branchLabel}
                </span>
              )}
              {isLocked(row) && (
                <span className="mt-1 inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">
                  Template
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function UserRow({ user, branches, onEdit, onStatus, onDelete }: any) {
  const branch = branches.find((row: any) => row.id === user.branch_id);
  const typeLabel =
    userTypes.find(([value]) => value === user.user_type)?.[1] ||
    humanizeOptionLabel(user.user_type, "Staff");
  return (
    <ClickableRow
      onClick={onEdit}
      className="xl:grid-cols-[1.05fr_1.15fr_.75fr_1fr_.65fr_.7fr_1.45fr]"
    >
      <div>
        <b>{user.name}</b>
      </div>
      <span className="break-all">{user.email}</span>
      <span>{typeLabel}</span>
      <span>{branch?.name || "All branches"}</span>
      <Badge tone={user.is_active ? "green" : "red"}>
        {user.is_active ? "Active" : "Inactive"}
      </Badge>
      <span>{formatDate(user.created_at)}</span>
      <RowActions
        row={user}
        onEdit={onEdit}
        onStatus={onStatus}
        onDelete={onDelete}
      />
    </ClickableRow>
  );
}
function RoleRow({ role, onEdit, onStatus, onDelete }: any) {
  return (
    <ClickableRow
      onClick={onEdit}
      className="xl:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b>{role.name}</b>
        {isLocked(role) && (
          <span className="ml-2">
            <Badge tone="purple">Locked</Badge>
          </span>
        )}
      </div>
      <span>{roleKeyLabel(role.key)}</span>
      <Badge tone={role.is_active ? "green" : "red"}>
        {role.is_active ? "Active" : "Inactive"}
      </Badge>
      <span>{formatDate(role.updated_at || role.created_at)}</span>
      <RowActions
        row={role}
        locked={isLocked(role)}
        onEdit={onEdit}
        onStatus={onStatus}
        onDelete={onDelete}
      />
    </ClickableRow>
  );
}
function DepartmentRow({ department, onEdit, onStatus, onDelete }: any) {
  return (
    <ClickableRow
      onClick={onEdit}
      className="xl:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b>{department.name}</b>
        {department.locked && (
          <span className="ml-2">
            <Badge tone="purple">Locked</Badge>
          </span>
        )}
        <p className="text-xs text-slate-500">
          {department.rows?.length > 1
            ? `${department.rows.length} branch mappings`
            : "Single branch mapping"}
        </p>
      </div>
      <span>{department.code}</span>
      <span>{department.branch_names || "All branches"}</span>
      <Badge tone={department.is_active ? "green" : "red"}>
        {department.is_active ? "Active" : "Inactive"}
      </Badge>
      <RowActions
        row={department.primary || department}
        locked={department.locked}
        onEdit={onEdit}
        onStatus={onStatus}
        onDelete={onDelete}
      />
    </ClickableRow>
  );
}
function BranchRow({ branch, onEdit, onStatus, onDelete }: any) {
  return (
    <ClickableRow
      onClick={onEdit}
      className="xl:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b>{branch.name}</b>
        {isLocked(branch) && (
          <span className="ml-2">
            <Badge tone="purple">Locked</Badge>
          </span>
        )}
      </div>
      <span>{branch.code}</span>
      <span>
        {[branch.city, branch.state].filter(Boolean).join(", ") || "-"}
      </span>
      <Badge tone={branch.is_active ? "green" : "red"}>
        {branch.is_active ? "Active" : "Inactive"}
      </Badge>
      <RowActions
        row={branch}
        locked={isLocked(branch)}
        onEdit={onEdit}
        onStatus={onStatus}
        onDelete={onDelete}
      />
    </ClickableRow>
  );
}
function SupplierRow({ supplier, onEdit, onStatus, onDelete }: any) {
  return (
    <ClickableRow
      onClick={onEdit}
      className="xl:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b>{supplier.name}</b>
      </div>
      <span>{supplier.gstin || "-"}</span>
      <span>
        <b>{supplier.phone || "-"}</b>
        <p className="break-all text-xs text-slate-500">
          {supplier.email || supplier.address || "-"}
        </p>
      </span>
      <Badge tone={supplier.is_active ? "green" : "red"}>
        {supplier.is_active ? "Active" : "Inactive"}
      </Badge>
      <RowActions
        row={supplier}
        onEdit={onEdit}
        onStatus={onStatus}
        onDelete={onDelete}
      />
    </ClickableRow>
  );
}
function TaxRuleRow({ rule, branches, onEdit, onStatus, onDelete }: any) {
  const branch = branches.find((row: any) => row.id === rule.branch_id);
  return (
    <ClickableRow
      onClick={onEdit}
      className="xl:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b>{rule.name}</b>
      </div>
      <span>
        {scopeLabel(rule.service_scope)} · {branch?.name || "All branches"}
      </span>
      <span>
        <b>{rule.tax_percentage}%</b>
        <p className="text-xs text-slate-500">{rule.tax_label || "GST"}</p>
      </span>
      <Badge tone={rule.is_active ? "green" : "red"}>
        {rule.is_active ? "Active" : "Inactive"}
      </Badge>
      <RowActions
        row={rule}
        onEdit={onEdit}
        onStatus={onStatus}
        onDelete={onDelete}
      />
    </ClickableRow>
  );
}
function DiscountOfferRow({
  offer,
  branches,
  onEdit,
  onStatus,
  onDelete,
}: any) {
  const branch = branches.find((row: any) => row.id === offer.branch_id);
  const value =
    offer.discount_type === "fixed"
      ? `₹${Number(offer.value || 0).toLocaleString("en-IN")}`
      : `${offer.value}%`;
  const code = publicDisplayValue(offer.code, "");
  const minimum = Number(offer.minimum_bill_amount || 0);
  return (
    <ClickableRow
      onClick={onEdit}
      className="xl:grid-cols-[1.15fr_.75fr_1.2fr_.65fr_1.45fr]"
    >
      <div>
        <b>{offer.name}</b>
        {code && <p className="break-all text-xs text-slate-500">{code}</p>}
      </div>
      <span>
        {scopeLabel(offer.service_scope)} · {branch?.name || "All branches"}
      </span>
      <span>
        <b>{value}</b>
        <p className="text-xs text-slate-500">
          {minimum > 0
            ? `Min bill ₹${minimum.toLocaleString("en-IN")}`
            : "No minimum"}{" "}
          ·{" "}
          {offer.max_discount_amount
            ? `Max ₹${Number(offer.max_discount_amount).toLocaleString("en-IN")}`
            : "No cap"}
        </p>
      </span>
      <Badge tone={offer.is_active ? "green" : "red"}>
        {offer.is_active ? "Active" : "Inactive"}
      </Badge>
      <RowActions
        row={offer}
        onEdit={onEdit}
        onStatus={onStatus}
        onDelete={onDelete}
      />
    </ClickableRow>
  );
}
function RowActions({ row, locked, onEdit, onStatus, onDelete }: any) {
  const stop = (handler: any) => (event: any) => {
    event.stopPropagation();
    handler();
  };
  return (
    <ActionGroup className="justify-start xl:justify-end">
      <ActionButton onClick={stop(onEdit)}>
        {locked ? "View" : "Edit"}
      </ActionButton>
      {!locked && (
        <ActionButton onClick={stop(onStatus)}>
          {row.is_active ? "Inactive" : "Active"}
        </ActionButton>
      )}
      {!locked && (
        <ActionButton tone="danger" onClick={stop(onDelete)}>
          Delete
        </ActionButton>
      )}
    </ActionGroup>
  );
}
function ClickableRow({ children, onClick, className }: any) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event: any) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={`grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none xl:items-center ${className}`}
    >
      {children}
    </div>
  );
}

function Header({ title, subtitle, back }: any) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={back}
        className="rounded-2xl border px-4 py-3 text-sm font-bold"
      >
        Back
      </button>
    </div>
  );
}
function Actions({ busy, back, disabled, label }: any) {
  return (
    <div className="flex flex-wrap gap-2 md:col-span-2">
      <Button disabled={busy || disabled}>{busy ? "Saving..." : label}</Button>
      <button
        type="button"
        onClick={back}
        className="rounded-2xl border px-4 py-3 text-sm font-bold"
      >
        Cancel
      </button>
    </div>
  );
}
function ConfirmModal({ action, busy, onCancel, onConfirm }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <Card className="max-w-md">
        <h3 className="text-lg font-bold">Confirm {action.kind}</h3>
        <p className="mt-2 text-sm text-slate-500">
          This will{" "}
          {action.kind === "delete" ? "deactivate/delete" : "change status for"}{" "}
          {action.row.name || action.row.email}. Continue?
        </p>
        <div className="mt-4 flex gap-2">
          <Button onClick={onConfirm} disabled={busy}>
            Confirm
          </Button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            Cancel
          </button>
        </div>
      </Card>
    </div>
  );
}
function Empty({ text }: any) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
      {text}
    </div>
  );
}
function Pagination({ page, totalPages, total, pageSize, onPage }: any) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="mt-4 flex flex-col justify-between gap-3 text-sm text-slate-500 sm:flex-row sm:items-center">
      <span>
        Showing {start}-{end} of {total}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300"
        >
          Previous
        </button>
        <span className="rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-700">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300"
        >
          Next
        </button>
      </div>
    </div>
  );
}
function title(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function formatDate(value: any) {
  return value ? new Date(value).toLocaleDateString() : "-";
}
function isLocked(row: any) {
  return Boolean(
    row?.is_template_locked ||
    row?.source_template_role_id ||
    row?.source_template_department_id ||
    row?.source_template_branch_id,
  );
}
function scopeLabel(value: any) {
  return (
    serviceScopes.find(([scope]) => scope === value)?.[1] ||
    title(String(value || "all").replaceAll("_", " "))
  );
}
function roleKeyLabel(value: any) {
  return humanizeOptionLabel(
    String(value || "")
      .replace(/^sun_[a-z0-9]+_/i, "")
      .replace(/^tenant_/i, "tenant "),
  );
}
function settingLabel(value: any) {
  return humanizeOptionLabel(
    String(value || "")
      .split(".")
      .pop() || value,
  );
}
function settingValueLabel(value: any) {
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
function dateToInput(value: any) {
  return value ? String(value).slice(0, 10) : "";
}
function dateInputToIso(value: any) {
  const raw = String(value || "");
  return raw ? `${raw}T00:00:00Z` : null;
}
function patientLabel(patients: any[], patientId: any) {
  const patient = patients.find((row: any) => row.id === patientId);
  return patient
    ? [patient.full_name || patient.name, patient.patient_number]
        .filter(Boolean)
        .join(" - ")
    : patientId || "-";
}

function groupDepartmentsByName(departments: any[], branches: any[]) {
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

function roleBranchToken(branch: any) {
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

function roleMatchesBranch(role: any, branch: any) {
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

function filterRolesForBranch(
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
    if (
      !existing ||
      selectedSet.has(role.key) ||
      roleMatchesBranch(role, branch)
    ) {
      byName.set(key, next);
    }
  }
  return Array.from(byName.values()).sort((a: any, b: any) =>
    String(a.name).localeCompare(String(b.name)),
  );
}
