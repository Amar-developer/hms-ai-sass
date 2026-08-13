  import {
    BarChart3,
    BedDouble,
    Building2,
    ClipboardList,
    Clock,
    Dumbbell,
    FlaskConical,
    HeartPulse,
    Home,
    PackageOpen,
    Pill,
    ReceiptIndianRupee,
    ShieldCheck,
    Stethoscope,
    UserCog,
    Users,
    BanknoteIcon
  } from "lucide-react";

  export const nav = [
    ["dashboard", "Dashboard", HeartPulse],
    ["superadmin", "Super Admin", Building2],
    ["admin", "Tenant Admin", ShieldCheck],
    ["opd", "OPD Workspace", Stethoscope],
    ["queue", "Token Queue", Clock],
    ["patients", "EMR / Patient Management", Users],
    ["practitioners", "Doctors", UserCog],
    ["scheduling", "Scheduling", ClipboardList],
    ["items", "Items", PackageOpen],
    ["ip", "IP Admission", BedDouble],
    ["lab", "Lab & Service", FlaskConical],
    ["pharmacy", "Prescription", Pill],
    ["physiotherapy", "Physiotherapy", Dumbbell],
    ["home_care", "Home Care  Visit Booking", Home],
    ["billing", "Invoices", ReceiptIndianRupee],
    ["reports", "Reports", BarChart3],
    ["expense","Expense",BanknoteIcon]
  ] as const;
