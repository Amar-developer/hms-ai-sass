"use client";

import { useEffect, useMemo, useState } from "react";
import { sections, status_filters } from "./constants";
import { canUseTenantAdminSection } from "./permissions";
import { Card, StatusToast } from "@/app/components/common/ui";
import { PatientSubscriptions } from "@/features/patient_subscriptions/PatientSubscriptions";
import { groupDepartmentsByName, userRoleLabels } from "./helpers";
import {
  UserRow,
  RoleRow,
  DepartmentRow,
  BranchRow,
  SupplierRow,
  TaxRuleRow,
  DiscountOfferRow,
} from "./components/Rows";
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
import {
  BRANCH_COLUMNS,
  DEPARTMENT_COLUMNS,
  DISCOUNT_OFFER_COLUMNS,
  ROLE_COLUMNS,
  SUPPLIER_COLUMNS,
  TAX_RULE_COLUMNS,
  USER_COLUMNS,
} from "@/utils/constants";
import { useTenantAdminData } from "./api/useTenantAdminData";
import { useTenantAdminActions } from "./api/useTenantAdminActions";
import { Role } from "./types";
import { canCopyDatabaseIds } from "@/app/components/common/CopyIdButton";

function uniqueRoleFilterOptions(roles: any[]) {
  const byName = new Map<string, any>();
  for (const role of roles || []) {
    const name = String(role?.name || "").trim();
    if (!name || byName.has(name)) continue;
    byName.set(name, role);
  }
  return Array.from(byName.values());
}

