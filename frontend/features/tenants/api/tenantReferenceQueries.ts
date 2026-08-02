import type { QueryClient } from "@tanstack/react-query";
import { apiFetch, type ApiSession } from "@/lib/api";

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
