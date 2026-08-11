"use client";

import { useRef } from "react";
import { apiFetch, apiUpload } from "@/lib/api";
import {
  UserFormValues,
  BranchFormValues,
  DepartmentFormValues,
} from "@/features/admin/settings.schema";

type Setter<T = any> = React.Dispatch<React.SetStateAction<T[]>>;
type EntitySection = "roles" | "users" | "departments" | "branches";

interface UseSuperAdminActionsArgs {
  apiSession: any;
  selectedId: string;
  tenants: any[];
  plans: any[];
  openListing: (sectionId: string) => void;
  reload: () => Promise<any>;
  loadTenantAccess: (tenantId: string) => Promise<void>;
  setBusy: (busy: boolean) => void;
  setMessage: (message: string) => void;
  setSelectedId: (id: string) => void;
  setTenants: Setter;
  setRoles: Setter;
  setUsers: Setter;
  setDepartments: Setter;
  setTenantBranches: Setter;
  selectedRoleId: string;
  setSelectedRoleId: (id: string) => void;
  selectedUserId: string;
  setSelectedUserId: (id: string) => void;
  selectedDepartmentId: string;
  setSelectedDepartmentId: (id: string) => void;
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
  setConfirmAction: (action: any) => void;
  setTenantSuccess: (details: any) => void;
  passwordUser: any;
  setPasswordUser: (user: any) => void;
}

