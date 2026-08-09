"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AppErrorBoundary } from "@/features/shared/AppErrorBoundary";
import { AppShell } from "@/features/shell/AppShell";
import { useWorkspaceController } from "@/features/shell/WorkspaceContext";

export default function AuthenticatedAppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { authenticated, initializing, shellProps } = useWorkspaceController();
  useEffect(() => {
    if (!initializing && !authenticated) {
      router.replace("/login");
    }
  }, [authenticated, initializing, router]);

  if (initializing || !authenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      </div>
    );
  }

  return (
    <AppErrorBoundary>
      <AppShell {...shellProps}>{children}</AppShell>
    </AppErrorBoundary>
  );
}
