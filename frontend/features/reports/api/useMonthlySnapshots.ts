"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as reportsApi from "./reports.api";

type UseMonthlySnapshotsParams = {
  apiSession: ApiSession | null | undefined;
  branchId?: string;
  refreshTick: number;
};

/**
 * Closed-month income snapshots (frozen at month end). Branch-scoped to
 * match the live dashboard's branch filter; no branch = all-branches
 * aggregate.
 */
export function useMonthlySnapshots({
  apiSession,
  branchId,
  refreshTick,
}: UseMonthlySnapshotsParams) {
  const [monthlySnapshots, setMonthlySnapshots] = useState<any[]>([]);

  useEffect(() => {
    if (!apiSession?.tenantId) {
      setMonthlySnapshots([]);
      return;
    }
    let cancelled = false;
    reportsApi
      .listMonthlySnapshots(apiSession, branchId)
      .then((rows: any) => {
        if (!cancelled) setMonthlySnapshots(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setMonthlySnapshots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [apiSession?.tenantId, branchId, refreshTick]);

  return { monthlySnapshots };
}
