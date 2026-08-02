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
  setDetailPlanId: (updater: (current: string) => string) => void;
};

/**
 * Owns the patient-subscriptions workspace's tenant-scoped data: plans,
 * enrollments, and the lab-test/medicine/department catalogs used to build
 * membership benefits. After each load, reconciles the selected plan and
 * open plan-detail id against the freshly-fetched plan rows so a stale
 * selection never lingers past a refresh. (Selected-patient reconciliation
 * lives in the component, since it depends on `patients` from the sibling
 * `usePatientReferencesQuery` hook, which itself depends on `enrollments`
 * returned here.)
 */
export function usePatientSubscriptionsData({
  apiSession,
  branchId,
  setSelectedPlan,
  setDetailPlanId,
}: UsePatientSubscriptionsDataParams) {
  const queryClient = useQueryClient();
  const [plans, setPlans] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [labTests, setLabTests] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);

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
      setDetailPlanId((current) =>
        planRows.some((row: any) => row.id === current) ? current : "",
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
