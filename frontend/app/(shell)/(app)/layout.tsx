"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AppErrorBoundary } from "@/features/shared/AppErrorBoundary";
import { AppShell } from "@/features/shell/AppShell";
import { useWorkspaceController } from "@/features/shell/WorkspaceContext";
import {
  BRAND_LOADER_CYCLE_MS,
  BrandLoader,
} from "@/app/components/common/loader/BrandLoader";

export default function AuthenticatedAppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { authenticated, initializing, shellProps } = useWorkspaceController();
  const [loaderCycleComplete, setLoaderCycleComplete] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setLoaderCycleComplete(true),
      BRAND_LOADER_CYCLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!initializing && !authenticated) {
      router.replace("/login");
    }
  }, [authenticated, initializing, router]);

  if (initializing || !authenticated || !loaderCycleComplete) {
    return <BrandLoader />;
  }

  return (
    <AppErrorBoundary>
      <AppShell {...shellProps}>{children}</AppShell>
    </AppErrorBoundary>
  );
}
