"use client";

import { useEffect, useState } from "react";
import type { ApiSession } from "@/lib/api";
import { mergeServices, serviceRowsFromResponse } from "../helpers";
import * as homeCareApi from "./homecare.api";

type UseHomeCareDataParams = {
  apiSession: ApiSession | null | undefined;
  branchId?: string;
};

/**
 * Owns the branch-scoped home care lookups: the service catalog, bookings,
 * and active staff. Exposes `load` so callers (refresh button, post-mutation
 * reloads) can re-fetch all three together, matching the original combined
 * load behavior.
 */
export function useHomeCareData({ apiSession, branchId }: UseHomeCareDataParams) {
  const [services, setServices] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  // Starts true: on mount there's a render before the load effect has run,
  // where loading=false would look identical to "finished, found nothing"
  // to anything gating a not-found redirect on it.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [serviceLoadError, setServiceLoadError] = useState("");

  async function load() {
    if (!apiSession) return;
    setError("");
    setServiceLoadError("");
    setLoading(true);
    try {
      const serviceRows = mergeServices(
        await homeCareApi
          .listServices(apiSession)
          .then(serviceRowsFromResponse)
          .catch((err: any) => {
            setServiceLoadError(err.message || "Unable to load services.");
            return [];
          }),
      );
      setServices(serviceRows);
      const [bookingRows, staffRows] = await Promise.all([
        homeCareApi
          .listBookings(apiSession, branchId as string)
          .catch((err: any) => {
            setError(err.message || "Unable to load home care bookings.");
            return [];
          }),
        homeCareApi.listActiveUsers(apiSession).catch(() => []),
      ]);
      setBookings(bookingRows);
      setStaff(staffRows.filter((user: any) => user.is_active !== false));
    } catch (err: any) {
      setError(err.message || "Unable to load home care bookings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [apiSession?.tenantId, branchId]);

  return {
    services,
    bookings,
    staff,
    loading,
    dataError: error,
    serviceLoadError,
    load,
  };
}
