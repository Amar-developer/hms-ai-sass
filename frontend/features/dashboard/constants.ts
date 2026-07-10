import { Activity, BarChart3, BedDouble, Building2, CalendarDays, ClipboardList, Clock, Dumbbell, FileText, FlaskConical, PackageOpen, Percent, Pill, Receipt, ReceiptIndianRupee, Settings, ShieldCheck, Stethoscope, Tags, Truck, UserCog, Users } from "lucide-react";

export const SHORTCUT_CATEGORIES = [
  {
    label: "Front Office",
    color: "bg-blue-50 border-blue-100",
    headerColor: "text-blue-700",
    iconColor: "text-blue-500",
    modules: [
      { id: "appointments", label: "Appointments", icon: CalendarDays },
      { id: "queue", label: "Token Queue", icon: Clock },
      { id: "patients", label: "EMR / Patients", icon: Users },
    ],
  },
  {
    label: "Clinical",
    color: "bg-emerald-50 border-emerald-100",
    headerColor: "text-emerald-700",
    iconColor: "text-emerald-500",
    modules: [
      { id: "practitioners", label: "Doctors / Create", icon: UserCog },
      { id: "scheduling", label: "Scheduling", icon: ClipboardList },
      { id: "doctor", label: "Doctor Dashboard", icon: Stethoscope },
      { id: "consultation", label: "Consultation", icon: ClipboardList },
    ],
  },
  {
    label: "Diagnostics & Pharmacy",
    color: "bg-violet-50 border-violet-100",
    headerColor: "text-violet-700",
    iconColor: "text-violet-500",
    modules: [
      { id: "lab", label: "Lab", icon: FlaskConical },
      { id: "pharmacy", label: "Prescription", icon: Pill },
      { id: "items", label: "Items", icon: PackageOpen },
    ],
  },
  {
    label: "Reports & Admin",
    color: "bg-slate-50 border-slate-200",
    headerColor: "text-slate-700",
    iconColor: "text-slate-500",
    modules: [
      { id: "reports", label: "Reports Overview", icon: BarChart3 },
      {
        id: "report-metrics",
        label: "Metrics Report",
        icon: Activity,
        target: { id: "reports", section: "metrix" },
      },
      {
        id: "report-invoice",
        label: "Invoice Report",
        icon: Receipt,
        target: { id: "reports", section: "invoice" },
      },
      {
        id: "report-lab",
        label: "Lab Report",
        icon: FlaskConical,
        target: { id: "reports", section: "lab" },
      },
      {
        id: "report-appointments",
        label: "Appointments Report",
        icon: FileText,
        target: { id: "reports", section: "appointments" },
      },
      {
        id: "report-pharmacy",
        label: "Pharmacy Report",
        icon: Users,
        target: { id: "reports", section: "pharmacy" },
      },
      { id: "admin", label: "Tenant Admin", icon: ShieldCheck },
      {
        id: "admin-users",
        label: "Users / Create",
        icon: Users,
        target: { id: "admin", section: "users" },
      },
      {
        id: "admin-roles",
        label: "Roles",
        icon: ShieldCheck,
        target: { id: "admin", section: "roles" },
      },
      {
        id: "admin-departments",
        label: "Departments / Create",
        icon: ClipboardList,
        target: { id: "admin", section: "departments" },
      },
      {
        id: "admin-branches",
        label: "Branches",
        icon: Building2,
        target: { id: "admin", section: "branches" },
      },
      {
        id: "admin-suppliers",
        label: "Suppliers",
        icon: Truck,
        target: { id: "admin", section: "suppliers" },
      },
      {
        id: "admin-tax",
        label: "Tax",
        icon: Percent,
        target: { id: "admin", section: "tax" },
      },
      {
        id: "admin-offers",
        label: "Discounts & Offers",
        icon: Tags,
        target: { id: "admin", section: "offers" },
      },
      {
        id: "admin-membership",
        label: "Patient Membership",
        icon: ShieldCheck,
        target: { id: "admin", section: "membership" },
      },
      {
        id: "admin-files",
        label: "Files",
        icon: FileText,
        target: { id: "admin", section: "files" },
      },
      {
        id: "admin-settings",
        label: "Tenant Settings",
        icon: Settings,
        target: { id: "admin", section: "settings" },
      },
    ],
  },
  {
    label: "Inpatient & Rehab",
    color: "bg-amber-50 border-amber-100",
    headerColor: "text-amber-700",
    iconColor: "text-amber-500",
    modules: [
      { id: "ip", label: "IP Admission", icon: BedDouble },
      { id: "physiotherapy", label: "Physiotherapy", icon: Dumbbell },
    ],
  },
  {
    label: "Revenue",
    color: "bg-rose-50 border-rose-100",
    headerColor: "text-rose-700",
    iconColor: "text-rose-500",
    modules: [
      { id: "billing", label: "Invoices & Billing", icon: ReceiptIndianRupee },
    ],
  },
];
