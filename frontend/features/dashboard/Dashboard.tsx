"use client";

import {
  CalendarDays,
  IndianRupee,
  ReceiptIndianRupee,
  Users,
} from "lucide-react";
import { Badge, Card } from "@/app/components/common/ui";
import {
  topRows,
  dateKey,
  invoiceAmount,
  invoiceBalance,
  invoiceItemTotal,
  invoiceMembershipBenefit,
  invoiceOfferDiscount,
  isCompletedAppointment,
  monthKey,
  normalized,
  rupees,
} from "./helpers";
import { Insight } from "./components/Insight";
import { QuickAccess } from "./components/QuickAccess";
import { NotificationWidget } from "./components/NotificationWidget";

export function Dashboard({
  scopedAppointments,
  patients,
  liveSummary,
  liveInvoices = [],
  allowedDepartments = [],
  livePractitioners = [],
  setActive,
  enabled,
  apiSession,
}: any) {
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
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
  const monthlyRevenue = monthlyInvoices.reduce(
    (sum: number, row: any) => sum + invoiceAmount(row),
    0,
  );
  const monthlyItemTotal = monthlyInvoices.reduce(
    (sum: number, row: any) => sum + invoiceItemTotal(row),
    0,
  );
  const monthlyDue = monthlyInvoices.reduce(
    (sum: number, row: any) => sum + invoiceBalance(row),
    0,
  );
  const membershipPurchaseInvoices = monthlyInvoices.filter(
    (row: any) =>
      row.patient_subscription_enrollment_id ||
      row.patient_subscription_plan_id,
  );
  const membershipSavings = monthlyInvoices.reduce(
    (sum: number, row: any) => sum + invoiceMembershipBenefit(row),
    0,
  );
  const offerSavings = monthlyInvoices.reduce(
    (sum: number, row: any) => sum + invoiceOfferDiscount(row),
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
      title: "Today Appointments",
      value: todayAppointments.length,
      detail: `${completedToday.length} completed today`,
      icon: CalendarDays,
      target: "appointments",
    },
    {
      title: "Patients Count",
      value: liveSummary?.patients ?? patients.length,
      detail: `${patients.length} loaded records`,
      icon: Users,
      target: "patients",
    },
    // {
    //   title: "Active Queue",
    //   value: activeQueue.length,
    //   detail: `${liveSummary?.queue ?? activeQueue.length} total queue entries`,
    //   icon: Clock,
    //   target: "queue",
    // },
    {
      title: "Monthly Revenue",
      value: rupees(monthlyRevenue),
      detail: `Collected from ${rupees(monthlyItemTotal)}`,
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
    // {
    //   title: "Membership Usage",
    //   value: rupees(membershipSavings),
    //   detail: `${membershipPurchaseInvoices.length} plan purchases · offers ${rupees(offerSavings)}`,
    //   icon: ReceiptIndianRupee,
    //   target: "patients",
    // },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-4">
        {cards.map(({ title, value, detail, icon: Icon, target }: any) => (
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
            <p className="mt-1 text-xl lg:text-2xl font-bold">{value}</p>
            <p className="mt-2 text-[10px] font-semibold text-slate-500 h-5">
              {detail}
            </p>
          </button>
        ))}
      </div>
      <NotificationWidget apiSession={apiSession} setActive={setActive} />
      <Card>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h3 className="card-title font-bold">Tenant Operations Analysis</h3>
            <p className="table-data text-slate-500">
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
          <Insight label="Invoices This Month" value={monthlyInvoices.length} />
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
