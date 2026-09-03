import {
  Activity,
  Building2,
  ClipboardList,
  CreditCard,
  MessageCircleMore,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { CLINIC_SECTION_IDS } from "@/lib/clinicSections";

export const tenantTypes = [
  ["clinic", "Clinic"],
  ["polyclinic", "Polyclinic"],
  ["general_hospital", "General Hospitals"],
  ["specialty_hospital", "Specialty Hospitals"],
  ["multi_specialty_hospital", "Multi Specialty Hospitals"],
] as const;

export const defaultNumberingEntities: any = {
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

export const defaultCatalogIntegrations: any = {
  lab_items: { enabled: false, provider: "local" },
  medicine_items: { enabled: true, provider: "external_catalog" },
};

export const userTypes = [
  ["tenant_admin", "Tenant Admin"],
  ["doctor", "Doctor"],
  ["receptionist", "Receptionist"],
  ["nurse", "Staff Nurse"],
  ["lab", "Lab Technician"],
  ["pharmacy", "Pharmacy User"],
  ["billing", "Billing Staff"],
  ["back_office", "Back Office Staff"],
  ["staff", "General Staff"],
] as const;

export const requiredRolePermissions = [
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
    description: "Medical Departments Manage",
  },
  {
    key: "departments.create",
    module: "departments",
    action: "create",
    description: "Medical Departments Create",
  },
  {
    key: "departments.read",
    module: "departments",
    action: "read",
    description: "Medical Departments Read",
  },
  {
    key: "departments.edit",
    module: "departments",
    action: "edit",
    description: "Medical Departments Edit",
  },
  {
    key: "departments.delete",
    module: "departments",
    action: "delete",
    description: "Medical Departments Delete",
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

export const superAdminSections = [
  ["overview", "Overview", Activity],
  ["privilegedAccess", "Privileged Access", ShieldCheck],
  ["tenants", "Tenants", Building2],
  ["roles", "Roles", ShieldCheck],
  ["users", "Users", Users],
  ["departments", "Medical Departments", ClipboardList],
  ["branches", "Branches", Building2],
  ["subscriptions", "Subscription Management", CreditCard],
  ["settings", "Tenant & Branch Settings", Settings],
  ["whatsappSettings", "WhatsApp Settings", MessageCircleMore],
  ["smsSettings", "SMS Settings", MessageSquare],
] as const;

// Display-only split of the list above: "Settings" is its own sidebar
// dropdown (routed under /superadmin/{section}), "Clinic" is a separate one
// (routed under /clinic/{section} — see superAdminPath in routing.ts). Both
// are still filtered through platformSectionsForUser() for permissions.
export const superAdminSettingsSections = superAdminSections.filter(
  ([id]) => !(CLINIC_SECTION_IDS as readonly string[]).includes(id),
);
export const superAdminClinicSections = superAdminSections.filter(([id]) =>
  (CLINIC_SECTION_IDS as readonly string[]).includes(id),
);

export const status_options = [
  { value: "all", label: "All status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export const tenant_status_options = [
  { value: "all", label: "All status" },
  { value: "trial", label: "Trial" },
  { value: "active", label: "Active" },
];

export const dateFieldOptions = [
  { value: "updated_at", label: "Modified date" },
  { value: "created_at", label: "Created date" },
];

export const subscriptin_status_options = [
  { value: "all", label: "All status" },
  { value: "active", label: "Active" },
  { value: "scheduled", label: "Scheduled" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];
