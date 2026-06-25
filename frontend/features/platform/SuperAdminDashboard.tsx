"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Card, StatusToast } from "@/app/components/common/ui";
import { apiFetch, apiUpload } from "@/lib/api";
import {
  catalogSubscriptionPlans,
  tenantSelectOptions,
} from "../../utils/superAdmin/superAdmin";
import { Overview } from "@/app/components/superadmin/overview/Overview";
import { TenantManagement } from "@/app/components/superadmin/tenants/TenantManagement";
import { EditTenant } from "@/app/components/superadmin/tenants/EditTenant";
import { CreateTenantForm } from "@/app/components/superadmin/tenants/CreateTenantForm";
import { TenantCreatedModal } from "@/app/components/superadmin/tenants/TenantCreatedModal";
import { RolesManagement } from "@/app/components/superadmin/roles/RolesManagement";
import { CreateRole } from "@/app/components/superadmin/roles/CreateRole";
import { EditRole } from "@/app/components/superadmin/roles/EditRole";
import { RolePermissions } from "@/app/components/superadmin/roles/RolePermissions";
import { TenantUsers } from "@/app/components/superadmin/users/TenantUsers";
import { CreateUser } from "@/app/components/superadmin/users/CreateUser";
import { EditUser } from "@/app/components/superadmin/users/EditUser";
import { DepartmentsManagement } from "@/app/components/superadmin/departments/DepartmentsManagement";
import { CreateDepartment } from "@/app/components/superadmin/departments/CreateDepartment";
import { EditDepartment } from "@/app/components/superadmin/departments/EditDepartment";
import { BranchesManagement } from "@/app/components/superadmin/branches/BranchesManagement";
import { CreateBranch } from "@/app/components/superadmin/branches/CreateBranch";
import { EditBranch } from "@/app/components/superadmin/branches/EditBranch";
import { AssignTemplate } from "@/app/components/superadmin/shared/AssignTemplate";
import { ConfirmModal } from "@/app/components/admin/ConfirmModal";
import { PasswordResetModal } from "@/app/components/superadmin/shared/PasswordResetModal";
import { SubscriptionManagement } from "@/app/components/superadmin/subscriptions/SubscriptionManagement";
import { TenantBranchSettings } from "@/app/components/superadmin/subscriptions/TenantBranchSettings";

export { superAdminSections } from "../../utils/superAdmin/constants";

