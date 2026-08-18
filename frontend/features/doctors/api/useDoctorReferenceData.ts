"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ApiSession } from "@/lib/api";
import { activeTenantOptions } from "@/utils/helper";
import { uniqueDepartmentRows } from "@/lib/options";
import {
  getTenantBranches,
  getTenantDepartments,
} from "@/features/tenants/api/tenantReferenceQueries";
import * as doctorsApi from "./doctors.api";

type UseDoctorReferenceDataParams = {
  apiSession: ApiSession | null | undefined;
  tenantId: string;
  setTenantId: (id: string) => void;
  clinic: any;
  allowedDepartments: any[];
  setMessage: (message: string) => void;
};

/**
 * Owns the reference data Doctors needs beyond the practitioner list itself:
 * the super-admin tenant switcher, and the tenant-scoped branches,
 * departments, users, and doctor fee rules that back the filters, table, and
 * create/edit forms.
 */
export function useDoctorReferenceData({
  apiSession,
  tenantId,
  setTenantId,
  clinic,
  allowedDepartments,
  setMessage,
}: UseDoctorReferenceDataParams) {
  const queryClient = useQueryClient();
  const [tenants, setTenants] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>(clinic?.branches || []);
  const [departments, setDepartments] = useState<any[]>(
    uniqueDepartmentRows(allowedDepartments),
  );
  const [users, setUsers] = useState<any[]>([]);
  const [feeRules, setFeeRules] = useState<any[]>([]);
  const [usersTenantId, setUsersTenantId] = useState("");
  const [feeRulesTenantId, setFeeRulesTenantId] = useState("");
  const [referenceLoading, setReferenceLoading] = useState(false);
   const [totalRows, setTotalRows] = useState(0);

  async function loadTenants() {
    if (!apiSession?.user?.is_super_admin) return;
    const tenantRows = activeTenantOptions(
      await doctorsApi.fetchTenants(apiSession),
    );
    setTenants(tenantRows);
    if (!tenantId || !tenantRows.some((tenant: any) => tenant.id === tenantId))
      setTenantId(
        tenantRows.find((tenant: any) => !tenant.is_primary)?.id ||
          tenantRows[0]?.id ||
          apiSession.tenantId,
      );
  }

  async function loadReferenceData(nextTenantId = tenantId, force = false) {
    if (!apiSession || !nextTenantId) return;
    setReferenceLoading(true);
    setMessage("");
    const session = { ...apiSession, tenantId: nextTenantId };
    try {
      const [branchRows, departmentRows] = await Promise.all([
        getTenantBranches(queryClient, session, nextTenantId, force),
        getTenantDepartments(queryClient, session, nextTenantId, force),
      ]);
      setBranches(branchRows);
      setDepartments(uniqueDepartmentRows(departmentRows));
    } catch (err: any) {
      setMessage(err.message || "Could not load doctors.");
    } finally {
      setReferenceLoading(false);
    }
  }

  async function loadUsers(nextTenantId = tenantId) {
    if (!apiSession || !nextTenantId) return;
    if (usersTenantId === nextTenantId) return;
    const session = { ...apiSession, tenantId: nextTenantId };
    const userRows = await doctorsApi
      .fetchTenantUsers(session)
      .catch(() => []);
    setUsers(userRows);
    setUsersTenantId(nextTenantId);
    setTotalRows(userRows.length)
  }

  async function loadFeeRules(nextTenantId = tenantId, force = false) {
    if (!apiSession || !nextTenantId) return;
    if (!force && feeRulesTenantId === nextTenantId) return;
    const session = { ...apiSession, tenantId: nextTenantId };
    const feeRuleRows = await doctorsApi
      .fetchDoctorFeeRules(session)
      .catch(() => []);
    setFeeRules(feeRuleRows);
    setFeeRulesTenantId(nextTenantId);
  }

  async function loadEditorData(nextTenantId = tenantId) {
    await Promise.all([loadUsers(nextTenantId), loadFeeRules(nextTenantId)]);
  }

  useEffect(() => {
    if (apiSession) {
      loadTenants();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.tenantId]);

  useEffect(() => {
    if (apiSession && tenantId) {
      setUsersTenantId("");
      setFeeRulesTenantId("");
      setUsers([]);
      setFeeRules([]);
      loadReferenceData(tenantId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.tenantId, tenantId, clinic, allowedDepartments]);

  return {
    tenants,
    branches,
    departments,
    users,
    feeRules,
    totalRows,
    feeRulesTenantId,
    referenceLoading,
    loadReferenceData,
    loadUsers,
    loadFeeRules,
    loadEditorData,
  };
}
