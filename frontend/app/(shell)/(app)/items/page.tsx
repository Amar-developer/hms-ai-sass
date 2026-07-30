"use client";

import { Items } from "@/features/items/Items";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

export default function ItemsPage() {
  const ctx = useWorkspace();
  return <Items {...ctx} />;
}
