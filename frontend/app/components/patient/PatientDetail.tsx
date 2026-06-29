import { UPLOADS_BASE } from "@/lib/api";
import { Badge, Button, Card, StatusToast } from "../common/ui";
import { hiddenScrollbar } from "@/utils/patient/constants";
import {
  clinicalRecordsWithUniqueItems,
  displayPatientGender,
  fmtDate,
  uniqueClinicalRecords,
} from "@/utils/patient/helpers";
import { money } from "@/features/reports/utils";
import { invoiceSource } from "@/utils/billing/helpers";
import { ChevronDown } from "lucide-react";
import { MembershipEnrollForm } from "./Forms";
import {
  AlertCard,
  Info,
  SectionEmpty,
  StatusBadge,
} from "./Shared";

function DetailSection({
  title,
  description,
  count,
  children,
  defaultOpen = true,
}: any) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-slate-200 bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <div>
          <h4 className="text-sm font-black text-slate-950 lg:text-base">{title}</h4>
          {description && (
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {count !== undefined && (
            <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">
              {count}
            </span>
          )}
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200 transition group-open:rotate-180">
            <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
          </span>
        </div>
      </summary>
      <div className="px-4 py-3">{children}</div>
    </details>
  );
}

function CompactMetric({ label, value }: any) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
      <p className="text-[11px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-black text-slate-950">{value}</p>
    </div>
  );
}

