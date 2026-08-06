"use client";

import type { ReactNode } from "react";
import { WorkspaceProvider } from "@/features/shell/WorkspaceContext";

export default function ShellLayout({ children }: { children: ReactNode }) {
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}
