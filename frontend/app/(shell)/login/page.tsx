"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { AppErrorBoundary } from "@/features/shared/AppErrorBoundary";
import { useWorkspaceController } from "@/features/shell/WorkspaceContext";

export default function LoginPage() {
  const router = useRouter();
  const { authenticated, initializing, authScreenProps, shellProps } = useWorkspaceController();

  useEffect(() => {
    if (!initializing && authenticated) {
      router.replace(`/${shellProps.active || "dashboard"}`);
    }
  }, [authenticated, initializing, shellProps.active, router]);

  if (initializing || authenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      </div>
    );
  }

  return (
    <AppErrorBoundary>
      <AuthScreen {...authScreenProps} />
    </AppErrorBoundary>
  );
}
