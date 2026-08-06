"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAppController } from "./useAppController";

type ControllerValue = ReturnType<typeof useAppController>;

const ControllerContext = createContext<ControllerValue | null>(null);

/**
 * Mounts the single `useAppController()` instance for the whole app (session,
 * workspace, live-data preload) and shares it via context. Must wrap `/`,
 * `/login`, and every authenticated module route so none of them re-invoke
 * the controller and re-trigger its login/session-restore side effects.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const controller = useAppController();
  return (
    <ControllerContext.Provider value={controller}>
      {children}
    </ControllerContext.Provider>
  );
}

export function useWorkspaceController(): ControllerValue {
  const value = useContext(ControllerContext);
  if (!value) {
    throw new Error("useWorkspaceController must be used within a WorkspaceProvider");
  }
  return value;
}

/** The session/branch/live-data blob every module route reads its data from. */
export function useWorkspace() {
  return useWorkspaceController().shellProps.ctx;
}
