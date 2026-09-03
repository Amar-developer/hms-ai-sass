import { useEffect, useState } from "react";
import { MessageCircle, ReceiptText, Stethoscope } from "lucide-react";

import { ApiSession } from "@/lib/api";
import {
  deriveClinicalRows,
  derivePatientBillingMembership,
  displayPatientGender,
  fmtDate,
} from "../helpers";
import { usePatientFamilySearch, usePatientVitals } from "../api";
import { MembershipEnrollForm } from "../forms/PatientForms";
import { CompactMetric } from "./CompactMetric";
import {
  invoicePatientDueAmount,
  invoiceSource,
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
import {
  familyRelationshipOptions,
  hiddenScrollbar,
  message_language_options,
  sms_language_options,
} from "../constants";
import { money } from "@/utils/helper";
import { OverlayLoader } from "@/app/components/common/loader/OverlayLoader";
import { DataTable } from "@/app/components/common/DataTable";
import { PatientFlagBadges, patientValueTierFlags } from "./PatientFlagBadges";
import { MembershipBenefitUsageModal } from "./MembershipBenefitUsageModal";
import {
  getCommunicationColumns,
  getConsultationColumns,
  getInvoiceColumns,
} from "../Column";
import { PatientOverviewDashboard } from "./workspace/PatientOverviewDashboard";
import { SectionBody } from "./PatientDetailSkeleton";

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
  sectionLoading = false,
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
  const [editingBenefitUsage, setEditingBenefitUsage] = useState<any | null>(
    null,
  );
  const {
    familyPatientId,
    setFamilyPatientId,
    familyRelationship,
    setFamilyRelationship,
    familyNotes,
    setFamilyNotes,
    familyPatientOptions,
    familyPatientSearchLoading,
    searchFamilyPatients,
    resetFamilyForm,
  } = usePatientFamilySearch({
    apiSession,
    patientId: patient.id,
    familyRelationships,
  });
  const { vitals, vitalsLoading, savingVital, createVital, bmiReadings } =
    usePatientVitals({
      apiSession,
      patientId: patient.id,
    });

  useEffect(() => {
    setManualPrescriptionDate(
      String(
        patientIntelligence?.manual_expected_refill_at ||
          patient?.monthly_refill_on ||
          "",
      ).slice(0, 10),
    );
    setManualPrescriptionNotes(
      patientIntelligence?.manual_refill_notes ||
        patient?.monthly_refill_notes ||
        "",
    );
    setManualLabDate(
      String(
        patientIntelligence?.manual_expected_lab_at ||
          patient?.monthly_lab_on ||
          "",
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

  if (sectionLoading) {
    return (
      <div className="relative space-y-5">
        <div className="animate-pulse rounded-lg border border-slate-200 bg-white p-4">
          <SectionBody section={activeSection} />
        </div>
      </div>
    );
  }

  const alerts = [
    ...(summary?.critical_alerts || []),
    ...(summary?.allergies || []),
  ];
  const risks = [...(summary?.risk_alerts || []), ...(summary?.notes || [])];
  const { labServiceRows, medicineRows } = deriveClinicalRows({
    labOrders,
    homeCareBookings,
    pharmacyIssues,
  });

  const {
    purchaseInvoiceFor,
    resolvedMembershipEnrollments,
    activeMembership,
    pendingMembership,
    queuedMembership,
    visibleMembership,
    freeConsultationsAllocated,
    freeConsultationsUsed,
    freeLabUsed,
    freeLabAllocated,
    freeMedicineUsed,
    freeMedicineAllocated,
    membershipUsageInvoices,
    membershipSavings,
    totalBilled,
    totalPaid,
    totalDue,
  } = derivePatientBillingMembership({
    membershipEnrollments,
    membershipPlans,
    patientInvoices,
  });

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
  const communicationColumns = getCommunicationColumns();
  const monthlyTrackingCards = (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <h5 className="text-sm font-black text-slate-950">
        Monthly Lab & Medicine Tracking
      </h5>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        Set the first refill and lab dates. Future monthly dates update
        automatically.
      </p>
      <div className="mt-3 grid gap-4 xl:grid-cols-2">
        <div>
          <div className="grid gap-3 md:grid-cols-2">
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
              className="save-button"
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

        <div>
          <div className="grid gap-3 md:grid-cols-2">
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
              className="save-button"
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
    </div>
  );

  return (
    <div className="relative space-y-5">
      {loading && <OverlayLoader />}
      <Card className={activeSection === "home" ? "p-0 shadow-none" : ""}>
        <StatusToast message={message} onClose={onMessageClose} />
        {activeSection === "home" && (
            <div className="grid gap-2 grid-cols-5 bg-white p-3 rounded-lg">
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
                  message_language_options[
                    String(patient.whatsapp_preferred_language || "en")
                  ] || String(patient.whatsapp_preferred_language)
                }
              />
              <Info
                title="SMS Preference"
                value={String(patient.sms_consent_status || "not_recorded")
                  .replaceAll("_", " ")
                  .replace(/\b\w/g, (letter) => letter.toUpperCase())}
              />
              <Info
                title="SMS Preference Source"
                value={String(patient.sms_consent_source || "-")
                  .replaceAll("_", " ")
                  .replace(/\b\w/g, (letter) => letter.toUpperCase())}
              />
              <Info
                title="SMS Language"
                value={
                  sms_language_options[
                    String(patient.sms_preferred_language || "en")
                  ] || String(patient.sms_preferred_language)
                }
              />
            </div>
        )}
        {activeSection === "membership" && canReadMembership && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
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
                  className="save-button"
                  onClick={async () => {
                    const ok = await onCreateFamilyRelationship?.({
                      relatedPatientId: familyPatientId.trim(),
                      relationship: familyRelationship.trim() || "family",
                      notes: familyNotes.trim(),
                    });
                    if (ok) {
                      resetFamilyForm();
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

      {/* {activeSection === "home" && (
        <PatientOverviewDashboard
          summary={summary}
          vitals={vitals}
          bmiReadings={bmiReadings}
          vitalsLoading={vitalsLoading}
          createVital={createVital}
          savingVital={savingVital}
          consultations={consultations}
          labServiceRows={labServiceRows}
          medicineRows={medicineRows}
          patientInvoices={patientInvoices}
          totalBilled={totalBilled}
          totalDue={totalDue}
          visibleMembership={visibleMembership}
          freeConsultationsUsed={freeConsultationsUsed}
          freeConsultationsAllocated={freeConsultationsAllocated}
          freeLabUsed={freeLabUsed}
          freeLabAllocated={freeLabAllocated}
          freeMedicineUsed={freeMedicineUsed}
          freeMedicineAllocated={freeMedicineAllocated}
          patientIntelligence={patientIntelligence}
          onOpenConsultation={openConsultation}
          onOpenInvoice={openInvoice}
        />
      )} */}

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
        // <DetailSection
        //   title="Patient Tracking"
        //   description="Monthly medicine refill and lab test follow-up dates."
        //   count={canUpdatePatientTracking ? 3 : patientCommunications.length}
        // >
        <div className="grid gap-3">
          {canUpdatePatientTracking ? (
            monthlyTrackingCards
          ) : (
            <Empty text="You do not have permission to update patient tracking." />
          )}
          <div className="rounded-lg p-2 bg-white p-3">
            <h5 className="text-sm font-black text-slate-950">
              WhatsApp Message History
            </h5>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              All WhatsApp templates sent or queued for this patient.
            </p>
            <div className="tablw-wrapper-width mt-3">
              <DataTable
                columns={communicationColumns}
                data={patientCommunications}
                emptyMessage="No WhatsApp messages found."
                emptyDescription="Invoice, membership, reminder and care messages for this patient will show here."
                emptyIcon={MessageCircle}
                minBodyHeight={`${patientCommunications.length > 0 ? "" : "220px"}`}
                className="table-width"
                paginate
                pageSize={10}
              />
            </div>
          </div>
        </div>
        // </DetailSection>
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
        <DataTable
          columns={consultationColumns}
          data={consultations}
          emptyMessage="No consultation records found."
          emptyDescription="Consultations recorded for this patient will show up here."
          emptyIcon={Stethoscope}
          minBodyHeight={`${consultations.length > 0 ? "" : "220px"}`}
          onRowClick={openConsultation}
        />
      )}

      {activeSection === "consultations" && physioCases.length > 0 && (
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
      )}

      {activeSection === "consultations" && patientIpAdmissions.length > 0 && (
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
      )}

      {activeSection === "membership" &&
        canReadMembership &&
        resolvedMembershipEnrollments.length > 0 && (
          <div>
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
          </div>
        )}

      {activeSection === "billing" && (
        <div>
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
            minBodyHeight={`${patientInvoices.length > 0 ? "" : "220px"}`}
            onRowClick={openInvoice}
          />
        </div>
      )}

      <ActivityLog
        resourceType="patient"
        resourceId={patient?.id}
        apiSession={apiSession}
      />
    </div>
  );
}
