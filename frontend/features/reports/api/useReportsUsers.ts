"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as reportsApi from "./reports.api";

type UseReportsUsersParams = {
  apiSession: ApiSession | null | undefined;
  refreshTick: number;
};

export function useReportsUsers({
  apiSession,
  refreshTick,
}: UseReportsUsersParams) {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    if (!apiSession?.tenantId) return;
    let cancelled = false;
    reportsApi
      .listUsers(apiSession)
      .then((rows) => {
        if (!cancelled) setUsers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [apiSession?.tenantId, refreshTick]);

  return { users };
}
