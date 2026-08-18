import {
  Building2,
  ClipboardList,
  FileText,
  KeyRound,
  MessageCircleMore,
  BrainCircuit,
  Percent,
  Plus,
  Settings,
  ShieldCheck,
  Tags,
  Truck,
  Users,
} from "lucide-react";
import {
  WhatsAppFlowKey,
  WhatsAppLanguage,
  WhatsAppSettingsDraft,
} from "./types";

type FileCategoryRule = {
  modules: string[];
  doctypes: string[];
  fields: string[];
  labels: string[];
  folders: string[];
};

// "Settings" — everything except the three sections Clinic owns (see
// clinic_sections below). Routed under /admin/{section}.
export const sections = [
  ["files", "Files", FileText],
  ["settings", "Tenant & Branch Settings", Settings],
  ["patient-intelligence", "Patient Intelligence", BrainCircuit],
  ["whatsapp", "WhatsApp Settings", MessageCircleMore],
  ["roles", "Roles", ShieldCheck],
  ["membership", "Patient Membership", ShieldCheck],
] as const;

export const tenantAdminSections = sections;

export const clinic_sections = [
  ["users", "Users", Users],
  ["branches", "Branches", Building2],
  ["departments", "Medical Departments", ClipboardList],
  ["tax", "Tax", Percent],
  ["offers", "Discounts & Offers", Tags],
  ["suppliers", "Suppliers", Truck],
] as const;

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
  ["home_care", "Home Care"],
  ["home_visit", "Home Visit"],
  ["physiotherapy", "Physiotherapy"],
  ["ip", "IP Admission"],
  ["service", "Other Services"],
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

export const doctypeFetchPaths: Record<
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

