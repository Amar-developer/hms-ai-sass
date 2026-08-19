"use client";

import { useParams } from "next/navigation";
import { Patient } from "@/features/patients/Patient";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";
import { isNewSegment, isEditSegment } from "@/lib/routeSlugs";
import { PATIENT_SECTION_IDS, type PatientSectionId } from "@/features/patients/PatientFlow";

const DEFAULT_PATIENT_SECTION: PatientSectionId = "home";

export default function PatientsPage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const [first, second] = segments;
  const view = isNewSegment(first)
    ? "create"
    : first
      ? isEditSegment(second)
        ? "edit"
        : "detail"
      : "list";
  const selectedId = first && !isNewSegment(first) ? first : "";
  // /patients/{id}/{section} — same segment slot "edit" uses, so an edit
  // link and a tab link are disambiguated purely by isEditSegment above.
  const section = PATIENT_SECTION_IDS.includes(second as PatientSectionId)
    ? (second as PatientSectionId)
    : DEFAULT_PATIENT_SECTION;
  return (
    <Patient
      {...ctx}
      setActive={navigatePage}
      view={view}
      selectedId={selectedId}
      section={section}
    />
  );
}
