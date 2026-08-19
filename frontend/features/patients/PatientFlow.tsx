"use client";

import type { ComponentType } from "react";
import {
  ClipboardList,
  CreditCard,
  FlaskConical,
  Home,
  Pill,
  ReceiptText,
  Stethoscope,
  Users,
} from "lucide-react";
import { PatientDetail } from "./components/PatientDetail";

export type PatientSectionId =
  | "home"
  | "membership"
  | "family"
  | "consultations"
  | "labs"
  | "medicines"
  | "billing";

export const PATIENT_SECTION_IDS: PatientSectionId[] = [
  "home",
  "membership",
  "family",
  "consultations",
  "labs",
  "medicines",
  "billing",
];

type SectionTab = {
  id: PatientSectionId;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

// Order mirrors the product spec: Home -> Membership -> Family ->
// Consultations -> Labs -> Medicines -> Billing. Each tab renders a slice
// of PatientDetail's content gated on `activeSection` (see PatientDetail.tsx)
// rather than a separate component per tab, so every tab shares the same
// data-fetch/permission logic that already existed on the single-page view.
const SECTION_TABS: SectionTab[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "membership", label: "Membership", icon: CreditCard },
  { id: "family", label: "Family", icon: Users },
  { id: "consultations", label: "Consultations", icon: Stethoscope },
  { id: "labs", label: "Lab & Services", icon: FlaskConical },
  { id: "medicines", label: "Medicines", icon: Pill },
  { id: "billing", label: "Billing", icon: ReceiptText },
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
  ...detailProps
}: PatientFlowProps) {
  return (
    <div className="grid gap-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-brand">
            <ClipboardList className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-950">
              Patient Workspace
            </h2>
            <p className="text-xs font-medium text-slate-500">
              Membership, family, consultations, labs, medicines and billing details in one place
            </p>
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
        <PatientDetail {...detailProps} activeSection={activeSection} />
      </div>
    </div>
  );
}

export default PatientFlow;
