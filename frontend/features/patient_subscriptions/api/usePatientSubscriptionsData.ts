"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ApiSession } from "@/lib/api";
import { uniqueDepartmentRows } from "@/lib/options";
import * as patientSubscriptionsApi from "./patientSubscriptions.api";
import { getTenantDepartments } from "@/features/tenants/api/tenantReferenceQueries";

type UsePatientSubscriptionsDataParams = {
  apiSession: ApiSession | null | undefined;
  branchId?: string;
  setSelectedPlan: (updater: (current: string) => string) => void;
};

/**
 * Owns the patient-subscriptions workspace's tenant-scoped data: plans,
 * enrollments, and the lab-test/medicine/department catalogs used to build
 * membership benefits. After each load, reconciles the selected plan
 * against the freshly-fetched plan rows so a stale selection never lingers
 * past a refresh. (Selected-patient reconciliation lives in the component,
 * since it depends on `patients` from the sibling
 * `usePatientReferencesQuery` hook, which itself depends on `enrollments`
 * returned here. The open plan-detail/edit id is derived from the URL by
 * the component, not tracked here.)
 */
export function usePatientSubscriptionsData({
  apiSession,
  branchId,
  setSelectedPlan,
}: UsePatientSubscriptionsDataParams) {
  const queryClient = useQueryClient();
  const [plans, setPlans] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [labTests, setLabTests] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loadError, setLoadError] = useState("");
  // Starts true (not false): on a fresh mount there's a render where the
  // load effect hasn't run yet, so plans is still []. If loading defaulted
  // to false, that render would look identical to "load finished, found
  // nothing" to any effect gating on it (e.g. a stale-id redirect guard),
  // causing a false bounce before the real fetch even starts.
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!apiSession) return;
    setLoadError("");
    setLoading(true);
    try {
      const [planRows, enrollmentRows, testRows, medicineRows, departmentRows] =
        await Promise.all([
          patientSubscriptionsApi.listPlans(apiSession),
          patientSubscriptionsApi.listEnrollments(apiSession),
          patientSubscriptionsApi.listLabTests(apiSession).catch(() => []),
          patientSubscriptionsApi
            .listMedicines(apiSession, branchId)
            .catch(() => []),
          getTenantDepartments(queryClient, apiSession).catch(() => []),
        ]);
      setPlans(planRows);
      setEnrollments(enrollmentRows);
      setLabTests(testRows);
      setMedicines(medicineRows);
      setDepartments(
        uniqueDepartmentRows(
          (departmentRows || []).filter(
            (dept: any) => dept?.is_active !== false,
          ),
        ),
      );
      setSelectedPlan((current) =>
        planRows.some((row: any) => row.id === current)
          ? current
          : planRows[0]?.id || "",
      );
    } catch (err: any) {
      setLoadError(err.message || "Could not load patient subscriptions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [apiSession?.tenantId, branchId]);

  return {
    plans,
    enrollments,
    labTests,
    medicines,
    departments,
    loadError,
    setLoadError,
    loading,
    load,
  };
}
