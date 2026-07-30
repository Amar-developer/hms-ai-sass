"use client";

import { Scheduling } from "@/features/scheduling/Scheduling";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

export default function SchedulingPage() {
  const ctx = useWorkspace();
  return <Scheduling {...ctx} />;
}
