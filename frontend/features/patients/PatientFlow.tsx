"use client";

import { useTransition } from "react";
import { uploadAssetUrl } from "@/lib/api";
import { patientDisplayMobile } from "./helpers";
import {
  canCopyDatabaseIds,
  CopyIdButton,
} from "@/app/components/common/CopyIdButton";
import { Badge, Button } from "@/app/components/common/ui";
import { StatusTabsNav } from "@/app/components/common/StatusTabsNav";
import { PatientDetail } from "./components/PatientDetail";
import { PatientFlagBadges } from "./components/PatientFlagBadges";
import { PatientFlowProps, PatientSectionId } from "./types";
import { SECTION_TABS } from "./constants";

export function PatientFlow({
  activeSection,
  onSectionChange,
  patient,
  membershipEnrollments = [],
  membershipPlans = [],
  apiSession,
  patientIpAdmissions = [],
  loading,
  onBack,
  onEdit,
  onUploadPhoto,
  ...detailProps
}: PatientFlowProps) {
  const [isSectionPending, startSectionTransition] = useTransition();
  const permissionKeys: string[] = apiSession?.user?.permissions || [];
  const canEditPatient = Boolean(
    apiSession?.user?.is_super_admin ||
    permissionKeys.includes("*") ||
    permissionKeys.includes("patients.edit"),
  );
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  const isAdmitted = (patientIpAdmissions || []).some(
    (a: any) => a.status === "admitted" || a.status === "active",
  );
  const activeMembershipPlanName =
    patient?.subscription_plan_name ||
    (membershipEnrollments || []).find((row: any) => row.status === "active")
      ?.plan?.name ||
    (() => {
      const activeEnrollment = (membershipEnrollments || []).find(
        (row: any) => row.status === "active",
      );
      return activeEnrollment
        ? (membershipPlans || []).find(
            (plan: any) => plan.id === activeEnrollment.plan_id,
          )?.name
        : "";
    })();

  return (
    <div className="grid gap-2">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 px-4 py-3 md:flex-row md:items-start ">
          <div className="flex items-start gap-4 ">
            <label className="group relative block h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              {patient?.photo_url ? (
                <img
                  src={uploadAssetUrl(patient.photo_url)}
                  alt="Patient"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xl font-bold text-slate-400">
                  {patient?.full_name?.[0]?.toUpperCase() || "P"}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-slate-900/75 px-1 py-1 text-center text-[9px] font-bold text-white opacity-0 transition group-hover:opacity-100">
                {patient?.photo_url ? "Change" : "Upload"}
              </span>
              {canEditPatient && onUploadPhoto && (
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
              )}
            </label>
            <div className="min-w-0 ">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-slate-950">
                  {patient?.full_name || "Patient Workspace"}
                </h2>
                {patient?.id && (
                  <CopyIdButton
                    value={patient.id}
                    label="Patient ID"
                    allowed={canCopyIds}
                  />
                )}
                {patient && (
                  <Badge
                    tone={isAdmitted ? "amber" : "green"}
                    className="normal-label"
                  >
                    {isAdmitted ? "Admitted" : "Outpatient"}
                  </Badge>
                )}
                {activeMembershipPlanName && (
                  <Badge
                    tone="purple"
                    className="normal-label max-w-[180px] truncate"
                  >
                    {activeMembershipPlanName}
                  </Badge>
                )}
                <PatientFlagBadges patient={patient} maxVisible={3} />
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {patient ? (
                  <>
                    {patient.patient_number} ·{" "}
                    {patientDisplayMobile(patient) || "No mobile"}
                  </>
                ) : (
                  "Membership, family, consultations, labs, medicines and billing details in one place"
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="close-button font-bold"
              >
                Back to Patients
              </button>
            )}
            {canEditPatient && onEdit && (
              <Button onClick={onEdit} className="close-button">
                Edit Patient
              </Button>
            )}
          </div>
        </div>

        <StatusTabsNav
          ariaLabel="Patient workspace sections"
          activeId={activeSection}
          onSelect={(id) =>
            startSectionTransition(() =>
              onSectionChange(id as PatientSectionId),
            )
          }
          tabs={SECTION_TABS}
        />
      </section>

      <div
        role="tabpanel"
        aria-label={SECTION_TABS.find((tab) => tab.id === activeSection)?.label}
      >
        <PatientDetail
          {...detailProps}
          patient={patient}
          membershipEnrollments={membershipEnrollments}
          membershipPlans={membershipPlans}
          apiSession={apiSession}
          patientIpAdmissions={patientIpAdmissions}
          loading={loading}
          onBack={onBack}
          onEdit={onEdit}
          onUploadPhoto={onUploadPhoto}
          activeSection={activeSection}
          sectionLoading={isSectionPending}
        />
      </div>
    </div>
  );
}

export default PatientFlow;
