"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceController } from "@/features/shell/WorkspaceContext";
import { BrandLoader } from "@/app/components/common/loader/BrandLoader";

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

  return <BrandLoader />;
}