export const defaultNumberingEntities: any = {
  user: "USR",
  patient: "PAT",
  doctor: "DOC",
  department: "DEPT",
  appointment: "APT",
  lab_order: "LAB",
  pharmacy_issue: "PHM",
  invoice: "INV",
  ip_admission: "IP",
  physiotherapy_case: "PHY",
  home_care_booking: "HC",
  home_care_visit: "HCV",
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

export const APPOINTMENT_GRID =
  "grid-cols-[180px_140px_180px_180px_180px_120px_320px]";

export const SUPER_APPOINTMENT_GRID =
  "grid-cols-[220px_220px_140px_180px_180px_180px_120px]";

export const MUST_CHANGE_OPTIONS = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

export const status_filters = {
  key: "status",
  label: "Status",
  options: [
    { value: "all", label: "All Status" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ],
};

export const branch_status_options = [
  {
    value: "true",
    label: "Active",
  },
  {
    value: "false",
    label: "Inactive",
  },
];

export const flowOptions: Array<{
  key: WhatsAppFlowKey;
  label: string;
  description: string;
  audience: "patient" | "doctor";
}> = [
  {
    key: "appointment_booked_patient",
    label: "Patient appointment confirmation",
    description: "Trigger after an appointment is booked successfully.",
    audience: "patient",
  },
  {
    key: "appointment_booked_doctor",
    label: "Doctor appointment alert",
    description: "Notify the assigned doctor about a new booking.",
    audience: "doctor",
  },
  {
    key: "invoice_paid_patient",
    label: "Paid invoice receipt",
    description: "Trigger when an invoice becomes fully paid.",
    audience: "patient",
  },
  {
    key: "payment_pending_patient",
    label: "Pending payment update",
    description: "Trigger after a partial payment leaves a balance.",
    audience: "patient",
  },
  {
    key: "appointment_cancelled_patient",
    label: "Patient appointment cancellation",
    description: "Trigger when a booked appointment is cancelled.",
    audience: "patient",
  },
  {
    key: "appointment_cancelled_doctor",
    label: "Doctor appointment cancellation",
    description: "Notify the assigned doctor when an appointment is cancelled.",
    audience: "doctor",
  },
  {
    key: "invoice_refunded_patient",
    label: "Invoice refund confirmation",
    description: "Trigger after a full or partial payment refund.",
    audience: "patient",
  },
  {
    key: "lab_report_ready_patient",
    label: "Lab report ready",
    description: "Trigger when a lab result is released.",
    audience: "patient",
  },
  {
    key: "prescription_ready_patient",
    label: "Prescription ready",
    description: "Trigger when a consultation with a prescription is signed.",
    audience: "patient",
  },
  {
    key: "follow_up_advice_patient",
    label: "Follow-up advice",
    description:
      "Trigger when a signed consultation includes follow-up advice.",
    audience: "patient",
  },
  {
    key: "appointment_reminder_patient",
    label: "Patient appointment reminder",
    description: "Send an automatic reminder before an upcoming appointment.",
    audience: "patient",
  },
  {
    key: "medicine_refill_patient",
    label: "Medicine refill reminder",
    description:
      "Send a consent-aware reminder when a recurring refill is due.",
    audience: "patient",
  },
  {
    key: "membership_renewal_patient",
    label: "Membership renewal reminder",
    description: "Send a reminder before an active patient membership expires.",
    audience: "patient",
  },
  {
    key: "patient_reengagement",
    label: "Patient re-engagement",
    description: "Staff-approved check-in after a no-show or inactivity flag.",
    audience: "patient",
  },
  {
    key: "home_care_booking_patient",
    label: "Home care booking confirmation",
    description: "Trigger after a home care booking is created.",
    audience: "patient",
  },
  {
    key: "home_care_visit_patient",
    label: "Home care visit update",
    description: "Trigger for a scheduled or completed home care visit.",
    audience: "patient",
  },
  {
    key: "home_visit_booking_patient",
    label: "Home visit booking confirmation",
    description: "Trigger after a doctor/staff home visit is booked.",
    audience: "patient",
  },
  {
    key: "home_visit_reminder_patient",
    label: "Home visit reminder",
    description: "Send a reminder before a scheduled home visit.",
    audience: "patient",
  },
  {
    key: "ip_admission_patient",
    label: "IP admission confirmation",
    description: "Trigger when an inpatient admission is created.",
    audience: "patient",
  },
  {
    key: "ip_discharge_patient",
    label: "IP discharge summary",
    description: "Trigger when an inpatient discharge summary is finalized.",
    audience: "patient",
  },
  {
    key: "physiotherapy_case_patient",
    label: "Physiotherapy case created",
    description: "Trigger when a physiotherapy case is opened.",
    audience: "patient",
  },
  {
    key: "physiotherapy_session_patient",
    label: "Physiotherapy session update",
    description: "Trigger for a physiotherapy session or home program update.",
    audience: "patient",
  },
  {
    key: "pharmacy_dispense_patient",
    label: "Pharmacy dispense update",
    description: "Trigger when medicines are dispensed.",
    audience: "patient",
  },
  {
    key: "service_invoice_patient",
    label: "Service invoice update",
    description: "Trigger for healthcare service invoice messages.",
    audience: "patient",
  },
  {
    key: "service_follow_up_patient",
    label: "Service follow-up",
    description: "Trigger for post-service follow-up engagement.",
    audience: "patient",
  },
];

export const MAX_TEMPLATE_PARAMETERS = 10;

export const languageOptions: Array<{
  value: WhatsAppLanguage;
  label: string;
}> = [
  { value: "en", label: "English" },
  { value: "ta", label: "Tamil" },
];

export const SAMPLE_VALUES_BY_FIELD: Record<string, string> = {
  recipient_name: "Test Patient",
  appointment_date: "25 July 2026",
  appointment_time: "10:30 AM",
  appointment_status: "booked",
  appointment_id: "appointment_test_001",
  appointment_view_url: "https://app.example.com/appointments",
  expected_date: "25 August 2026",
  expiry_date: "31 August 2026",
  invoice_number: "TEST-INV-001",
  service_description: "Consultation",
  total_amount: "1000",
  paid_amount: "500",
  balance_amount: "500",
  refund_amount: "500",
  report_name: "Blood test",
  clinic_name: "MedizinHub Healthcare Service",
  report_date: "25 July 2026",
  consultation_date: "25 July 2026",
  doctor_name: "Test Doctor",
  follow_up_advice: "Return after seven days",
  cancellation_reason: "Schedule change",
};

export const newTemplateInitialState = {
  name: "",
  description: "",
  triggerKey: "appointment_booked_patient" as WhatsAppFlowKey,
  parameters: [] as string[],
  englishIdentifier: "",
  tamilIdentifier: "",
};

export const initialDraft: WhatsAppSettingsDraft = {
  enabled: false,
  apiUrl: "",
  publicMediaBaseUrl: "",
  appointmentViewUrl: "",
  apiKey: "",
  defaultCountryCode: "+91",
  timeoutSeconds: 15,
  maxAttempts: 5,
  patientNotificationsEnabled: true,
  doctorNotificationsEnabled: true,
  appointmentReminder24hEnabled: false,
  appointmentReminder2hEnabled: false,
  defaultLanguage: "en",
  templates: {
    appointment_booked_patient: "",
    appointment_booked_doctor: "",
    invoice_paid_patient: "",
    payment_pending_patient: "",
    appointment_cancelled_patient: "",
    appointment_cancelled_doctor: "",
    invoice_refunded_patient: "",
    lab_report_ready_patient: "",
    prescription_ready_patient: "",
    follow_up_advice_patient: "",
    appointment_reminder_patient: "",
    medicine_refill_patient: "",
    membership_renewal_patient: "",
    patient_reengagement: "",
    home_care_booking_patient: "",
    home_care_visit_patient: "",
    home_visit_booking_patient: "",
    home_visit_reminder_patient: "",
    ip_admission_patient: "",
    ip_discharge_patient: "",
    physiotherapy_case_patient: "",
    physiotherapy_session_patient: "",
    pharmacy_dispense_patient: "",
    service_invoice_patient: "",
    service_follow_up_patient: "",
  },
  localizedTemplates: {},
  flows: {
    appointment_booked_patient: true,
    appointment_booked_doctor: true,
    invoice_paid_patient: true,
    payment_pending_patient: false,
    appointment_cancelled_patient: false,
    appointment_cancelled_doctor: false,
    invoice_refunded_patient: false,
    lab_report_ready_patient: false,
    prescription_ready_patient: false,
    follow_up_advice_patient: false,
    appointment_reminder_patient: false,
    medicine_refill_patient: false,
    membership_renewal_patient: false,
    patient_reengagement: false,
    home_care_booking_patient: false,
    home_care_visit_patient: false,
    home_visit_booking_patient: false,
    home_visit_reminder_patient: false,
    ip_admission_patient: false,
    ip_discharge_patient: false,
    physiotherapy_case_patient: false,
    physiotherapy_session_patient: false,
    pharmacy_dispense_patient: false,
    service_invoice_patient: false,
    service_follow_up_patient: false,
  },
  customTemplates: [],
  fieldCatalog: {},
  templateFieldMappings: {},
};
