  import {
    BarChart3,
    BedDouble,
    Building2,
    ClipboardList,
    Clock,
    Dumbbell,
    FlaskConical,
    LayoutDashboard,
    History,
    Home,
    PackageOpen,
    Pill,
    ReceiptIndianRupee,
    ShieldCheck,
    Stethoscope,
    UserCog,
    Users,
    BanknoteIcon,
    Hospital
  } from "lucide-react";

  export const nav = [
    ["dashboard", "Dashboard", LayoutDashboard],
    ["clinic", "Clinic Setup", Hospital],
    ["opd", "OPD Workspace", Stethoscope],
    ["queue", "Token Queue", Clock],
    ["patients", "EMR / Patient Management", Users],
    ["patient_history", "Patient History", History],
    ["practitioners", "Doctors", UserCog],
    ["scheduling", "Scheduling", ClipboardList],
    ["items", "Items", PackageOpen],
    ["ip", "IP Admission", BedDouble],
    ["lab", "Lab & Service", FlaskConical],
    ["pharmacy", "Pharmacy", Pill],
    ["physiotherapy", "Physiotherapy", Dumbbell],
    ["home_care", "Home Care  Visit Booking", Home],
    ["billing", "Invoices", ReceiptIndianRupee],
    ["reports", "Reports", BarChart3],
    ["expense","Expense",BanknoteIcon],
    // Both "Settings" entries (super admin vs. tenant admin — mutually
    // exclusive per user, see Sidebar.tsx) are last so the group sits at
    // the bottom of the sidebar, below every operational module.
    ["superadmin", "Settings", Building2],
    ["admin", "Settings", ShieldCheck],
  ] as const;
