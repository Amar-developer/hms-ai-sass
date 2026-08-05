"use client";

import { useParams } from "next/navigation";
import { HomeCare } from "@/features/home-care/HomeCare";
import { useWorkspace } from "@/features/shell/WorkspaceContext";
import { useShellChrome } from "@/features/shell/AppShell";

export default function HomeCarePage() {
  const ctx = useWorkspace();
  const { navigatePage } = useShellChrome();
  const params = useParams();
  const segments = (params?.segments as string[] | undefined) || [];
  const [first, second] = segments;
  const view =
    first === "new"
      ? "create"
      : first
        ? second === "edit"
          ? "edit"
          : second === "invoice"
            ? "invoice"
            : "view"
        : "list";
  const selectedId = first && first !== "new" ? first : "";
  return (
    <HomeCare
      {...ctx}
      setActive={navigatePage}
      view={view}
      selectedId={selectedId}
    />
  );
}
