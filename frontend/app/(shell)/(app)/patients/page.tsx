"use client";

import { Patient } from "@/features/patients/Patient";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";

export default function PatientsPage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  return <Patient {...ctx} setActive={navigatePage} />;
}
