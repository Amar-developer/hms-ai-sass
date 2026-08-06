"use client";

import { TokenQueue } from "@/features/queue/TokenQueue";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";

export default function QueuePage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  return <TokenQueue {...ctx} setActive={navigatePage} />;
}
