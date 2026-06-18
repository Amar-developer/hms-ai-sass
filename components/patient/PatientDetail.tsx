import { UPLOADS_BASE } from "@/lib/api";
import { Card,Badge,Button,StatusToast } from "../common/ui";
import { hiddenScrollbar } from "@/utils/patient/constants";
import { clinicalRecordsWithUniqueItems, fmtDate, uniqueClinicalRecords } from "@/utils/patient/helpers";
import { money } from "@/features/reports/utils";
import { MembershipEnrollForm } from "./Forms";
import { AlertCard, ClinicalItemList, Info, Row, SectionEmpty, StatusBadge } from "./Shared";


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
  // A plan-purchase invoice is the membership fee invoice itself. Benefit-usage
  // invoices (lab/pharmacy/consultation with the membership applied) also carry
  // the enrollment/plan id, so exclude any invoice linked to a service.
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
  const activeMembership = membershipEnrollments.find(
    (row: any) => row.status === "active" && isEnrollmentPaid(row),
  );
  const pendingMembership = membershipEnrollments.find(
    (row: any) => row.status === "active" && !isEnrollmentPaid(row),
  );
  const membershipUsageInvoices = patientInvoices.filter(
    (invoice: any) => Number(invoice.membership_discount_amount || 0) > 0,
  );
  const membershipSavings = membershipUsageInvoices.reduce(
    (sum: number, invoice: any) =>
      sum + Number(invoice.membership_discount_amount || 0),
    0,
  );

  return (
    <div className="space-y-5">
      {/* Demographics */}
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
              <h3 className="card-title font-bold">Patient Details</h3>
              <p className="table-data text-slate-500">
                Audited EMR view with demographics, alerts, history, treatment,
                and timeline.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {loading && <Badge tone="amber">Loading…</Badge>}
            <button
              type="button"
              onClick={onBack}
              className="close-button font-bold"
            >
              Back to Patients
            </button>
            <Button onClick={onEdit}>Edit Patient</Button>
          </div>
        </div>
        <StatusToast message={message} onClose={onMessageClose} />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Info k="Name" v={patient.full_name} />
          <Info k="Patient Number" v={patient.patient_number} />
          <Info k="Mobile" v={patient.mobile || "-"} />
          <Info
            k="Age / Gender"
            v={`${patient.age_years ?? "-"} / ${patient.gender || "-"}`}
          />
          <Info k="Blood Group" v={patient.blood_group || "-"} />
          <Info k="Area" v={patient.area || "-"} />
          <Info k="Address" v={patient.address || "-"} />
          <Info k="Guardian" v={patient.guardian_name || "-"} />
          <Info k="IP Status" v={isAdmitted ? "Admitted" : "No"} />
        </div>
      </Card>

      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h4 className="card-title font-bold">Patient Membership</h4>
            <p className="table-data text-slate-500">
              Subscription status, usage, purchase invoice, and benefit savings
              for this patient.
            </p>
          </div>
          <Badge
            tone={
              activeMembership ? "green" : pendingMembership ? "amber" : "slate"
            }
            className="px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm rounded-lg w-[15%]
"
          >
            {activeMembership
              ? "Subscribed"
              : pendingMembership
                ? "Payment due"
                : "Not subscribed"}
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Info
            k="Current Plan"
            v={
              activeMembership?.plan?.name ||
              pendingMembership?.plan?.name ||
              "-"
            }
          />
          <Info
            k="Valid Until"
            v={fmtDate(activeMembership?.ends_on || pendingMembership?.ends_on)}
          />
          <Info
            k="Free Consult Used"
            v={
              activeMembership
                ? `${activeMembership.used_consultations}/${activeMembership.plan?.free_consultations ?? 0}`
                : "Payment required"
            }
          />
          <Info k="Membership Savings" v={money(membershipSavings)} />
        </div>
        <MembershipEnrollForm
          membershipPlans={membershipPlans}
          patient={patient}
          branches={branches}
          loading={loading}
          onSubmit={onEnrollMembership}
        />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border p-4">
            <h5 className="card-title font-bold">Membership History</h5>
            <div className="mt-3 space-y-2">
              {membershipEnrollments.length === 0 && (
                <SectionEmpty text="No membership history." />
              )}
              {membershipEnrollments.map((row: any) => {
                const invoice = purchaseInvoiceFor(row);
                const due = Number(
                  invoice?.balance_amount ??
                    Math.max(
                      Number(row.plan?.price_amount || 0) -
                        Number(row.paid_amount || 0),
                      0,
                    ),
                );
                return (
                  <div
                    key={row.id}
                    className="rounded-lg bg-slate-50 p-3 text-sm"
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
                      Purchase invoice:{" "}
                      {invoice?.invoice_number ||
                        row.purchase_invoice_id ||
                        "-"}
                      {due > 0 ? ` · due ${money(due)}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <h5 className="card-title font-bold">Benefit Usage Invoices</h5>
            <div className="mt-3 table-data space-y-2">
              {membershipUsageInvoices.length === 0 && (
                <SectionEmpty text="No membership benefits used yet." />
              )}
              {membershipUsageInvoices.map((invoice: any) => (
                <div
                  key={invoice.id}
                  className="rounded-xl bg-slate-50 p-3 text-sm"
                >
                  <div className="flex justify-between gap-3">
                    <b>{invoice.invoice_number}</b>
                    <span>{money(invoice.membership_discount_amount)}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {fmtDate(invoice.created_at)} · total{" "}
                    {money(invoice.total_amount)} · discount{" "}
                    {money(invoice.discount_amount)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
        {membershipInvoices.length > 0 && (
          <div className="mt-4 rounded-lg bg-slate-50 p-4 table-data">
            <b>Plan purchase invoices:</b>{" "}
            {membershipInvoices
              .map(
                (invoice: any) =>
                  `${invoice.invoice_number} (${money(invoice.paid_amount)} paid, ${money(invoice.balance_amount)} due)`,
              )
              .join(", ")}
          </div>
        )}
      </Card>

      {/* Alerts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h4 className="font-bold text-red-700">
            Allergies &amp; Critical Alerts
          </h4>
          <div className="mt-3 space-y-2">
            {alerts.length === 0 && (
              <SectionEmpty text="No active allergy or critical alert." />
            )}
            {alerts.map((alert: any) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </Card>
        <Card>
          <h4 className="font-bold">Risk Notes</h4>
          <div className="mt-3 space-y-2">
            {risks.length === 0 && (
              <SectionEmpty text="No active risk notes." />
            )}
            {risks.map((alert: any) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </Card>
      </div>

      {/* Consultations — complaints, symptoms, diagnosis, prescription */}
      <Card>
        <h4 className="card-title font-bold">Consultations</h4>
        <p className="table-data text-slate-500">
          Chief complaints, diagnosis, prescriptions and referrals from each
          visit.
        </p>
        {consultations.length === 0 && (
          <SectionEmpty text="No consultation records found." />
        )}
        <div className="mt-3 space-y-3">
          {consultations.map((c: any) => (
            <div
              key={c.id}
              className="rounded-lg border border-slate-200 p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{fmtDate(c.created_at)}</span>
                <div className="flex flex-wrap gap-2">
                  {c.treatment_type && (
                    <Badge tone="slate" className="normal-badge">{c.treatment_type.toUpperCase()}</Badge>
                  )}
                  <StatusBadge status={c.status} />
                </div>
              </div>
              {c.chief_complaint && (
                <Row label="Chief Complaint" value={c.chief_complaint} />
              )}
              {c.patient_remarks && (
                <Row label="Symptoms / Remarks" value={c.patient_remarks} />
              )}
              {c.diagnosis && <Row label="Diagnosis" value={c.diagnosis} />}
              {c.clinical_notes && (
                <Row label="Clinical Notes" value={c.clinical_notes} />
              )}
              {c.scan_referral_text && (
                <Row label="Scan Referral" value={c.scan_referral_text} />
              )}
              {c.follow_up_advice && (
                <Row label="Follow-up" value={c.follow_up_advice} />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Lab & Pharmacy side by side */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h4 className="card-title font-bold">Lab Tests</h4>
          <p className="table-data text-slate-500">
            Ordered diagnostic tests and results.
          </p>
          {labOrders.length === 0 && (
            <SectionEmpty text="No lab orders found." />
          )}
          <div
            className={`mt-3 max-h-[260px] space-y-3 overflow-y-auto pr-1 ${hiddenScrollbar}`}
          >
            {labRows.map(({ row: order, items }: any) => (
              <div
                key={order.id}
                className="rounded-2xl bg-slate-50 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold">{fmtDate(order.created_at)}</span>
                  <span className="shrink-0">
                    <StatusBadge status={order.status} />
                  </span>
                </div>
                <ClinicalItemList items={items} />
                {order.notes && (
                  <p className="mt-1 text-xs text-slate-500">{order.notes}</p>
                )}
                {order.priority && order.priority !== "routine" && (
                  <Badge tone="amber">{order.priority}</Badge>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h4 className="card-title font-bold">Medicines</h4>
          <p className="table-data text-slate-500">
            Pharmacy issues and dispensed medicines.
          </p>
          {pharmacyIssues.length === 0 && (
            <SectionEmpty text="No pharmacy records found." />
          )}
          <div
            className={`mt-3 max-h-[260px] space-y-3 overflow-y-auto pr-1 ${hiddenScrollbar}`}
          >
            {medicineRows.map(({ row: issue, items }: any) => (
              <div
                key={issue.id}
                className="rounded-2xl bg-slate-50 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold">{fmtDate(issue.created_at)}</span>
                  <span className="shrink-0">
                    <StatusBadge status={issue.status} />
                  </span>
                </div>
                <ClinicalItemList items={items} />
                {issue.notes && (
                  <p className="mt-1 text-xs text-slate-500">{issue.notes}</p>
                )}
                {issue.amount > 0 && (
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    ₹{issue.amount}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Physiotherapy */}
      <Card>
        <h4 className="card-title font-bold">Physiotherapy Sessions</h4>
        <p className="table-data text-slate-500">
          Physiotherapy cases and treatment plans.
        </p>
        {physioCases.length === 0 && (
          <SectionEmpty text="No physiotherapy records found." />
        )}
        <div className="mt-3 space-y-3">
          {physioCases.map((c: any) => (
            <div
              key={c.id}
              className="rounded-2xl border border-slate-200 p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">
                  {c.case_number || fmtDate(c.assessment_date)}
                </span>
                <div className="flex flex-wrap gap-2">
                  {c.care_context && (
                    <Badge tone="slate">{c.care_context.toUpperCase()}</Badge>
                  )}
                  <StatusBadge status={c.status} />
                </div>
              </div>
              {c.body_region && (
                <Row label="Body Region" value={c.body_region} />
              )}
              {c.condition && <Row label="Condition" value={c.condition} />}
              {c.treatment_goal && (
                <Row label="Goal" value={c.treatment_goal} />
              )}
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                {c.pain_score != null && (
                  <span>
                    Pain score: <b>{c.pain_score}/10</b>
                  </span>
                )}
                {c.planned_sessions && (
                  <span>
                    Sessions planned: <b>{c.planned_sessions}</b>
                  </span>
                )}
                {c.frequency && (
                  <span>
                    Frequency: <b>{c.frequency}</b>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* IP Admissions */}
      <Card>
        <h4 className="card-title font-bold">IP Admissions</h4>
        <p className="table-data text-slate-500">
          Inpatient admission history with ward, room and discharge details.
        </p>
        {patientIpAdmissions.length === 0 && (
          <SectionEmpty text="No IP admission records found." />
        )}
        <div className="mt-3 space-y-3">
          {patientIpAdmissions.map((adm: any) => (
            <div
              key={adm.id}
              className="rounded-2xl border border-slate-200 p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">
                  {adm.admission_number || fmtDate(adm.admission_date)}
                </span>
                <StatusBadge status={adm.status} />
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <Info k="Ward" v={adm.ward || "-"} />
                <Info
                  k="Room / Bed"
                  v={adm.room ? `${adm.room} / ${adm.bed}` : adm.bed || "-"}
                />
                <Info k="Admitted" v={fmtDate(adm.admission_date)} />
              </div>
              {adm.expected_discharge_date && (
                <div className="mt-2">
                  <Info
                    k="Expected Discharge"
                    v={fmtDate(adm.expected_discharge_date)}
                  />
                </div>
              )}
              {adm.reason && <Row label="Reason" value={adm.reason} />}
              {adm.provisional_diagnosis && (
                <Row
                  label="Provisional Diagnosis"
                  value={adm.provisional_diagnosis}
                />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Timeline */}
      <Card>
        <h4 className="card-title font-bold">Timeline</h4>
        {(!summary?.timeline || summary.timeline.length === 0) && (
          <SectionEmpty text="No timeline events." />
        )}
        <div className="mt-3 space-y-2">
          {summary?.timeline?.map((event: any, index: number) => (
            <div
              key={`${event.type}-${index}`}
              className="rounded-lg bg-slate-50 p-3 text-sm"
            >
              <b className="table-data">{event.title}</b>
              <p className="text-slate-500 table-data">{fmtDate(event.recorded_at)}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
