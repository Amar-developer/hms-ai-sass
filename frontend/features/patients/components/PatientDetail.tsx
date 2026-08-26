import { useEffect, useState } from "react";
import {
  FlaskConical,
  MessageCircle,
  Pill,
  ReceiptText,
  Stethoscope,
} from "lucide-react";

import { ApiSession, apiFetch } from "@/lib/api";
import {
  clinicalRecordsWithUniqueItems,
  displayPatientGender,
  fmtDate,
  uniqueClinicalRecords,
} from "../helpers";
import { MembershipEnrollForm } from "../forms/PatientForms";
import { CompactMetric } from "./CompactMetric";
import {
  invoicePatientDueAmount,
  invoiceSource,
  isMembershipPlanInvoice,
} from "@/features/billing/helpers";
import { StatusBadge } from "./StatusBadge";
import {
  ActionButton,
  Badge,
  Button,
  Card,
  Input,
  SearchableSelect,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { ActivityLog } from "@/app/components/common/ActivityLog";
import { Info } from "@/app/components/common/Info";
import { Empty } from "@/app/components/common/Empty";
import { DetailSection } from "./DetailSection";
import { AlertCard } from "./AlertCard";
import { familyRelationshipOptions, hiddenScrollbar } from "../constants";
import { money } from "@/utils/helper";
import { OverlayLoader } from "@/app/components/common/loader/OverlayLoader";
import { DataTable } from "@/app/components/common/DataTable";
import { PatientFlagBadges, patientValueTierFlags } from "./PatientFlagBadges";
import { MembershipBenefitUsageModal } from "./MembershipBenefitUsageModal";
import {
  getConsultationColumns,
  getInvoiceColumns,
  getLabOrderColumns,
  getMedicineColumns,
} from "../Column";
import { BmiTrendChart, type VitalReading } from "./workspace/BmiTrendChart";
import { Column } from "@/utils/types";

// Placeholder vitals — the patient schema has no height/weight/vitals model
// yet, so the BMI trend renders illustrative data until that's added.
const MOCK_VITALS: VitalReading[] = [
  { date: "2026-03-01", heightCm: 168, weightKg: 82 },
  { date: "2026-04-01", heightCm: 168, weightKg: 80 },
  { date: "2026-05-01", heightCm: 168, weightKg: 78.5 },
  { date: "2026-06-01", heightCm: 168, weightKg: 77 },
  { date: "2026-07-01", heightCm: 168, weightKg: 75.5 },
  { date: "2026-08-01", heightCm: 168, weightKg: 74 },
];

export function PatientDetail({
  apiSession,
  patient,
  summary,
  patientIpAdmissions,
  consultations,
  labOrders,
  homeCareBookings = [],
  pharmacyIssues,
  physioCases,
  membershipPlans = [],
  membershipEnrollments = [],
  patientInvoices = [],
  patientCommunications = [],
  familyRelationships = [],
  patientIntelligence,
  patientIntelligenceError,
  branches,
  loading,
  message,
  onMessageClose,
  onEnrollMembership,
  onUpdateMembershipBenefitUsage,
  onCreateFamilyRelationship,
  onDeleteFamilyRelationship,
  onBack,
  onEdit,
  onUploadPhoto,
  onSaveManualPrescriptionDate,
  onSaveManualLabDate,
  onSendEngagementAction,
  setActive,
  activeSection = "home",
}: any & { apiSession?: ApiSession | null }) {
  const permissionKeys = apiSession?.user?.permissions || [];
  const hasAnyPermission = (keys: string[]) =>
    Boolean(
      apiSession?.user?.is_super_admin ||
      permissionKeys.includes("*") ||
      keys.some((key) => permissionKeys.includes(key)),
    );
  const canReadMembership = hasAnyPermission([
    "patient_subscriptions.manage",
    "patient_subscriptions.read",
    "patient_subscriptions.create",
  ]);
  const canCreateMembership = hasAnyPermission([
    "patient_subscriptions.manage",
    "patient_subscriptions.create",
  ]);
  const canAdjustMembershipUsage = Boolean(
    apiSession?.user?.user_type === "tenant_admin" ||
      apiSession?.user?.roles?.includes("tenant_admin"),
  );
  const canReadBilling = hasAnyPermission([
    "billing.manage",
    "billing.read",
    "invoices.read",
  ]);
  const canEditPatient = hasAnyPermission(["patients.edit"]);
  const canSendEngagement = hasAnyPermission(["patient_engagement.send"]);
  const canManageIntelligence = hasAnyPermission([
    "patient_intelligence.manage",
  ]);
  const canUpdatePatientTracking = canManageIntelligence || canEditPatient;
  const [manualPrescriptionDate, setManualPrescriptionDate] = useState("");
  const [manualPrescriptionNotes, setManualPrescriptionNotes] = useState("");
  const [manualLabDate, setManualLabDate] = useState("");
  const [manualLabTestName, setManualLabTestName] = useState("");
  const [manualLabNotes, setManualLabNotes] = useState("");
  const [familyPatientId, setFamilyPatientId] = useState("");
  const [familyRelationship, setFamilyRelationship] = useState("father");
  const [familyNotes, setFamilyNotes] = useState("");
  const [familyPatientOptions, setFamilyPatientOptions] = useState<any[]>([]);
  const [familyPatientSearchLoading, setFamilyPatientSearchLoading] =
    useState(false);
  const [editingBenefitUsage, setEditingBenefitUsage] = useState<any | null>(
    null,
  );

  async function searchFamilyPatients(query = "") {
    if (!apiSession) return;
    setFamilyPatientSearchLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "25",
        active_only: "true",
      });
      if (query.trim()) params.set("q", query.trim());
      const rows = await apiFetch(`/patients?${params.toString()}`, apiSession);
      const linkedIds = new Set(
        familyRelationships.map((row: any) => row.related_patient_id),
      );
      setFamilyPatientOptions(
        (Array.isArray(rows) ? rows : [])
          .filter((row: any) => row.id !== patient.id && !linkedIds.has(row.id))
          .map((row: any) => ({
            value: row.id,
            label: row.full_name || row.patient_number || row.id,
            sublabel: `${row.patient_number || row.id}${row.contact_mobile || row.mobile ? ` · ${row.contact_mobile || row.mobile}` : ""}`,
          })),
      );
    } catch {
      setFamilyPatientOptions([]);
    } finally {
      setFamilyPatientSearchLoading(false);
    }
  }

  useEffect(() => {
    setFamilyPatientId("");
    setFamilyRelationship("father");
    setFamilyNotes("");
    searchFamilyPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id, familyRelationships.length, apiSession?.tenantId]);
  useEffect(() => {
    setManualPrescriptionDate(
      String(
        patientIntelligence?.manual_expected_refill_at ||
          patient?.monthly_refill_on ||
          "",
      ).slice(0, 10),
    );
    setManualPrescriptionNotes(
      patientIntelligence?.manual_refill_notes || patient?.monthly_refill_notes || "",
    );
    setManualLabDate(
      String(
        patientIntelligence?.manual_expected_lab_at || patient?.monthly_lab_on || "",
      ).slice(0, 10),
    );
    setManualLabTestName(
      patientIntelligence?.manual_lab_test_name ||
        patient?.monthly_lab_test_name ||
        "",
    );
    setManualLabNotes(
      patientIntelligence?.manual_lab_notes || patient?.monthly_lab_notes || "",
    );
  }, [
    patient.id,
    patient?.monthly_refill_on,
    patient?.monthly_refill_notes,
    patient?.monthly_lab_on,
    patient?.monthly_lab_test_name,
    patient?.monthly_lab_notes,
    patientIntelligence?.manual_expected_refill_at,
    patientIntelligence?.manual_refill_notes,
    patientIntelligence?.manual_expected_lab_at,
    patientIntelligence?.manual_lab_test_name,
    patientIntelligence?.manual_lab_notes,
  ]);
  const alerts = [
    ...(summary?.critical_alerts || []),
    ...(summary?.allergies || []),
  ];
  const risks = [...(summary?.risk_alerts || []), ...(summary?.notes || [])];
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
  ).map((bundle: any) => ({ ...bundle, source: "lab" }));
  const homeCareRows = homeCareBookings.map((booking: any) => {
    const serviceItems =
      (booking.services || []).length > 0
        ? booking.services
        : booking.visit_logs || [];
    const items = serviceItems
      .map((item: any) => item.description || item.service_category)
      .filter(Boolean);
    return { row: booking, items, source: "home_care" };
  });
  const labServiceRows = [...labRows, ...homeCareRows].sort(
    (a: any, b: any) =>
      new Date(
        b.row.created_at || b.row.start_date || b.row.visit_date || 0,
      ).getTime() -
      new Date(
        a.row.created_at || a.row.start_date || a.row.visit_date || 0,
      ).getTime(),
  );
  const medicineRows = clinicalRecordsWithUniqueItems(
    uniquePharmacyIssues,
    (issue: any) => issue.medicine_text,
  );

  const membershipInvoices = patientInvoices.filter(isMembershipPlanInvoice);
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
  const queuedMembership = resolvedMembershipEnrollments.find(
    (row: any) => row.status === "queued",
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
    (sum: number, invoice: any) => sum + invoicePatientDueAmount(invoice),
    0,
  );

  function openConsultation(c: any) {
    if (!c?.appointment_id) return;
    setActive?.({ id: "opd", appointmentId: c.appointment_id });
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

  const consultationColumns = getConsultationColumns({
    onOpen: openConsultation,
  });
  const invoiceColumns = getInvoiceColumns({ onOpen: openInvoice });
  const labOrderColumns = getLabOrderColumns({
    onOpen: (bundle: any) =>
      goToModule(bundle?.source === "home_care" ? "home_care" : "lab"),
  });
  const medicineColumns = getMedicineColumns({
    onOpen: () => goToModule("pharmacy"),
  });
  const communicationFlowLabels: Record<string, string> = {
    appointment_booked_patient: "Appointment",
    appointment_reminder_patient: "Appointment reminder",
    invoice_paid_patient: "Paid invoice",
    payment_pending_patient: "Payment reminder",
    lab_report_ready_patient: "Lab report ready",
    medicine_refill_patient: "Monthly medicine reminder",
    lab_test_reminder_patient: "Monthly lab test reminder",
    membership_renewal_patient: "Membership renewal",
    unused_benefit_patient: "Membership benefit reminder",
    health_tip_patient: "Health tip",
    patient_reengagement: "Patient re-engagement",
    home_care_booking_patient: "Home care booking",
    home_visit_reminder_patient: "Home visit reminder",
    prescription_ready_patient: "Prescription ready",
  };
  const communicationColumns: Column<any>[] = [
    {
      key: "created_at",
      header: "Date",
      render: (row) => fmtDate(row.sent_at || row.created_at),
    },
    {
      key: "template_key",
      header: "Template",
      render: (row) =>
        communicationFlowLabels[row.template_key] || row.template_key || "-",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge
          tone={
            row.status === "sent"
              ? "green"
              : row.status === "failed"
                ? "red"
                : row.status === "cancelled"
                  ? "slate"
                  : "blue"
          }
          className="normal-badge"
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: "resource_type",
      header: "Source",
      render: (row) => String(row.resource_type || "-").replaceAll("_", " "),
    },
    {
      key: "recipient_masked",
      header: "Recipient",
      render: (row) => row.recipient_masked || "-",
    },
    {
      key: "failure_reason",
      header: "Failure",
      render: (row) => row.failure_reason || "-",
    },
  ];
  const monthlyTrackingCards = (
    <div className="grid gap-3 xl:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h5 className="text-sm font-black text-slate-950">
          Monthly Medicine Tracking
        </h5>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Set the first refill date. Future monthly dates update automatically.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <FormField label="First / Next Refill Date">
            <Input
              type="date"
              value={manualPrescriptionDate}
              onChange={(event: any) =>
                setManualPrescriptionDate(event.target.value)
              }
            />
          </FormField>
          <FormField label="Notes">
            <Input
              value={manualPrescriptionNotes}
              onChange={(event: any) =>
                setManualPrescriptionNotes(event.target.value)
              }
              placeholder="Optional medicine note"
            />
          </FormField>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            onClick={() =>
              onSaveManualPrescriptionDate?.(
                manualPrescriptionDate,
                manualPrescriptionNotes,
              )
            }
            disabled={loading || !manualPrescriptionDate}
          >
            Save Refill
          </Button>
          {(patientIntelligence?.manual_expected_refill_at ||
            patient?.monthly_refill_on) && (
            <ActionButton
              tone="danger"
              onClick={() =>
                onSaveManualPrescriptionDate?.("", manualPrescriptionNotes)
              }
              disabled={loading}
            >
              Clear
            </ActionButton>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h5 className="text-sm font-black text-slate-950">
          Monthly Lab Tracking
        </h5>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Set the first lab date and test. Future monthly dates update automatically.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <FormField label="First / Next Lab Date">
            <Input
              type="date"
              value={manualLabDate}
              onChange={(event: any) => setManualLabDate(event.target.value)}
            />
          </FormField>
          <FormField label="Lab Test">
            <Input
              value={manualLabTestName}
              onChange={(event: any) =>
                setManualLabTestName(event.target.value)
              }
              placeholder="For example, HbA1c"
            />
          </FormField>
          <FormField label="Notes" className="md:col-span-2">
            <Input
              value={manualLabNotes}
              onChange={(event: any) => setManualLabNotes(event.target.value)}
              placeholder="Optional lab note"
            />
          </FormField>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            onClick={() =>
              onSaveManualLabDate?.(
                manualLabDate,
                manualLabTestName,
                manualLabNotes,
              )
            }
            disabled={loading || !manualLabDate}
          >
            Save Lab Date
          </Button>
          {(patientIntelligence?.manual_expected_lab_at ||
            patient?.monthly_lab_on) && (
            <ActionButton
              tone="danger"
              onClick={() =>
                onSaveManualLabDate?.("", manualLabTestName, manualLabNotes)
              }
              disabled={loading}
            >
              Clear
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative space-y-5">
      {loading && <OverlayLoader />}
      <Card>
        <StatusToast message={message} onClose={onMessageClose} />
        {activeSection === "home" && (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Info
              title="Age / Gender"
              value={`${patient.age_years ?? "-"} / ${displayPatientGender(patient.gender)}`}
            />
            <Info title="Blood Group" value={patient.blood_group || "-"} />
            <Info title="Mobile" value={patient.mobile || "-"} />
            <Info title="Address" value={patient.address || "-"} />
            <Info
              title="Secondary Mobile"
              value={patient.alternate_mobile || "-"}
            />
            <Info
              title="WhatsApp Preference"
              value={String(patient.whatsapp_consent_status || "not_recorded")
                .replaceAll("_", " ")
                .replace(/\b\w/g, (letter) => letter.toUpperCase())}
            />
            <Info
              title="Preference Source"
              value={String(patient.whatsapp_consent_source || "-")
                .replaceAll("_", " ")
                .replace(/\b\w/g, (letter) => letter.toUpperCase())}
            />
            <Info
              title="Message Language"
              value={
                {
                  tenant_default: "English",
                  en: "English",
                  hi: "Hindi",
                  mr: "Marathi",
                  gu: "Gujarati",
                  ta: "Tamil",
                  te: "Telugu",
                  kn: "Kannada",
                  ml: "Malayalam",
                  bn: "Bengali",
                  pa: "Punjabi",
                  ur: "Urdu",
                }[String(patient.whatsapp_preferred_language || "en")] ||
                String(patient.whatsapp_preferred_language)
              }
            />
          </div>
        )}
        {activeSection === "membership" && canReadMembership && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h5 className="text-sm font-black text-slate-950">
                  Membership Plan Enrollment
                </h5>
                <p className="text-xs font-semibold text-slate-500">
                  Enroll the patient and generate the plan purchase invoice.
                </p>
              </div>
              <Badge
                tone={
                  activeMembership
                    ? "green"
                    : pendingMembership
                      ? "amber"
                      : "slate"
                }
                className="normal-badge"
              >
                {activeMembership
                  ? "active"
                  : pendingMembership
                    ? "payment due"
                    : "not enrolled"}
              </Badge>
            </div>
            {queuedMembership && (
              <p className="mt-2 text-xs font-semibold text-amber-700">
                Next plan: {queuedMembership.plan?.name || "Membership plan"} —
                activates automatically when the current plan ends.
              </p>
            )}
            {canCreateMembership && !queuedMembership && (
              <MembershipEnrollForm
                membershipPlans={membershipPlans}
                patient={patient}
                branches={branches}
                loading={loading}
                onSubmit={onEnrollMembership}
                excludedPlanIds={[
                  visibleMembership?.plan_id,
                  queuedMembership?.plan_id,
                ].filter(Boolean)}
              />
            )}
            {canAdjustMembershipUsage && visibleMembership && (
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  onClick={() => setEditingBenefitUsage(visibleMembership)}
                  className="rounded-lg px-3 py-2 text-xs"
                >
                  Update benefit usage
                </Button>
              </div>
            )}
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
                  visibleMembership ? `${freeLabUsed}/${freeLabAllocated}` : "-"
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
            <MembershipBenefitUsageModal
              enrollment={editingBenefitUsage}
              onClose={() => setEditingBenefitUsage(null)}
              onSave={onUpdateMembershipBenefitUsage}
              saving={loading}
            />
          </div>
        )}
        {(activeSection === "membership" || activeSection === "family") && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h5 className="text-sm font-black text-slate-950">
                  Family Relationships
                </h5>
                <p className="text-xs font-semibold text-slate-500">
                  Link existing patients so one membership benefit pool can be
                  used by any linked family member.
                </p>
              </div>
              <Badge tone="slate" className="normal-badge">
                {familyRelationships.length} linked
              </Badge>
            </div>

            {canEditPatient && (
              <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_180px_1fr_auto] md:items-end">
                <FormField label="Family Patient">
                  <SearchableSelect
                    value={familyPatientId}
                    onChange={setFamilyPatientId}
                    options={familyPatientOptions}
                    loading={familyPatientSearchLoading}
                    onSearchChange={searchFamilyPatients}
                    placeholder="Search patient by name, ID, or mobile"
                    searchPlaceholder="Search existing patients..."
                    emptyText="No matching patient found."
                  />
                </FormField>
                <FormField label="Relationship">
                  <SearchableSelect
                    value={familyRelationship}
                    onChange={setFamilyRelationship}
                    options={familyRelationshipOptions}
                    searchable={false}
                    placeholder="Select relationship"
                  />
                </FormField>
                <FormField label="Notes">
                  <Input
                    value={familyNotes}
                    onChange={(event: any) =>
                      setFamilyNotes(event.target.value)
                    }
                    placeholder="Optional note"
                  />
                </FormField>
                <Button
                  disabled={loading || !familyPatientId.trim()}
                  onClick={async () => {
                    const ok = await onCreateFamilyRelationship?.({
                      relatedPatientId: familyPatientId.trim(),
                      relationship: familyRelationship.trim() || "family",
                      notes: familyNotes.trim(),
                    });
                    if (ok) {
                      setFamilyPatientId("");
                      setFamilyRelationship("father");
                      setFamilyNotes("");
                      searchFamilyPatients();
                    }
                  }}
                >
                  Link Family
                </Button>
              </div>
            )}

            <div className="mt-3 space-y-2">
              {familyRelationships.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">
                  No family relationships linked yet.
                </p>
              ) : (
                familyRelationships.map((row: any) => (
                  <div
                    key={row.id}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-black text-slate-950">
                        {row.related_patient_name || row.related_patient_id}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        {row.related_patient_number || row.related_patient_id} ·{" "}
                        {row.relationship || "family"}
                      </p>
                      {row.notes && (
                        <p className="mt-1 text-xs text-slate-500">
                          {row.notes}
                        </p>
                      )}
                    </div>
                    {canEditPatient && (
                      <ActionButton
                        tone="neutral"
                        disabled={loading}
                        onClick={() => onDeleteFamilyRelationship?.(row.id)}
                      >
                        Remove
                      </ActionButton>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Card>

      {activeSection === "home" && (
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-black text-slate-900">BMI Trend</h3>
          <p className="mb-3 text-xs text-slate-500">
            Updated to today from the patient&apos;s latest recorded vitals.
          </p>
          <BmiTrendChart readings={MOCK_VITALS} />
        </Card>
      )}

      {activeSection === "home" && patientIntelligence && (
        <DetailSection
          title="Patient Intelligence"
          description="Explainable Patient 360 metrics calculated from existing HMS activity."
          count={patientValueTierFlags(patientIntelligence.flags).length}
        >
          <div className="grid gap-3 md:grid-cols-4">
            <CompactMetric
              label="Current Tier"
              value={patientIntelligence.current_tier || "Standard"}
            />
            <CompactMetric
              label="Last Activity"
              value={fmtDate(patientIntelligence.metrics?.last_activity_at)}
            />
            <CompactMetric
              label="30-day Collected"
              value={money(patientIntelligence.metrics?.net_collected_30d || 0)}
            />
            <CompactMetric
              label="365-day Collected"
              value={money(
                patientIntelligence.metrics?.net_collected_365d || 0,
              )}
            />
            <CompactMetric
              label="Completed Visits"
              value={patientIntelligence.metrics?.completed_visits || 0}
            />
            <CompactMetric
              label="Lab Orders"
              value={patientIntelligence.metrics?.lab_order_count || 0}
            />
            <CompactMetric
              label="Pharmacy Dispenses"
              value={patientIntelligence.metrics?.pharmacy_dispense_count || 0}
            />
            <CompactMetric
              label="Next Medicine Refill"
              value={fmtDate(patientIntelligence.metrics?.expected_refill_at)}
            />
            <CompactMetric
              label="Next Lab Test"
              value={fmtDate(patientIntelligence.manual_expected_lab_at)}
            />
            <CompactMetric
              label="Active Paid Membership"
              value={
                patientIntelligence.metrics?.active_membership ? "Yes" : "No"
              }
            />
            <CompactMetric
              label="Total Score"
              value={patientIntelligence.score_summary?.total || 0}
            />
            <CompactMetric
              label="Value / Engagement / Risk"
              value={`${patientIntelligence.score_summary?.value || 0} / ${
                patientIntelligence.score_summary?.engagement || 0
              } / ${patientIntelligence.score_summary?.risk || 0}`}
            />
          </div>

          <PatientFlagBadges
            flags={patientIntelligence.flags || []}
            maxVisible={99}
            className="mt-4"
          />

          {(patientIntelligence.engagement_actions || []).length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h5 className="text-sm font-black text-slate-950">
                Recommended Engagement
              </h5>
              <div className="mt-2 space-y-2">
                {patientIntelligence.engagement_actions.map((action: any) => (
                  <div
                    key={action.id}
                    className="flex flex-col justify-between gap-2 rounded-lg bg-white px-3 py-2 sm:flex-row sm:items-center"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {String(action.action_key).replaceAll("_", " ")}
                      </p>
                      <p className="text-xs text-slate-500">{action.reason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={action.requires_approval ? "amber" : "blue"}>
                        {action.status}
                      </Badge>
                      {canSendEngagement && action.status === "recommended" && (
                        <Button
                          onClick={() => onSendEngagementAction?.(action.id)}
                          disabled={loading}
                        >
                          {action.requires_approval ? "Review & Send" : "Send"}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DetailSection>
      )}

      {activeSection === "home" &&
        !patientIntelligence &&
        patientIntelligenceError && (
          <DetailSection
            title="Patient Intelligence"
            description="Patient 360 metrics and explainable flags could not be loaded."
            count={0}
          >
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {patientIntelligenceError}
            </div>
          </DetailSection>
        )}

      {activeSection === "patient_tracking" && (
        <DetailSection
          title="Patient Tracking"
          description="Monthly medicine refill and lab test follow-up dates."
          count={canUpdatePatientTracking ? 3 : patientCommunications.length}
        >
          <div className="grid gap-3">
            {canUpdatePatientTracking ? (
              monthlyTrackingCards
            ) : (
              <Empty text="You do not have permission to update patient tracking." />
            )}
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <h5 className="text-sm font-black text-slate-950">
                WhatsApp Message History
              </h5>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                All WhatsApp templates sent or queued for this patient.
              </p>
              <div className="mt-3">
                <DataTable
                  columns={communicationColumns}
                  data={patientCommunications}
                  emptyMessage="No WhatsApp messages found."
                  emptyDescription="Invoice, membership, reminder and care messages for this patient will show here."
                  emptyIcon={MessageCircle}
                  minBodyHeight={`${patientCommunications.length > 0 ?'':'220px'}`}
                  className="text-xs"
                />
              </div>
            </div>
          </div>
        </DetailSection>
      )}

      {activeSection === "home" && (alerts.length > 0 || risks.length > 0) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {alerts.length > 0 && (
            <DetailSection
              title="Alerts"
              description="Allergies and critical notes."
              count={alerts.length}
            >
              <div className="space-y-2">
                {alerts.map((alert: any) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            </DetailSection>
          )}
          {risks.length > 0 && (
            <DetailSection
              title="Risk Notes"
              description="Care risks and general notes."
              count={risks.length}
            >
              <div className="space-y-2">
                {risks.map((alert: any) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            </DetailSection>
          )}
        </div>
      )}

      {activeSection === "consultations" && (
        <DetailSection
          title="Consultations"
          description="Click a consultation to open the consultation workspace."
          count={consultations.length}
        >
          <DataTable
            columns={consultationColumns}
            data={consultations}
            emptyMessage="No consultation records found."
            emptyDescription="Consultations recorded for this patient will show up here."
            emptyIcon={Stethoscope}
            minBodyHeight={`${consultations.length > 0 ?'':'220px'}`}
            onRowClick={openConsultation}
          />
        </DetailSection>
      )}

      {activeSection === "labs" && (
        <div className="grid gap-5">
          <DetailSection
            title="Lab & Service"
            description="Ordered diagnostic tests, services, home care, and home visit bookings."
            count={labServiceRows.length}
          >
            <DataTable
              columns={labOrderColumns}
              data={labServiceRows}
              emptyMessage="No lab or service orders found."
              emptyDescription="Diagnostic tests, services, home care, and home visit bookings for this patient will show up here."
              emptyIcon={FlaskConical}
              minBodyHeight={`${labServiceRows.length > 0 ?'':'220px'}`}
            />
          </DetailSection>
        </div>
      )}

      {activeSection === "medicines" && (
        <div className="grid gap-5">
          <DetailSection
            title="Medicines"
            description="Pharmacy issues and dispensed medicines."
            count={medicineRows.length}
          >
            <DataTable
              columns={medicineColumns}
              data={medicineRows}
              emptyMessage="No pharmacy issues found."
              emptyDescription="Medicines dispensed to this patient will show up here."
              emptyIcon={Pill}
              minBodyHeight={`${medicineRows.length > 0 ?'':'220px'}`}
            />
          </DetailSection>
        </div>
      )}

      {activeSection === "consultations" && physioCases.length > 0 && (
        <DetailSection
          title="Physiotherapy"
          description="Cases, treatment goals, and planned sessions."
          count={physioCases.length}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {physioCases.map((c: any) => (
              <button
                type="button"
                key={c.id}
                onClick={() => goToModule("physiotherapy")}
                title="Open in Physiotherapy"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-bold">
                  {c.case_number || fmtDate(c.assessment_date)}
                </span>
                <StatusBadge status={c.status} />
              </button>
            ))}
          </div>
        </DetailSection>
      )}

      {activeSection === "consultations" && patientIpAdmissions.length > 0 && (
        <DetailSection
          title="IP Admissions"
          description="Admission, bed, diagnosis, and discharge status."
          count={patientIpAdmissions.length}
        >
          <div className="space-y-3">
            {patientIpAdmissions.map((adm: any) => (
              <button
                type="button"
                key={adm.id}
                onClick={() => goToModule("ip")}
                title="Open in IP Admission"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-bold">
                  {adm.admission_number || fmtDate(adm.admission_date)}
                </span>
                <StatusBadge status={adm.status} />
              </button>
            ))}
          </div>
        </DetailSection>
      )}

      {activeSection === "membership" &&
        canReadMembership &&
        resolvedMembershipEnrollments.length > 0 && (
          <DetailSection
            title="Billing & Membership"
            description="Membership plan history and benefit usage."
            count={resolvedMembershipEnrollments.length}
            defaultOpen={false}
          >
            <div className="grid gap-3 md:grid-cols-4">
              <CompactMetric
                label="Membership Saved"
                value={money(membershipSavings)}
              />
            </div>

            <div className="mt-3 rounded-lg border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
                <h5 className="text-sm font-black text-slate-950">
                  Membership History
                </h5>
              </div>
              <div className="space-y-2 p-3">
                {resolvedMembershipEnrollments.length === 0 && (
                  <Empty text="No membership history." />
                )}
                {resolvedMembershipEnrollments.map((row: any) => {
                  const invoice = purchaseInvoiceFor(row);
                  const due = invoice
                    ? invoicePatientDueAmount(invoice)
                    : Math.max(
                        Number(row.plan?.price_amount || 0) -
                          Number(row.paid_amount || 0),
                        0,
                      );
                  const clickable = Boolean(invoice?.id);
                  return (
                    <div
                      key={row.id}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={
                        clickable ? () => openInvoice(invoice) : undefined
                      }
                      title={clickable ? "Open purchase invoice" : undefined}
                      className={`rounded-lg bg-slate-50 px-3 py-2 text-sm ${clickable ? "cursor-pointer hover:bg-slate-100" : ""}`}
                    >
                      <div className="flex justify-between gap-3">
                        <b>{row.plan?.name || row.plan_id}</b>
                        <Badge
                          tone={due > 0 ? "amber" : "green"}
                          className="normal-badge"
                        >
                          {due > 0 ? "payment due" : row.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {row.status === "queued" ? "Expected: " : ""}
                        {fmtDate(row.starts_on)} to {fmtDate(row.ends_on)} ·
                        paid {money(invoice?.paid_amount ?? row.paid_amount)} /{" "}
                        {money(invoice?.total_amount ?? row.plan?.price_amount)}
                      </p>
                      {row.status === "queued" && (
                        <p className="text-xs font-semibold text-amber-700">
                          Activates after the current plan; dates are
                          recalculated on actual activation.
                        </p>
                      )}
                      <p className="text-xs text-slate-500">
                        Purchase invoice:{" "}
                        {invoice?.invoice_number ||
                          row.purchase_invoice_id ||
                          "-"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {canReadBilling && (
              <div className="mt-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <div>
                    <h5 className="text-sm font-black text-slate-950">
                      Membership Benefit Usage
                    </h5>
                    <p className="text-xs font-semibold text-slate-500">
                      Free tests, free medicines, and discounts claimed on the
                      invoices above.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-slate-200">
                    Saved {money(membershipSavings)}
                  </span>
                </div>
                <div
                  className={`max-h-[320px] space-y-2 overflow-y-auto p-3 pr-1 ${hiddenScrollbar}`}
                >
                  {membershipUsageInvoices.length === 0 && (
                    <Empty text="No membership benefits used yet." />
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
                            <b className=" decoration-slate-300 ">
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
                            {fmtDate(invoice.created_at)} · bill{" "}
                            {money(invoice.total_amount)}
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
            )}
          </DetailSection>
        )}

      {activeSection === "billing"  && (
        <DetailSection
          title="Billing Invoices"
          description="Patient invoices, paid amount, and due amount."
          count={patientInvoices.length}
          defaultOpen={false}
        >
          <div className="mb-3 grid gap-3 md:grid-cols-3">
            <CompactMetric label="Overall Billed" value={money(totalBilled)} />
            <CompactMetric label="Overall Paid" value={money(totalPaid)} />
            <CompactMetric label="Overall Due" value={money(totalDue)} />
          </div>
          <DataTable
            columns={invoiceColumns}
            data={patientInvoices}
            emptyMessage="No billing invoices found."
            emptyDescription="Invoices generated for this patient will show up here."
            emptyIcon={ReceiptText}
            minBodyHeight={`${patientInvoices.length > 0 ?'':'220px'}`}
            onRowClick={openInvoice}
          />
        </DetailSection>
      )}

      <ActivityLog
        resourceType="patient"
        resourceId={patient?.id}
        apiSession={apiSession}
      />
    </div>
  );
}
