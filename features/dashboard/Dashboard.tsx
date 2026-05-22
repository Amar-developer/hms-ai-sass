"use client";

import {
  ArrowRight,
  BarChart3,
  BedDouble,
  CalendarDays,
  ClipboardList,
  Clock,
  Dumbbell,
  FlaskConical,
  IndianRupee,
  PackageOpen,
  Pill,
  ReceiptIndianRupee,
  ShieldCheck,
  Stethoscope,
  UserCog,
  Users,
} from "lucide-react";
import { Badge, Card } from "@/components/ui";

const SHORTCUT_CATEGORIES = [
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
      { id: "practitioners", label: "Doctors", icon: UserCog },
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
  {
    label: "Reports & Admin",
    color: "bg-slate-50 border-slate-200",
    headerColor: "text-slate-700",
    iconColor: "text-slate-500",
    modules: [
      { id: "reports", label: "Reports", icon: BarChart3 },
      { id: "admin", label: "Tenant Admin", icon: ShieldCheck },
    ],
  },
];

function rupees(value: any) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function dateKey(value: any) {
  return String(value || "").slice(0, 10);
}

function monthKey(value: any) {
  return dateKey(value).slice(0, 7);
}

function normalized(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
}

function isCompletedAppointment(row: any) {
  const values = [
    row.status,
    row.queueStatus,
    row.queue_status,
    row.consultationStatus,
    row.consultation_status,
  ].map(normalized);
  return values.some((value) =>
    [
      "consultation_completed",
      "consultation_done",
      "completed",
      "done",
      "seen",
      "signed",
      "billed",
    ].includes(value),
  );
}

function invoiceAmount(row: any) {
  return Number(row.total_amount ?? row.total ?? row.amount ?? 0);
}

function invoiceBalance(row: any) {
  return Number(row.balance_amount ?? row.balance ?? 0);
}

