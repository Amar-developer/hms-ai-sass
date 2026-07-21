"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { tenantSelectOptions } from "../helpers";

export function useSuperAdminData(apiSession: any) {
  const [tenants, setTenants] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [tenantBranches, setTenantBranches] = useState<any[]>([]);
  const [tenantSubscriptions, setTenantSubscriptions] = useState<any[]>([]);
  const [primaryTemplates, setPrimaryTemplates] = useState<any>({
    roles: [],
    departments: [],
    branches: [],
  });
  const [permissionCatalog, setPermissionCatalog] = useState<any[]>([]);
  const [moduleRegistry, setModuleRegistry] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const tenantAccessLoadSequence = useRef(0);

  async function loadPrimaryTemplates(primaryTenantId: string) {
    if (!apiSession || !primaryTenantId) return;
    try {
      const scoped = { ...apiSession, tenantId: primaryTenantId };
      const [roleRows, departmentRows, branchRows] = await Promise.all([
        apiFetch("/identity/roles", scoped),
        apiFetch(`/tenants/${primaryTenantId}/departments`, scoped),
        apiFetch(`/tenants/${primaryTenantId}/branches`, scoped),
      ]);
      setPrimaryTemplates({
        roles: roleRows.filter((role: any) => role.key !== "super_admin"),
        departments: departmentRows,
        branches: branchRows,
      });
    } catch {
      setPrimaryTemplates({ roles: [], departments: [], branches: [] });
    }
  }

  async function reload() {
    if (!apiSession) return [];
    setBusy(true);
    setMessage("");
    try {
      const [tenantRows, planRows, moduleRows] = await Promise.all([
        apiFetch("/tenants", apiSession),
        apiFetch("/subscription-plans", apiSession),
        apiFetch("/modules", apiSession),
      ]);
      const selectableRows = tenantSelectOptions(tenantRows);
      setTenants(tenantRows);
      setPlans(planRows);
      setModuleRegistry(moduleRows);
      if (
        selectableRows.length &&
        (!selectedId ||
          !selectableRows.some((tenant: any) => tenant.id === selectedId))
      )
        setSelectedId(
          selectableRows.find((t: any) => t.is_primary)?.id ||
            selectableRows[0].id,
        );
      const primary = tenantRows.find((tenant: any) => tenant.is_primary);
      if (primary) await loadPrimaryTemplates(primary.id);
      return tenantRows;
    } catch (err: any) {
      setMessage(err.message || "Could not load platform data.");
      return [];
    } finally {
      setBusy(false);
    }
  }

  async function loadTenantAccess(tenantId: string) {
    if (!apiSession || !tenantId) return;
    const requestSequence = ++tenantAccessLoadSequence.current;
    // Never display one tenant's grantable catalog while another tenant is
    // loading. Primary-tenant catalogs can contain platform-only permissions.
    setPermissionCatalog([]);
    try {
      const scoped = { ...apiSession, tenantId };
      const [
        roleRows,
        userRows,
        departmentRows,
        branchRows,
        permissionRows,
        subscriptionRows,
      ] = await Promise.all([
        apiFetch("/identity/roles", scoped),
        apiFetch("/identity/users", scoped),
        apiFetch(`/tenants/${tenantId}/departments`, scoped),
        apiFetch(`/tenants/${tenantId}/branches`, scoped),
        apiFetch("/identity/permissions", scoped),
        apiFetch("/subscription-plans/tenant-subscriptions", scoped).catch(
          () => [],
        ),
      ]);
      if (requestSequence !== tenantAccessLoadSequence.current) return;
      setRoles(roleRows);
      setUsers(userRows);
      setDepartments(departmentRows);
      setTenantBranches(branchRows);
      setPermissionCatalog(permissionRows);
      setTenantSubscriptions(subscriptionRows);
    } catch {
      if (requestSequence !== tenantAccessLoadSequence.current) return;
      setRoles([]);
      setUsers([]);
      setDepartments([]);
      setTenantBranches([]);
      setTenantSubscriptions([]);
      setPermissionCatalog([]);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.tenantId]);
  useEffect(() => {
    if (selectedId) loadTenantAccess(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, apiSession?.tenantId]);

  return {
    tenants,
    setTenants,
    plans,
    setPlans,
    roles,
    setRoles,
    users,
    setUsers,
    departments,
    setDepartments,
    tenantBranches,
    setTenantBranches,
    tenantSubscriptions,
    setTenantSubscriptions,
    primaryTemplates,
    setPrimaryTemplates,
    permissionCatalog,
    setPermissionCatalog,
    moduleRegistry,
    setModuleRegistry,
    selectedId,
    setSelectedId,
    busy,
    setBusy,
    message,
    setMessage,
    reload,
    loadTenantAccess,
  };
}
