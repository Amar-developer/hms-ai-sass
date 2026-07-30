"use client";

import { Dashboard } from "@/features/dashboard/Dashboard";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";

export default function DashboardPage() {
  const ctx = useWorkspace();
  const { liveSummary, navigatePage, nav, enabled } = useShellChrome();
  return <Dashboard {...ctx} liveSummary={liveSummary} setActive={navigatePage} nav={nav} enabled={enabled} />;
}
