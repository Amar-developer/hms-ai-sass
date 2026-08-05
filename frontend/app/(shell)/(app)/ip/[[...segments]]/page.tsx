"use client";

import { useParams } from "next/navigation";
import { IPAdmission } from "@/features/ip/IPAdmission";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

export default function IpAdmissionPage() {
  const ctx = useWorkspace();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const [first] = segments;
  const view =
    first === "convert" ? "convert" : first === "direct" ? "direct" : "list";
  const selectedId = view === "list" ? first || "" : "";
  return <IPAdmission {...ctx} view={view} selectedId={selectedId} />;
}