function topRows(rows: any[], keyGetter: (row: any) => string, labelGetter: (key: string) => string) {
  const buckets = rows.reduce((acc: Record<string, number>, row: any) => {
    const key = keyGetter(row) || "unassigned";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(buckets)
    .map(([key, count]) => ({ key, label: labelGetter(key), count: Number(count) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function Dashboard({
  clinic,
  scopedAppointments,
  patients,
  liveSummary,
  liveInvoices = [],
  allowedDepartments = [],
  livePractitioners = [],
  setActive,
  enabled,
}: any) {
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const todayAppointments = scopedAppointments.filter(
    (row: any) => dateKey(row.appointmentDate || row.appointment_date) === today,
  );
  const completedAppointments = scopedAppointments.filter(isCompletedAppointment);
  const completedToday = todayAppointments.filter(isCompletedAppointment);
  const monthlyInvoices = liveInvoices.filter((row: any) => {
    const sourceDate =
      row.created_at || row.invoice_date || row.updated_at || row.paid_at;
    return monthKey(sourceDate) === currentMonth;
  });
  const monthlyRevenue = monthlyInvoices.reduce(
    (sum: number, row: any) => sum + invoiceAmount(row),
    0,
  );
  const monthlyDue = monthlyInvoices.reduce(
    (sum: number, row: any) => sum + invoiceBalance(row),
    0,
  );
  const membershipPurchaseInvoices = monthlyInvoices.filter(
    (row: any) => row.patient_subscription_enrollment_id || row.patient_subscription_plan_id,
  );
  const membershipSavings = monthlyInvoices.reduce(
    (sum: number, row: any) => sum + Number(row.membership_discount_amount || 0),
    0,
  );
  const departmentById = new Map(
    allowedDepartments.map((department: any) => [department.id, department.name]),
  );
  const practitionerById = new Map(
    livePractitioners.map((practitioner: any) => [
      practitioner.id,
      practitioner.full_name || practitioner.name || practitioner.id,
    ]),
  );
  const departmentRows = topRows(
    completedAppointments,
    (row) => row.departmentId || row.department_id,
    (key) => String(departmentById.get(key) || key),
  );
  const practitionerRows = topRows(
    completedAppointments,
    (row) => row.doctorId || row.practitioner_id,
    (key) => String(practitionerById.get(key) || key),
  );
  const activeQueue = scopedAppointments.filter((row: any) => {
    const status = normalized(row.queueStatus || row.queue_status || row.status);
    return (
      !isCompletedAppointment(row) &&
      ["waiting", "called", "in_queue", "requeued", "patient_not_available"].includes(status)
    );
  });
  const cards = [
    {
      title: "Today Appointments",
      value: todayAppointments.length,
      detail: `${completedToday.length} completed today`,
      icon: CalendarDays,
      target: "appointments",
    },
    {
      title: "Patients",
      value: liveSummary?.patients ?? patients.length,
      detail: `${patients.length} loaded records`,
      icon: Users,
      target: "patients",
    },
    {
      title: "Active Queue",
      value: activeQueue.length,
      detail: `${liveSummary?.queue ?? activeQueue.length} total queue entries`,
      icon: Clock,
      target: "queue",
    },
    {
      title: "Monthly Revenue",
      value: rupees(monthlyRevenue),
      detail: `${monthlyInvoices.length} invoices this month`,
      icon: IndianRupee,
      target: "billing",
    },
    {
      title: "Monthly Due",
      value: rupees(monthlyDue || liveSummary?.invoiceBalance || 0),
      detail: "Outstanding balance",
      icon: ReceiptIndianRupee,
      target: "billing",
    },
    {
      title: "Membership Usage",
      value: rupees(membershipSavings),
      detail: `${membershipPurchaseInvoices.length} plan purchase invoices this month`,
      icon: ReceiptIndianRupee,
      target: "patients",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ title, value, detail, icon: Icon, target }: any) => (
          <button
            key={title}
            type="button"
            onClick={() => setActive?.(target)}
            className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          >
            <Icon className="mb-3 text-slate-500" />
            <p className="text-sm text-slate-500">{title}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            <p className="mt-2 text-xs font-semibold text-slate-500">{detail}</p>
          </button>
        ))}
      </div>

      <QuickAccess enabled={enabled} setActive={setActive} />

      <div className="grid gap-6 xl:grid-cols-2">
        <AnalysisCard
          title="Completed By Department"
          subtitle="Completed consultation count by department."
          rows={departmentRows}
          empty="No completed consultations yet."
        />
        <AnalysisCard
          title="Completed By Practitioner"
          subtitle="Completed consultation count by doctor."
          rows={practitionerRows}
          empty="No completed practitioner activity yet."
        />
      </div>

      <Card>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h3 className="text-lg font-bold">Tenant Operations Analysis</h3>
            <p className="text-sm text-slate-500">
              Today workload, collections, queue pressure, and module usage.
            </p>
          </div>
          <Badge tone="blue">Tenant Admin Only</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Insight label="Booked Today" value={todayAppointments.length} />
          <Insight label="Completed Today" value={completedToday.length} />
          <Insight label="Waiting Queue" value={activeQueue.length} />
          <Insight label="Invoices This Month" value={monthlyInvoices.length} />
          <Insight label="Membership Savings" value={rupees(membershipSavings)} />
          <Insight label="Membership Purchases" value={membershipPurchaseInvoices.length} />
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-bold">Enabled Plug-and-Play Modules</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {clinic.modules.map((module: string) => (
            <Badge key={module} tone="green">
              {module}
            </Badge>
          ))}
        </div>
      </Card>
    </div>
  );
}

function AnalysisCard({ title, subtitle, rows, empty }: any) {
  const max = Math.max(...rows.map((row: any) => row.count), 1);
  return (
    <Card>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="text-sm text-slate-500">{subtitle}</p>
      <div className="mt-4 grid gap-3">
        {rows.length === 0 && (
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
            {empty}
          </div>
        )}
        {rows.slice(0, 8).map((row: any) => (
          <div key={row.key} className="grid gap-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-bold">{row.label}</span>
              <span className="text-slate-500">{row.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-900"
                style={{ width: `${Math.max(8, (row.count / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Insight({ label, value }: any) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function QuickAccess({ enabled, setActive }: { enabled?: (id: string) => boolean; setActive?: (id: string) => void }) {
  const visibleCategories = SHORTCUT_CATEGORIES.map((cat) => ({
    ...cat,
    modules: cat.modules.filter((mod) => !enabled || enabled(mod.id)),
  })).filter((cat) => cat.modules.length > 0);

  if (visibleCategories.length === 0) return null;

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-bold">Quick Access</h3>
        <p className="text-sm text-slate-500">Jump to any module — grouped by function.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleCategories.map((cat) => (
          <div
            key={cat.label}
            className={`rounded-2xl border p-4 ${cat.color}`}
          >
            <p className={`mb-3 text-xs font-bold uppercase tracking-wide ${cat.headerColor}`}>
              {cat.label}
            </p>
            <div className="grid gap-1">
              {cat.modules.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActive?.(id)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/70 active:scale-[0.98]"
                >
                  <Icon size={16} className={cat.iconColor} />
                  <span className="flex-1 text-sm font-semibold text-slate-800">{label}</span>
                  <ArrowRight size={13} className="text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
