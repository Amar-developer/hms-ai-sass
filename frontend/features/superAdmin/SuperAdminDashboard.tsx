"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Card,
  RefreshButton,
  SearchableSelect,
  StatusToast,
} from "@/app/components/common/ui";
import { AdaptiveFilterTrigger } from "@/app/components/common/AdaptiveFilterTrigger";
import { AdaptiveSortTrigger } from "@/app/components/common/AdaptiveSortTrigger";
import { AdaptiveResultCount } from "@/app/components/common/AdaptiveResultCount";
import { BreadcrumbSlot, useShellChrome } from "@/features/shell/AppShell";
import { sortRows } from "@/utils/sortRows";
import {
  applyQueryFilters,
  standardAuditQueryFields,
  type QueryFieldOption,
  type QueryFieldSchema,
  type QueryFilterRow,
} from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";
import { superAdminPath } from "./routing";
import {
  catalogSubscriptionPlans,
  groupRolesByName,
  tenantSelectOptions,
} from "./helpers";
import {
  platformSectionsForUser,
  superAdminSettingsSections,
  tenantTypes,
  tenant_status_options,
} from "./constants";
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
import { WhatsAppIntegrationSettings } from "../admin/whatsapp_integration/WhatsAppIntegrationSettings";
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
  const { beginNavigation } = useShellChrome();
  const currentSection = section || "overview";

  // Tenants/Roles/Users/Departments/Branches share one global search+sort+
  // custom-filter bar (same pattern as TenantAdmin's listQuery/listSort/
  // listQueryFilters) since only one of them is ever visible at a time —
  // reset whenever the section changes so a filter from one entity doesn't
  // silently no-op in another.
  const [listQuery, setListQuery] = useState("");
  const [listSort, setListSort] = useState<SortState | null>({
    key: "updated_at",
    dir: "desc",
  });
  const [listQueryFilters, setListQueryFilters] = useState<QueryFilterRow[]>(
    [],
  );
  useEffect(() => {
    setListQuery("");
    setListSort({ key: "updated_at", dir: "desc" });
    setListQueryFilters([]);
  }, [currentSection]);

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
    const path = superAdminPath(nextSection, pendingIds.current);
    beginNavigation("superadmin", path);
    router.push(path);
  }
  const [confirmAction, setConfirmAction] = useState<any>(null);
  function requestSuspendTenant(tenant: any) {
    setConfirmAction({ kind: "delete", entity: "tenant", tenant });
  }
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
  const settingsModuleId = (() => {
    if (["createTenant", "tenantEdit"].includes(currentSection)) {
      return "tenants";
    }
    if (
      ["roleCreate", "roleEdit", "rolePermissions", "roleAssign"].includes(
        currentSection,
      )
    ) {
      return "roles";
    }
    return currentSection;
  })();
  const permittedSettingsModuleIds = new Set(
    platformSectionsForUser(apiSession?.user).map(([id]) => id),
  );
  const settingsModuleOptions = superAdminSettingsSections
    .filter(([id]) => permittedSettingsModuleIds.has(id))
    .map(([id, label]) => ({ value: id, label }));
  const showSettingsModulePicker = settingsModuleOptions.some(
    (option) => option.value === settingsModuleId,
  );

  const selectableTenants = tenantSelectOptions(data.tenants);
  const selected =
    selectableTenants.find((t) => t.id === data.selectedId) ||
    selectableTenants.find((t) => t.is_primary) ||
    selectableTenants[0];
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
    // which would otherwise bounce straight back to the listing. `busy` only
    // covers the platform-level reload() (tenants/plans); roles, users,
    // departments, and branches load separately via loadTenantAccess(), so
    // that has to be checked too or a detail page opened right as the tenant
    // data (re)loads gets redirected back before it arrives.
    if (data.busy || data.tenantAccessLoading) return;
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
    if (route && !route?.exists) router.replace(superAdminPath(route.list));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentSection,
    selected,
    selectedRoleId,
    selectedUserId,
    selectedDepartmentId,
    selectedBranchId,
    data.busy,
    data.tenantAccessLoading,
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

  function distinctFieldOptions(
    rows: any[],
    key: string,
    labelFor?: (value: string) => string,
  ): QueryFieldOption[] {
    const seen = new Map<string, string>();
    rows.forEach((row) => {
      const raw = row[key];
      if (raw === null || raw === undefined || raw === "") return;
      const value = String(raw);
      if (!seen.has(value)) seen.set(value, labelFor ? labelFor(value) : value);
    });
    return Array.from(seen.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }

  const statusField = (rows: any[]): QueryFieldSchema => ({
    key: "is_active",
    label: "Status",
    type: "select",
    options: distinctFieldOptions(rows, "is_active", (value) =>
      value === "true" ? "Active" : "Inactive",
    ),
  });

  const userAuditOptions: Record<string, QueryFieldOption[]> = {
    created_by_user_id: data.users.map((user: any) => ({
      value: user.id,
      label: user.name || user.email || user.id,
    })),
    updated_by_user_id: data.users.map((user: any) => ({
      value: user.id,
      label: user.name || user.email || user.id,
    })),
  };

  const groupedRoles = groupRolesByName(data.roles);
  const nonSuperAdminUsers = data.users.filter(
    (user: any) => !user.is_super_admin,
  );

  // Config for whichever of the 5 list sections is currently active — the
  // shared search/sort/custom-filter bar in the breadcrumb (below) reads
  // from this instead of each section owning its own fixed status/type
  // dropdowns and its own Tenant picker.
  const listSectionConfig: Record<
    string,
    { rows: any[]; searchKeys: string[]; queryFields: QueryFieldSchema[] }
  > = {
    tenants: {
      rows: selectableTenants,
      searchKeys: ["name", "legal_name", "id"],
      queryFields: [
        { key: "name", label: "Name", type: "text" },
        { key: "legal_name", label: "Legal Name", type: "text" },
        {
          key: "tenant_type",
          label: "Type",
          type: "select",
          options: tenantTypes.map(([value, label]) => ({ value, label })),
        },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: tenant_status_options.filter(
            (option) => option.value !== "all",
          ),
        },
        { key: "updated_at", label: "Last Updated", type: "date" },
      ],
    },
    roles: {
      rows: groupedRoles,
      searchKeys: ["name", "display_key", "id"],
      queryFields: [
        { key: "name", label: "Name", type: "text" },
        statusField(groupedRoles),
        { key: "created_at", label: "Created On", type: "date" },
        { key: "updated_at", label: "Last Updated", type: "date" },
      ],
    },
    users: {
      rows: nonSuperAdminUsers,
      searchKeys: ["name", "email", "mobile", "user_type", "roles", "id"],
      queryFields: [
        { key: "name", label: "Name", type: "text" },
        { key: "email", label: "Email", type: "text" },
        { key: "mobile", label: "Mobile", type: "text" },
        {
          key: "user_type",
          label: "User Type",
          type: "select",
          options: distinctFieldOptions(nonSuperAdminUsers, "user_type"),
        },
        statusField(nonSuperAdminUsers),
      ],
    },
    departments: {
      rows: data.departments,
      searchKeys: ["name", "code", "description"],
      queryFields: [
        { key: "name", label: "Name", type: "text" },
        { key: "code", label: "Code", type: "text" },
        { key: "description", label: "Description", type: "text" },
        statusField(data.departments),
        ...standardAuditQueryFields({
          rows: data.departments,
          filterOptions: userAuditOptions,
          includeUpdatedBy: true,
        }),
      ],
    },
    branches: {
      rows: data.tenantBranches,
      searchKeys: ["name", "code", "area", "city", "state"],
      queryFields: [
        { key: "name", label: "Name", type: "text" },
        { key: "code", label: "Code", type: "text" },
        { key: "city", label: "City", type: "text" },
        { key: "state", label: "State", type: "text" },
        statusField(data.tenantBranches),
        ...standardAuditQueryFields({
          rows: data.tenantBranches,
          filterOptions: userAuditOptions,
          includeUpdatedBy: true,
        }),
      ],
    },
  };

  const listSortFields = [
    { key: "name", label: "Name" },
    { key: "is_active", label: "Status" },
    { key: "created_at", label: "Created On" },
    { key: "updated_at", label: "Last Modified" },
  ];

  const listSectionNouns: Record<string, string> = {
    tenants: "tenants",
    roles: "roles",
    users: "users",
    departments: "departments",
    branches: "branches",
  };

  const activeListConfig = listSectionConfig[currentSection];

  function matchesListQuery(row: any, searchKeys: string[]) {
    if (!listQuery.trim()) return true;
    const q = listQuery.trim().toLowerCase();
    return searchKeys.some((key) =>
      String(row[key] ?? "")
        .toLowerCase()
        .includes(q),
    );
  }

  const listRows = useMemo(() => {
    if (!activeListConfig) return [];
    return sortRows(
      applyQueryFilters(
        activeListConfig.rows.filter((row: any) =>
          matchesListQuery(row, activeListConfig.searchKeys),
        ),
        activeListConfig.queryFields,
        listQueryFilters,
      ),
      listSort,
      (row: any, key: string) =>
        key === "updated_at" ? row.updated_at || row.created_at : row[key],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeListConfig, listQuery, listQueryFilters, listSort]);

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
    <div className="min-w-0 ">
      <StatusToast message={data.message} onClose={() => data.setMessage("")} />
      {showSettingsModulePicker && (
        <BreadcrumbSlot>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-400 lg:inline">
              Settings module
            </span>
            <SearchableSelect
              value={settingsModuleId}
              onChange={openListing}
              options={settingsModuleOptions}
              placeholder="Open settings module"
              searchable={false}
              className="w-[170px] sm:w-[210px]"
            />
          </div>
        </BreadcrumbSlot>
      )}
      {activeListConfig && !["tenants", "roles"].includes(currentSection) && (
        <BreadcrumbSlot>
          <div className="flex items-center gap-2">
            <AdaptiveResultCount
              shown={listRows.length}
              total={activeListConfig.rows.length}
              noun={listSectionNouns[currentSection] || "records"}
            />
            <RefreshButton
              onRefresh={data.reload}
              className="h-auto rounded-md px-2.5 py-1 text-[11px]"
            />
            <AdaptiveFilterTrigger
              schema={{
                id: `superadmin-${currentSection}`,
                searchLabel: "Search",
                searchPlaceholder: "Search",
                filters: [],
                sortFields: listSortFields,
              }}
              query={listQuery}
              setQuery={setListQuery}
              filterValues={{}}
              sort={listSort}
              onSortChange={setListSort}
              showSort={false}
              onReset={() => {
                setListQuery("");
                setListSort(null);
              }}
              queryFields={activeListConfig.queryFields}
              queryFilters={listQueryFilters}
              onQueryFiltersChange={setListQueryFilters}
            >
              {isRoot && currentSection !== "tenants" && (
                <TenantPicker
                  tenants={selectableTenants}
                  selectedId={data.selectedId}
                  setSelectedId={setSelectedTenantId}
                />
              )}
            </AdaptiveFilterTrigger>
            <AdaptiveSortTrigger
              fields={listSortFields}
              sort={listSort}
              onSortChange={setListSort}
            />
          </div>
        </BreadcrumbSlot>
      )}
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
          rows={listRows}
          setSelectedId={setSelectedTenantId}
          setSection={changeSection}
          switchTenant={switchTenant}
          apiSession={apiSession}
          canCopyIds={canCopyIds}
          busy={data.busy}
          suspendTenant={requestSuspendTenant}
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
          suspendTenant={requestSuspendTenant}
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
          back={() => changeSection("tenants")}
        />
      )}
      {currentSection === "roles" && (
        <RolesManagement
          selected={selected}
          tenants={selectableTenants}
          selectedId={data.selectedId}
          setSelectedId={setSelectedTenantId}
          rows={listRows}
          canCopyIds={canCopyIds}
          setSelectedRoleId={setSelectedRoleId}
          setSection={changeSection}
          setConfirmAction={setConfirmAction}
          busy={data.busy || data.tenantAccessLoading}
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
          rows={listRows}
          canCopyIds={canCopyIds}
          setSelectedUserId={setSelectedUserId}
          setSection={changeSection}
          setConfirmAction={setConfirmAction}
          busy={data.busy || data.tenantAccessLoading}
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
          selected={selected}
          rows={listRows}
          setSelectedDepartmentId={setSelectedDepartmentId}
          setSection={changeSection}
          setConfirmAction={setConfirmAction}
          busy={data.busy || data.tenantAccessLoading}
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
          selected={selected}
          rows={listRows}
          canCopyIds={canCopyIds}
          setSelectedBranchId={setSelectedBranchId}
          setSection={changeSection}
          setConfirmAction={setConfirmAction}
          busy={data.busy || data.tenantAccessLoading}
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
        <div className="space-y-3">
          <BreadcrumbSlot>
            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-400 lg:inline">
                Tenant
              </span>
              <SearchableSelect
                value={data.selectedId}
                onChange={setSelectedTenantId}
                options={customerTenants.map((tenant: any) => ({
                  value: tenant.id,
                  label: tenant.name,
                }))}
                placeholder="Select tenant"
                searchable={false}
                className="w-[150px] sm:w-[190px]"
              />
              <Badge
                tone={tenantWhatsAppEnabled ? "green" : "slate"}
                className="normal-label inline-flex whitespace-nowrap"
              >
                <span className="sm:hidden">
                  {tenantWhatsAppEnabled ? "Included" : "Not included"}
                </span>
                <span className="hidden sm:inline">
                  {tenantWhatsAppEnabled
                    ? "Included in active subscription"
                    : "Not included in active subscription"}
                </span>
              </Badge>
            </div>
          </BreadcrumbSlot>
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
          title={
            confirmAction.entity === "tenant" ? "Deactivate Tenant" : undefined
          }
          message={
            confirmAction.entity === "tenant"
              ? `Deactivate tenant ${confirmAction.tenant?.name}? This suspends access and keeps tenant records for audit and compliance.`
              : undefined
          }
          confirmLabel={
            confirmAction.entity === "tenant" ? "Yes, Deactivate" : undefined
          }
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            if (confirmAction.entity === "tenant")
              return actions.suspendTenant(confirmAction.tenant);
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
