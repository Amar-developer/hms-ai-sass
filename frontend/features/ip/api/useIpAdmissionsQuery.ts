"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiSession } from "@/lib/api";
import * as ipApi from "./ip.api";

export function ipAdmissionsQueryKey(apiSession: ApiSession | null | undefined) {
  return ["ip-admissions", apiSession?.tenantId] as const;
}

/**
 * The shared IP admission list, keyed by tenant. Every module that needs
 * admissions (IP Admission, Physiotherapy, Reports) reads through this same
 * hook/query key, so TanStack Query's cache is the single shared source —
 * updating it here (via `refetch`/`setLocal`) is visible to every other
 * component using the hook without any extra sync plumbing.
 */
export function useIpAdmissionsQuery(apiSession: ApiSession | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ipAdmissionsQueryKey(apiSession);

  const query = useQuery<any[]>({
    queryKey,
    queryFn: () => ipApi.listAdmissions(apiSession as ApiSession),
    enabled: Boolean(apiSession),
  });

  async function refetch() {
    if (!apiSession) return [];
    const rows = await ipApi.listAdmissions(apiSession);
    queryClient.setQueryData(queryKey, rows);
    return rows;
  }

  function setLocal(rows: any[]) {
    queryClient.setQueryData(queryKey, rows);
  }

  return {
    ipAdmissions: query.data ?? [],
    isLoading: query.isLoading,
    refetch,
    setLocal,
  };
}
