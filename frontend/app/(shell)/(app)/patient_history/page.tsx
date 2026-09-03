"use client";

import { PatientHistory } from "@/features/patientHistory/PatientHistory";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";

export default function PatientHistoryPage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  return <PatientHistory {...ctx} setActive={navigatePage} />;
}
