import type { QueryClient } from "@tanstack/react-query";
import { apiFetch, type ApiSession } from "@/lib/api";

// Resolved settings are configuration, not live operational data. Cache each
// exact tenant/branch/module/key combination and invalidate the tenant prefix
// whenever an administrator writes settings.
export const RESOLVED_SETTING_STALE_MS = 5 * 60_000;

export function resolvedSettingsTenantQueryKey(tenantId?: string) {
  return ["resolved-setting", tenantId] as const;
}

export function resolvedSettingQueryKey(
  tenantId: string | undefined,
  module: string,
  key: string,
  branchId?: string,
) {
  return [
    ...resolvedSettingsTenantQueryKey(tenantId),
    branchId || "tenant",
    module,
    key,
  ] as const;
}

export function fetchResolvedSetting(
  session: ApiSession,
  module: string,
  key: string,
  branchId?: string,
) {
  const params = new URLSearchParams({ module, key });
  if (branchId) params.set("branch_id", branchId);
  return apiFetch<any>(`/settings/resolve?${params.toString()}`, session);
}

export function getResolvedSetting(
  queryClient: QueryClient,
  session: ApiSession,
  module: string,
  key: string,
  branchId?: string,
) {
  return queryClient.fetchQuery({
    queryKey: resolvedSettingQueryKey(
      session.tenantId,
      module,
      key,
      branchId,
    ),
    queryFn: () => fetchResolvedSetting(session, module, key, branchId),
    staleTime: RESOLVED_SETTING_STALE_MS,
  });
}
