"use client";

import { Reports } from "@/features/reports/Reports";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";

export default function ReportsPage() {
  const ctx = useWorkspace();
  const { reportsSection, navigatePage } = useShellChrome();
  return <Reports {...ctx} section={reportsSection} setActive={navigatePage} />;
}