export function TenantAdmin({
  apiSession,
  clinic,
  branchId,
  patients,
  section: externalSection,
  setSection: externalSetSection,
}: any) {
  const [localSection, setLocalSection] = useState("users");
  const section = externalSection || localSection;
  const setSection = externalSetSection || setLocalSection;
  const [view, setView] = useState("list");
  const [selectedId, setSelectedId] = useState("");
  const [confirm, setConfirm] = useState<any>(null);
  const [passwordUser, setPasswordUser] = useState<any>(null);
  const [reportBusy, setReportBusy] = useState("");

  const [userFilters, setUserFilters] = useState({
    status: "all",
    role: "all",
    branch: "all",
  });

  const [roleFilter, setRoleFilters] = useState({
    status: "all",
  });

  const [departmentFilters, setDepartmentFilters] = useState({
    status: "all",
    branch: "all",
  });

  const [branchFilter, setBranchFilter] = useState({
    status: "all",
  });
  const [supplierFilter, setSupplierFilter] = useState({
    status: "all",
  });

  const [taxFilter, setTaxFilter] = useState({
    status: "all",
  });
  const [offerFilter, setOfferFilter] = useState({
    status: "all",
  });

  const data = useTenantAdminData(apiSession, clinic);
  const permissionKeys: string[] = apiSession?.user?.permissions || [];
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

  function open(nextSection: string, nextView = "list") {
    setSection(nextSection);
    setView(nextView);
    setSelectedId("");
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  function openRolePermissions(role: any) {
    setSection("roles");
    setView("edit");
    setSelectedId(role.id);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  const actions = useTenantAdminActions({
    apiSession,
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

  const filteredUsers = useMemo(() => {
    return data.users.filter((user: any) => {
      // Status
      if (
        userFilters.status !== "all" &&
        (user.is_active ? "active" : "inactive") !== userFilters.status
      ) {
        return false;
      }

      // Branch
      if (
        userFilters.branch !== "all" &&
        user.branch_id !== userFilters.branch
      ) {
        return false;
      }

      // Role
      if (userFilters.role !== "all") {
        const labels = userRoleLabels(user, data.roles);

        if (!labels.includes(userFilters.role)) {
          return false;
        }
      }

      return true;
    });
  }, [data.users, data.roles, userFilters]);

  const filterdRoles = useMemo(() => {
    return data.roles.filter((role: any) => {
      if (
        roleFilter.status !== "all" &&
        (role.is_active ? "active" : "inactive") !== roleFilter.status
      ) {
        return false;
      }
      return true;
    });
  }, [data.roles, roleFilter]);

  const filteredDepartments = useMemo(() => {
    return data.departments.filter((department) => {
      if (
        departmentFilters.status !== "all" &&
        (department.is_active ? "active" : "inactive") !==
          departmentFilters.status
      ) {
        return false;
      }
      if (
        departmentFilters.branch !== "all" &&
        department.branch !== departmentFilters.branch
      ) {
        return false;
      }
      return true;
    });
  }, [departmentFilters, data.departments]);

  const filteredBranches = useMemo(() => {
    return data.branches.filter((branch) => {
      if (
        branchFilter.status !== "all" &&
        (branch.is_active ? "active" : "inactive") !== branchFilter.status
      ) {
        return false;
      }
      return true;
    });
  }, [data.branches, branchFilter]);

  const filteredSuppliers = useMemo(() => {
    return data.suppliers.filter((supplier) => {
      if (
        supplierFilter.status !== "all" &&
        (supplier.is_active ? "active" : "inactive") !== supplierFilter.status
      ) {
        return false;
      }
      return true;
    });
  }, [data.suppliers, supplierFilter]);

  const filteredTaxes = useMemo(() => {
    return data.taxRules.filter((tax) => {
      if (
        taxFilter.status !== "all" &&
        (tax.is_active ? "active" : "inactive") !== taxFilter.status
      ) {
        return false;
      }
      return true;
    });
  }, [data.taxRules, taxFilter]);

  const filteredOffers = useMemo(() => {
    return data.discountOffers.filter((offer) => {
      if (
        offerFilter.status !== "all" &&
        (offer.is_active ? "active" : "inactive") !== offerFilter.status
      ) {
        return false;
      }
      return true;
    });
  }, [data.discountOffers, offerFilter]);

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
  const visibleSections = sections.filter(([sectionId]) =>
    canUseTenantAdminSection(sectionId, apiSession?.user),
  );

  useEffect(() => {
    setView("list");
    setSelectedId("");
    setConfirm(null);
    setPasswordUser(null);
  }, [section]);
  useEffect(() => {
    if (view !== "edit") return;
    const selectedExists =
      (section === "users" && Boolean(selectedUser)) ||
      (section === "roles" && Boolean(selectedRole)) ||
      (section === "departments" && Boolean(selectedDepartment)) ||
      (section === "branches" && Boolean(selectedBranch)) ||
      (section === "suppliers" && Boolean(selectedSupplier)) ||
      (section === "tax" && Boolean(selectedTaxRule)) ||
      (section === "offers" && Boolean(selectedOffer));
    if (!selectedExists) {
      setView("list");
      setSelectedId("");
    }
  }, [
    section,
    view,
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
      open(visibleSections[0][0]);
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

  return (
    <div className="">
      <StatusToast message={data.message} onClose={() => data.setMessage("")} />
      {section === "users" && view === "list" && (
        <ListCard
          title="Users"
          rows={filteredUsers}
          searchKeys={["name", "email", "mobile", "user_type", "roles", "id"]}
          createLabel="Create User"
          canCreate={hasAdminAction("identity.users", "create")}
          onCreate={() => setView("create")}
          onRefresh={data.reload}
          columns={USER_COLUMNS}
          filters={[
            {
              key: "status",
              label: "Status",
              options: [
                { value: "all", label: "All Status" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ],
            },
            {
              key: "role",
              label: "Role",
              options: [
                { value: "all", label: "All Roles" },
                ...uniqueRoleFilterOptions(data.roles).map((role: any) => ({
                  value: role.name,
                  label: role.name,
                })),
              ],
            },
            {
              key: "branch",
              label: "Branch",
              options: [
                { value: "all", label: "All Branches" },
                ...data.branches.map((branch: any) => ({
                  value: branch.id,
                  label: branch.name,
                })),
              ],
            },
          ]}
          onFilterChange={(key: string, value: string) =>
            setUserFilters((prev) => ({
              ...prev,
              [key]: value,
            }))
          }
          filterValues={userFilters}
          render={(user: any) => (
            <UserRow
              key={user.id}
              user={user}
              roles={data.roles}
              branches={data.branches}
              canCopyIds={canCopyIds}
              canEdit={hasAdminAction("identity.users", "edit")}
              canDelete={hasAdminAction("identity.users", "delete")}
              onEdit={() => {
                setSelectedId(user.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "users", kind: "status", row: user })
              }
              onDelete={() =>
                setConfirm({ entity: "users", kind: "delete", row: user })
              }
            />
          )}
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
      {section === "users" && view === "edit" && selectedUser && (
        <UserForm
          title="Edit User"
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
        />
      )}
      {section === "roles" && view === "list" && (
        <ListCard
          title="Roles"
          rows={filterdRoles}
          searchKeys={["name", "key", "id"]}
          createLabel="Create Role"
          canCreate={hasAdminAction("identity.roles", "create")}
          onCreate={() => setView("create")}
          onRefresh={data.reload}
          columns={ROLE_COLUMNS}
          filters={[status_filters]}
          filterValues={roleFilter}
          onFilterChange={(key: string, value: string) => {
            setRoleFilters((prev) => ({
              ...prev,
              [key]: value,
            }));
          }}
          render={(role: Role) => (
            <RoleRow
              key={role.id}
              role={role}
              canCopyIds={canCopyIds}
              canEdit={hasAdminAction("identity.roles", "edit")}
              canDelete={hasAdminAction("identity.roles", "delete")}
              onEdit={() => {
                setSelectedId(role.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "roles", kind: "status", row: role })
              }
              onDelete={() =>
                setConfirm({ entity: "roles", kind: "delete", row: role })
              }
            />
          )}
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
      {section === "roles" && view === "edit" && selectedRole && (
        <RoleForm
          key={selectedRole.id}
          title="Edit Role"
          role={selectedRole}
          roles={data.roles}
          permissions={data.permissions}
          busy={data.busy}
          onSubmit={(e: any) => actions.updateRole(e, selectedRole)}
          onRoleChange={setSelectedId}
          back={() => open("roles")}
        />
      )}

      {section === "departments" && view === "list" && (
        <ListCard
          title="Medical Departments"
          rows={filteredDepartments}
          searchKeys={["name", "code", "branch_names", "description", "id"]}
          createLabel="Create  Department"
          canCreate={hasAdminAction("departments", "create")}
          onCreate={() => setView("create")}
          onRefresh={data.reload}
          columns={DEPARTMENT_COLUMNS}
          filters={[
            status_filters,
            {
              key: "branch",
              label: "Branch",
              options: [
                { value: "all", label: "All Branches" },
                ...data.branches.map((branch: any) => ({
                  value: branch.id,
                  label: branch.name,
                })),
              ],
            },
          ]}
          onFilterChange={(key: number, value: string) =>
            setDepartmentFilters((prev) => ({
              ...prev,
              [key]: value,
            }))
          }
          filterValues={departmentFilters}
          render={(department: any) => (
            <DepartmentRow
              key={department.id}
              department={department}
              canEdit={hasAdminAction("departments", "edit")}
              canDelete={hasAdminAction("departments", "delete")}
              branches={data.branches}
              onEdit={() => {
                setSelectedId(department.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({
                  entity: "departments",
                  kind: "status",
                  row: department.primary,
                })
              }
              onDelete={() =>
                setConfirm({
                  entity: "departments",
                  kind: "delete",
                  row: department.primary,
                })
              }
            />
          )}
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
      {section === "departments" && view === "edit" && selectedDepartment && (
        <DepartmentForm
          title="Edit Department"
          department={selectedDepartment}
          departments={data.departments}
          branches={data.branches}
          busy={data.busy}
          onSubmit={(formData: any) =>
            actions.updateDepartment(formData, selectedDepartment)
          }
          back={() => open("departments")}
        />
      )}

      {section === "branches" && view === "list" && (
        <ListCard
          title="Branches"
          rows={filteredBranches}
          searchKeys={["name", "code", "city", "state", "id"]}
          createLabel="Create Branch"
          canCreate={hasAdminAction("branches", "create")}
          onCreate={() => setView("create")}
          onRefresh={data.reload}
          columns={BRANCH_COLUMNS}
          filters={[
            {
              key: "status",
              label: "Status",
              options: [
                { value: "all", label: "All Status" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ],
            },
          ]}
          onFilterChange={(key: string, value: string) => {
            setBranchFilter((prev) => ({
              ...prev,
              [key]: value,
            }));
          }}
          filterValues={branchFilter}
          render={(branch: any) => (
            <BranchRow
              key={branch.id}
              branch={branch}
              canCopyIds={canCopyIds}
              canEdit={hasAdminAction("branches", "edit")}
              canDelete={hasAdminAction("branches", "delete")}
              onEdit={() => {
                setSelectedId(branch.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "branches", kind: "status", row: branch })
              }
              onDelete={() =>
                setConfirm({ entity: "branches", kind: "delete", row: branch })
              }
            />
          )}
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
      {section === "branches" && view === "edit" && selectedBranch && (
        <BranchForm
          title="Edit Branch"
          branch={selectedBranch}
          busy={data.busy}
          onSubmit={(formData: any) =>
            actions.updateBranch(formData, selectedBranch)
          }
          back={() => open("branches")}
        />
      )}

      {section === "suppliers" && view === "list" && (
        <ListCard
          title="Suppliers"
          rows={filteredSuppliers}
          searchKeys={["name", "gstin", "phone", "email", "address", "id"]}
          createLabel="Create Supplier"
          canCreate={hasAdminAction("suppliers", "create")}
          onCreate={() => setView("create")}
          onRefresh={data.reload}
          columns={SUPPLIER_COLUMNS}
          filters={[
            {
              key: "status",
              label: "Status",
              options: [
                { value: "all", label: "All Status" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ],
            },
          ]}
          onFilterChange={(key: string, value: string) => {
            setSupplierFilter((prev) => ({
              ...prev,
              [key]: value,
            }));
          }}
          filterValues={supplierFilter}
          render={(supplier: any) => (
            <SupplierRow
              key={supplier.id}
              supplier={supplier}
              canEdit={hasAdminAction("suppliers", "edit")}
              canDelete={hasAdminAction("suppliers", "delete")}
              onEdit={() => {
                setSelectedId(supplier.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({
                  entity: "suppliers",
                  kind: "status",
                  row: supplier,
                })
              }
              onDelete={() =>
                setConfirm({
                  entity: "suppliers",
                  kind: "delete",
                  row: supplier,
                })
              }
            />
          )}
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
      {section === "suppliers" && view === "edit" && selectedSupplier && (
        <SupplierForm
          title="Edit Supplier"
          supplier={selectedSupplier}
          busy={data.busy}
          onSubmit={(formData: any) =>
            actions.updateSupplier(formData, selectedSupplier)
          }
          back={() => open("suppliers")}
        />
      )}

      {section === "tax" && view === "list" && (
        <ListCard
          title="Tax Rules"
          rows={filteredTaxes}
          searchKeys={["name", "tax_label", "service_scope", "id"]}
          createLabel="Create Tax Rule"
          canCreate={hasAdminAction("tax", "create")}
          onCreate={() => setView("create")}
          onRefresh={data.reload}
          columns={TAX_RULE_COLUMNS}
          filters={[
            {
              key: "status",
              label: "Status",
              options: [
                { value: "all", label: "All Status" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ],
            },
          ]}
          onFilterChange={(key: string, value: string) => {
            setTaxFilter((prev) => ({
              ...prev,
              [key]: value,
            }));
          }}
          filterValues={taxFilter}
          render={(rule: any) => (
            <TaxRuleRow
              key={rule.id}
              rule={rule}
              canEdit={hasAdminAction("tax", "edit")}
              canDelete={hasAdminAction("tax", "delete")}
              branches={data.branches}
              onEdit={() => {
                setSelectedId(rule.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "tax", kind: "status", row: rule })
              }
              onDelete={() =>
                setConfirm({ entity: "tax", kind: "status", row: rule })
              }
            />
          )}
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
      {section === "tax" && view === "edit" && selectedTaxRule && (
        <TaxRuleForm
          title="Edit Tax Rule"
          rule={selectedTaxRule}
          branches={data.branches}
          busy={data.busy}
          onSubmit={(formData: any) =>
            actions.updateTaxRule(formData, selectedTaxRule)
          }
          back={() => open("tax")}
        />
      )}

      {section === "offers" && view === "list" && (
        <ListCard
          title="Discounts & Offers"
          rows={filteredOffers}
          searchKeys={["name", "code", "service_scope", "discount_type", "id"]}
          createLabel="Create Offer"
          canCreate={hasAdminAction("discounts", "create")}
          onCreate={() => setView("create")}
          onRefresh={data.reload}
          columns={DISCOUNT_OFFER_COLUMNS}
          filters={[
            {
              key: "status",
              label: "Status",
              options: [
                { value: "all", label: "All Status" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ],
            },
          ]}
          onFilterChange={(key: string, value: string) => {
            setOfferFilter((prev) => ({
              ...prev,
              [key]: value,
            }));
          }}
          filterValues={offerFilter}
          render={(offer: any) => (
            <DiscountOfferRow
              key={offer.id}
              offer={offer}
              canEdit={hasAdminAction("discounts", "edit")}
              canDelete={hasAdminAction("discounts", "delete")}
              branches={data.branches}
              onEdit={() => {
                setSelectedId(offer.id);
                setView("edit");
              }}
              onStatus={() =>
                setConfirm({ entity: "offers", kind: "status", row: offer })
              }
              onDelete={() =>
                setConfirm({ entity: "offers", kind: "status", row: offer })
              }
            />
          )}
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
      {section === "offers" && view === "edit" && selectedOffer && (
        <DiscountOfferForm
          title="Edit Discount Offer"
          offer={selectedOffer}
          branches={data.branches}
          busy={data.busy}
          onSubmit={(formData: any) =>
            actions.updateDiscountOffer(formData, selectedOffer)
          }
          back={() => open("offers")}
        />
      )}

      {section === "membership" && (
        <PatientSubscriptions
          apiSession={apiSession}
          branchId={branchId}
          branches={data.branches}
          patients={patients}
        />
      )}

      {section === "files" && (
        <FilesPanel
          apiSession={apiSession}
          files={data.files}
          setFiles={data.setFiles}
          setMessage={data.setMessage}
          branches={data.branches}
          patients={patients}
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
