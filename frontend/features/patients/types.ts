import { ComponentType } from "react";

export type PatientSectionId =
  | "overview"
  | "home"
  | "membership"
  | "family"
  | "consultations"
  | "billing"
  | "patient_tracking"

export const PATIENT_SECTION_IDS: PatientSectionId[] = [
  "home",
  "membership",
  "family",
  "consultations",
  "billing",
  "patient_tracking",
];

export type SectionTab = {
  id: PatientSectionId;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export type PatientFlowProps = {
  activeSection: PatientSectionId;
  onSectionChange: (section: PatientSectionId) => void;
  [key: string]: any;
};
