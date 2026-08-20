import type { QueryClient } from "@tanstack/react-query";
import { apiFetch, type ApiSession } from "@/lib/api";
import type { QueryFilterRow } from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";

// Branches and departments are small tenant reference lists. They are shared
// across workspace screens and invalidated by their own mutations, so a short
// bounded freshness window avoids duplicate navigation-time requests without
// caching clinical or financial data.
export const TENANT_REFERENCE_STALE_MS = 5 * 60_000;

export function tenantBranchesQueryKey(tenantId?: string) {
  return ["tenant-reference", tenantId, "branches"] as const;
}

export function tenantDepartmentsQueryKey(tenantId?: string) {
  return ["tenant-reference", tenantId, "departments"] as const;
}

export function fetchTenantBranches(
  session: ApiSession,
  tenantId = session.tenantId,
) {
  return apiFetch<any[]>(`/tenants/${tenantId}/branches`, {
    ...session,
    tenantId,
  });
}

export function fetchTenantDepartments(
  session: ApiSession,
  tenantId = session.tenantId,
) {
  return apiFetch<any[]>(`/tenants/${tenantId}/departments`, {
    ...session,
    tenantId,
  });
}

type TenantReferencePageParams = {
  q?: string;
  queryFilters?: QueryFilterRow[];
  sort?: SortState | null;
  limit: number;
  offset: number;
};

function tenantReferencePageQuery(
  params: TenantReferencePageParams,
): URLSearchParams {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.queryFilters?.length)
    search.set("filters", JSON.stringify(params.queryFilters));
  if (params.sort) search.set("sort", JSON.stringify(params.sort));
  search.set("limit", String(params.limit));
  search.set("offset", String(params.offset));
  return search;
}

export function fetchTenantBranchPage(
  session: ApiSession,
  params: TenantReferencePageParams,
  tenantId = session.tenantId,
) {
  const search = tenantReferencePageQuery(params);
  return apiFetch<any>(`/tenants/${tenantId}/branches/page?${search.toString()}`, {
    ...session,
    tenantId,
  });
}

export function fetchTenantDepartmentPage(
  session: ApiSession,
  params: TenantReferencePageParams,
  tenantId = session.tenantId,
) {
  const search = tenantReferencePageQuery(params);
  return apiFetch<any>(
    `/tenants/${tenantId}/departments/page?${search.toString()}`,
    {
      ...session,
      tenantId,
    },
  );
}

export function fetchTenantBranchFilterOptions(
  session: ApiSession,
  tenantId = session.tenantId,
) {
  return apiFetch<Record<string, { value: string; label: string }[]>>(
    `/tenants/${tenantId}/branches/filter-options`,
    {
      ...session,
      tenantId,
    },
  );
}

export function fetchTenantDepartmentFilterOptions(
  session: ApiSession,
  tenantId = session.tenantId,
) {
  return apiFetch<Record<string, { value: string; label: string }[]>>(
    `/tenants/${tenantId}/departments/filter-options`,
    {
      ...session,
      tenantId,
    },
  );
}

export function getTenantBranches(
  queryClient: QueryClient,
  session: ApiSession,
  tenantId = session.tenantId,
  force = false,
) {
  return queryClient.fetchQuery({
    queryKey: tenantBranchesQueryKey(tenantId),
    queryFn: () => fetchTenantBranches(session, tenantId),
    staleTime: force ? 0 : TENANT_REFERENCE_STALE_MS,
  });
}

export function getTenantDepartments(
  queryClient: QueryClient,
  session: ApiSession,
  tenantId = session.tenantId,
  force = false,
) {
  return queryClient.fetchQuery({
    queryKey: tenantDepartmentsQueryKey(tenantId),
    queryFn: () => fetchTenantDepartments(session, tenantId),
    staleTime: force ? 0 : TENANT_REFERENCE_STALE_MS,
  });
}
