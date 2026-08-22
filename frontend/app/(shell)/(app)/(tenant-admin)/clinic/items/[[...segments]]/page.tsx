"use client";

import { useParams } from "next/navigation";
import { Items } from "@/features/items/Items";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { isNewSegment, isEditSegment } from "@/lib/routeSlugs";

export default function ItemsPage() {
  const ctx = useWorkspace();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const [first, second] = segments;
  const view = isNewSegment(second)
    ? "create"
    : isEditSegment(second)
      ? "edit"
      : "list";
  const itemType = view === "create" ? first : "medicine";
  const selectedId = view === "edit" ? first : "";
  return (
    <Items {...ctx} view={view} selectedId={selectedId} itemType={itemType} />
  );
}
