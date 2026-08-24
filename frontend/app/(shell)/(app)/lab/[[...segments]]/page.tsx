"use client";

import { useParams } from "next/navigation";
import { Lab } from "@/features/lab/Lab";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";
import { isNewSegment } from "@/lib/routeSlugs";

export default function LabPage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const view = isNewSegment(segments[0]) ? "create" : "list";
  return <Lab {...ctx} setActive={navigatePage} view={view} />;
}
