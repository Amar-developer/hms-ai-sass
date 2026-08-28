"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { AppErrorBoundary } from "@/features/shared/AppErrorBoundary";
import { useWorkspaceController } from "@/features/shell/WorkspaceContext";
import { BrandLoader } from "@/app/components/common/loader/BrandLoader";

export default function LoginPage() {
  const router = useRouter();
  const { authenticated, initializing, authScreenProps, shellProps } = useWorkspaceController();

  useEffect(() => {
    if (!initializing && authenticated) {
      router.replace(`/${shellProps.active || "dashboard"}`);
    }
  }, [authenticated, initializing, shellProps.active, router]);

  if (initializing || authenticated) {
    return <BrandLoader />;
  }

  return (
    <AppErrorBoundary>
      <AuthScreen {...authScreenProps} />
    </AppErrorBoundary>
  );
}
