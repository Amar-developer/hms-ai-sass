"use client";

import { useParams, useSearchParams } from "next/navigation";

import { OPDWorkspace, type OPDSection } from "@/features/opd/OPDWorkspace";
import { useShellChrome } from "@/features/shell/AppShell";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

export default function OPDWorkspacePage() {
  const workspace = useWorkspace();
  const { navigatePage } = useShellChrome();
  const params = useParams();
  const searchParams = useSearchParams();
  const segment = ((params?.segments as string[] | undefined) || [])[0];
  const section: OPDSection =
    segment === "new"
      ? "new"
      : segment === "appointments"
        ? "appointments"
        : segment === "schedule"
          ? "schedule"
        : segment === "invoices"
            ? "invoices"
            : segment === "templates"
              ? "templates"
              : "consultation";

  return (
    <OPDWorkspace
      {...workspace}
      section={section}
      appointmentId={searchParams.get("appointment") || ""}
      setActive={navigatePage}
    />
  );
}
