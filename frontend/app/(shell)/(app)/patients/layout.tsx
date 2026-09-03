"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { Patient } from "@/features/patients/Patient";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";
import { isNewSegment, isEditSegment } from "@/lib/routeSlugs";
import {
  PATIENT_SECTION_IDS,
  type PatientSectionId,
} from "@/features/patients/types";
const DEFAULT_PATIENT_SECTION: PatientSectionId = "home";

// Renders the actual patient workspace here instead of in page.tsx. Layouts
// persist across navigations to sibling routes (only their params update);
// pages are torn down and recreated on every navigation. Tab switching
// inside PatientFlow navigates between /patients/{id}/{section} routes, so
// keeping <Patient> in page.tsx meant every tab click fully remounted it —
// resetting all its local state and re-running every data fetch from
// scratch, which is what caused the empty-table/loading-overlay flicker.
// Rendering it from the layout instead means a tab click only changes the
// params useParams() reports; <Patient> re-renders in place rather than
// unmounting, so its cached data (see usePatientDetailData) stays on screen.
export default function PatientsLayout({ children }: { children: ReactNode }) {
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
  const section = PATIENT_SECTION_IDS.includes(second as PatientSectionId)
    ? (second as PatientSectionId)
    : DEFAULT_PATIENT_SECTION;
  return (
    <>
      <Patient
        {...ctx}
        setActive={navigatePage}
        view={view}
        selectedId={selectedId}
        section={section}
      />
      {children}
    </>
  );
}
