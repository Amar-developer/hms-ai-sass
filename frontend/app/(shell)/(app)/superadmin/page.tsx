"use client";

import { SuperAdminDashboard } from "@/features/superAdmin/SuperAdminDashboard";
import { useShellChrome } from "@/features/shell/AppShell";

export default function SuperAdminPage() {
  const { apiSession, switchTenant, superAdminSection, setSuperAdminSection } = useShellChrome();
  return (
    <SuperAdminDashboard
      apiSession={apiSession}
      switchTenant={switchTenant}
      section={superAdminSection}
      setSection={setSuperAdminSection}
    />
  );
}
