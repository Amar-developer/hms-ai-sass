"use client";

import { useParams } from "next/navigation";
import { Pharmacy } from "@/features/pharmacy/Pharmacy";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { isNewSegment } from "@/lib/routeSlugs";

export default function PharmacyPage() {
  const ctx = useWorkspace();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const view = isNewSegment(segments[0]) ? "create" : "list";
  return <Pharmacy {...ctx} view={view} />;
}
