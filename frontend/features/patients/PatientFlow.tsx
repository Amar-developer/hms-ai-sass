"use client";

import type { ComponentType } from "react";
import {
  CreditCard,
  FlaskConical,
  Home,
  Pill,
  ReceiptText,
  Stethoscope,
  NotepadText,
  Activity
} from "lucide-react";
import { uploadAssetUrl } from "@/lib/api";
import { patientDisplayMobile } from "./helpers";
import {
  canCopyDatabaseIds,
  CopyIdButton,
} from "@/app/components/common/CopyIdButton";
import { Badge, Button } from "@/app/components/common/ui";
import { PatientDetail } from "./components/PatientDetail";
import { PatientFlagBadges } from "./components/PatientFlagBadges";

export type PatientSectionId =
  | "home"
  | "membership"
  | "family"
  | "consultations"
  | "labs"
  | "medicines"
  | "billing"
  | "patient_tracking"
  | "diagonisis"

export const PATIENT_SECTION_IDS: PatientSectionId[] = [
  "home",
  "membership",
  "family",
  "consultations",
  "labs",
  "medicines",
  "billing",
  "patient_tracking",
  "diagonisis"
];

type SectionTab = {
  id: PatientSectionId;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

// Each tab renders a slice
// of PatientDetail's content gated on `activeSection` (see PatientDetail.tsx)
// rather than a separate component per tab, so every tab shares the same
// data-fetch/permission logic that already existed on the single-page view.
export const SECTION_TABS: SectionTab[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "consultations", label: "Consultations", icon: Stethoscope },
  { id: "labs", label: "Lab & Services", icon: FlaskConical },
  { id: "medicines", label: "Medicines", icon: Pill },
  { id: "billing", label: "Billing", icon: ReceiptText },
  { id: "membership", label: "Membership & Family", icon: CreditCard },
  { id: "patient_tracking", label: "Patient Tracking", icon:  NotepadText},
  { id: "diagonisis", label: "Diagnosis", icon: Activity },
];

type PatientFlowProps = {
  activeSection: PatientSectionId;
  onSectionChange: (section: PatientSectionId) => void;
  [key: string]: any;
};

/**
 * Route-driven tab shell for the Patient detail workspace — mirrors
 * OPDWorkspace.tsx's header + horizontal tab-nav pattern. Tabs are real
 * routes (`/patients/{id}/{section}`, wired in patients/[[...segments]]/
 * page.tsx), not local component state, so each tab is bookmarkable and
 * survives back/forward exactly like OPD's tabs.
 */
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
    (membershipEnrollments || []).find((row: any) => row.status === "active")?.plan
      ?.name ||
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
    <div className="grid gap-4 ">
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
                  <Badge tone="purple" className="normal-label max-w-[180px] truncate">
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

        <nav
          className="scrollbar-hidden flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 py-1.5"
          aria-label="Patient workspace sections"
        >
          {SECTION_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeSection;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSectionChange(tab.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition-colors ${
                  isActive
                    ? "bg-brand text-brand-fg"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
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
        />
      </div>
    </div>
  );
}

export default PatientFlow;
