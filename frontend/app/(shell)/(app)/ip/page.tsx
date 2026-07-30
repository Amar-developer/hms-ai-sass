"use client";

import { IPAdmission } from "@/features/ip/IPAdmission";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

export default function IpAdmissionPage() {
  const ctx = useWorkspace();
  return <IPAdmission {...ctx} />;
}
