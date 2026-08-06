"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Reports } from "@/features/reports/Reports";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";
import { reportSections } from "@/features/reports/constants";

const SECTION_IDS = reportSections.map(([id]) => id as string);

export default function ReportsPage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  const router = useRouter();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const raw = segments[0];
  const section = SECTION_IDS.includes(raw) ? raw : "metrix";

  useEffect(() => {
    if (!raw || !SECTION_IDS.includes(raw)) router.replace("/reports/metrix");
  }, [raw, router]);

  return <Reports {...ctx} section={section} setActive={navigatePage} />;
}
