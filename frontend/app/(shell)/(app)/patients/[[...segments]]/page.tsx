"use client";

import { useParams } from "next/navigation";
import { Patient } from "@/features/patients/Patient";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";

export default function PatientsPage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const [first, second] = segments;
  const view =
    first === "new" ? "create" : first ? (second === "edit" ? "edit" : "detail") : "list";
  const selectedId = first && first !== "new" ? first : "";
  return (
    <Patient
      {...ctx}
      setActive={navigatePage}
      view={view}
      selectedId={selectedId}
    />
  );
}
