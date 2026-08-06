"use client";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getTenants,
  getDoctors,
  getSchedules,
} from "../api";
import { uniqueDepartmentRows } from "@/lib/options";
import { activeTenantOptions } from "@/utils/helper";
import {
  getTenantBranches,
  getTenantDepartments,
} from "@/features/tenants/api/tenantReferenceQueries";

export function useSchedulingData({
  apiSession,
  tenantId,
  filterDepartment,
}: any) {
  const queryClient = useQueryClient();
  const [tenants, setTenants] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  // Starts true: on mount there is a render before loadData runs, and
  // loading=false there looks identical to "loaded, found nothing" to any
  // not-found redirect guard.
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");

  async function loadTenants() {
    if (!apiSession?.user?.is_super_admin) return;
    const result = await getTenants(apiSession);
    const options = activeTenantOptions(result);
    setTenants(options);
  }

  async function loadData() {
    if (!apiSession || !tenantId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const session = {
        ...apiSession,
        tenantId,
      };

      const [branchRows, departmentRows, doctorRows, scheduleRows] =
        await Promise.all([
          getTenantBranches(queryClient, session, tenantId),

          getTenantDepartments(queryClient, session, tenantId),

          getDoctors(session),

          getSchedules(session),
        ]);

      setBranches(branchRows);

      setDepartments(uniqueDepartmentRows(departmentRows, filterDepartment));

      setDoctors(doctorRows);

      setRows(scheduleRows);
    } catch (err: any) {
      setError(err.message || "Could not load schedules");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (apiSession) loadTenants();
  }, [apiSession?.tenantId]);

  useEffect(() => {
    loadData();
  }, [apiSession?.tenantId, tenantId]);

  return {
    tenants,
    branches,
    departments,
    doctors,
    rows,
    loading,
    error,
    reload: loadData,
  };
}
