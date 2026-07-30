"use client";

import { HomeCare } from "@/features/home-care/HomeCare";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";

export default function HomeCarePage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  return <HomeCare {...ctx} setActive={navigatePage} />;
}
