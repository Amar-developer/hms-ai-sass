"use client";

import { Pharmacy } from "@/features/pharmacy/Pharmacy";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

export default function PharmacyPage() {
  const ctx = useWorkspace();
  return <Pharmacy {...ctx} />;
}
