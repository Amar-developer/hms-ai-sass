"use client";

import { Billing } from "@/features/billing/Billing";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

export default function BillingPage() {
  const ctx = useWorkspace();
  return <Billing {...ctx} />;
}
