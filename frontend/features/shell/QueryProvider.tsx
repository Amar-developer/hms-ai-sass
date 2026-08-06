"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from "@tanstack/react-query";
import { LIVE_DATA_CHANGED_EVENT } from "@/lib/api";
import {
  appointmentRowsQueryKey,
  consultationRowsQueryKey,
  queueRowsQueryKey,
  scheduleRowsQueryKey,
} from "@/features/appointments/api/appointmentWorkspaceQueries";
import {
  tenantBranchesQueryKey,
  tenantDepartmentsQueryKey,
} from "@/features/tenants/api/tenantReferenceQueries";
import { resolvedSettingsTenantQueryKey } from "@/features/settings/api/resolvedSettingQueries";
import { billingReportsTenantQueryKey } from "@/features/billing/api/billingReportQueries";

export const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      // Domain hooks opt into freshness only when sharing that data is useful.
      // The global default stays fresh-on-read to avoid blindly caching every
      // clinical and financial request.
      staleTime: 0,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
};

export function workspaceQueryKeysForMutation(path: string, tenantId: string) {
  const keys: (readonly unknown[])[] = [];
  const appointmentRelated =
    path.startsWith("/appointments") ||
    path.startsWith("/queue") ||
    path.startsWith("/consultations") ||
    path.startsWith("/billing/invoices");
  if (appointmentRelated) {
    keys.push(
      appointmentRowsQueryKey(tenantId),
      queueRowsQueryKey(tenantId),
      consultationRowsQueryKey(tenantId),
      ["appointments", tenantId],
    );
  }
  if (path.startsWith("/practitioners/schedules")) {
    keys.push(scheduleRowsQueryKey(tenantId), ["appointments", tenantId]);
  }
  if (path === "/settings" || path.startsWith("/settings/")) {
    keys.push(resolvedSettingsTenantQueryKey(tenantId));
  }
  if (path === "/billing" || path.startsWith("/billing/")) {
    keys.push(billingReportsTenantQueryKey(tenantId));
  }
  const directReferenceMatch = path.match(
    /^\/tenants\/([^/]+)\/(branches|departments)(?:\/|$)/,
  );
  const assignedReferenceMatch = path.match(
    /^\/tenants\/(branches|departments)\/[^/]+\/assign\/([^/?]+)/,
  );
  if (directReferenceMatch) {
    const [, affectedTenantId, resource] = directReferenceMatch;
    keys.push(
      resource === "branches"
        ? tenantBranchesQueryKey(affectedTenantId)
        : tenantDepartmentsQueryKey(affectedTenantId),
    );
  } else if (assignedReferenceMatch) {
    const [, resource, affectedTenantId] = assignedReferenceMatch;
    keys.push(
      resource === "branches"
        ? tenantBranchesQueryKey(affectedTenantId)
        : tenantDepartmentsQueryKey(affectedTenantId),
    );
  }
  return keys;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient(queryClientConfig));

  useEffect(() => {
    function invalidateChangedWorkspace(event: Event) {
      const detail = (event as CustomEvent).detail || {};
      const tenantId = String(detail.tenantId || "");
      const path = String(detail.path || "");
      if (!tenantId) return;

      for (const queryKey of workspaceQueryKeysForMutation(path, tenantId)) {
        void client.invalidateQueries({ queryKey });
      }
    }

    window.addEventListener(LIVE_DATA_CHANGED_EVENT, invalidateChangedWorkspace);
    return () =>
      window.removeEventListener(
        LIVE_DATA_CHANGED_EVENT,
        invalidateChangedWorkspace,
      );
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