export function useSuperAdminActions({
  apiSession,
  selectedId,
  tenants,
  plans,
  openListing,
  reload,
  loadTenantAccess,
  setBusy,
  setMessage,
  setSelectedId,
  setTenants,
  setRoles,
  setUsers,
  setDepartments,
  setTenantBranches,
  selectedRoleId,
  setSelectedRoleId,
  selectedUserId,
  setSelectedUserId,
  selectedDepartmentId,
  setSelectedDepartmentId,
  selectedBranchId,
  setSelectedBranchId,
  setConfirmAction,
  setTenantSuccess,
  passwordUser,
  setPasswordUser,
}: UseSuperAdminActionsArgs) {
  const onboardingInFlight = useRef(false);

  const entityConfig: Record<
    EntitySection,
    {
      label: string;
      createPath: string;
      itemPath: (id: string) => string;
      statusPath: (id: string) => string;
      assignPath: ((id: string, targetTenantId: string) => string) | null;
      setter: Setter;
      setSelectedId: (id: string) => void;
    }
  > = {
    roles: {
      label: "Role",
      createPath: "/identity/roles",
      itemPath: (id) => `/identity/roles/${id}`,
      statusPath: (id) => `/identity/roles/${id}/status`,
      assignPath: (id, targetTenantId) =>
        `/identity/roles/${id}/assign/${targetTenantId}`,
      setter: setRoles,
      setSelectedId: setSelectedRoleId,
    },
    users: {
      label: "User",
      createPath: "/identity/users",
      itemPath: (id) => `/identity/users/${id}`,
      statusPath: (id) => `/identity/users/${id}/status`,
      assignPath: null,
      setter: setUsers,
      setSelectedId: setSelectedUserId,
    },
    departments: {
      label: "Medical Department",
      createPath: `/tenants/${selectedId}/departments`,
      itemPath: (id) => `/tenants/${selectedId}/departments/${id}`,
      statusPath: (id) => `/tenants/${selectedId}/departments/${id}/status`,
      assignPath: (id, targetTenantId) =>
        `/tenants/departments/${id}/assign/${targetTenantId}`,
      setter: setDepartments,
      setSelectedId: setSelectedDepartmentId,
    },
    branches: {
      label: "Branch",
      createPath: `/tenants/${selectedId}/branches`,
      itemPath: (id) => `/tenants/${selectedId}/branches/${id}`,
      statusPath: (id) => `/tenants/${selectedId}/branches/${id}/status`,
      assignPath: (id, targetTenantId) =>
        `/tenants/branches/${id}/assign/${targetTenantId}`,
      setter: setTenantBranches,
      setSelectedId: setSelectedBranchId,
    },
  };

  async function createEntity(
    section: EntitySection,
    body: any,
    successMessage: (created: any) => string,
    failureMessage: string,
  ) {
    const cfg = entityConfig[section];
    setBusy(true);
    setMessage("");
    try {
      const created = await apiFetch(
        cfg.createPath,
        { ...apiSession, tenantId: selectedId },
        { method: "POST", body: JSON.stringify(body) },
      );
      cfg.setter((previous: any[]) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      cfg.setSelectedId(created.id);
      openListing(section);
      await loadTenantAccess(selectedId);
      setMessage(successMessage(created));
      return created;
    } catch (err: any) {
      setMessage(err.message || failureMessage);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function updateEntity(
    section: EntitySection,
    id: string,
    body: any,
    successMessage: string,
    failureMessage: string,
  ) {
    const cfg = entityConfig[section];
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiFetch(
        cfg.itemPath(id),
        { ...apiSession, tenantId: selectedId },
        { method: "PATCH", body: JSON.stringify(body) },
      );
      cfg.setter((previous: any[]) => [
        updated,
        ...previous.filter((row: any) => row.id !== updated.id),
      ]);
      openListing(section);
      await loadTenantAccess(selectedId);
      setMessage(successMessage);
      return updated;
    } catch (err: any) {
      setMessage(err.message || failureMessage);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(section: EntitySection, row: any) {
    const cfg = entityConfig[section];
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(
        cfg.statusPath(row.id),
        { ...apiSession, tenantId: selectedId },
        {
          method: "POST",
          body: JSON.stringify({ is_active: !row.is_active }),
        },
      );
      await loadTenantAccess(selectedId);
      setMessage(`${cfg.label} ${row.is_active ? "deactivated" : "activated"}.`);
    } catch (err: any) {
      setMessage(err.message || `Could not change ${cfg.label.toLowerCase()} status.`);
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function deleteEntity(section: EntitySection, row: any) {
    const cfg = entityConfig[section];
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(
        cfg.itemPath(row.id),
        { ...apiSession, tenantId: selectedId },
        { method: "DELETE" },
      );
      await loadTenantAccess(selectedId);
      setMessage(`${cfg.label} deleted.`);
    } catch (err: any) {
      setMessage(err.message || `Could not delete ${cfg.label.toLowerCase()}.`);
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function assignTemplate(section: EntitySection, itemId: string, e: any) {
    e.preventDefault();
    const cfg = entityConfig[section];
    if (!apiSession || !itemId || !cfg.assignPath) return;
    const fd = new FormData(e.currentTarget);
    const targetTenantId = String(fd.get("targetTenantId") || "");
    setBusy(true);
    setMessage("");
    try {
      const assigned = await apiFetch(
        cfg.assignPath(itemId, targetTenantId),
        apiSession,
        { method: "POST" },
      );
      openListing(section);
      setMessage(`${cfg.label} template assigned to tenant: ${assigned.name}`);
    } catch (err: any) {
      setMessage(
        err.message || `Could not assign ${cfg.label.toLowerCase()} template.`,
      );
    } finally {
      setBusy(false);
    }
  }

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
      openListing("tenantEdit");
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
      await reload();
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

  async function updateTenant(e: any, selected: any) {
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
      await Promise.all([reload(), loadTenantAccess(updated.id)]);
      setMessage(`Tenant has been updated successfully: ${updated.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not update tenant.");
    } finally {
      setBusy(false);
    }
  }

  async function suspendTenant(tenant: any) {
    if (!apiSession || !tenant || tenant.is_primary) return;
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
      await reload();
      setMessage(`Tenant deactivated: ${tenant.name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not deactivate tenant.");
    } finally {
      setBusy(false);
      setConfirmAction(null);
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
    const created = await createEntity(
      "roles",
      {
        name: fd.get("name"),
        key: fd.get("key"),
        permission_keys: permissionKeys,
      },
      (row) => `Role created: ${row.name}`,
      "Could not create role.",
    );
    if (created) form.reset();
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
    await updateEntity(
      "roles",
      selectedRoleId,
      payload,
      "Role updated.",
      "Could not update role.",
    );
  }

  async function assignRoleTemplate(e: any) {
    await assignTemplate("roles", selectedRoleId, e);
  }

  async function createUser(data: UserFormValues) {
    if (!apiSession || !selectedId) return;
    const created = await createEntity(
      "users",
      {
        name: data.name,
        email: data.email,
        password: data.password,
        mobile: data.mobile || null,
        user_type: data.userType || "staff",
        branch_id: data.branchId || null,
        role_keys: data.roleKeys || [],
        must_change_password: data.mustChangePassword === "true",
      },
      (row) => `User created: ${row.name}`,
      "Could not create user.",
    );
    return created;
  }

  async function updateUser(data: UserFormValues, selectedUser: any) {
    if (!apiSession || !selectedId || !selectedUser) return;
    await updateEntity(
      "users",
      selectedUser.id,
      {
        name: data.name,
        email: data.email,
        user_type: data.userType || "staff",
        mobile: data.mobile || null,
        branch_id: data.branchId || null,
        is_active: data.isActive === "true",
        must_change_password: data.mustChangePassword === "true",
        role_keys: data.roleKeys || [],
      },
      "User updated.",
      "Could not update user.",
    );
  }

  async function resetUserPassword(e: any) {
    e.preventDefault();
    if (!apiSession || !passwordUser) return;
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("newPassword") || "");
    const confirmPassword = String(fd.get("confirmPassword") || "");
    if (password !== confirmPassword) {
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
      setUsers((previous: any[]) => [
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

  async function createDepartment(data: DepartmentFormValues) {
    if (!apiSession || !selectedId) return;
    const created = await createEntity(
      "departments",
      {
        name: data.name.trim(),
        description: data.description || null,
        branch_id: data.branchId || null,
        created_by_user_id: apiSession.user?.id || null,
      },
      (row) => `Medical Department created: ${row.name}`,
      "Could not create medical department.",
    );
    return created;
  }

  async function updateDepartment(
    data: DepartmentFormValues,
    selectedDepartment: any,
  ) {
    if (!apiSession || !selectedId || !selectedDepartment) return;
    await updateEntity(
      "departments",
      selectedDepartment.id,
      {
        name: data.name.trim(),
        description: data.description || null,
        branch_id: data.branchId || null,
        is_active: data.isActive === "true",
      },
      "Medical Department updated.",
      "Could not update medical department.",
    );
  }

  async function assignDepartmentTemplate(e: any) {
    await assignTemplate("departments", selectedDepartmentId, e);
  }

  async function createBranch(data: BranchFormValues) {
    if (!apiSession || !selectedId) return;
    const created = await createEntity(
      "branches",
      {
        name: data.name,
        code: data.code,
        area: data.area || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
      },
      (row) => `Branch created: ${row.name}`,
      "Could not create branch.",
    );
    return created;
  }

  async function updateBranch(data: BranchFormValues, selectedBranch: any) {
    if (!apiSession || !selectedId || !selectedBranch) return;
    await updateEntity(
      "branches",
      selectedBranch.id,
      {
        name: data.name,
        code: data.code,
        area: data.area || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        is_active: data.isActive === "true",
      },
      "Branch updated.",
      "Could not update branch.",
    );
  }

  async function assignBranchTemplate(e: any) {
    await assignTemplate("branches", selectedBranchId, e);
  }

  return {
    createTenant,
    updateTenant,
    suspendTenant,
    createRole,
    updateRole,
    assignRoleTemplate,
    createUser,
    updateUser,
    resetUserPassword,
    createDepartment,
    updateDepartment,
    assignDepartmentTemplate,
    createBranch,
    updateBranch,
    assignBranchTemplate,
    changeStatus,
    deleteEntity,
  };
}
