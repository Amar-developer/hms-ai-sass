"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, StatusToast } from "@/app/components/common/ui";
import { superAdminPath } from "./routing";
import { catalogSubscriptionPlans,tenantSelectOptions } from "./helpers";
import { Overview } from "./components/overview/Overview";
import { TenantManagement } from "./components/tenants/TenantManagement";
import { EditTenant } from "./components/tenants/EditTenant";
import { CreateTenantForm } from "./components/tenants/CreateTenantForm";
import { TenantCreatedModal } from "./components/tenants/TenantCreatedModal";
import { RolesManagement } from "./components/roles/RolesManagement";
import { CreateRole } from "./components/roles/CreateRole";
import { EditRole } from "./components/roles/EditRole";
import { RolePermissions } from "./components/roles/RolePermissions";
import { TenantUsers } from "./components/users/TenantUsers";
import { PrivilegedAccess } from "./components/users/PrivilegedAccess";
import { DepartmentsManagement } from "./components/departments/DepartmentsManagement";
import { BranchesManagement } from "./components/branches/BranchesManagement";
import { AssignTemplate } from "./components/shared/AssignTemplate";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { PasswordResetModal } from "./components/shared/PasswordResetModal";
import { SubscriptionManagement } from "./components/subscriptions/SubscriptionManagement";
import { TenantBranchSettings } from "./components/subscriptions/TenantBranchSettings";
import { TenantPicker } from "./components/shared/TenantPicker";
import { WhatsAppIntegrationSettings } from "@/features/admin/components/WhatsAppIntegrationSettings";
import { UserForm } from "@/features/admin/forms/UserForm";
import { BranchForm } from "@/features/admin/forms/BranchForm";
import { DepartmentForm } from "@/features/admin/forms/DepartmentForm";
import { useSuperAdminData, useSuperAdminActions } from "./api";
import { canCopyDatabaseIds } from "@/app/components/common/CopyIdButton";
import { canResetUserPassword } from "./helpers";

export { superAdminSections } from "./constants";
export { platformSectionsForUser } from "./constants";

