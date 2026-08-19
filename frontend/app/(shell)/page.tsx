"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceController } from "@/features/shell/WorkspaceContext";

export default function RootRedirect() {
  const router = useRouter();
  const { authenticated, initializing, shellProps } = useWorkspaceController();

  useEffect(() => {
    if (initializing) return;
    const restoredPath =
      shellProps.lastPath &&
      shellProps.lastPath.startsWith("/") &&
      !shellProps.lastPath.startsWith("//") &&
      !shellProps.lastPath.startsWith("/login")
        ? shellProps.lastPath
        : `/${shellProps.active || "dashboard"}`;
    router.replace(authenticated ? restoredPath : "/login");
  }, [
    authenticated,
    initializing,
    router,
    shellProps.active,
    shellProps.lastPath,
  ]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-white">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
    </div>
  );
}
