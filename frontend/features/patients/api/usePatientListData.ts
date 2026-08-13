"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ApiSession } from "@/lib/api";
import { activeTenantOptions } from "@/utils/helper";
import { getTenantBranches } from "@/features/tenants/api/tenantReferenceQueries";
import * as patientsApi from "./patients.api";

const pageSize = 10;

export type PatientListFilters = {
  query: string;
  status: string;
  gender: string;
  branchFilter: string;
  fromDate: string;
  toDate: string;
};

type UsePatientListDataParams = {
  apiSession: ApiSession | null | undefined;
  tenantId: string;
  setTenantId: (id: string) => void;
  setBusy: (busy: boolean) => void;
  setMessage: (message: string) => void;
};

/**
 * Owns the patient list surface: the super-admin tenant switcher, the
 * tenant-scoped branches used by the filter row and forms, and the paged
 * patient rows themselves.
 */
export function usePatientListData({
  apiSession,
  tenantId,
  setTenantId,
  setBusy,
  setMessage,
}: UsePatientListDataParams) {
  const queryClient = useQueryClient();
  const [tenants, setTenants] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  async function loadTenants() {
    if (!apiSession?.user?.is_super_admin) return;
    const tenantRows = activeTenantOptions(
      await patientsApi.fetchTenants(apiSession),
    );
    setTenants(tenantRows);
    if (!tenantId || !tenantRows.some((tenant: any) => tenant.id === tenantId))
      setTenantId(
        tenantRows.find((tenant: any) => !tenant.is_primary)?.id ||
          tenantRows[0]?.id ||
          apiSession.tenantId,
      );
  }

  async function loadData(
    nextTenantId: string,
    nextPage: number,
    filters: PatientListFilters,
  ) {
    if (!apiSession || !nextTenantId) return;
    setBusy(true);
    const session = { ...apiSession, tenantId: nextTenantId };
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String((nextPage - 1) * pageSize),
        active_only: "false",
      });
      if (filters.query) params.set("q", filters.query);
      if (filters.status && filters.status !== "all")
        params.set("status", filters.status);
      if (filters.gender && filters.gender !== "all")
        params.set("gender", filters.gender);
      if (filters.branchFilter && filters.branchFilter !== "all")
        params.set("branch_id", filters.branchFilter);
      if (filters.fromDate) params.set("from_date", filters.fromDate);
      if (filters.toDate) params.set("to_date", filters.toDate);
      const [branchRows, patientRows] = await Promise.all([
        getTenantBranches(queryClient, session, nextTenantId).catch(() => []),
        patientsApi.fetchPatientsPage(session, params),
      ]);
      setBranches(branchRows);
      setRows(patientRows.items || []);
      setTotalRows(patientRows.total || 0);
    } catch (err: any) {
      setMessage(err.message || "Could not load patients.");
    } finally {
      setBusy(false);
    }
  }

  return {
    tenants,
    branches,
    rows,
    totalRows,
    setRows,
    loadTenants,
    loadData,
  };
}
