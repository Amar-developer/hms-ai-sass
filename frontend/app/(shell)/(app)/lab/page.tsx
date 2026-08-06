"use client";

import { Lab } from "@/features/lab/Lab";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";

export default function LabPage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  return <Lab {...ctx} setActive={navigatePage} />;
}
