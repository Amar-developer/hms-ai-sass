"use client";

import { useParams } from "next/navigation";
import { Doctors } from "@/features/doctors/Doctors";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { isNewSegment, isEditSegment, isViewSegment } from "@/lib/routeSlugs";

export default function PractitionersPage() {
  const ctx = useWorkspace();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const [first, second] = segments;
  const view = isNewSegment(first)
    ? "create"
    : isEditSegment(second)
      ? "edit"
      : isViewSegment(second)
        ? "view"
        : "list";
  const selectedId = view === "edit" || view === "view" ? first : "";
  return <Doctors {...ctx} view={view} selectedId={selectedId} />;
}