export function SuperAdminDashboard({
  apiSession,
  switchTenant,
  section,
  setSection,
}: any) {
  const [localSection, setLocalSection] = useState("overview");
  const currentSection = section || localSection;
  const changeSection = setSection || setLocalSection;
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
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [confirmAction, setConfirmAction] = useState<any>(null);
  const [tenantSuccess, setTenantSuccess] = useState<any>(null);
  const [passwordUser, setPasswordUser] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const onboardingInFlight = useRef(false);
  const tenantAccessLoadSequence = useRef(0);
  const selectableTenants = tenantSelectOptions(tenants);
  const selected =
    selectableTenants.find((t) => t.id === selectedId) ||
    selectableTenants.find((t) => t.is_primary) ||
    selectableTenants[0];
  const settingsTenant = currentSection === "settings" ? selected : null;
  const customerTenants = tenantSelectOptions(
    tenants.filter((t) => !t.is_primary),
  );
  const currentTenantPlanIds = new Set(
    tenantSubscriptions.map((subscription: any) => subscription.plan_id),
  );
  const catalogPlanIds = new Set(
    catalogSubscriptionPlans(plans).map((plan: any) => plan.id),
  );
  const tenantEditPlans = plans.filter(
    (plan: any) =>
      catalogPlanIds.has(plan.id) || currentTenantPlanIds.has(plan.id),
  );
  const activeTenants = customerTenants.filter(
    (t) => t.status === "active",
  ).length;
  const trialTenants = customerTenants.filter(
    (t) => t.status === "trial",
  ).length;
  const estimatedRevenue = customerTenants.reduce(
    (sum, t) =>
      sum + Number(plans.find((p) => p.is_active)?.price_inr_monthly || 0),
    0,
  );

  function openListing(sectionId: string) {
    changeSection(sectionId);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  async function loadPlatform() {
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

  async function loadTenantAccess(tenantId: string) {
    if (!apiSession || !tenantId) return;
    const requestSequence = ++tenantAccessLoadSequence.current;
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
    }
  }

  useEffect(() => {
    loadPlatform();
  }, [apiSession?.token, apiSession?.tenantId]);
  useEffect(() => {
    if (selectedId) loadTenantAccess(selectedId);
  }, [selectedId, apiSession?.token]);
  useEffect(() => {
    const detailRoutes: Record<string, { list: string; exists: boolean }> = {
      tenantEdit: { list: "tenants", exists: Boolean(selected) },
      roleEdit: {
        list: "roles",
        exists: roles.some((role: any) => role.id === selectedRoleId),
      },
      rolePermissions: {
        list: "roles",
        exists: roles.some((role: any) => role.id === selectedRoleId),
      },
      roleAssign: {
        list: "roles",
        exists: roles.some((role: any) => role.id === selectedRoleId),
      },
      userEdit: {
        list: "users",
        exists: users.some((user: any) => user.id === selectedUserId),
      },
      departmentEdit: {
        list: "departments",
        exists: departments.some(
          (department: any) => department.id === selectedDepartmentId,
        ),
      },
      departmentAssign: {
        list: "departments",
        exists: departments.some(
          (department: any) => department.id === selectedDepartmentId,
        ),
      },
      branchEdit: {
        list: "branches",
        exists: tenantBranches.some(
          (branch: any) => branch.id === selectedBranchId,
        ),
      },
      branchAssign: {
        list: "branches",
        exists: tenantBranches.some(
          (branch: any) => branch.id === selectedBranchId,
        ),
      },
    };
    const route = detailRoutes[currentSection];
    if (route && !route.exists) changeSection(route.list);
  }, [
    currentSection,
    selected,
    selectedRoleId,
    selectedUserId,
    selectedDepartmentId,
    selectedBranchId,
    roles,
    users,
    departments,
    tenantBranches,
  ]);

  async function createTenant(e: any) {
    e.preventDefault();
    if (!apiSession) return;
    if (onboardingInFlight.current) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const tenantName = String(fd.get("name") || "").trim();
    const tenantEmail = String(fd.get("email") || "").trim();
    const tenantPhone = String(fd.get("phone") || "").trim();
    const normalized = (value: string) =>
      value.replace(/\s+/g, " ").trim().toLowerCase();
    const duplicate = tenants.find(
      (tenant: any) =>
        normalized(tenant.name || "") === normalized(tenantName) ||
        (tenantEmail &&
          normalized(tenant.email || "") === normalized(tenantEmail)) ||
        (tenantPhone &&
          normalized(tenant.phone || "") === normalized(tenantPhone)),
    );
    if (duplicate) {
      setSelectedId(duplicate.id);
      changeSection("tenantEdit");
      requestAnimationFrame(() =>
        window.scrollTo({ top: 0, behavior: "smooth" }),
      );
      setMessage(
        `Tenant already exists: ${duplicate.name}. Duplicate onboarding is not allowed. Add new branches from this tenant edit page.`,
      );
      return;
    }
    const confirmed = window.confirm(
      `Complete onboarding for ${tenantName}? This will create the tenant, branches, templates, subscription, and admin user.`,
    );
    if (!confirmed) return;
    onboardingInFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const branchCount = Number(fd.get("branchCount") || 1);
      const branches = [];
      for (let index = 0; index < branchCount; index += 1) {
        const branchName = String(fd.get(`branchName_${index}`) || "").trim();
        if (!branchName) continue;
        branches.push({
          name: branchName,
          code: String(
            fd.get(`branchCode_${index}`) || `BR${index + 1}`,
          ).trim(),
          area: fd.get(`branchArea_${index}`) || null,
          address:
            fd.get(`branchAddress_${index}`) || fd.get("address") || null,
          city: fd.get(`branchCity_${index}`) || null,
          state: fd.get(`branchState_${index}`) || null,
        });
      }
      const planId = String(fd.get("planId") || "");
      const selectedPlan = plans.find((plan: any) => plan.id === planId);
      const enabledModules = selectedPlan?.enabled_modules || [];
      const roleTemplateIds = fd
        .getAll("roleTemplateIds")
        .map((value) => String(value));
      const departmentTemplateIds = fd
        .getAll("departmentTemplateIds")
        .map((value) => String(value));
      const branchTemplateIds = fd
        .getAll("branchTemplateIds")
        .map((value) => String(value));
      const adminEmail = String(fd.get("adminEmail") || "").trim();
      const adminPassword = String(fd.get("adminPassword") || "").trim();
      const onboarding = await apiFetch("/tenants/onboard", apiSession, {
        method: "POST",
        body: JSON.stringify({
          tenant: {
            name: fd.get("name"),
            legal_name: fd.get("legalName") || null,
            description: fd.get("description") || null,
            email: fd.get("email") || null,
            phone: fd.get("phone") || null,
            address: fd.get("address") || null,
            tenant_type: fd.get("tenantType") || "clinic",
            status: fd.get("status") || "trial",
            country: String(fd.get("country") || "IN").toUpperCase(),
            timezone: fd.get("timezone") || "Asia/Kolkata",
          },
          branches,
          subscription_plan_id: planId || null,
          enabled_modules: enabledModules,
          monthly_patient_limit: Number(
            selectedPlan?.monthly_patient_limit || 0,
          ),
          included_branches: selectedPlan?.included_branches ?? null,
          included_doctors: Number(selectedPlan?.included_doctors || 0),
          price_inr_monthly: Number(selectedPlan?.price_inr_monthly || 0),
          subscription_starts_on: new Date().toISOString().slice(0, 10),
          role_template_ids: roleTemplateIds,
          department_template_ids: departmentTemplateIds,
          branch_template_ids: branchTemplateIds,
          admin_user: {
            name: fd.get("adminName") || "Tenant Admin",
            email: adminEmail,
            password: adminPassword,
            mobile: fd.get("adminMobile") || null,
            must_change_password: fd.get("adminMustChangePassword") !== "false",
          },
        }),
      });
      const logoFile = fd.get("logoFile") as File | null;
      let tenantWithLogo = onboarding.tenant;
      let logoWarning = "";
      if (logoFile && logoFile.size > 0) {
        try {
          const logoData = new FormData();
          logoData.append("file", logoFile);
          tenantWithLogo = await apiUpload(
            `/tenants/${onboarding.tenant.id}/logo`,
            apiSession,
            logoData,
          );
        } catch {
          logoWarning =
            "Tenant provisioning completed, but the logo could not be uploaded.";
        }
      }
      form.reset();
      setSelectedId(tenantWithLogo.id);
      setTenants((previous) => [
        tenantWithLogo,
        ...previous.filter((tenant: any) => tenant.id !== tenantWithLogo.id),
      ]);
      openListing("tenants");
      await loadPlatform();
      setTenantSuccess({
        tenant: tenantWithLogo,
        branchCount: onboarding.branches.length,
        hasSubscription: Boolean(onboarding.subscription_id),
        moduleCount: enabledModules.length,
        onboardingPlan: selectedPlan,
        roleCount: onboarding.role_count,
        departmentCount: onboarding.department_count,
        branchTemplateCount: onboarding.branch_template_count,
        adminUserId: onboarding.admin_user_id,
        adminEmail,
        logoWarning,
      });
      setMessage(
        logoWarning ||
          `Tenant onboarding completed successfully: ${tenantWithLogo.name}`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not create tenant.");
    } finally {
      setBusy(false);
      onboardingInFlight.current = false;
    }
  }

  async function updateTenant(e: any) {
    e.preventDefault();
    if (!apiSession || !selected) return;
    const fd = new FormData(e.currentTarget);
    const requestedPlanId = String(fd.get("planId") || "");
    const requestedPlan = plans.find(
      (plan: any) => plan.id === requestedPlanId,
    );
    const requestedBranchCount = Number(fd.get("branchCount") || 0);
    const assignedBranchTemplateIds = new Set(
      String(fd.get("assignedBranchTemplateIds") || "")
        .split(",")
        .filter(Boolean),
    );
    const newBranchTemplateCount = fd
      .getAll("branchTemplateIds")
      .map((value) => String(value))
      .filter((id) => !assignedBranchTemplateIds.has(id)).length;
    if (
      !selected.is_primary &&
      requestedPlan &&
      requestedBranchCount + newBranchTemplateCount >
        Number(requestedPlan.included_branches || 0)
    ) {
      setMessage(
        `${requestedPlan.name} allows ${requestedPlan.included_branches} branches. Remove branches or select a plan with a higher limit.`,
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const isPrimary = Boolean(selected.is_primary);
      const updated = await apiFetch(`/tenants/${selected.id}`, apiSession, {
        method: "PATCH",
        body: JSON.stringify({
          name: isPrimary ? selected.name : fd.get("name"),
          legal_name: fd.get("legalName") || null,
          description: fd.get("description") || null,
          email: fd.get("email") || null,
          phone: fd.get("phone") || null,
          address: fd.get("address") || null,
          tenant_type: isPrimary ? "primary" : fd.get("tenantType"),
          status: isPrimary ? "active" : fd.get("status"),
          country: String(fd.get("country") || "IN").toUpperCase(),
          timezone: fd.get("timezone") || "Asia/Kolkata",
        }),
      });
      const logoFile = fd.get("logoFile") as File | null;
      let tenantRow = updated;
      if (logoFile && logoFile.size > 0) {
        const logoData = new FormData();
        logoData.append("file", logoFile);
        tenantRow = await apiUpload(
          `/tenants/${selected.id}/logo`,
          apiSession,
          logoData,
        );
      }
      const branchCount = isPrimary ? 0 : Number(fd.get("branchCount") || 0);
      for (let index = 0; index < branchCount; index += 1) {
        const branchName = String(fd.get(`branchName_${index}`) || "").trim();
        const branchId = String(fd.get(`branchId_${index}`) || "").trim();
        if (!branchName) continue;
        const payload = {
          name: branchName,
          code: String(
            fd.get(`branchCode_${index}`) || `BR${index + 1}`,
          ).trim(),
          area: fd.get(`branchArea_${index}`) || null,
          address: fd.get(`branchAddress_${index}`) || null,
          city: fd.get(`branchCity_${index}`) || null,
          state: fd.get(`branchState_${index}`) || null,
          is_active: fd.get(`branchActive_${index}`) !== "false",
        };
        if (branchId) {
          await apiFetch(
            `/tenants/${updated.id}/branches/${branchId}`,
            { ...apiSession, tenantId: updated.id },
            { method: "PATCH", body: JSON.stringify(payload) },
          );
        } else {
          await apiFetch(
            `/tenants/${updated.id}/branches`,
            { ...apiSession, tenantId: updated.id },
            { method: "POST", body: JSON.stringify(payload) },
          );
        }
      }
      const selectedPlanId = String(fd.get("planId") || "");
      const currentPlanId = String(fd.get("currentPlanId") || "");
      if (!isPrimary && selectedPlanId && selectedPlanId !== currentPlanId) {
        const selectedPlan = plans.find(
          (plan: any) => plan.id === selectedPlanId,
        );
        await apiFetch(
          "/subscription-plans/tenant-subscriptions",
          { ...apiSession, tenantId: updated.id },
          {
            method: "POST",
            body: JSON.stringify({
              plan_id: selectedPlanId,
              starts_on: new Date().toISOString().slice(0, 10),
              billing_amount: Number(selectedPlan?.price_inr_monthly || 0),
              notes: "Updated from tenant edit workspace",
            }),
          },
        );
        try {
          localStorage.setItem(
            "medizinhub.entitlements.refresh",
            String(Date.now()),
          );
          window.dispatchEvent(new Event("medizinhub.entitlements.refresh"));
        } catch {}
      }
      const assignedRoleTemplateIds = new Set(
        String(fd.get("assignedRoleTemplateIds") || "")
          .split(",")
          .filter(Boolean),
      );
      for (const roleId of fd
        .getAll("roleTemplateIds")
        .map((value) => String(value))) {
        if (assignedRoleTemplateIds.has(roleId)) continue;
        await apiFetch(
          `/identity/roles/${roleId}/assign/${updated.id}`,
          apiSession,
          { method: "POST" },
        );
      }
      const assignedDepartmentTemplateIds = new Set(
        String(fd.get("assignedDepartmentTemplateIds") || "")
          .split(",")
          .filter(Boolean),
      );
      for (const departmentId of fd
        .getAll("departmentTemplateIds")
        .map((value) => String(value))) {
        if (assignedDepartmentTemplateIds.has(departmentId)) continue;
        await apiFetch(
          `/tenants/departments/${departmentId}/assign/${updated.id}`,
          apiSession,
          { method: "POST" },
        );
      }
      const existingBranchTemplateIds = new Set(
        String(fd.get("assignedBranchTemplateIds") || "")
          .split(",")
          .filter(Boolean),
      );
      for (const branchId of fd
        .getAll("branchTemplateIds")
        .map((value) => String(value))) {
        if (existingBranchTemplateIds.has(branchId)) continue;
        await apiFetch(
          `/tenants/branches/${branchId}/assign/${updated.id}`,
          apiSession,
          { method: "POST" },
        );
      }
      const adminUserId = String(fd.get("adminUserId") || "");
      if (!isPrimary && adminUserId) {
        await apiFetch(
          `/identity/users/${adminUserId}`,
          { ...apiSession, tenantId: updated.id },
          {
            method: "PATCH",
            body: JSON.stringify({
              name: fd.get("adminName"),
              email: fd.get("adminEmail"),
              mobile: fd.get("adminMobile") || null,
              user_type: "tenant_admin",
              branch_id: null,
              is_active: fd.get("adminIsActive") === "true",
              must_change_password:
                fd.get("adminMustChangePassword") === "true",
              role_keys: ["tenant_admin"],
            }),
          },
        );
        const newPassword = String(fd.get("adminNewPassword") || "");
        if (newPassword) {
          await apiFetch(
            `/identity/users/${adminUserId}/password-reset`,
            { ...apiSession, tenantId: updated.id },
            {
              method: "POST",
              body: JSON.stringify({
                new_password: newPassword,
                must_change_password:
                  fd.get("adminMustChangePassword") === "true",
              }),
            },
          );
        }
      }
      setSelectedId(updated.id);
      setTenants((previous) => [
        tenantRow,
        ...previous.filter((tenant: any) => tenant.id !== tenantRow.id),
      ]);
      openListing("tenants");
      await loadPlatform();
      await loadTenantAccess(updated.id);
      setMessage(`Tenant has been updated successfully: ${updated.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not update tenant.");
    } finally {
      setBusy(false);
    }
  }

  async function suspendTenant(tenant = selected) {
    if (!apiSession || !tenant || tenant.is_primary) return;
    if (
      !window.confirm(
        `Deactivate tenant ${tenant.name}? This suspends access and keeps tenant records for audit and compliance.`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(`/tenants/${tenant.id}`, apiSession, {
        method: "DELETE",
      });
      setTenants((previous) =>
        previous.map((row: any) =>
          row.id === tenant.id ? { ...row, status: "suspended" } : row,
        ),
      );
      await loadPlatform();
      setMessage(`Tenant deactivated: ${tenant.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not deactivate tenant.");
    } finally {
      setBusy(false);
    }
  }

  async function createRole(e: any) {
    e.preventDefault();
    if (!apiSession || !selectedId) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const permissionKeys = fd
      .getAll("permissionKeys")
      .map((x) => String(x).trim())
      .filter(Boolean);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch(
        "/identity/roles",
        { ...apiSession, tenantId: selectedId },
        {
          method: "POST",
          body: JSON.stringify({
            name: fd.get("name"),
            key: fd.get("key"),
            permission_keys: permissionKeys,
          }),
        },
      );
      form.reset();
      setRoles((previous) => [
        created,
        ...previous.filter((role: any) => role.id !== created.id),
      ]);
      setSelectedRoleId(created.id);
      openListing("roles");
      await loadTenantAccess(selectedId);
      setMessage(`Role created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create role.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(e: any) {
    e.preventDefault();
    if (!apiSession || !selectedId || !selectedRoleId) return;
    const fd = new FormData(e.currentTarget);
    const checkedKeys = fd
      .getAll("permissionKeys")
      .map((x) => String(x).trim())
      .filter(Boolean);
    const typedKeys = String(fd.get("permissionKeysText") || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const permissionKeys = [...checkedKeys, ...typedKeys];
    const payload: any = {
      name: fd.get("name"),
      key: fd.get("key"),
      is_active: fd.get("isActive") === "true",
    };
    if (permissionKeys.length || fd.get("replacePermissions") === "true")
      payload.permission_keys = permissionKeys;
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/identity/roles/${selectedRoleId}`,
        { ...apiSession, tenantId: selectedId },
        { method: "PATCH", body: JSON.stringify(payload) },
      );
      setRoles((previous) => [
        updated,
        ...previous.filter((role: any) => role.id !== updated.id),
      ]);
      openListing("roles");
      await loadTenantAccess(selectedId);
      setMessage("Role updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update role.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRoleStatus(role: any) {
    if (!apiSession || !selectedId) return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(
        `/identity/roles/${role.id}/status`,
        { ...apiSession, tenantId: selectedId },
        {
          method: "POST",
          body: JSON.stringify({ is_active: !role.is_active }),
        },
      );
      await loadTenantAccess(selectedId);
      setMessage(`Role ${role.is_active ? "deactivated" : "activated"}.`);
    } catch (err: any) {
      setMessage(err.message || "Could not change role status.");
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function deleteRole(role: any) {
    if (!apiSession || !selectedId) return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(
        `/identity/roles/${role.id}`,
        { ...apiSession, tenantId: selectedId },
        { method: "DELETE" },
      );
      await loadTenantAccess(selectedId);
      setMessage("Role deleted.");
    } catch (err: any) {
      setMessage(err.message || "Could not delete role.");
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function assignRoleTemplate(e: any) {
    e.preventDefault();
    if (!apiSession || !selectedRoleId) return;
    const fd = new FormData(e.currentTarget);
    const targetTenantId = String(fd.get("targetTenantId") || "");
    setBusy(true);
    setMessage("");
    try {
      const assigned = await apiFetch(
        `/identity/roles/${selectedRoleId}/assign/${targetTenantId}`,
        apiSession,
        { method: "POST" },
      );
      openListing("roles");
      setMessage(`Role template assigned to tenant: ${assigned.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not assign role template.");
    } finally {
      setBusy(false);
    }
  }

  async function createUser(e: any) {
    e.preventDefault();
    if (!apiSession || !selectedId) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const roleKeys = fd
      .getAll("roleKeys")
      .map((x) => String(x).trim())
      .filter(Boolean);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch(
        "/identity/users",
        { ...apiSession, tenantId: selectedId },
        {
          method: "POST",
          body: JSON.stringify({
            name: fd.get("name"),
            email: fd.get("email"),
            password: fd.get("password"),
            mobile: fd.get("mobile") || null,
            user_type: fd.get("userType") || "staff",
            branch_id: fd.get("branchId") || null,
            role_keys: roleKeys,
            must_change_password: fd.get("mustChangePassword") === "true",
          }),
        },
      );
      form.reset();
      setUsers((previous) => [
        created,
        ...previous.filter((user: any) => user.id !== created.id),
      ]);
      setSelectedUserId(created.id);
      openListing("users");
      await loadTenantAccess(selectedId);
      setMessage(`User created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create user.");
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(e: any) {
    e.preventDefault();
    if (!apiSession || !selectedId || !selectedUserId) return;
    const fd = new FormData(e.currentTarget);
    const roleKeys = fd
      .getAll("roleKeys")
      .map((x) => String(x).trim())
      .filter(Boolean);
    const payload: any = {
      name: fd.get("name"),
      email: fd.get("email"),
      user_type: fd.get("userType") || "staff",
      mobile: fd.get("mobile") || null,
      branch_id: fd.get("branchId") || null,
      is_active: fd.get("isActive") === "true",
      must_change_password: fd.get("mustChangePassword") === "true",
    };
    payload.role_keys = roleKeys;
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/identity/users/${selectedUserId}`,
        { ...apiSession, tenantId: selectedId },
        { method: "PATCH", body: JSON.stringify(payload) },
      );
      setUsers((previous) => [
        updated,
        ...previous.filter((user: any) => user.id !== updated.id),
      ]);
      openListing("users");
      await loadTenantAccess(selectedId);
      setMessage("User updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update user.");
    } finally {
      setBusy(false);
    }
  }

  async function resetUserPassword(e: any) {
    e.preventDefault();
    if (!apiSession || !passwordUser) return;
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("newPassword") || "");
    const confirm = String(fd.get("confirmPassword") || "");
    if (password !== confirm) {
      setMessage("Passwords do not match.");
      return;
    }
    const tenantId =
      passwordUser.tenant_id || selectedId || apiSession.tenantId;
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/identity/users/${passwordUser.id}/password-reset`,
        { ...apiSession, tenantId },
        {
          method: "POST",
          body: JSON.stringify({
            new_password: password,
            must_change_password: fd.get("mustChangePassword") === "true",
          }),
        },
      );
      setUsers((previous) => [
        updated,
        ...previous.filter((user: any) => user.id !== updated.id),
      ]);
      setPasswordUser(null);
      setMessage(`Password reset for ${updated.name}.`);
    } catch (err: any) {
      setMessage(err.message || "Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  async function changeUserStatus(user: any) {
    if (!apiSession || !selectedId) return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(
        `/identity/users/${user.id}/status`,
        { ...apiSession, tenantId: selectedId },
        {
          method: "POST",
          body: JSON.stringify({ is_active: !user.is_active }),
        },
      );
      await loadTenantAccess(selectedId);
      setMessage(`User ${user.is_active ? "deactivated" : "activated"}.`);
    } catch (err: any) {
      setMessage(err.message || "Could not change user status.");
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function deleteUser(user: any) {
    if (!apiSession || !selectedId) return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(
        `/identity/users/${user.id}`,
        { ...apiSession, tenantId: selectedId },
        { method: "DELETE" },
      );
      await loadTenantAccess(selectedId);
      setMessage("User deleted.");
    } catch (err: any) {
      setMessage(err.message || "Could not delete user.");
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function createDepartment(e: any) {
    e.preventDefault();
    if (!apiSession || !selectedId) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    if (name.length < 2) {
      setMessage("Medical department name must contain at least 2 characters.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch(
        `/tenants/${selectedId}/departments`,
        { ...apiSession, tenantId: selectedId },
        {
          method: "POST",
          body: JSON.stringify({
            name,
            description: fd.get("description") || null,
            created_by_user_id: apiSession.user?.id || null,
          }),
        },
      );
      form.reset();
      setDepartments((previous) => [
        created,
        ...previous.filter((department: any) => department.id !== created.id),
      ]);
      setSelectedDepartmentId(created.id);
      openListing("departments");
      await loadTenantAccess(selectedId);
      setMessage(`Medical Department created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create medical department.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDepartment(e: any) {
    e.preventDefault();
    if (!apiSession || !selectedId || !selectedDepartmentId) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    if (name.length < 2) {
      setMessage("Medical department name must contain at least 2 characters.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/tenants/${selectedId}/departments/${selectedDepartmentId}`,
        { ...apiSession, tenantId: selectedId },
        {
          method: "PATCH",
          body: JSON.stringify({
            name,
            description: fd.get("description") || null,
            is_active: fd.get("isActive") === "true",
          }),
        },
      );
      setDepartments((previous) => [
        updated,
        ...previous.filter((department: any) => department.id !== updated.id),
      ]);
      openListing("departments");
      await loadTenantAccess(selectedId);
      setMessage("Medical Department updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update medical department.");
    } finally {
      setBusy(false);
    }
  }

  async function changeDepartmentStatus(department: any) {
    if (!apiSession || !selectedId) return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(
        `/tenants/${selectedId}/departments/${department.id}/status`,
        { ...apiSession, tenantId: selectedId },
        {
          method: "POST",
          body: JSON.stringify({ is_active: !department.is_active }),
        },
      );
      await loadTenantAccess(selectedId);
      setMessage(
        `Medical Department ${department.is_active ? "deactivated" : "activated"}.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not change medical department status.");
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function deleteDepartment(department: any) {
    if (!apiSession || !selectedId) return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(
        `/tenants/${selectedId}/departments/${department.id}`,
        { ...apiSession, tenantId: selectedId },
        { method: "DELETE" },
      );
      await loadTenantAccess(selectedId);
      setMessage("Medical Department deleted.");
    } catch (err: any) {
      setMessage(err.message || "Could not delete medical department.");
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function assignDepartmentTemplate(e: any) {
    e.preventDefault();
    if (!apiSession || !selectedDepartmentId) return;
    const fd = new FormData(e.currentTarget);
    const targetTenantId = String(fd.get("targetTenantId") || "");
    setBusy(true);
    setMessage("");
    try {
      const assigned = await apiFetch(
        `/tenants/departments/${selectedDepartmentId}/assign/${targetTenantId}`,
        apiSession,
        { method: "POST" },
      );
      openListing("departments");
      setMessage(
        `Medical Department template assigned to tenant: ${assigned.name}`,
      );
    } catch (err: any) {
      setMessage(
        err.message || "Could not assign medical department template.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createBranch(e: any) {
    e.preventDefault();
    if (!apiSession || !selectedId) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch(
        `/tenants/${selectedId}/branches`,
        { ...apiSession, tenantId: selectedId },
        {
          method: "POST",
          body: JSON.stringify({
            name: fd.get("name"),
            code: fd.get("code"),
            area: fd.get("area") || null,
            address: fd.get("address") || null,
            city: fd.get("city") || null,
            state: fd.get("state") || null,
          }),
        },
      );
      form.reset();
      setTenantBranches((previous) => [
        created,
        ...previous.filter((branch: any) => branch.id !== created.id),
      ]);
      setSelectedBranchId(created.id);
      openListing("branches");
      await loadTenantAccess(selectedId);
      setMessage(`Branch created: ${created.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not create branch.");
    } finally {
      setBusy(false);
    }
  }

  async function updateBranch(e: any) {
    e.preventDefault();
    if (!apiSession || !selectedId || !selectedBranchId) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        `/tenants/${selectedId}/branches/${selectedBranchId}`,
        { ...apiSession, tenantId: selectedId },
        {
          method: "PATCH",
          body: JSON.stringify({
            name: fd.get("name"),
            code: fd.get("code"),
            area: fd.get("area") || null,
            address: fd.get("address") || null,
            city: fd.get("city") || null,
            state: fd.get("state") || null,
            is_active: fd.get("isActive") === "true",
          }),
        },
      );
      setTenantBranches((previous) => [
        updated,
        ...previous.filter((branch: any) => branch.id !== updated.id),
      ]);
      openListing("branches");
      await loadTenantAccess(selectedId);
      setMessage("Branch updated.");
    } catch (err: any) {
      setMessage(err.message || "Could not update branch.");
    } finally {
      setBusy(false);
    }
  }

  async function changeBranchStatus(branch: any) {
    if (!apiSession || !selectedId) return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(
        `/tenants/${selectedId}/branches/${branch.id}/status`,
        { ...apiSession, tenantId: selectedId },
        {
          method: "POST",
          body: JSON.stringify({ is_active: !branch.is_active }),
        },
      );
      await loadTenantAccess(selectedId);
      setMessage(`Branch ${branch.is_active ? "deactivated" : "activated"}.`);
    } catch (err: any) {
      setMessage(err.message || "Could not change branch status.");
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function deleteBranch(branch: any) {
    if (!apiSession || !selectedId) return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(
        `/tenants/${selectedId}/branches/${branch.id}`,
        { ...apiSession, tenantId: selectedId },
        { method: "DELETE" },
      );
      await loadTenantAccess(selectedId);
      setMessage("Branch deleted.");
    } catch (err: any) {
      setMessage(err.message || "Could not delete branch.");
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function assignBranchTemplate(e: any) {
    e.preventDefault();
    if (!apiSession || !selectedBranchId) return;
    const fd = new FormData(e.currentTarget);
    const targetTenantId = String(fd.get("targetTenantId") || "");
    setBusy(true);
    setMessage("");
    try {
      const assigned = await apiFetch(
        `/tenants/branches/${selectedBranchId}/assign/${targetTenantId}`,
        apiSession,
        { method: "POST" },
      );
      openListing("branches");
      setMessage(`Branch template assigned to tenant: ${assigned.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not assign branch template.");
    } finally {
      setBusy(false);
    }
  }

  if (!apiSession?.user?.is_super_admin)
    return (
      <Card>
        <h3 className="text-lg font-bold">Super Admin</h3>
        <p className="mt-2 text-sm text-slate-500">
          This workspace is available only for MedizinHub HMS primary tenant
          super admin users.
        </p>
      </Card>
    );

  return (
    <div className="min-w-0 space-y-5">
      <Card className="rounded-lg">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h3 className="card-title font-bold">
              {settingsTenant?.name || "MedizinHub HMS Primary Tenant"}
            </h3>
            <p className="card-desc text-slate-500">
              {settingsTenant
                ? "Manage tenant settings, branches, numbering, modules, and providers for the selected tenant."
                : "Manage tenants, roles, subscriptions, and platform settings from separate pages."}
            </p>
          </div>
          <Badge tone="blue" className="px-2 py-2 lg:px-4 lg:py-3 text-xs rounded-lg">
            Global Platform Access
          </Badge>
        </div>
      </Card>
      <StatusToast message={message} onClose={() => setMessage("")} />
      {currentSection === "overview" && (
        <Overview
          customerTenants={customerTenants}
          activeTenants={activeTenants}
          trialTenants={trialTenants}
          plans={plans}
          estimatedRevenue={estimatedRevenue}
        />
      )}
      {currentSection === "tenants" && (
        <TenantManagement
          tenants={selectableTenants}
          setSelectedId={setSelectedId}
          setSection={changeSection}
          switchTenant={switchTenant}
          apiSession={apiSession}
          busy={busy}
          suspendTenant={suspendTenant}
          onRefresh={loadPlatform}
        />
      )}
      {currentSection === "tenantEdit" && selected && (
        <EditTenant
          selected={selected}
          branches={tenantBranches}
          plans={tenantEditPlans}
          moduleRegistry={moduleRegistry}
          templates={primaryTemplates}
          roles={roles}
          departments={departments}
          users={users}
          subscriptions={tenantSubscriptions}
          busy={busy}
          updateTenant={updateTenant}
          suspendTenant={suspendTenant}
          back={() => changeSection("tenants")}
        />
      )}
      {currentSection === "createTenant" && (
        <CreateTenantForm
          plans={catalogSubscriptionPlans(plans)}
          moduleRegistry={moduleRegistry}
          templates={primaryTemplates}
          busy={busy}
          createTenant={createTenant}
        />
      )}
      {currentSection === "roles" && (
        <RolesManagement
          tenants={selectableTenants}
          customerTenants={customerTenants}
          selected={selected}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          roles={roles}
          setSelectedRoleId={setSelectedRoleId}
          setSection={changeSection}
          setConfirmAction={setConfirmAction}
          onRefresh={loadPlatform}
        />
      )}
      {currentSection === "roleCreate" && (
        <CreateRole
          tenants={selectableTenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          permissionCatalog={permissionCatalog}
          busy={busy}
          createRole={createRole}
          back={() => changeSection("roles")}
        />
      )}
      {currentSection === "roleEdit" && (
        <EditRole
          role={roles.find((r: any) => r.id === selectedRoleId)}
          busy={busy}
          updateRole={updateRole}
          back={() => changeSection("roles")}
        />
      )}
      {currentSection === "rolePermissions" && (
        <RolePermissions
          role={roles.find((r: any) => r.id === selectedRoleId)}
          permissionCatalog={permissionCatalog}
          busy={busy}
          updateRole={updateRole}
          back={() => changeSection("roles")}
        />
      )}
      {currentSection === "roleAssign" && (
        <AssignTemplate
          title="Assign Role Template"
          item={roles.find((r: any) => r.id === selectedRoleId)}
          tenants={selectableTenants.filter(
            (tenant: any) => tenant.id !== selectedId,
          )}
          busy={busy}
          onSubmit={assignRoleTemplate}
          back={() => changeSection("roles")}
        />
      )}
      {currentSection === "users" && (
        <TenantUsers
          tenants={selectableTenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          users={users}
          setSelectedUserId={setSelectedUserId}
          setSection={changeSection}
          setConfirmAction={setConfirmAction}
          onRefresh={loadPlatform}
        />
      )}
      {currentSection === "userCreate" && (
        <CreateUser
          tenants={selectableTenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          branches={tenantBranches}
          roles={roles}
          busy={busy}
          createUser={createUser}
          back={() => changeSection("users")}
        />
      )}
      {currentSection === "userEdit" && (
        <EditUser
          apiSession={apiSession}
          selected={selected}
          user={users.find((u: any) => u.id === selectedUserId)}
          branches={tenantBranches}
          roles={roles}
          busy={busy}
          updateUser={updateUser}
          onResetPassword={setPasswordUser}
          back={() => changeSection("users")}
        />
      )}
      {currentSection === "departments" && (
        <DepartmentsManagement
          tenants={selectableTenants}
          customerTenants={customerTenants}
          selected={selected}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          departments={departments}
          setSelectedDepartmentId={setSelectedDepartmentId}
          setSection={changeSection}
          setConfirmAction={setConfirmAction}
          onRefresh={loadPlatform}
        />
      )}
      {currentSection === "departmentCreate" && (
        <CreateDepartment
          tenants={selectableTenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          busy={busy}
          createDepartment={createDepartment}
          back={() => changeSection("departments")}
        />
      )}
      {currentSection === "departmentEdit" && (
        <EditDepartment
          department={departments.find(
            (d: any) => d.id === selectedDepartmentId,
          )}
          busy={busy}
          updateDepartment={updateDepartment}
          back={() => changeSection("departments")}
        />
      )}
      {currentSection === "departmentAssign" && (
        <AssignTemplate
          title="Assign Medical Department Template"
          item={departments.find((d: any) => d.id === selectedDepartmentId)}
          tenants={selectableTenants.filter(
            (tenant: any) => tenant.id !== selectedId,
          )}
          busy={busy}
          onSubmit={assignDepartmentTemplate}
          back={() => changeSection("departments")}
        />
      )}
      {currentSection === "branches" && (
        <BranchesManagement
          tenants={selectableTenants}
          selected={selected}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          branches={tenantBranches}
          setSelectedBranchId={setSelectedBranchId}
          setSection={changeSection}
          setConfirmAction={setConfirmAction}
          onRefresh={loadPlatform}
        />
      )}
      {currentSection === "branchCreate" && (
        <CreateBranch
          tenants={selectableTenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          busy={busy}
          createBranch={createBranch}
          back={() => changeSection("branches")}
        />
      )}
      {currentSection === "branchEdit" && (
        <EditBranch
          branch={tenantBranches.find((b: any) => b.id === selectedBranchId)}
          busy={busy}
          updateBranch={updateBranch}
          back={() => changeSection("branches")}
        />
      )}
      {currentSection === "branchAssign" && (
        <AssignTemplate
          title="Assign Branch Template"
          item={tenantBranches.find((b: any) => b.id === selectedBranchId)}
          tenants={selectableTenants.filter(
            (tenant: any) => tenant.id !== selectedId,
          )}
          busy={busy}
          onSubmit={assignBranchTemplate}
          back={() => changeSection("branches")}
        />
      )}
      {currentSection === "subscriptions" && (
        <SubscriptionManagement
          apiSession={apiSession}
          plans={plans}
          tenants={customerTenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          reloadPlans={loadPlatform}
          modules={moduleRegistry}
        />
      )}
      {currentSection === "settings" && (
        <TenantBranchSettings
          apiSession={apiSession}
          selected={selected}
          tenants={customerTenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          plans={plans}
          modules={moduleRegistry}
          reloadPlans={loadPlatform}
        />
      )}
      {confirmAction && (
        <ConfirmModal
          action={confirmAction}
          busy={busy}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            if (confirmAction.entity === "branch")
              return confirmAction.kind === "delete"
                ? deleteBranch(confirmAction.branch)
                : changeBranchStatus(confirmAction.branch);
            if (confirmAction.entity === "department")
              return confirmAction.kind === "delete"
                ? deleteDepartment(confirmAction.department)
                : changeDepartmentStatus(confirmAction.department);
            if (confirmAction.entity === "role")
              return confirmAction.kind === "delete"
                ? deleteRole(confirmAction.role)
                : changeRoleStatus(confirmAction.role);
            return confirmAction.kind === "delete"
              ? deleteUser(confirmAction.user)
              : changeUserStatus(confirmAction.user);
          }}
        />
      )}
      {tenantSuccess && (
        <TenantCreatedModal
          details={tenantSuccess}
          onClose={() => setTenantSuccess(null)}
        />
      )}
      {passwordUser && (
        <PasswordResetModal
          user={passwordUser}
          busy={busy}
          onSubmit={resetUserPassword}
          onCancel={() => setPasswordUser(null)}
        />
      )}
    </div>
  );
}
