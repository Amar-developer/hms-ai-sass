import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  queryClientConfig,
  workspaceQueryKeysForMutation,
} from "./QueryProvider";
import {
  APPOINTMENT_ROWS_STALE_MS,
  appointmentRowsQueryKey,
} from "@/features/appointments/api/appointmentWorkspaceQueries";
import {
  TENANT_REFERENCE_STALE_MS,
  tenantBranchesQueryKey,
  tenantDepartmentsQueryKey,
} from "@/features/tenants/api/tenantReferenceQueries";
import {
  RESOLVED_SETTING_STALE_MS,
  resolvedSettingQueryKey,
  resolvedSettingsTenantQueryKey,
} from "@/features/settings/api/resolvedSettingQueries";
import {
  BILLING_REPORT_STALE_MS,
  billingReportQueryKey,
  billingReportsTenantQueryKey,
} from "@/features/billing/api/billingReportQueries";

describe("shared application query cache", () => {
  it("does not make every application query globally fresh", () => {
    const client = new QueryClient(queryClientConfig);

    expect(client.getDefaultOptions().queries?.staleTime).toBe(0);
    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });

  it("deduplicates and reuses data when a domain query explicitly opts in", async () => {
    const client = new QueryClient(queryClientConfig);
    const queryFn = vi.fn().mockResolvedValue([{ id: "practitioner-1" }]);
    const options = {
      queryKey: ["practitioners", "tenant-1"] as const,
      queryFn,
      staleTime: 60_000,
    };

    const [first, second] = await Promise.all([
      client.fetchQuery(options),
      client.fetchQuery(options),
    ]);
    const cached = await client.fetchQuery(options);

    expect(first).toEqual(second);
    expect(cached).toEqual(first);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("shares the shell appointment request with a module entering immediately afterward", async () => {
    const client = new QueryClient(queryClientConfig);
    const queryFn = vi.fn().mockResolvedValue([{ id: "appointment-1" }]);
    const options = {
      queryKey: appointmentRowsQueryKey("tenant-1"),
      queryFn,
      staleTime: APPOINTMENT_ROWS_STALE_MS,
    };

    await client.fetchQuery(options);
    await client.fetchQuery(options);

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("shares stable tenant references between workspace modules", async () => {
    const client = new QueryClient(queryClientConfig);
    const queryFn = vi.fn().mockResolvedValue([{ id: "branch-1" }]);
    const options = {
      queryKey: tenantBranchesQueryKey("tenant-1"),
      queryFn,
      staleTime: TENANT_REFERENCE_STALE_MS,
    };

    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    await client.fetchQuery(options);

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("deduplicates an exact resolved setting without caching all API data", async () => {
    const client = new QueryClient(queryClientConfig);
    const queryFn = vi.fn().mockResolvedValue({
      key: "payment.methods_enabled",
      value: ["cash", "upi"],
    });
    const options = {
      queryKey: resolvedSettingQueryKey(
        "tenant-1",
        "payment",
        "payment.methods_enabled",
      ),
      queryFn,
      staleTime: RESOLVED_SETTING_STALE_MS,
    };

    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    await client.fetchQuery(options);

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("shares a short-lived aggregate billing report by its exact filters", async () => {
    const client = new QueryClient(queryClientConfig);
    const path =
      "/billing/reports/collections?from_date=2026-08-01&to_date=2026-08-31";
    const queryFn = vi.fn().mockResolvedValue({ total_collected: 1250 });
    const options = {
      queryKey: billingReportQueryKey("tenant-1", path),
      queryFn,
      staleTime: BILLING_REPORT_STALE_MS,
    };

    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    await client.fetchQuery(options);

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("invalidates only workspace data affected by a mutation", () => {
    expect(
      workspaceQueryKeysForMutation("/appointments", "tenant-1"),
    ).toContainEqual(appointmentRowsQueryKey("tenant-1"));
    expect(
      workspaceQueryKeysForMutation("/settings", "tenant-1"),
    ).toContainEqual(resolvedSettingsTenantQueryKey("tenant-1"));
    expect(
      workspaceQueryKeysForMutation(
        "/billing/invoices/invoice-1/payments",
        "tenant-1",
      ),
    ).toContainEqual(billingReportsTenantQueryKey("tenant-1"));
    expect(
      workspaceQueryKeysForMutation(
        "/tenants/tenant-2/branches/branch-1/status",
        "platform-tenant",
      ),
    ).toContainEqual(tenantBranchesQueryKey("tenant-2"));
    expect(
      workspaceQueryKeysForMutation(
        "/tenants/departments/department-1/assign/tenant-3",
        "platform-tenant",
      ),
    ).toContainEqual(tenantDepartmentsQueryKey("tenant-3"));
  });
});