export function PatientDetail({
  patient,
  summary,
  patientIpAdmissions,
  consultations,
  labOrders,
  pharmacyIssues,
  physioCases,
  membershipPlans,
  membershipEnrollments,
  patientInvoices,
  branches,
  loading,
  message,
  onMessageClose,
  onEnrollMembership,
  onBack,
  onEdit,
  onUploadPhoto,
  setActive,
}: any) {
  const alerts = [
    ...(summary?.critical_alerts || []),
    ...(summary?.allergies || []),
  ];
  const risks = [...(summary?.risk_alerts || []), ...(summary?.notes || [])];
  const isAdmitted = patientIpAdmissions.some(
    (a: any) => a.status === "admitted" || a.status === "active",
  );
  const uniqueLabOrders = uniqueClinicalRecords(
    labOrders,
    (order: any) =>
      `${fmtDate(order.created_at)}|${order.status || ""}|${order.tests || ""}|${order.notes || ""}`,
  );
  const uniquePharmacyIssues = uniqueClinicalRecords(
    pharmacyIssues,
    (issue: any) =>
      `${fmtDate(issue.created_at)}|${issue.status || ""}|${issue.medicine_text || ""}|${issue.notes || ""}|${issue.amount || ""}`,
  );
  const labRows = clinicalRecordsWithUniqueItems(
    uniqueLabOrders,
    (order: any) => order.tests,
  );
  const medicineRows = clinicalRecordsWithUniqueItems(
    uniquePharmacyIssues,
    (issue: any) => issue.medicine_text,
  );

  const isPlanPurchaseInvoice = (invoice: any) =>
    Boolean(
      invoice.patient_subscription_enrollment_id ||
        invoice.patient_subscription_plan_id,
    ) &&
    !invoice.lab_order_id &&
    !invoice.pharmacy_issue_id &&
    !invoice.consultation_id &&
    !invoice.ip_admission_id &&
    !invoice.physiotherapy_case_id &&
    !invoice.home_care_booking_id;
  const membershipInvoices = patientInvoices.filter(isPlanPurchaseInvoice);
  const purchaseInvoiceFor = (enrollment: any) =>
    membershipInvoices.find(
      (invoice: any) => invoice.id === enrollment.purchase_invoice_id,
    ) ||
    membershipInvoices.find(
      (invoice: any) =>
        invoice.patient_subscription_enrollment_id === enrollment.id,
    );
  const isEnrollmentPaid = (enrollment: any) => {
    const invoice = purchaseInvoiceFor(enrollment);
    if (invoice) return Number(invoice.balance_amount || 0) <= 0;
    return (
      Number(enrollment.paid_amount || 0) >=
      Number(enrollment.plan?.price_amount || 0)
    );
  };
  const resolvedMembershipEnrollments = membershipEnrollments.map(
    (enrollment: any) => ({
      ...enrollment,
      plan:
        membershipPlans.find((plan: any) => plan.id === enrollment.plan_id) ||
        enrollment.plan ||
        null,
    }),
  );
  const activeMembership = resolvedMembershipEnrollments.find(
    (row: any) => row.status === "active" && isEnrollmentPaid(row),
  );
  const pendingMembership = resolvedMembershipEnrollments.find(
    (row: any) => row.status === "active" && !isEnrollmentPaid(row),
  );
  const visibleMembership = activeMembership || pendingMembership;
  const freeConsultationsAllocated = Number(
    visibleMembership?.allocated_free_consultations ??
      visibleMembership?.plan?.free_consultations ??
      0,
  );
  const freeConsultationsUsed = Number(
    visibleMembership?.used_consultations || 0,
  );
  const freeLabUsed = Number(visibleMembership?.used_free_lab_count || 0);
  const freeLabRemaining = Number(
    visibleMembership?.remaining_free_lab_count || 0,
  );
  const freeLabAllocated = freeLabUsed + freeLabRemaining;
  const freeMedicineUsed = Number(
    visibleMembership?.used_free_medicine_count || 0,
  );
  const freeMedicineRemaining = Number(
    visibleMembership?.remaining_free_medicine_count || 0,
  );
  const freeMedicineAllocated = freeMedicineUsed + freeMedicineRemaining;
  const membershipUsageInvoices = patientInvoices.filter(
    (invoice: any) =>
      Number(invoice.membership_discount_amount || 0) > 0 &&
      !["cancelled", "refunded"].includes(
        String(invoice.status || "").toLowerCase(),
      ),
  );
  const membershipSavings = membershipUsageInvoices.reduce(
    (sum: number, invoice: any) =>
      sum + Number(invoice.membership_discount_amount || 0),
    0,
  );
  const totalBilled = patientInvoices.reduce(
    (sum: number, invoice: any) =>
      sum +
      (["cancelled", "refunded"].includes(String(invoice.status).toLowerCase())
        ? 0
        : Number(invoice.total_amount || 0)),
    0,
  );
  const totalPaid = patientInvoices.reduce(
    (sum: number, invoice: any) => sum + Number(invoice.paid_amount || 0),
    0,
  );
  const totalDue = patientInvoices.reduce(
    (sum: number, invoice: any) => sum + Number(invoice.balance_amount || 0),
    0,
  );

  function openConsultation(c: any) {
    if (!c?.appointment_id || typeof window === "undefined") return;
    sessionStorage.setItem("medizinhub.consultationAppointmentId", c.appointment_id);
    if (c.practitioner_id) {
      sessionStorage.setItem("medizinhub.consultationDoctorId", c.practitioner_id);
    }
    setActive?.("consultation");
  }

  function openInvoice(invoice: any) {
    if (!invoice?.id || typeof window === "undefined") return;
    window.sessionStorage.setItem("medizinhub.billingInvoiceId", invoice.id);
    setActive?.("billing");
  }

  function goToModule(page: string) {
    setActive?.(page);
  }

  function benefitUsageLabel(invoice: any) {
    const saved = Number(invoice.membership_discount_amount || 0);
    const subtotal = Number(invoice.subtotal_amount || 0);
    const source = invoiceSource(invoice).label;
    const kind = invoice.consultation_id
      ? "Free consultation"
      : subtotal > 0 && saved >= subtotal
        ? "Free item"
        : "Discount";
    return { source, kind, saved };
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div className="flex items-start gap-4">
            <label className="group relative block h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              {patient.photo_url ? (
                <img
                  src={`${UPLOADS_BASE}${patient.photo_url}`}
                  alt="Patient"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-slate-400">
                  {patient.full_name?.[0]?.toUpperCase() || "P"}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-slate-900/75 px-1 py-1 text-center text-[9px] font-bold text-white opacity-0 transition group-hover:opacity-100">
                {patient.photo_url ? "Change" : "Upload"}
              </span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e: any) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadPhoto(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="card-title font-bold">{patient.full_name}</h3>
                <Badge tone={isAdmitted ? "amber" : "green"} className="normal-badge">
                  {isAdmitted ? "Admitted" : "Outpatient"}
                </Badge>
              </div>
              <p className="table-data mt-1 text-slate-500">
                {patient.patient_number} · {patient.mobile || "No mobile"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {loading && <Badge tone="amber">Loading...</Badge>}
            <button type="button" onClick={onBack} className="close-button font-bold">
              Back to Patients
            </button>
            <Button onClick={onEdit}>Edit Patient</Button>
          </div>
        </div>
        <StatusToast message={message} onClose={onMessageClose} />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Info k="Age / Gender" v={`${patient.age_years ?? "-"} / ${displayPatientGender(patient.gender)}`} />
          <Info k="Blood Group" v={patient.blood_group || "-"} />
          <Info k="Area" v={patient.area || "-"} />
          <Info k="Address" v={patient.address || "-"} />
          <Info k="Guardian" v={patient.guardian_name || "-"} />
          <Info k="Alternate Mobile" v={patient.alternate_mobile || "-"} />
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h5 className="text-sm font-black text-slate-950">Membership Plan Enrollment</h5>
              <p className="text-xs font-semibold text-slate-500">
                Enroll the patient and generate the plan purchase invoice.
              </p>
            </div>
            <Badge
              tone={activeMembership ? "green" : pendingMembership ? "amber" : "slate"}
              className="normal-badge"
            >
              {activeMembership ? "active" : pendingMembership ? "payment due" : "not enrolled"}
            </Badge>
          </div>
          <MembershipEnrollForm
            membershipPlans={membershipPlans}
            patient={patient}
            branches={branches}
            loading={loading}
            onSubmit={onEnrollMembership}
          />
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <CompactMetric
              label="Current Plan"
              value={visibleMembership?.plan?.name || "-"}
            />
            <CompactMetric
              label="Free Consultations"
              value={
                visibleMembership
                  ? `${freeConsultationsUsed}/${freeConsultationsAllocated}`
                  : "-"
              }
            />
            <CompactMetric
              label="Free Lab Tests"
              value={
                visibleMembership
                  ? `${freeLabUsed}/${freeLabAllocated}`
                  : "-"
              }
            />
            <CompactMetric
              label="Free Medicines"
              value={
                visibleMembership
                  ? `${freeMedicineUsed}/${freeMedicineAllocated}`
                  : "-"
              }
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <DetailSection title="Alerts" description="Allergies and critical notes." count={alerts.length}>
          {alerts.length === 0 && <SectionEmpty text="No active allergy or critical alert." />}
          <div className="space-y-2">
            {alerts.map((alert: any) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </DetailSection>
        <DetailSection title="Risk Notes" description="Care risks and general notes." count={risks.length}>
          {risks.length === 0 && <SectionEmpty text="No active risk notes." />}
          <div className="space-y-2">
            {risks.map((alert: any) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </DetailSection>
      </div>

      <DetailSection
        title="Consultations"
        description="Click a consultation to open the consultation workspace."
        count={consultations.length}
      >
        {consultations.length === 0 && <SectionEmpty text="No consultation records found." />}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Summary</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {consultations.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-3 py-3 font-black text-slate-950">
                    {fmtDate(c.created_at)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold capitalize text-slate-700">
                      {String(c.treatment_type || "consultation").replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    <span className="line-clamp-1">
                      {c.chief_complaint ||
                        c.diagnosis ||
                        c.patient_remarks ||
                        c.clinical_notes ||
                        "Consultation record"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openConsultation(c)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:border-slate-900 hover:bg-white"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailSection>

      <div className="grid gap-5 lg:grid-cols-2">
        <DetailSection title="Lab / Service" description="Ordered diagnostic tests and services." count={labRows.length}>
          {labOrders.length === 0 && <SectionEmpty text="No lab orders found." />}
          <div className={`max-h-[300px] space-y-3 overflow-y-auto pr-1 ${hiddenScrollbar}`}>
            {labRows.map(({ row: order, items }: any) => (
              <button
                type="button"
                key={order.id}
                onClick={() => goToModule("lab")}
                title="Open in Lab / Service"
                className="flex w-full items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-left text-sm hover:bg-slate-100"
              >
                <span className="font-bold">{fmtDate(order.created_at)}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">{items.length} test(s)</span>
                  <StatusBadge status={order.status} />
                </span>
              </button>
            ))}
          </div>
        </DetailSection>

        <DetailSection title="Medicines" description="Pharmacy issues and dispensed medicines." count={medicineRows.length}>
          {pharmacyIssues.length === 0 && <SectionEmpty text="No pharmacy records found." />}
          <div className={`max-h-[300px] space-y-3 overflow-y-auto pr-1 ${hiddenScrollbar}`}>
            {medicineRows.map(({ row: issue, items }: any) => (
              <button
                type="button"
                key={issue.id}
                onClick={() => goToModule("pharmacy")}
                title="Open in Pharmacy"
                className="flex w-full items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-left text-sm hover:bg-slate-100"
              >
                <span className="font-bold">{fmtDate(issue.created_at)}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">{items.length} item(s)</span>
                  <StatusBadge status={issue.status} />
                </span>
              </button>
            ))}
          </div>
        </DetailSection>
      </div>

      <DetailSection title="Physiotherapy" description="Cases, treatment goals, and planned sessions." count={physioCases.length}>
        {physioCases.length === 0 && <SectionEmpty text="No physiotherapy records found." />}
        <div className="grid gap-3 lg:grid-cols-2">
          {physioCases.map((c: any) => (
            <button
              type="button"
              key={c.id}
              onClick={() => goToModule("physiotherapy")}
              title="Open in Physiotherapy"
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-bold">{c.case_number || fmtDate(c.assessment_date)}</span>
              <StatusBadge status={c.status} />
            </button>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="IP Admissions" description="Admission, bed, diagnosis, and discharge status." count={patientIpAdmissions.length}>
        {patientIpAdmissions.length === 0 && <SectionEmpty text="No IP admission records found." />}
        <div className="space-y-3">
          {patientIpAdmissions.map((adm: any) => (
            <button
              type="button"
              key={adm.id}
              onClick={() => goToModule("ip")}
              title="Open in IP Admission"
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-bold">{adm.admission_number || fmtDate(adm.admission_date)}</span>
              <StatusBadge status={adm.status} />
            </button>
          ))}
        </div>
      </DetailSection>

      <DetailSection
        title="Billing & Membership"
        description="Membership, invoices, paid amount, due amount, and benefit usage."
        count={patientInvoices.length}
        defaultOpen={false}
      >
        <div className="grid gap-3 md:grid-cols-4">
          <CompactMetric label="Membership Saved" value={money(membershipSavings)} />
          <CompactMetric label="Billed" value={money(totalBilled)} />
          <CompactMetric label="Paid" value={money(totalPaid)} />
          <CompactMetric label="Due" value={money(totalDue)} />
        </div>

        <div className="mt-3 rounded-lg border border-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
            <h5 className="text-sm font-black text-slate-950">Membership History</h5>
          </div>
          <div className="space-y-2 p-3">
            {resolvedMembershipEnrollments.length === 0 && <SectionEmpty text="No membership history." />}
            {resolvedMembershipEnrollments.map((row: any) => {
              const invoice = purchaseInvoiceFor(row);
              const due = Number(
                invoice?.balance_amount ??
                  Math.max(Number(row.plan?.price_amount || 0) - Number(row.paid_amount || 0), 0),
              );
              const clickable = Boolean(invoice?.id);
              return (
                <div
                  key={row.id}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => openInvoice(invoice) : undefined}
                  title={clickable ? "Open purchase invoice" : undefined}
                  className={`rounded-lg bg-slate-50 px-3 py-2 text-sm ${clickable ? "cursor-pointer hover:bg-slate-100" : ""}`}
                >
                  <div className="flex justify-between gap-3">
                    <b>{row.plan?.name || row.plan_id}</b>
                    <Badge tone={due > 0 ? "amber" : "green"} className="normal-badge">
                      {due > 0 ? "payment due" : row.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {fmtDate(row.starts_on)} to {fmtDate(row.ends_on)} · paid{" "}
                    {money(invoice?.paid_amount ?? row.paid_amount)} /{" "}
                    {money(invoice?.total_amount ?? row.plan?.price_amount)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Purchase invoice: {invoice?.invoice_number || row.purchase_invoice_id || "-"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Invoice</th>
                <th className="px-3 py-2.5">Source</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5 text-right">Paid</th>
                <th className="px-3 py-2.5 text-right">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patientInvoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-sm font-semibold text-slate-500">
                    No billing invoices found.
                  </td>
                </tr>
              )}
              {patientInvoices.map((invoice: any) => (
                <tr
                  key={invoice.id}
                  onClick={() => openInvoice(invoice)}
                  title="Open invoice"
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-3 py-3 font-black text-slate-950 underline decoration-slate-300 underline-offset-2">{invoice.invoice_number}</td>
                  <td className="px-3 py-3">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                      {invoiceSource(invoice).label}
                    </span>
                  </td>
                  <td className="px-3 py-3 capitalize">{String(invoice.status || "").replaceAll("_", " ")}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{money(invoice.total_amount)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{money(invoice.paid_amount)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{money(invoice.balance_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
            <div>
              <h5 className="text-sm font-black text-slate-950">Membership Benefit Usage</h5>
              <p className="text-xs font-semibold text-slate-500">
                Free tests, free medicines, and discounts claimed on the invoices above.
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-slate-200">
              Saved {money(membershipSavings)}
            </span>
          </div>
          <div className={`max-h-[320px] space-y-2 overflow-y-auto p-3 pr-1 ${hiddenScrollbar}`}>
            {membershipUsageInvoices.length === 0 && (
              <SectionEmpty text="No membership benefits used yet." />
            )}
            {membershipUsageInvoices.map((invoice: any) => {
              const { source, kind, saved } = benefitUsageLabel(invoice);
              return (
                <button
                  type="button"
                  key={invoice.id}
                  onClick={() => openInvoice(invoice)}
                  title="Open invoice"
                  className="flex w-full items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="underline decoration-slate-300 underline-offset-2">
                        {invoice.invoice_number}
                      </b>
                      <span className="rounded bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500 ring-1 ring-slate-200">
                        {source}
                      </span>
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                        {kind}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {fmtDate(invoice.created_at)} · bill {money(invoice.total_amount)}
                    </p>
                  </div>
                  <span className="shrink-0 font-black tabular-nums text-emerald-700">
                    -{money(saved)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </DetailSection>

      <div className="px-1 pb-2">
        <h4 className="text-sm font-black text-slate-950">Timeline</h4>
        <p className="mt-0.5 text-xs font-semibold text-slate-500">
          Patient activity in date order.
        </p>
        {(!summary?.timeline || summary.timeline.length === 0) && (
          <p className="mt-3 table-data text-slate-500">No timeline events.</p>
        )}
        <div className="mt-3 space-y-2">
          {summary?.timeline?.map((event: any, index: number) => (
            <p key={`${event.type}-${index}`} className="text-sm text-slate-700">
              <span className="font-black text-slate-950">{fmtDate(event.recorded_at)}</span>
              <span className="mx-2 text-slate-300">|</span>
              <span>{event.title}</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
