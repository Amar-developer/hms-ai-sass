import {
  Building2,
  ClipboardList,
  FileText,
  KeyRound,
  Percent,
  Plus,
  Settings,
  ShieldCheck,
  Tags,
  Truck,
  Users,
} from "lucide-react";

type FileCategoryRule = {
  modules: string[];
  doctypes: string[];
  fields: string[];
  labels: string[];
  folders: string[];
};

export const sections = [
  ["users", "Users", Users],
  ["roles", "Roles", ShieldCheck],
  ["departments", "Medical Departments", ClipboardList],
  ["branches", "Branches", Building2],
  ["suppliers", "Suppliers", Truck],
  ["tax", "Tax", Percent],
  ["offers", "Discounts & Offers", Tags],
  ["membership", "Patient Membership", ShieldCheck],
  ["files", "Files", FileText],
  ["settings", "Tenant & Branch Settings", Settings],
] as const;

export const tenantAdminSections = sections;

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

export const serviceScopes = [
  ["all", "All billable modules"],
  ["consultation", "Consultation"],
  ["lab", "Lab / Service"],
  ["pharmacy", "Pharmacy"],
  ["items", "Items"],
] as const;

export const fileCategoryOptions = [
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

export const fileCategoryRules: Record<string, FileCategoryRule> = {
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
    fields: ["logo_url", "invoice.logo_url"],
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

export const doctypeFetchPaths: Record<string,{ path: string; label: (row: any) => string; sublabel?: (row: any) => string }> = {
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

export const parseNumberingRules = (value: any, fallbackPrefix = "SUN") => ({
  prefix: String(value?.prefix || fallbackPrefix || "SUN").toUpperCase(),
  digits: Number(value?.digits || 5),
  entities: { ...defaultNumberingEntities, ...(value?.entities || {}) },
});

export const parseBankDetails = (value: any) => ({
  account_name: String(value?.account_name || value?.name || ""),
  branch_name: String(value?.branch_name || value?.branch || ""),
  account_number: String(value?.account_number || value?.acc_number || ""),
  ifsc: String(value?.ifsc || "").toUpperCase(),
  upi_id: String(value?.upi_id || value?.upi || ""),
  gstin: String(value?.gstin || "").toUpperCase(),
});
