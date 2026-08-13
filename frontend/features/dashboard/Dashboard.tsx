"use client";

import { useState } from "react";

import {
  CalendarDays,
  IndianRupee,
  ReceiptIndianRupee,
  Users,
} from "lucide-react";
import { Badge, Card } from "@/app/components/common/ui";
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
  const [dashboardTab, setDashboardTab] = useState<"overview" | "intelligence">(
    "overview",
  );
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
    },
    {
      title: "Patients Created Today",
      value: dashboardData?.patientCount?.total ?? 0,
      detail: "New patient registrations today",
      icon: Users,
      target: "patients",
    },
    {
      title: "Total Patients",
      value: liveSummary?.patients ?? 0,
      detail: "Tenant-wide total",
      icon: Users,
      target: "patients",
    },
    {
      title: "Monthly Revenue",
      value: rupees(monthlyPaid),
      detail: "Paid collections only",
      icon: IndianRupee,
      target: "billing",
    },
    {
      title: "Today Revenue",
      value: rupees(todayPaid),
      detail: "Paid collections today",
      icon: IndianRupee,
      target: "billing",
      loading,
    },
    {
      title: "Monthly Due",
      value: rupees(monthlyDue),
      detail: `${monthlyDueInvoiceCount} invoices with balance`,
      icon: ReceiptIndianRupee,
      target: "billing",
      loading,
    },
    {
      title: "Today Due",
      value: rupees(todayDue),
      detail: `${todayDueInvoiceCount} invoices with balance today`,
      icon: ReceiptIndianRupee,
      target: "billing",
      loading,
    },
  ];

  return (
    <div className="space-y-6">
      {intelligenceEnabled && (
        <div className="flex w-fit gap-1 rounded-lg border border-slate-200 bg-white p-1">
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
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-4">
            {cards.map(
              ({
                title,
                value,
                detail,
                icon: Icon,
                target,
                loading: cardLoading,
              }: any) => (
                <button
                  key={title}
                  type="button"
                  onClick={() => setActive?.(target)}
                  className="rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  <div className="mb-3 flex h-10 items-center">
                    <Icon className="mr-2 text-slate-500" />
                    <p className="font-bold text-slate-500 md:text-[10px] lg:text-sm">
                      {title}
                    </p>
                  </div>
                  {cardLoading ? (
                    <Skeleton className="mt-1 h-7 w-24" />
                  ) : (
                    <p className="mt-1 text-xl font-bold lg:text-2xl">{value}</p>
                  )}
                  {cardLoading ? (
                    <Skeleton className="mt-2 h-4 w-32" />
                  ) : (
                    <p className="mt-2 h-5 text-[10px] font-semibold text-slate-500">
                      {detail}
                    </p>
                  )}
                </button>
              ),
            )}
          </div>
          <NotificationWidget apiSession={apiSession} setActive={setActive} />
          <Card>
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <h3 className="card-title font-bold">
                  Tenant Operations Analysis
                </h3>
                <p className="card-desc text-slate-500">
                  Today workload, collections, queue pressure, and module usage.
                </p>
              </div>
              <Badge tone="blue" className="normal-badge">
                Tenant Admin Only
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Insight label="Booked Today" value={todayAppointments.length} />
              <Insight label="Completed Today" value={completedToday.length} />
              <Insight label="Waiting Queue" value={activeQueue.length} />
              <Insight
                label="Invoices This Month"
                value={activeMonthlyInvoices.length}
              />
              <Insight
                label="Membership Savings"
                value={rupees(membershipSavings)}
              />
              <Insight
                label="Membership Purchases"
                value={membershipPurchaseInvoices.length}
              />
            </div>
          </Card>
          <QuickAccess enabled={enabled} setActive={setActive} />
        </div>
      )}
    </div>
  );
}
