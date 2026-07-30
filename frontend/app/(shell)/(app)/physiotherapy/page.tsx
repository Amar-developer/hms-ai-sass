"use client";

import { Physiotherapy } from "@/features/physiotherapy/Physiotherapy";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

export default function PhysiotherapyPage() {
  const ctx = useWorkspace();
  return <Physiotherapy {...ctx} />;
}
