"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type ApiSession } from "@/lib/api";

export function practitionersQueryKey(apiSession: ApiSession | null | undefined) {
  return ["practitioners", apiSession?.tenantId] as const;
}

export function fetchPractitioners(apiSession: ApiSession) {
  return apiFetch<any[]>("/practitioners", apiSession);
}

/**
 * The shared practitioner list, keyed by tenant. Doctors owns full CRUD and
 * fetches its own richer bootstrap (branches/departments/users/fee-rules)
 * separately, but patches this same query's cache after a mutation so
 * Dashboard, DoctorConsultation, and Reports — which only need the plain
 * list — see the update without a full shell reload.
 */
export function usePractitionersQuery(apiSession: ApiSession | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = practitionersQueryKey(apiSession);

  const query = useQuery<any[]>({
    queryKey,
    queryFn: () => fetchPractitioners(apiSession as ApiSession),
    enabled: Boolean(apiSession),
    staleTime: 60_000,
  });

  function setLocal(updater: any[] | ((previous: any[]) => any[])) {
    queryClient.setQueryData(queryKey, (previous: any[] = []) =>
      typeof updater === "function" ? (updater as (previous: any[]) => any[])(previous) : updater,
    );
  }

  return {
    livePractitioners: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    setLocal,
  };
}
