"use client";

import { TenantAdmin } from "@/features/admin/TenantAdmin";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";

export default function AdminPage() {
  const ctx = useWorkspace();
  const { tenantAdminSection, setTenantAdminSection } = useShellChrome();
  return <TenantAdmin {...ctx} section={tenantAdminSection} setSection={setTenantAdminSection} />;
}
