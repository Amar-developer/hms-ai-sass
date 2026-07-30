"use client";

import { PatientSubscriptions } from "@/features/patient_subscriptions/PatientSubscriptions";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

export default function SubscriptionsPage() {
  const ctx = useWorkspace();
  return <PatientSubscriptions {...ctx} />;
}