export function SuperAdminDashboard({
  apiSession,
  switchTenant,
  section,
  setSection,
  selectedDetailId = "",
}: any) {
  const router = useRouter();
  const currentSection = section || "overview";

  // Children set the target record and then switch section as two separate
  // calls (setSelectedRoleId(id); setSection("roleEdit")). Since the id now
  // lives in the URL rather than state, hold it in a ref so the section
  // change that follows can build a path that already includes it.
  const pendingIds = useRef<{
    tenantId?: string;
    roleId?: string;
    userId?: string;
    departmentId?: string;
    branchId?: string;
  }>({});

  const selectedRoleId = selectedDetailId;
  const selectedUserId = selectedDetailId;
  const selectedDepartmentId = selectedDetailId;
  const selectedBranchId = selectedDetailId;
  const setSelectedRoleId = (id: string) => {
    pendingIds.current.roleId = id;
  };
  const setSelectedUserId = (id: string) => {
    pendingIds.current.userId = id;
  };
  const setSelectedDepartmentId = (id: string) => {
    pendingIds.current.departmentId = id;
  };
  const setSelectedBranchId = (id: string) => {
    pendingIds.current.branchId = id;
  };

  function changeSection(nextSection: string) {
    router.push(superAdminPath(nextSection, pendingIds.current));
  }
  const [confirmAction, setConfirmAction] = useState<any>(null);
  const [tenantSuccess, setTenantSuccess] = useState<any>(null);
  const [passwordUser, setPasswordUser] = useState<any>(null);

  const data = useSuperAdminData(apiSession);
  // data.selectedId is the workspace-wide "which tenant am I managing"
  // context, not just a detail-page id, so it stays state — but record it
  // too, so a following changeSection("tenantEdit") can put it in the URL.
  const setSelectedTenantId = (id: string) => {
    pendingIds.current.tenantId = id;
    data.setSelectedId(id);
  };
  // A direct/bookmarked /superadmin/tenants/{id}/edit link must re-point the
  // workspace at that tenant rather than whatever was last selected.
  useEffect(() => {
    if (
      currentSection === "tenantEdit" &&
      selectedDetailId &&
      selectedDetailId !== data.selectedId
    ) {
      data.setSelectedId(selectedDetailId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSection, selectedDetailId, data.selectedId]);
  const isRoot = Boolean(apiSession?.user?.is_super_admin);
  const isPrivilegedWorkspace = Boolean(
    isRoot ||
      apiSession?.user?.user_type === "platform_admin" ||
      apiSession?.user?.user_type === "support_admin",
  );
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);

  const selectableTenants = tenantSelectOptions(data.tenants);
  const selected =
    selectableTenants.find((t) => t.id === data.selectedId) ||
    selectableTenants.find((t) => t.is_primary) ||
    selectableTenants[0];
  const settingsTenant = ["settings", "whatsappSettings"].includes(
    currentSection,
  )
    ? selected
    : null;
  const customerTenants = tenantSelectOptions(
    data.tenants.filter((t) => !t.is_primary),
  );
  const currentTenantPlanIds = new Set(
    data.tenantSubscriptions.map((subscription: any) => subscription.plan_id),
  );
  const catalogPlanIds = new Set(
    catalogSubscriptionPlans(data.plans).map((plan: any) => plan.id),
  );
  const tenantEditPlans = data.plans.filter(
    (plan: any) =>
      catalogPlanIds.has(plan.id) || currentTenantPlanIds.has(plan.id),
  );
  const activeTenantSubscription =
    data.tenantSubscriptions.find(
      (subscription: any) =>
        subscription.status === "active" || subscription.is_active,
    ) || data.tenantSubscriptions[0];
  const activeTenantPlan = activeTenantSubscription
    ? data.plans.find(
        (plan: any) => plan.id === activeTenantSubscription.plan_id,
      )
    : null;
  const tenantWhatsAppEnabled = Boolean(
    activeTenantPlan?.enabled_modules?.includes("whatsapp"),
  );

  useEffect(() => {
    if (
      currentSection === "whatsappSettings" &&
      customerTenants.length > 0 &&
      !customerTenants.some((tenant: any) => tenant.id === data.selectedId)
    ) {
      data.setSelectedId(customerTenants[0].id);
    }
  }, [currentSection, customerTenants, data.selectedId]);
  const activeTenants = customerTenants.filter(
    (t) => t.status === "active",
  ).length;
  const trialTenants = customerTenants.filter(
    (t) => t.status === "trial",
  ).length;
  const estimatedRevenue = customerTenants.reduce(
    (sum, t) =>
      sum +
      Number(data.plans.find((p) => p.is_active)?.price_inr_monthly || 0),
    0,
  );

  function openListing(sectionId: string) {
    changeSection(sectionId);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  const actions = useSuperAdminActions({
    apiSession,
    selectedId: data.selectedId,
    tenants: data.tenants,
    plans: data.plans,
    openListing,
    reload: data.reload,
    loadTenantAccess: data.loadTenantAccess,
    setBusy: data.setBusy,
    setMessage: data.setMessage,
    setSelectedId: setSelectedTenantId,
    setTenants: data.setTenants,
    setRoles: data.setRoles,
    setUsers: data.setUsers,
    setDepartments: data.setDepartments,
    setTenantBranches: data.setTenantBranches,
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
  });

  useEffect(() => {
    // Don't judge a record "missing" while its list is still being fetched —
    // on a direct/bookmarked detail link the collections start out empty,
    // which would otherwise bounce straight back to the listing.
    if (data.busy) return;
    const detailRoutes: Record<string, { list: string; exists: boolean }> = {
      tenantEdit: { list: "tenants", exists: Boolean(selected) },
      roleEdit: {
        list: "roles",
        exists: data.roles.some((role: any) => role.id === selectedRoleId),
      },
      rolePermissions: {
        list: "roles",
        exists: data.roles.some((role: any) => role.id === selectedRoleId),
      },
      roleAssign: {
        list: "roles",
        exists: data.roles.some((role: any) => role.id === selectedRoleId),
      },
      userEdit: {
        list: "users",
        exists: data.users.some((user: any) => user.id === selectedUserId),
      },
      departmentEdit: {
        list: "departments",
        exists: data.departments.some(
          (department: any) => department.id === selectedDepartmentId,
        ),
      },
      departmentAssign: {
        list: "departments",
        exists: data.departments.some(
          (department: any) => department.id === selectedDepartmentId,
        ),
      },
      branchEdit: {
        list: "branches",
        exists: data.tenantBranches.some(
          (branch: any) => branch.id === selectedBranchId,
        ),
      },
      branchAssign: {
        list: "branches",
        exists: data.tenantBranches.some(
          (branch: any) => branch.id === selectedBranchId,
        ),
      },
    };
    const route = detailRoutes[currentSection];
    if (route && !route.exists) router.replace(superAdminPath(route.list));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentSection,
    selected,
    selectedRoleId,
    selectedUserId,
    selectedDepartmentId,
    selectedBranchId,
    data.busy,
    data.roles,
    data.users,
    data.departments,
    data.tenantBranches,
  ]);

  const editingUser = data.users.find(
    (user: any) => user.id === selectedUserId,
  );
  const editingDepartment = data.departments.find(
    (department: any) => department.id === selectedDepartmentId,
  );
  const editingBranch = data.tenantBranches.find(
    (branch: any) => branch.id === selectedBranchId,
  );

  if (!isPrivilegedWorkspace)
    return (
      <Card>
        <h3 className="text-lg font-bold">Super Admin</h3>
        <p className="mt-2 text-sm text-slate-500">
          This workspace is available only for authorized platform accounts.
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
            {isRoot
              ? "Root Platform Access"
              : apiSession?.user?.user_type === "support_admin"
                ? "Temporary Support Access"
                : "Scoped Platform Access"}
          </Badge>
        </div>
      </Card>
      <StatusToast message={data.message} onClose={() => data.setMessage("")} />
      {currentSection === "overview" && (
        <Overview
          customerTenants={customerTenants}
          activeTenants={activeTenants}
          trialTenants={trialTenants}
          plans={data.plans}
          estimatedRevenue={estimatedRevenue}
          loading={data.busy}
        />
      )}
      {currentSection === "privilegedAccess" && (
        <PrivilegedAccess
          apiSession={apiSession}
          tenants={selectableTenants}
          switchTenant={switchTenant}
          busy={data.busy}
          setBusy={data.setBusy}
          setMessage={data.setMessage}
        />
      )}
      {currentSection === "tenants" && (
        <TenantManagement
          tenants={selectableTenants}
          setSelectedId={setSelectedTenantId}
          setSection={changeSection}
          switchTenant={switchTenant}
          apiSession={apiSession}
          canCopyIds={canCopyIds}
          busy={data.busy}
          suspendTenant={actions.suspendTenant}
          onRefresh={data.reload}
        />
      )}
      {currentSection === "tenantEdit" && selected && (
        <EditTenant
          selected={selected}
          branches={data.tenantBranches}
          plans={tenantEditPlans}
          moduleRegistry={data.moduleRegistry}
          templates={data.primaryTemplates}
          roles={data.roles}
          departments={data.departments}
          users={data.users}
          subscriptions={data.tenantSubscriptions}
          busy={data.busy}
          updateTenant={(e: any) => actions.updateTenant(e, selected)}
          suspendTenant={actions.suspendTenant}
          back={() => changeSection("tenants")}
        />
      )}
      {currentSection === "createTenant" && (
        <CreateTenantForm
          plans={catalogSubscriptionPlans(data.plans)}
          moduleRegistry={data.moduleRegistry}
          templates={data.primaryTemplates}
          busy={data.busy}
          createTenant={actions.createTenant}
        />
      )}
      {currentSection === "roles" && (
        <RolesManagement
          tenants={selectableTenants}
          customerTenants={customerTenants}
          selected={selected}
          selectedId={data.selectedId}
          setSelectedId={setSelectedTenantId}
          roles={data.roles}
          canCopyIds={canCopyIds}
          setSelectedRoleId={setSelectedRoleId}
          setSection={changeSection}
          setConfirmAction={setConfirmAction}
          onRefresh={data.reload}
          busy={data.busy}
        />
      )}
      {currentSection === "roleCreate" && (
        <CreateRole
          tenants={selectableTenants}
          selectedId={data.selectedId}
          setSelectedId={setSelectedTenantId}
          permissionCatalog={data.permissionCatalog}
          busy={data.busy}
          createRole={actions.createRole}
          back={() => changeSection("roles")}
        />
      )}
      {currentSection === "roleEdit" && (
        <EditRole
          role={data.roles.find((r: any) => r.id === selectedRoleId)}
          permissionCatalog={data.permissionCatalog}
          busy={data.busy}
          updateRole={actions.updateRole}
          back={() => changeSection("roles")}
        />
      )}
      {currentSection === "rolePermissions" && (
        <RolePermissions
          role={data.roles.find((r: any) => r.id === selectedRoleId)}
          roles={data.roles}
          permissionCatalog={data.permissionCatalog}
          onRoleChange={setSelectedRoleId}
          busy={data.busy}
          updateRole={actions.updateRole}
          back={() => changeSection("roles")}
        />
      )}
      {currentSection === "roleAssign" && (
        <AssignTemplate
          title="Assign Role Template"
          item={data.roles.find((r: any) => r.id === selectedRoleId)}
          tenants={selectableTenants.filter(
            (tenant: any) => tenant.id !== data.selectedId,
          )}
          busy={data.busy}
          onSubmit={actions.assignRoleTemplate}
          back={() => changeSection("roles")}
        />
      )}
      {currentSection === "users" && (
        <TenantUsers
          tenants={selectableTenants}
          selectedId={data.selectedId}
          setSelectedId={setSelectedTenantId}
          users={data.users.filter((user: any) => !user.is_super_admin)}
          canCopyIds={canCopyIds}
          setSelectedUserId={setSelectedUserId}
          setSection={changeSection}
          setConfirmAction={setConfirmAction}
          onRefresh={data.reload}
          busy={data.busy}
        />
      )}
      {currentSection === "userCreate" && (
        <UserForm
          title="Create User"
          roles={data.roles.filter((role: any) => role.key !== "super_admin")}
          branches={data.tenantBranches}
          busy={data.busy}
          tenants={selectableTenants}
          selectedId={data.selectedId}
          setSelectedId={setSelectedTenantId}
          defaultUserType="tenant_admin"
          apiSession={apiSession}
          onSubmit={actions.createUser}
          back={() => changeSection("users")}
        />
      )}
      {currentSection === "userEdit" && (
        <UserForm
          title="Edit User"
          user={editingUser}
          roles={data.roles.filter((role: any) => role.key !== "super_admin")}
          branches={data.tenantBranches}
          busy={data.busy}
          apiSession={apiSession}
          canResetPassword={canResetUserPassword(apiSession, editingUser, selected)}
          onSubmit={(formData: any) => actions.updateUser(formData, editingUser)}
          onResetPassword={setPasswordUser}
          back={() => changeSection("users")}
        />
      )}
      {currentSection === "departments" && (
        <DepartmentsManagement
          tenants={selectableTenants}
          customerTenants={customerTenants}
          selected={selected}
          selectedId={data.selectedId}
          setSelectedId={setSelectedTenantId}
          departments={data.departments}
          setSelectedDepartmentId={setSelectedDepartmentId}
          setSection={changeSection}
          setConfirmAction={setConfirmAction}
          onRefresh={data.reload}
          busy={data.busy}
        />
      )}
      {currentSection === "departmentCreate" && (
        <DepartmentForm
          title="Create Medical Department"
          departments={data.departments}
          branches={data.tenantBranches}
          busy={data.busy}
          tenants={selectableTenants}
          selectedId={data.selectedId}
          setSelectedId={setSelectedTenantId}
          onSubmit={actions.createDepartment}
          back={() => changeSection("departments")}
        />
      )}
      {currentSection === "departmentEdit" && (
        <DepartmentForm
          title="Edit Medical Department"
          department={editingDepartment}
          departments={data.departments}
          branches={data.tenantBranches}
          busy={data.busy}
          onSubmit={(formData: any) =>
            actions.updateDepartment(formData, editingDepartment)
          }
          back={() => changeSection("departments")}
        />
      )}
      {currentSection === "departmentAssign" && (
        <AssignTemplate
          title="Assign Medical Department Template"
          item={data.departments.find(
            (d: any) => d.id === selectedDepartmentId,
          )}
          tenants={selectableTenants.filter(
            (tenant: any) => tenant.id !== data.selectedId,
          )}
          busy={data.busy}
          onSubmit={actions.assignDepartmentTemplate}
          back={() => changeSection("departments")}
        />
      )}
      {currentSection === "branches" && (
        <BranchesManagement
          tenants={selectableTenants}
          selected={selected}
          selectedId={data.selectedId}
          setSelectedId={setSelectedTenantId}
          branches={data.tenantBranches}
          canCopyIds={canCopyIds}
          setSelectedBranchId={setSelectedBranchId}
          setSection={changeSection}
          setConfirmAction={setConfirmAction}
          onRefresh={data.reload}
          busy={data.busy}
        />
      )}
      {currentSection === "branchCreate" && (
        <BranchForm
          title="Create Branch"
          busy={data.busy}
          tenants={selectableTenants}
          selectedId={data.selectedId}
          setSelectedId={setSelectedTenantId}
          onSubmit={actions.createBranch}
          back={() => changeSection("branches")}
        />
      )}
      {currentSection === "branchEdit" && (
        <BranchForm
          title="Edit Branch"
          branch={editingBranch}
          busy={data.busy}
          onSubmit={(formData: any) => actions.updateBranch(formData, editingBranch)}
          back={() => changeSection("branches")}
        />
      )}
      {currentSection === "branchAssign" && (
        <AssignTemplate
          title="Assign Branch Template"
          item={data.tenantBranches.find(
            (b: any) => b.id === selectedBranchId,
          )}
          tenants={selectableTenants.filter(
            (tenant: any) => tenant.id !== data.selectedId,
          )}
          busy={data.busy}
          onSubmit={actions.assignBranchTemplate}
          back={() => changeSection("branches")}
        />
      )}
      {currentSection === "subscriptions" && (
        <SubscriptionManagement
          apiSession={apiSession}
          plans={data.plans}
          tenants={customerTenants}
          selectedId={data.selectedId}
          setSelectedId={setSelectedTenantId}
          reloadPlans={data.reload}
          modules={data.moduleRegistry}
        />
      )}
      {currentSection === "settings" && (
        <TenantBranchSettings
          apiSession={apiSession}
          selected={selected}
          tenants={customerTenants}
          selectedId={data.selectedId}
          setSelectedId={setSelectedTenantId}
          plans={data.plans}
          modules={data.moduleRegistry}
          reloadPlans={data.reload}
        />
      )}
      {currentSection === "whatsappSettings" && (
        <div className="space-y-5">
          <Card>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <TenantPicker
                tenants={customerTenants}
                selectedId={data.selectedId}
                setSelectedId={setSelectedTenantId}
              />
              <Badge tone={tenantWhatsAppEnabled ? "green" : "slate"} className="normal-badge">
                {tenantWhatsAppEnabled
                  ? "Included in active subscription"
                  : "Not included in active subscription"}
              </Badge>
            </div>
          </Card>
          {tenantWhatsAppEnabled ? (
            <WhatsAppIntegrationSettings
              apiSession={apiSession}
              tenantId={data.selectedId}
            />
          ) : (
            <Card>
              <h3 className="card-title font-bold">WhatsApp Settings</h3>
              <p className="mt-2 text-sm text-slate-500">
                Enable the WhatsApp module in the tenant&apos;s subscription
                before configuring its connection and notification templates.
              </p>
            </Card>
          )}
        </div>
      )}
      {confirmAction && (
        <ConfirmModal
          action={confirmAction}
          busy={data.busy}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            if (confirmAction.entity === "branch")
              return confirmAction.kind === "delete"
                ? actions.deleteEntity("branches", confirmAction.branch)
                : actions.changeStatus("branches", confirmAction.branch);
            if (confirmAction.entity === "department")
              return confirmAction.kind === "delete"
                ? actions.deleteEntity("departments", confirmAction.department)
                : actions.changeStatus("departments", confirmAction.department);
            if (confirmAction.entity === "role")
              return confirmAction.kind === "delete"
                ? actions.deleteEntity("roles", confirmAction.role)
                : actions.changeStatus("roles", confirmAction.role);
            return confirmAction.kind === "delete"
              ? actions.deleteEntity("users", confirmAction.user)
              : actions.changeStatus("users", confirmAction.user);
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
          busy={data.busy}
          onSubmit={actions.resetUserPassword}
          onCancel={() => setPasswordUser(null)}
        />
      )}
    </div>
  );
}
