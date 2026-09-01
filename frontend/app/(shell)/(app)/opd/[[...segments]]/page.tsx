"use client";

import { useParams, useSearchParams } from "next/navigation";

import { OPDWorkspace } from "@/features/opd/OPDWorkspace";
import { opdSectionFromSegment } from "@/features/opd/routing";
import { useShellChrome } from "@/features/shell/AppShell";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

export default function OPDWorkspacePage() {
  const workspace = useWorkspace();
  const { navigatePage } = useShellChrome();
  const params = useParams();
  const searchParams = useSearchParams();
  const segment = ((params?.segments as string[] | undefined) || [])[0];
  const section = opdSectionFromSegment(segment);

  return (
    <OPDWorkspace
      {...workspace}
      section={section}
      appointmentId={searchParams.get("appointment") || ""}
      setActive={navigatePage}
    />
  );
}
