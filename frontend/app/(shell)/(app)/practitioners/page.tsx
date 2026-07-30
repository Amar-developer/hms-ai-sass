"use client";

import { Doctors } from "@/features/doctors/Doctors";
import { useWorkspace } from "@/features/shell/WorkspaceContext";

export default function PractitionersPage() {
  const ctx = useWorkspace();
  return <Doctors {...ctx} />;
}
