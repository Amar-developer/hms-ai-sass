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

export function Dashboard({
  scopedAppointments,
  liveSummary,
  liveInvoices = [],
  allowedDepartments = [],
  setActive,
  enabled,
  apiSession,
  branchId,
}: any) {
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
  const monthlyParams = new URLSearchParams({
    from_date: monthStart,
    to_date: monthEnd,
  });

  if (branchId) monthlyParams.set("branch_id", branchId);
  const todayParams = new URLSearchParams({
    from_date: today,
    to_date: today,
  });
  if (branchId) todayParams.set("branch_id", branchId);

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
    dashboardData?.total_due_amount ?? fallbackMonthlyDue,
  );
  const todayDue = Number(
    dashboardData?.total_due_amount ??
      activeTodayInvoices.reduce(
        (sum: number, row: any) => sum + invoiceBalance(row),
        0,
      ),
  );
  const monthlyDueInvoiceCount = Number(
    dashboardData?.invoice_count ??
      activeMonthlyInvoices.filter((row: any) => invoiceBalance(row) > 0)
        .length,
  );
  const todayDueInvoiceCount = Number(
    dashboardData?.invoice_count ??
      activeTodayInvoices.filter((row: any) => invoiceBalance(row) > 0).length,
  );
  const monthlyPaid = Number(
    dashboardData?.net_collected_amount ??
      activeMonthlyInvoices.reduce(
        (sum: number, row: any) => sum + Number(row.paid_amount || 0),
        0,
      ),
  );
  const todayPaid = Number(
    dashboardData?.net_collected_amount ??
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
      target: "appointments",
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
              <div className="flex items-center mb-3 h-10">
                <Icon className="text-slate-500 mr-2" />
                <p className="md:text-[10px] lg:text-sm text-slate-500 font-bold  ">
                  {title}
                </p>
              </div>
              {cardLoading ? (
                <Skeleton className="mt-1 h-7 w-24" />
              ) : (
                <p className="mt-1 text-xl lg:text-2xl font-bold">{value}</p>
              )}
              {cardLoading ? (
                <Skeleton className="mt-2 h-4 w-32" />
              ) : (
                <p className="mt-2 text-[10px] font-semibold text-slate-500 h-5">
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
            <h3 className="card-title font-bold">Tenant Operations Analysis</h3>
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
  );
}
