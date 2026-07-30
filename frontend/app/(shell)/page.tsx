"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceController } from "@/features/shell/WorkspaceContext";

export default function RootRedirect() {
  const router = useRouter();
  const { authenticated, initializing, shellProps } = useWorkspaceController();

  useEffect(() => {
    if (initializing) return;
    router.replace(authenticated ? `/${shellProps.active || "dashboard"}` : "/login");
  }, [authenticated, initializing, shellProps.active, router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-white">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
    </div>
  );
}
