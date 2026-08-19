"use client";

import { useParams } from "next/navigation";
import { HomeCare } from "@/features/home-care/HomeCare";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";
import { isNewSegment, isEditSegment } from "@/lib/routeSlugs";

export default function HomeCarePage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const [first, second] = segments;
  const view = isNewSegment(first)
    ? "create"
    : first
      ? isEditSegment(second)
        ? "edit"
        : second === "invoice"
          ? "invoice"
          : "view"
      : "list";
  const selectedId = first && !isNewSegment(first) ? first : "";
  return (
    <HomeCare
      {...ctx}
      setActive={navigatePage}
      view={view}
      selectedId={selectedId}
    />
  );
}
