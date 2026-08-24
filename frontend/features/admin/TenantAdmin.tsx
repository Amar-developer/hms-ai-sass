"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { tenantAdminSections, clinic_sections, sectionSlug } from "./constants";
import { newSegment, editSegment } from "@/lib/routeSlugs";

const allAdminSections = [...tenantAdminSections, ...clinic_sections];
import { canUseTenantAdminSection } from "./permissions";
import {
  Card,
  RefreshButton,
  SearchableSelect,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { AdaptiveFilterTrigger } from "@/app/components/common/AdaptiveFilterTrigger";
import { AdaptiveSortTrigger } from "@/app/components/common/AdaptiveSortTrigger";
import { AdaptiveResultCount } from "@/app/components/common/AdaptiveResultCount";
import { BreadcrumbSlot } from "@/features/shell/AppShell";
import { sortRows } from "@/utils/sortRows";
import {
  applyQueryFilters,
  standardAuditQueryFields,
  type QueryFieldOption,
  type QueryFieldSchema,
  type QueryFilterRow,
} from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";
import { PatientSubscriptions } from "@/features/patient_subscriptions/PatientSubscriptions";
import { groupDepartmentsByName } from "./helpers";
import {
  getUserColumns,
  getRoleColumns,
  getDepartmentColumns,
  getBranchColumns,
  getSupplierColumns,
  getTaxRuleColumns,
  getDiscountOfferColumns,
} from "./column";
import { ListCard } from "./components/ListCard";
import { PasswordResetModal } from "./components/PasswordResetModal";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { UserForm } from "./forms/UserForm";
import { RoleForm } from "./forms/RoleForm";
import { BranchForm } from "./forms/BranchForm";
import { TaxRuleForm } from "./forms/TaxRuleForm";
import { DiscountOfferForm } from "./forms/DiscounOfferForm";
import { DepartmentForm } from "./forms/DepartmentForm";
import { SupplierForm } from "./forms/SupplierForm";
import { FilesPanel } from "./components/FilesPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { WhatsAppIntegrationSettings } from "./whatsapp_integration/WhatsAppIntegrationSettings";
import { PatientIntelligenceSettings } from "./components/PatientIntelligenceSettings";
import { useAdminData } from "./AdminDataContext";
import { useTenantAdminActions } from "./api/useTenantAdminActions";
import { Role } from "./types";
import { canCopyDatabaseIds } from "@/app/components/common/CopyIdButton";

export function TenantAdmin({
  apiSession,
  clinic,
  branchId,
  section,
  view,
  selectedId,
  sections = allAdminSections,
  basePath = "/admin",
}: any) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<any>(null);
  const [passwordUser, setPasswordUser] = useState<any>(null);
  const [reportBusy, setReportBusy] = useState("");

  // Users/Roles/Departments/Branches/Suppliers/Tax/Offers share one
  // search+sort+custom-filter bar (matching Patient's pattern) since only
  // one of them is ever visible at a time — reset whenever the section
  // changes so a filter from one entity doesn't silently no-op in another.
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
  }, [section]);

  const data = useAdminData();
  const whatsappModuleEnabled = Boolean(clinic?.modules?.includes("whatsapp"));
  const permissionKeys: string[] = apiSession?.user?.permissions || [];
  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  const hasAdminAction = (prefix: string, action: string) =>
    Boolean(
      apiSession?.user?.is_super_admin ||
      permissionKeys.includes("*") ||
      apiSession?.user?.roles?.includes("tenant_admin") ||
      apiSession?.user?.user_type === "tenant_admin" ||
      permissionKeys.includes(`${prefix}.manage`) ||
      permissionKeys.includes(`${prefix}.${action}`),
    );

  function goTo(
    nextSection: string,
    nextView = "list",
    nextId = "",
    opts: { replace?: boolean } = {},
  ) {
    const slug = sectionSlug(nextSection);
    const path =
      nextView === "create"
        ? `${basePath}/${nextSection}/${newSegment(slug)}`
        : nextView === "edit"
          ? `${basePath}/${nextSection}/${nextId}/${editSegment(slug)}`
          : nextView === "view"
            ? `${basePath}/${nextSection}/${nextId}`
            : `${basePath}/${nextSection}`;
    if (opts.replace) {
      router.replace(path);
    } else {
      router.push(path);
    }
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  function open(nextSection: string, nextView = "list") {
    goTo(nextSection, nextView);
  }

  function openRolePermissions(role: any) {
    goTo("roles", "edit", role.id);
  }

  function openCreate() {
    goTo(section, "create");
  }

  function openEdit(id: string) {
    goTo(section, "edit", id);
  }

  // Row click opens a read-only view of the record — only the Edit action
  // in the row's Actions menu (openEdit, above) makes it editable.
  function openDetail(id: string) {
    goTo(section, "view", id);
  }

  const actions = useTenantAdminActions({
    // Mutations must target whichever tenant the switcher below has
    // selected, not necessarily the session's own home tenant.
    apiSession: data.scopedApiSession,
    branchId,
    open,
    reload: data.reload,
    setBusy: data.setBusy,
    setMessage: data.setMessage,
    departments: data.departments,
    setRoles: data.setRoles,
    setUsers: data.setUsers,
    setDepartments: data.setDepartments,
    setBranches: data.setBranches,
    setSuppliers: data.setSuppliers,
    setTaxRules: data.setTaxRules,
    setDiscountOffers: data.setDiscountOffers,
    setPasswordUser,
    invoicePrefix: data.invoicePrefix,
    invoiceLogoUrl: data.invoiceLogoUrl,
    setInvoiceLogoUrl: data.setInvoiceLogoUrl,
    bankDetails: data.bankDetails,
    numberingRules: data.numberingRules,
    requeueAfter: data.requeueAfter,
    noShowAfter: data.noShowAfter,
    slotIntervalsEnabled: data.slotIntervalsEnabled,
    slotIntervalMinutes: data.slotIntervalMinutes,
    payments: data.payments,
    providers: data.providers,
    reportEnabled: data.reportEnabled,
    reportRecipients: data.reportRecipients,
    reportCc: data.reportCc,
    reportSendDay: data.reportSendDay,
    reportFilters: data.reportFilters,
    setReportBusy,
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

  function distinctFieldOptions(
    rows: any[],
    key: string,
    labelFor?: (value: string) => string,
  ): { value: string; label: string }[] {
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

  // Config for whichever of the 7 list sections is currently active — one
  // shared search/sort/custom-filter bar (see listQuery/listSort/
  // listQueryFilters above) reads from this instead of each section having
  // its own fixed status/branch/role dropdowns.
  const listSectionConfig: Record<
    string,
    { rows: any[]; searchKeys: string[]; queryFields: QueryFieldSchema[] }
  > = {
    users: {
      rows: data.users,
      searchKeys: ["name", "email", "mobile", "user_type", "roles", "id"],
      queryFields: [
        { key: "name", label: "Name", type: "text" },
        { key: "email", label: "Email", type: "text" },
        { key: "mobile", label: "Mobile", type: "text" },
        {
          key: "user_type",
          label: "User Type",
          type: "select",
          options: distinctFieldOptions(data.users, "user_type"),
        },
        {
          key: "branch_id",
          label: "Branch",
          type: "select",
          options: data.branches.map((branch: any) => ({
            value: branch.id,
            label: branch.name,
          })),
        },
        statusField(data.users),
      ],
    },
    roles: {
      rows: data.roles,
      searchKeys: ["name", "key", "id"],
      queryFields: [
        { key: "name", label: "Name", type: "text" },
        { key: "key", label: "Key", type: "text" },
        statusField(data.roles),
        { key: "created_at", label: "Created On", type: "date" },
        { key: "updated_at", label: "Last Updated", type: "date" },
      ],
    },
    departments: {
      rows: data.departments,
      searchKeys: ["name", "code", "branch_names", "description", "id"],
      queryFields: [
        { key: "name", label: "Name", type: "text" },
        { key: "code", label: "Code", type: "text" },
        { key: "description", label: "Description", type: "text" },
        { key: "branch_names", label: "Branches", type: "text" },
        statusField(data.departments),
        ...standardAuditQueryFields({
          rows: data.departments,
          filterOptions: userAuditOptions,
          includeUpdatedBy: true,
        }),
      ],
    },
    branches: {
      rows: data.branches,
      searchKeys: ["name", "code", "city", "state", "id"],
      queryFields: [
        { key: "name", label: "Name", type: "text" },
        { key: "code", label: "Code", type: "text" },
        { key: "city", label: "City", type: "text" },
        { key: "state", label: "State", type: "text" },
        statusField(data.branches),
        ...standardAuditQueryFields({
          rows: data.branches,
          filterOptions: userAuditOptions,
          includeUpdatedBy: true,
        }),
      ],
    },
    suppliers: {
      rows: data.suppliers,
      searchKeys: ["name", "gstin", "phone", "email", "address", "id"],
      queryFields: [
        { key: "name", label: "Name", type: "text" },
        { key: "gstin", label: "GSTIN", type: "text" },
        { key: "phone", label: "Phone", type: "text" },
        { key: "email", label: "Email", type: "text" },
        { key: "address", label: "Address", type: "text" },
        statusField(data.suppliers),
        ...standardAuditQueryFields({
          rows: data.suppliers,
          filterOptions: userAuditOptions,
          includeUpdatedBy: true,
        }),
      ],
    },
    tax: {
      rows: data.taxRules,
      searchKeys: ["name", "tax_label", "service_scope", "id"],
      queryFields: [
        { key: "name", label: "Name", type: "text" },
        { key: "tax_label", label: "Tax Label", type: "text" },
        { key: "tax_percentage", label: "Tax %", type: "number" },
        {
          key: "service_scope",
          label: "Service Scope",
          type: "select",
          options: distinctFieldOptions(data.taxRules, "service_scope"),
        },
        statusField(data.taxRules),
        { key: "created_at", label: "Created On", type: "date" },
        {
          key: "created_by_user_id",
          label: "Created By",
          type: "select",
          options: userAuditOptions.created_by_user_id,
        },
        {
          key: "updated_by_user_id",
          label: "Last Updated By",
          type: "select",
          options: userAuditOptions.updated_by_user_id,
        },
      ],
    },
    offers: {
      rows: data.discountOffers,
      searchKeys: ["name", "code", "service_scope", "discount_type", "id"],
      queryFields: [
        { key: "name", label: "Name", type: "text" },
        { key: "code", label: "Code", type: "text" },
        {
          key: "discount_type",
          label: "Discount Type",
          type: "select",
          options: distinctFieldOptions(data.discountOffers, "discount_type"),
        },
        {
          key: "service_scope",
          label: "Service Scope",
          type: "select",
          options: distinctFieldOptions(data.discountOffers, "service_scope"),
        },
        statusField(data.discountOffers),
        { key: "created_at", label: "Created On", type: "date" },
        {
          key: "created_by_user_id",
          label: "Created By",
          type: "select",
          options: userAuditOptions.created_by_user_id,
        },
        {
          key: "updated_by_user_id",
          label: "Last Updated By",
          type: "select",
          options: userAuditOptions.updated_by_user_id,
        },
      ],
    },
  };

  const listSortFields = [
    { key: "name", label: "Name" },
    { key: "is_active", label: "Status" },
    { key: "created_at", label: "Created On" },
    { key: "updated_at", label: "Last Modified" },
  ];

  const activeListConfig = listSectionConfig[section];

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

  const filteredUsers = section === "users" ? listRows : [];
  const filterdRoles = section === "roles" ? listRows : [];
  const filteredDepartments = section === "departments" ? listRows : [];
  const filteredBranches = section === "branches" ? listRows : [];
  const filteredSuppliers = section === "suppliers" ? listRows : [];
  const filteredTaxes = section === "tax" ? listRows : [];
  const filteredOffers = section === "offers" ? listRows : [];

  const selectedRole = data.roles.find((row: any) => row.id === selectedId);
  const selectedUser = data.users.find((row: any) => row.id === selectedId);
  const departmentGroups = useMemo(
    () => groupDepartmentsByName(data.departments, data.branches),
    [data.departments, data.branches],
  );
  const selectedDepartment = data.departments.find(
    (row: any) => row.id === selectedId,
  );
  const selectedBranch = data.branches.find(
    (row: any) => row.id === selectedId,
  );
  const selectedSupplier = data.suppliers.find(
    (row: any) => row.id === selectedId,
  );
  const selectedTaxRule = data.taxRules.find(
    (row: any) => row.id === selectedId,
  );
  const selectedOffer = data.discountOffers.find(
    (row: any) => row.id === selectedId,
  );
  const visibleSections = sections.filter(([sectionId]: any) =>
    canUseTenantAdminSection(sectionId, apiSession?.user),
  );

  useEffect(() => {
    // view/selectedId now come straight from the URL, so they're always
    // correct on navigation — only transient, non-URL modal state needs
    // resetting when the section changes.
    setConfirm(null);
    setPasswordUser(null);
  }, [section]);
  useEffect(() => {
    // Wait for the admin data fetch to finish before concluding a row is
    // missing — otherwise a direct/bookmarked visit to an edit URL bounces
    // back to the list while data.departments (etc.) is still loading.
    // Sections that manage their own record lookup (e.g. membership, via
    // PatientSubscriptions) aren't covered here — they guard themselves.
    const guardedSections = [
      "users",
      "roles",
      "departments",
      "branches",
      "suppliers",
      "tax",
      "offers",
    ];
    if (
      (view !== "edit" && view !== "view") ||
      !selectedId ||
      data.busy ||
      !guardedSections.includes(section)
    )
      return;
    const selectedExists =
      (section === "users" && Boolean(selectedUser)) ||
      (section === "roles" && Boolean(selectedRole)) ||
      (section === "departments" && Boolean(selectedDepartment)) ||
      (section === "branches" && Boolean(selectedBranch)) ||
      (section === "suppliers" && Boolean(selectedSupplier)) ||
      (section === "tax" && Boolean(selectedTaxRule)) ||
      (section === "offers" && Boolean(selectedOffer));
    if (!selectedExists) {
      router.replace(`${basePath}/${section}`);
    }
  }, [
    section,
    view,
    selectedId,
    data.busy,
    selectedUser,
    selectedRole,
    selectedDepartment,
    selectedBranch,
    selectedSupplier,
    selectedTaxRule,
    selectedOffer,
  ]);
  useEffect(() => {
    if (
      apiSession &&
      visibleSections.length &&
      !visibleSections.some(([sectionId]) => sectionId === section)
    ) {
      goTo(visibleSections[0][0], "list", "", { replace: true });
    }
  }, [
    apiSession?.tenantId,
    section,
    visibleSections.map(([sectionId]) => sectionId).join(","),
  ]);

  if (!apiSession)
    return (
      <Card>
        <h3 className="text-lg font-bold">Tenant Admin</h3>
        <p className="mt-2 text-sm text-slate-500">
          Login to manage tenant settings.
        </p>
      </Card>
    );
  if (visibleSections.length === 0)
    return (
      <Card>
        <h3 className="text-lg font-bold">Tenant Admin</h3>
        <p className="mt-2 text-sm text-slate-500">
          Your role does not include tenant administration permissions.
        </p>
      </Card>
    );

  const listSectionNouns: Record<string, string> = {
    users: "users",
    roles: "roles",
    departments: "departments",
    branches: "branches",
    suppliers: "suppliers",
    tax: "tax rules",
    offers: "offers",
  };

  return (
    <div className="">
      <StatusToast message={data.message} onClose={() => data.setMessage("")} />
      {view === "list" && activeListConfig && (
        <BreadcrumbSlot>
          <div className="flex items-center gap-2">
            <AdaptiveResultCount
              shown={listRows.length}
              total={activeListConfig.rows.length}
              noun={listSectionNouns[section] || "records"}
            />
            <RefreshButton
              onRefresh={data.reload}
              className="h-auto rounded-md px-2.5 py-1 text-[11px]"
            />
            <AdaptiveFilterTrigger
              schema={{
                id: `tenant-admin-${section}`,
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
              {isSuperAdmin && (
                <FormField label="Tenant">
                  <SearchableSelect
                    searchable={false}
                    value={data.tenantId}
                    onChange={data.setTenantId}
                    options={data.tenants.map((tenant: any) => ({
                      value: tenant.id,
                      label: tenant.name,
                    }))}
                  />
                </FormField>
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
      {section === "users" && view === "list" && (
        <ListCard
          title="Users"
          rows={filteredUsers}
          createLabel="Create User"
          canCreate={hasAdminAction("identity.users", "create")}
          onCreate={openCreate}
          loading={data.busy}
          columns={getUserColumns({
            roles: data.roles,
            branches: data.branches,
            canCopyIds,
            canEdit: hasAdminAction("identity.users", "edit"),
            canDelete: hasAdminAction("identity.users", "delete"),
            onEdit: (user: any) => openEdit(user.id),
            onStatus: (user: any) =>
              setConfirm({ entity: "users", kind: "status", row: user }),
            onDelete: (user: any) =>
              setConfirm({ entity: "users", kind: "delete", row: user }),
          })}
          onRowClick={
            hasAdminAction("identity.users", "edit")
              ? (user: any) => openDetail(user.id)
              : undefined
          }
        />
      )}
      {section === "users" && view === "create" && (
        <UserForm
          title="Create User"
          roles={data.roles}
          branches={data.branches}
          busy={data.busy}
          onSubmit={actions.createUser}
          onRoleOpen={openRolePermissions}
          apiSession={apiSession}
          back={() => open("users")}
        />
      )}
      {section === "users" &&
        (view === "edit" || view === "view") &&
        selectedUser && (
          <UserForm
            title={view === "view" ? "View User" : "Edit User"}
            user={selectedUser}
            roles={data.roles}
            branches={data.branches}
            busy={data.busy}
            onSubmit={(formData: any) =>
              actions.updateUser(formData, selectedUser)
            }
            onRoleOpen={openRolePermissions}
            apiSession={apiSession}
            onResetPassword={setPasswordUser}
            back={() => open("users")}
            readOnly={view === "view"}
            onEdit={() => openEdit(selectedUser.id)}
          />
        )}
      {section === "roles" && view === "list" && (
        <ListCard
          title="Roles"
          rows={filterdRoles}
          createLabel="Create Role"
          canCreate={hasAdminAction("identity.roles", "create")}
          onCreate={openCreate}
          loading={data.busy}
          columns={getRoleColumns({
            canCopyIds,
            canEdit: hasAdminAction("identity.roles", "edit"),
            canDelete: hasAdminAction("identity.roles", "delete"),
            onEdit: (role: Role) => openEdit(role.id),
            onStatus: (role: Role) =>
              setConfirm({ entity: "roles", kind: "status", row: role }),
            onDelete: (role: Role) =>
              setConfirm({ entity: "roles", kind: "delete", row: role }),
          })}
          onRowClick={
            hasAdminAction("identity.roles", "edit")
              ? (role: Role) => openDetail(role.id)
              : undefined
          }
        />
      )}
      {section === "roles" && view === "create" && (
        <RoleForm
          title="Create Role"
          permissions={data.permissions}
          busy={data.busy}
          onSubmit={actions.createRole}
          back={() => open("roles")}
        />
      )}
      {section === "roles" &&
        (view === "edit" || view === "view") &&
        selectedRole && (
          <RoleForm
            key={selectedRole.id}
            title={view === "view" ? "View Role" : "Edit Role"}
            role={selectedRole}
            roles={data.roles}
            permissions={data.permissions}
            busy={data.busy}
            onSubmit={(e: any) => actions.updateRole(e, selectedRole)}
            onRoleChange={openEdit}
            back={() => open("roles")}
            readOnly={view === "view"}
            onEdit={() => openEdit(selectedRole.id)}
          />
        )}

      {section === "departments" && view === "list" && (
        <ListCard
          title="Medical Departments"
          rows={filteredDepartments}
          createLabel="Create  Department"
          canCreate={hasAdminAction("departments", "create")}
          onCreate={openCreate}
          loading={data.busy}
          columns={getDepartmentColumns({
            canEdit: hasAdminAction("departments", "edit"),
            canDelete: hasAdminAction("departments", "delete"),
            onEdit: (department: any) => openEdit(department.id),
            onStatus: (department: any) =>
              setConfirm({
                entity: "departments",
                kind: "status",
                row: department.primary,
              }),
            onDelete: (department: any) =>
              setConfirm({
                entity: "departments",
                kind: "delete",
                row: department.primary,
              }),
          })}
          onRowClick={
            hasAdminAction("departments", "edit")
              ? (department: any) => openDetail(department.id)
              : undefined
          }
        />
      )}
      {section === "departments" && view === "create" && (
        <DepartmentForm
          title="Create Department"
          departments={data.departments}
          branches={data.branches}
          busy={data.busy}
          onSubmit={actions.createDepartment}
          back={() => open("departments")}
        />
      )}
      {section === "departments" &&
        (view === "edit" || view === "view") &&
        selectedDepartment && (
          <DepartmentForm
            title={view === "view" ? "View Department" : "Edit Department"}
            department={selectedDepartment}
            departments={data.departments}
            branches={data.branches}
            busy={data.busy}
            onSubmit={(formData: any) =>
              actions.updateDepartment(formData, selectedDepartment)
            }
            back={() => open("departments")}
            readOnly={view === "view"}
            onEdit={() => openEdit(selectedDepartment.id)}
          />
        )}

      {section === "branches" && view === "list" && (
        <ListCard
          title="Branches"
          rows={filteredBranches}
          createLabel="Create Branch"
          canCreate={hasAdminAction("branches", "create")}
          onCreate={openCreate}
          loading={data.busy}
          columns={getBranchColumns({
            canCopyIds,
            canEdit: hasAdminAction("branches", "edit"),
            canDelete: hasAdminAction("branches", "delete"),
            onEdit: (branch: any) => openEdit(branch.id),
            onStatus: (branch: any) =>
              setConfirm({ entity: "branches", kind: "status", row: branch }),
            onDelete: (branch: any) =>
              setConfirm({ entity: "branches", kind: "delete", row: branch }),
          })}
          onRowClick={
            hasAdminAction("branches", "edit")
              ? (branch: any) => openDetail(branch.id)
              : undefined
          }
        />
      )}
      {section === "branches" && view === "create" && (
        <BranchForm
          title="Create Branch"
          branchCount={
            data.branches.filter((branch: any) => branch.is_active !== false)
              .length
          }
          branchLimit={data.subscriptionEntitlements?.included_branches}
          busy={data.busy}
          onSubmit={actions.createBranch}
          back={() => open("branches")}
        />
      )}

      {section === "branches" &&
        (view === "edit" || view === "view") &&
        selectedBranch && (
          <BranchForm
            title={view === "view" ? "View Branch" : "Edit Branch"}
            branch={selectedBranch}
            busy={data.busy}
            onSubmit={(formData: any) =>
              actions.updateBranch(formData, selectedBranch)
            }
            back={() => open("branches")}
            readOnly={view === "view"}
            onEdit={() => openEdit(selectedBranch.id)}
          />
        )}

      {section === "suppliers" && view === "list" && (
        <ListCard
          title="Suppliers"
          rows={filteredSuppliers}
          createLabel="Create Supplier"
          canCreate={hasAdminAction("suppliers", "create")}
          onCreate={openCreate}
          loading={data.busy}
          columns={getSupplierColumns({
            canEdit: hasAdminAction("suppliers", "edit"),
            canDelete: hasAdminAction("suppliers", "delete"),
            onEdit: (supplier: any) => openEdit(supplier.id),
            onStatus: (supplier: any) =>
              setConfirm({ entity: "suppliers", kind: "status", row: supplier }),
            onDelete: (supplier: any) =>
              setConfirm({ entity: "suppliers", kind: "delete", row: supplier }),
          })}
          onRowClick={
            hasAdminAction("suppliers", "edit")
              ? (supplier: any) => openDetail(supplier.id)
              : undefined
          }
        />
      )}
      {section === "suppliers" && view === "create" && (
        <SupplierForm
          title="Create Supplier"
          busy={data.busy}
          onSubmit={actions.createSupplier}
          back={() => open("suppliers")}
        />
      )}
      {section === "suppliers" &&
        (view === "edit" || view === "view") &&
        selectedSupplier && (
          <SupplierForm
            title={view === "view" ? "View Supplier" : "Edit Supplier"}
            supplier={selectedSupplier}
            busy={data.busy}
            onSubmit={(formData: any) =>
              actions.updateSupplier(formData, selectedSupplier)
            }
            back={() => open("suppliers")}
            readOnly={view === "view"}
            onEdit={() => openEdit(selectedSupplier.id)}
          />
        )}

      {section === "tax" && view === "list" && (
        <ListCard
          title="Tax Rules"
          rows={filteredTaxes}
          createLabel="Create Tax Rule"
          canCreate={hasAdminAction("tax", "create")}
          onCreate={openCreate}
          loading={data.busy}
          columns={getTaxRuleColumns({
            branches: data.branches,
            canEdit: hasAdminAction("tax", "edit"),
            canDelete: hasAdminAction("tax", "delete"),
            onEdit: (rule: any) => openEdit(rule.id),
            onStatus: (rule: any) =>
              setConfirm({ entity: "tax", kind: "status", row: rule }),
            onDelete: (rule: any) =>
              setConfirm({ entity: "tax", kind: "status", row: rule }),
          })}
          onRowClick={
            hasAdminAction("tax", "edit")
              ? (rule: any) => openDetail(rule.id)
              : undefined
          }
        />
      )}
      {section === "tax" && view === "create" && (
        <TaxRuleForm
          title="Create Tax Rule"
          branches={data.branches}
          busy={data.busy}
          onSubmit={actions.createTaxRule}
          back={() => open("tax")}
        />
      )}
      {section === "tax" &&
        (view === "edit" || view === "view") &&
        selectedTaxRule && (
          <TaxRuleForm
            title={view === "view" ? "View Tax Rule" : "Edit Tax Rule"}
            rule={selectedTaxRule}
            branches={data.branches}
            busy={data.busy}
            onSubmit={(formData: any) =>
              actions.updateTaxRule(formData, selectedTaxRule)
            }
            back={() => open("tax")}
            readOnly={view === "view"}
            onEdit={() => openEdit(selectedTaxRule.id)}
          />
        )}

      {section === "offers" && view === "list" && (
        <ListCard
          title="Discounts & Offers"
          rows={filteredOffers}
          createLabel="Create Offer"
          canCreate={hasAdminAction("discounts", "create")}
          onCreate={openCreate}
          loading={data.busy}
          columns={getDiscountOfferColumns({
            branches: data.branches,
            canEdit: hasAdminAction("discounts", "edit"),
            canDelete: hasAdminAction("discounts", "delete"),
            onEdit: (offer: any) => openEdit(offer.id),
            onStatus: (offer: any) =>
              setConfirm({ entity: "offers", kind: "status", row: offer }),
            onDelete: (offer: any) =>
              setConfirm({ entity: "offers", kind: "status", row: offer }),
          })}
          onRowClick={
            hasAdminAction("discounts", "edit")
              ? (offer: any) => openDetail(offer.id)
              : undefined
          }
        />
      )}
      {section === "offers" && view === "create" && (
        <DiscountOfferForm
          title="Create Discount Offer"
          branches={data.branches}
          busy={data.busy}
          onSubmit={actions.createDiscountOffer}
          back={() => open("offers")}
        />
      )}
      {section === "offers" &&
        (view === "edit" || view === "view") &&
        selectedOffer && (
          <DiscountOfferForm
            title={
              view === "view" ? "View Discount Offer" : "Edit Discount Offer"
            }
            offer={selectedOffer}
            branches={data.branches}
            busy={data.busy}
            onSubmit={(formData: any) =>
              actions.updateDiscountOffer(formData, selectedOffer)
            }
            back={() => open("offers")}
            readOnly={view === "view"}
            onEdit={() => openEdit(selectedOffer.id)}
          />
        )}

      {section === "membership" && (
        <PatientSubscriptions
          apiSession={apiSession}
          branchId={branchId}
          branches={data.branches}
          view={view}
          selectedId={selectedId}
        />
      )}

      {section === "files" && (
        <FilesPanel
          apiSession={apiSession}
          files={data.files}
          setFiles={data.setFiles}
          setMessage={data.setMessage}
          branches={data.branches}
          busy={data.busy}
          setBusy={data.setBusy}
        />
      )}

      {section === "settings" && (
        <SettingsPanel
          apiSession={apiSession}
          settings={data.settings}
          invoicePrefix={data.invoicePrefix}
          setInvoicePrefix={data.setInvoicePrefix}
          numberingRules={data.numberingRules}
          setNumberingRules={data.setNumberingRules}
          invoiceLogoUrl={data.invoiceLogoUrl}
          setInvoiceLogoUrl={data.setInvoiceLogoUrl}
          bankDetails={data.bankDetails}
          setBankDetails={data.setBankDetails}
          tenantLogoUrl={clinic?.logo_url || ""}
          files={data.files}
          uploadInvoiceLogo={actions.uploadInvoiceLogo}
          requeueAfter={data.requeueAfter}
          setRequeueAfter={data.setRequeueAfter}
          noShowAfter={data.noShowAfter}
          setNoShowAfter={data.setNoShowAfter}
          slotIntervalsEnabled={data.slotIntervalsEnabled}
          setSlotIntervalsEnabled={data.setSlotIntervalsEnabled}
          slotIntervalMinutes={data.slotIntervalMinutes}
          setSlotIntervalMinutes={data.setSlotIntervalMinutes}
          payments={data.payments}
          setPayments={data.setPayments}
          providers={data.providers}
          setProviders={data.setProviders}
          busy={data.busy}
          saveSettings={actions.saveSettings}
          reportEnabled={data.reportEnabled}
          setReportEnabled={data.setReportEnabled}
          reportRecipients={data.reportRecipients}
          setReportRecipients={data.setReportRecipients}
          reportCc={data.reportCc}
          setReportCc={data.setReportCc}
          reportSendDay={data.reportSendDay}
          setReportSendDay={data.setReportSendDay}
          reportFilters={data.reportFilters}
          setReportFilters={data.setReportFilters}
          reportJobs={data.reportJobs}
          reportBusy={reportBusy}
          saveReportSettings={actions.saveReportSettings}
          sendMonthlyReportNow={actions.sendMonthlyReportNow}
          resendMonthlyReport={actions.resendMonthlyReport}
          downloadMonthlyReport={actions.downloadMonthlyReport}
        />
      )}
      {section === "patient-intelligence" &&
        clinic?.modules?.includes("patient_intelligence") && (
          <PatientIntelligenceSettings apiSession={apiSession} />
        )}
      {section === "patient-intelligence" &&
        !clinic?.modules?.includes("patient_intelligence") && (
          <Card>
            <h3 className="card-title font-bold">Patient Intelligence</h3>
            <p className="mt-2 text-sm text-slate-500">
              This module is not enabled by the tenant&apos;s active
              subscription.
            </p>
          </Card>
        )}
      {section === "whatsapp" && whatsappModuleEnabled && (
        <WhatsAppIntegrationSettings apiSession={apiSession} />
      )}
      {section === "whatsapp" && !whatsappModuleEnabled && (
        <Card>
          <h3 className="card-title font-bold">WhatsApp Settings</h3>
          <p className="mt-2 text-sm text-slate-500">
            This module is not enabled by the tenant&apos;s active subscription.
          </p>
        </Card>
      )}
      {confirm && (
        <ConfirmModal
          action={confirm}
          busy={data.busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const result =
              confirm.kind === "delete"
                ? actions.deleteRow(confirm.entity, confirm.row)
                : actions.changeStatus(confirm.entity, confirm.row);
            result.finally(() => setConfirm(null));
          }}
        />
      )}
      {passwordUser && (
        <PasswordResetModal
          user={passwordUser}
          busy={data.busy}
          onSubmit={(e: any) => actions.resetUserPassword(e, passwordUser)}
          onCancel={() => setPasswordUser(null)}
        />
      )}
    </div>
  );
}
