"use client";

import { useParams } from "next/navigation";
import { Scheduling } from "@/features/scheduling/Scheduling";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

export default function SchedulingPage() {
  const ctx = useWorkspace();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const [first, second] = segments;
  const view = first === "new" ? "create" : second === "edit" ? "edit" : "list";
  const selectedId = view === "edit" ? first : "";
  return <Scheduling {...ctx} view={view} selectedId={selectedId} />;
}
