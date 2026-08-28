"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Home,
  IndianRupee,
  ReceiptIndianRupee,
  Users,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/app/components/common/ui";
import { isMembershipPlanInvoice } from "@/features/billing/helpers";
import {
  topRows,
  dateKey,
  invoiceBalance,
  invoiceMembershipBenefit,
  isCompletedAppointment,
  monthKey,
  normalized,
  rupees,
} from "./helpers";
import { Insight } from "./components/Insight";
import { QuickAccess } from "./components/QuickAccess";
import { NotificationWidget } from "./components/NotificationWidget";
import { Skeleton } from "@/app/components/common/loader/Skeleton";
import { useDashboardData } from "./api";
import { usePractitionersQuery } from "@/features/doctors/api/usePractitionersQuery";
import { PatientIntelligenceDashboard } from "./components/PatientIntelligenceDashboard";

function DashboardMetric({
  title,
  value,
  detail,
  icon: Icon,
  tone = "emerald",
  loading,
  onClick,
}: any) {
  const toneClasses: Record<string, string> = {
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
    blue: "bg-blue-50 text-blue-600 ring-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
    rose: "bg-rose-50 text-rose-600 ring-rose-100",
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[82px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ${
          toneClasses[tone] || toneClasses.emerald
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-black uppercase tracking-wide text-slate-500">
          {title}
        </span>
        {loading ? (
          <Skeleton className="mt-1 h-6 w-20" />
        ) : (
          <span className="mt-0.5 block text-xl font-black leading-none text-slate-950">
            {value}
          </span>
        )}
        {loading ? (
          <Skeleton className="mt-1.5 h-3 w-28" />
        ) : detail ? (
          <span className="mt-1 block truncate text-[11px] font-semibold text-slate-500">
            {detail}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function Dashboard({
  scopedAppointments,
  liveSummary,
  liveInvoices = [],
  allowedDepartments = [],
  setActive,
  enabled,
  apiSession,
  branchId,
  clinic,
}: any) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intelligencePermissions = apiSession?.user?.permissions || [];
  const canReadIntelligence =
    intelligencePermissions.includes("*") ||
    intelligencePermissions.some((permission: string) =>
      [
        "patient_intelligence.read",
        "patient_intelligence.manage",
        "patient_intelligence.rules.manage",
      ].includes(permission),
    );
  const intelligenceEnabled = Boolean(
    clinic?.modules?.includes("patient_intelligence") && canReadIntelligence,
  );
  const requestedDashboardTab = searchParams.get("tab");
  const dashboardTab =
    requestedDashboardTab === "intelligence" && intelligenceEnabled
      ? "intelligence"
      : "overview";
  function setDashboardTab(tab: "overview" | "intelligence") {
    router.push(tab === "intelligence" ? "/dashboard?tab=intelligence" : "/dashboard");
  }
  useEffect(() => {
    if (requestedDashboardTab && requestedDashboardTab !== dashboardTab) {
      router.replace(
        dashboardTab === "intelligence"
          ? "/dashboard?tab=intelligence"
          : "/dashboard",
      );
    }
  }, [dashboardTab, requestedDashboardTab, router]);
  const { livePractitioners } = usePractitionersQuery(apiSession);
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const currentMonth = today.slice(0, 7);
  const monthStart = `${currentMonth}-01`;
  const monthEndDate = new Date(
    Number(currentMonth.slice(0, 4)),
    Number(currentMonth.slice(5, 7)),
    0,
  );
  const monthEnd = `${currentMonth}-${String(monthEndDate.getDate()).padStart(2, "0")}`;
  const todayAppointments = scopedAppointments.filter(
    (row: any) =>
      dateKey(row.appointmentDate || row.appointment_date) === today,
  );
  const completedAppointments = scopedAppointments.filter(
    isCompletedAppointment,
  );
  const completedToday = todayAppointments.filter(isCompletedAppointment);
  const monthlyInvoices = liveInvoices.filter((row: any) => {
    const sourceDate =
      row.created_at || row.invoice_date || row.updated_at || row.paid_at;
    return monthKey(sourceDate) === currentMonth;
  });
  const activeMonthlyInvoices = monthlyInvoices.filter(
    (row: any) => !["cancelled", "refunded"].includes(normalized(row.status)),
  );
  const todayInvoices = liveInvoices.filter((row: any) => {
    const sourceDate =
      row.created_at || row.invoice_date || row.updated_at || row.paid_at;
    return dateKey(sourceDate) === today;
  });
  const activeTodayInvoices = todayInvoices.filter(
    (row: any) => !["cancelled", "refunded"].includes(normalized(row.status)),
  );
  const fallbackMonthlyDue = activeMonthlyInvoices.reduce(
    (sum: number, row: any) => sum + invoiceBalance(row),
    0,
  );
  const { data: dashboardData, loading } = useDashboardData({
    apiSession,
    branchId,
    today,
    monthStart,
    monthEnd,
  });
  const monthlyDue = Number(
    dashboardData?.monthlyDue?.total_due_amount ?? fallbackMonthlyDue,
  );
  const todayDue = Number(
    dashboardData?.todayDue?.total_due_amount ??
      activeTodayInvoices.reduce(
        (sum: number, row: any) => sum + invoiceBalance(row),
        0,
      ),
  );
  const monthlyDueInvoiceCount = Number(
    dashboardData?.monthlyDue?.invoice_count ??
      activeMonthlyInvoices.filter((row: any) => invoiceBalance(row) > 0)
        .length,
  );
  const todayDueInvoiceCount = Number(
    dashboardData?.todayDue?.invoice_count ??
      activeTodayInvoices.filter((row: any) => invoiceBalance(row) > 0).length,
  );
  const monthlyPaid = Number(
    dashboardData?.collections?.net_collected_amount ??
      activeMonthlyInvoices.reduce(
        (sum: number, row: any) => sum + Number(row.paid_amount || 0),
        0,
      ),
  );
  const todayPaid = Number(
    dashboardData?.todayPaid?.net_collected_amount ??
      activeTodayInvoices.reduce(
        (sum: number, row: any) => sum + Number(row.paid_amount || 0),
        0,
      ),
  );
  const membershipPurchaseInvoices = monthlyInvoices.filter(
    isMembershipPlanInvoice,
  );
  const membershipSavings = activeMonthlyInvoices.reduce(
    (sum: number, row: any) => sum + invoiceMembershipBenefit(row),
    0,
  );
  const todayHomeCareBookings = (dashboardData?.homeCareBookings || []).filter(
    (booking: any) => {
      const start = dateKey(booking.start_date || booking.starts_on);
      const end = dateKey(booking.end_date || booking.ends_on || start);
      return start && start <= today && (!end || end >= today);
    },
  );
  const todayHomeCareCount = todayHomeCareBookings.filter(
    (booking: any) => normalized(booking.booking_type) !== "home_visit",
  ).length;
  const todayHomeVisitCount = todayHomeCareBookings.filter(
    (booking: any) => normalized(booking.booking_type) === "home_visit",
  ).length;
  const departmentById = new Map(
    allowedDepartments.map((department: any) => [
      department.id,
      department.name,
    ]),
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
    const status = normalized(
      row.queueStatus || row.queue_status || row.status,
    );
    return (
      !isCompletedAppointment(row) &&
      [
        "waiting",
        "called",
        "in_queue",
        "requeued",
        "patient_not_available",
      ].includes(status)
    );
  });

  const cards = [
    {
      title: "Booked Today",
      value: todayAppointments.length,
      detail: `${completedToday.length} completed today`,
      icon: CalendarDays,
      target: "opd",
      tone: "blue",
    },
    {
      title: "Home Care / Visit",
      value: todayHomeCareBookings.length,
      detail: `${todayHomeCareCount} care · ${todayHomeVisitCount} visit`,
      icon: Home,
      target: "home_care",
      loading,
      tone: "amber",
    },
    {
      title: "New Patients",
      value: dashboardData?.patientCount?.total ?? 0,
      detail: "created today",
      icon: Users,
      target: "patients",
      loading,
      tone: "sky",
    },
    {
      title: "Total Patients",
      value: liveSummary?.patients ?? 0,
      detail: "tenant total",
      icon: Users,
      target: "patients",
      tone: "violet",
    },
    {
      title: "Month Revenue",
      value: rupees(monthlyPaid),
      detail: "paid collections",
      icon: WalletCards,
      target: "billing",
      loading,
      tone: "emerald",
    },
    {
      title: "Today Revenue",
      value: rupees(todayPaid),
      detail: "paid today",
      icon: IndianRupee,
      target: "billing",
      loading,
      tone: "emerald",
    },
    {
      title: "Monthly Due",
      value: rupees(monthlyDue),
      detail: `${monthlyDueInvoiceCount} invoices`,
      icon: ReceiptIndianRupee,
      target: "billing",
      loading,
      tone: "rose",
    },
    {
      title: "Today Due",
      value: rupees(todayDue),
      detail: `${todayDueInvoiceCount} invoices`,
      icon: ReceiptIndianRupee,
      target: "billing",
      loading,
      tone: "amber",
    },
  ];

  return (
    <div className="space-y-6 global-bg p-2">
      {intelligenceEnabled && (
        <div className="flex w-fit gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setDashboardTab("overview")}
            className={`rounded-md px-4 py-2 text-sm font-bold ${dashboardTab === "overview" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Operations Overview
          </button>
          <button
            type="button"
            onClick={() => setDashboardTab("intelligence")}
            className={`rounded-md px-4 py-2 text-sm font-bold ${dashboardTab === "intelligence" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Patient Intelligence
          </button>
        </div>
      )}
      {dashboardTab === "intelligence" && intelligenceEnabled ? (
        <PatientIntelligenceDashboard
          apiSession={apiSession}
          branchId={branchId}
          setActive={setActive}
        />
      ) : (
        <div className="space-y-4">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-brand ring-1 ring-emerald-100">
                  <Activity className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-950">
                    Operations Dashboard
                  </h2>
                  <p className="text-xs font-medium text-slate-500">
                    Today workload, collections, queue pressure and module usage
                  </p>
                </div>
              </div>
              <Badge tone="blue" className="normal-badge">
                Tenant Admin Only
              </Badge>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(
              ({
                title,
                value,
                detail,
                icon: Icon,
                target,
                tone,
                loading: cardLoading,
              }: any) => (
                <DashboardMetric
                  key={title}
                  title={title}
                  value={value}
                  detail={detail}
                  icon={Icon}
                  tone={tone}
                  loading={cardLoading}
                  onClick={() => setActive?.(target)}
                />
              ),
            )}
          </section>
          <NotificationWidget apiSession={apiSession} setActive={setActive} />
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-base font-black tracking-tight text-slate-950">
                Tenant Operations Analysis
              </h3>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-7">
              <Insight label="Booked" value={todayAppointments.length} />
              <Insight label="Completed" value={completedToday.length} />
              <Insight label="Home Care / Visit" value={todayHomeCareBookings.length} />
              <Insight label="Queue" value={activeQueue.length} />
              <Insight
                label="Invoices"
                value={activeMonthlyInvoices.length}
              />
              <Insight
                label="Savings"
                value={rupees(membershipSavings)}
              />
              <Insight
                label="Memberships"
                value={membershipPurchaseInvoices.length}
              />
            </div>
          </section>
          <QuickAccess enabled={enabled} setActive={setActive} />
        </div>
      )}
    </div>
  );
}
