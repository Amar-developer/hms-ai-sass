"use client";

import { DoctorConsultation } from "@/features/consulation/DoctorConsultation";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";

export default function ConsultationWorkflowPage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  // `view` decides which half of DoctorConsultation renders, and it defaults to
  // "dashboard". Without "workspace" here the `if (view === "workspace")` branch
  // — the whole Consultation Workspace — is unreachable, so opening a patient
  // from the token queue lands on the appointment list instead. `setActive` is
  // how the component navigates between modules; without it those calls no-op.
  return <DoctorConsultation {...ctx} view="workspace" setActive={navigatePage} />;
}
