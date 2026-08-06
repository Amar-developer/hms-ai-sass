"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import * as reportsApi from "./reports.api";

type UseHomeCareBookingsParams = {
  apiSession: ApiSession | null | undefined;
  branchId?: string;
  refreshTick: number;
};

export function useHomeCareBookings({
  apiSession,
  branchId,
  refreshTick,
}: UseHomeCareBookingsParams) {
  const [homeCareBookings, setHomeCareBookings] = useState<any[]>([]);
  const [homeCareBookingsLoading, setHomeCareBookingsLoading] =
    useState(false);

  useEffect(() => {
    if (!apiSession?.tenantId) return;
    let cancelled = false;
    async function loadHomeCareBookings() {
      setHomeCareBookingsLoading(true);
      try {
        const rows = await reportsApi
          .listHomeCareBookings(apiSession as ApiSession, branchId)
          .catch(() => []);
        if (!cancelled) setHomeCareBookings(Array.isArray(rows) ? rows : []);
      } finally {
        if (!cancelled) setHomeCareBookingsLoading(false);
      }
    }
    loadHomeCareBookings();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.tenantId, branchId, refreshTick]);

  return { homeCareBookings, homeCareBookingsLoading };
}
