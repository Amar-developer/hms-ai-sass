"use client";

import { useParams } from "next/navigation";
import { Physiotherapy } from "@/features/physiotherapy/Physiotherapy";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

export default function PhysiotherapyPage() {
  const ctx = useWorkspace();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const [first] = segments;
  const view =
    first === "op" ? "op" : first === "ip" ? "ip" : first ? "detail" : "list";
  const selectedId = view === "detail" ? first : "";
  return <Physiotherapy {...ctx} view={view} selectedId={selectedId} />;
}
