"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { SuperAdminDashboard } from "@/features/superAdmin/SuperAdminDashboard";
import { useShellChrome } from "@/features/shell/AppShell";
import { parseSuperAdminSegments } from "@/features/superAdmin/routing";

export default function SuperAdminPage() {
  const { apiSession, switchTenant, setSuperAdminSection } = useShellChrome();
  const router = useRouter();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const { section, id } = parseSuperAdminSegments(segments);

  useEffect(() => {
    if (segments.length === 0) router.replace("/superadmin/overview");
  }, [segments.length, router]);

  return (
    <SuperAdminDashboard
      apiSession={apiSession}
      switchTenant={switchTenant}
      section={section}
      setSection={setSuperAdminSection}
      selectedDetailId={id}
    />
  );
}
