"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type ApiSession } from "@/lib/api";
import type { QueryFilterRow } from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";

export function practitionersQueryKey(apiSession: ApiSession | null | undefined) {
  return ["practitioners", apiSession?.tenantId] as const;
}

export function fetchPractitioners(apiSession: ApiSession) {
  return apiFetch<any[]>("/practitioners", apiSession);
}

type PractitionerPageParams = {
  q?: string;
  branchId?: string;
  departmentId?: string;
  queryFilters?: QueryFilterRow[];
  sort?: SortState | null;
  limit: number;
  offset: number;
};

export function practitionersPageQueryKey(
  apiSession: ApiSession | null | undefined,
  params: PractitionerPageParams,
) {
  return ["practitioners", "page", apiSession?.tenantId, params] as const;
}

export function fetchPractitionerPage(
  apiSession: ApiSession,
  params: PractitionerPageParams,
) {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.branchId && params.branchId !== "all")
    search.set("branch_id", params.branchId);
  if (params.departmentId && params.departmentId !== "all")
    search.set("department_id", params.departmentId);
  if (params.queryFilters?.length)
    search.set("filters", JSON.stringify(params.queryFilters));
  if (params.sort) search.set("sort", JSON.stringify(params.sort));
  search.set("limit", String(params.limit));
  search.set("offset", String(params.offset));
  return apiFetch<any>(`/practitioners/page?${search.toString()}`, apiSession);
}

export function fetchPractitionerFilterOptions(apiSession: ApiSession) {
  return apiFetch<Record<string, { value: string; label: string }[]>>(
    "/practitioners/filter-options",
    apiSession,
  );
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

export function usePractitionerPageQuery(
  apiSession: ApiSession | null | undefined,
  params: PractitionerPageParams,
) {
  return useQuery<any>({
    queryKey: practitionersPageQueryKey(apiSession, params),
    queryFn: () => fetchPractitionerPage(apiSession as ApiSession, params),
    enabled: Boolean(apiSession),
    staleTime: 30_000,
  });
}

export function usePractitionerFilterOptionsQuery(
  apiSession: ApiSession | null | undefined,
) {
  return useQuery<Record<string, { value: string; label: string }[]>>({
    queryKey: ["practitioners", "filter-options", apiSession?.tenantId],
    queryFn: () => fetchPractitionerFilterOptions(apiSession as ApiSession),
    enabled: Boolean(apiSession),
    staleTime: 60_000,
  });
}
