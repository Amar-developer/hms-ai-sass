"use client";

import { DoctorConsultation } from "@/features/consulation/DoctorConsultation";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";

export default function DoctorWorkspacePage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  return <DoctorConsultation {...ctx} view="dashboard" setActive={navigatePage} />;
}
