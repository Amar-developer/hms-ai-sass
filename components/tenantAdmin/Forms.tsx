import { roleKeyFromName } from "@/utils/tenantAdmin/helpers";
import {
  Card,
  Input,
  Select,
  Field,
  SuggestionInput,
  Badge,
} from "../common/ui";
import { FormField } from "../FormElements";
import { useState, useEffect, useMemo } from "react";
import { Header, Actions, CheckboxList } from "./Shared";
import {
  isLocked,
  filterRolesForBranch,
  dateToInput,
  title,
  permissionModuleTitle,
} from "@/utils/tenantAdmin/helpers";
import { canResetTenantUserPassword } from "@/utils/tenantAdmin/permissions";
import {
  userTypes,
  serviceScopes,
  requiredRolePermissions,
} from "@/utils/tenantAdmin/constants";
import { KeyRound } from "lucide-react";
import { basicMedicalDepartmentSuggestions } from "@/lib/options";

export function RoleForm({
  title,
  role,
  permissions,
  busy,
  onSubmit,
  back,
}: any) {
  const [roleName, setRoleName] = useState(role?.name || "");
  const generatedKey = roleKeyFromName(roleName || role?.key || "");
  return (
    <Card>
      <Header
        title={title}
        subtitle={role?.key || "Select permissions by module action."}
        back={back}
      />
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <FormField label="Role Name">
          <Input
            name="name"
            value={roleName}
            onChange={(event: any) => setRoleName(event.target.value)}
            required
            disabled={isLocked(role)}
            placeholder="Enter role name"
          />
        </FormField>
        <input type="hidden" name="key" value={generatedKey} />
        <div className="rounded-2xl bg-slate-50 p-4 text-sm">
          <p className="text-xs font-bold uppercase text-slate-500">
            Generated Role Key
          </p>
          <p className="mt-1 font-bold text-slate-800">
            {generatedKey || "Enter role name"}
          </p>
        </div>
        {role && (
          <FormField label="Status">
            <Select
              name="isActive"
              defaultValue={String(role.is_active)}
              disabled={isLocked(role)}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </FormField>
        )}
        <div className="md:col-span-2">
          <PermissionCheckboxes
            permissions={permissions}
            selected={role?.permission_keys || []}
            disabled={isLocked(role)}
          />
        </div>
        <Actions
          busy={busy}
          back={back}
          disabled={isLocked(role)}
          label={role ? "Save Role" : "Create Role"}
        />
      </form>
    </Card>
  );
}

export function UserForm({
  title,
  user,
  roles,
  branches,
  busy,
  onSubmit,
  onRoleOpen,
  apiSession,
  onResetPassword,
  back,
}: any) {
  const initialRoleKeys = user?.roles?.length
    ? user.roles
    : user?.user_type === "tenant_admin"
      ? ["tenant_admin"]
      : [];
  const [selectedRoleKeys, setSelectedRoleKeys] =
    useState<string[]>(initialRoleKeys);
  const [userType, setUserType] = useState(
    user?.user_type ||
      (initialRoleKeys.includes("tenant_admin") ? "tenant_admin" : "staff"),
  );
  const hasTenantAdminAccess =
    userType === "tenant_admin" || selectedRoleKeys.includes("tenant_admin");
  const [selectedBranch, setSelectedBranch] = useState(
    hasTenantAdminAccess ? "" : user?.branch_id || "",
  );
  useEffect(() => {
    if (!hasTenantAdminAccess) return;
    setSelectedBranch("");
    setUserType("tenant_admin");
    setSelectedRoleKeys((previous) =>
      previous.includes("tenant_admin")
        ? previous
        : [...previous, "tenant_admin"],
    );
  }, [hasTenantAdminAccess]);
  const roleOptions = useMemo(
    () =>
      filterRolesForBranch(roles, branches, selectedBranch, selectedRoleKeys),
    [roles, branches, selectedBranch, selectedRoleKeys],
  );
  const canResetPassword = canResetTenantUserPassword(apiSession, user);
  return (
    <Card>
      <Header
        title={title}
        subtitle={user?.email || "Create tenant-scoped users only."}
        back={back}
      />
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <FormField label="Name">
          <Input
            name="name"
            defaultValue={user?.name || ""}
            placeholder="Enter user name"
            required
          />
        </FormField>
        <FormField label="Email">
          <Input
            name="email"
            type="email"
            placeholder="Enter user email"
            defaultValue={user?.email || ""}
            required
          />
        </FormField>
        <FormField label="User Type">
          <Select
            name="userType"
            value={userType}
            onChange={(event: any) => setUserType(event.target.value)}
          >
            {userTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Mobile">
          <Input
            name="mobile"
            defaultValue={user?.mobile || ""}
            placeholder="Enter user mobile number"
          />
        </FormField>
        <Field label="Branch Access">
          <Select
            name="branchId"
            value={selectedBranch}
            onChange={(event: any) => setSelectedBranch(event.target.value)}
            disabled={hasTenantAdminAccess}
          >
            <option value="">All branches</option>
            {branches.map((branch: any) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
          {hasTenantAdminAccess && (
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Tenant Admin access covers every branch in this tenant.
            </p>
          )}
        </Field>
        {!user && (
          <FormField label="Temporary Password">
            <Input
              name="password"
              type="text"
              defaultValue="TempPass123"
              required
            />
          </FormField>
        )}
        <FormField label="Must Change Password">
          <Select
            name="mustChangePassword"
            defaultValue={String(user?.must_change_password ?? true)}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Select>
        </FormField>
        {user && (
          <FormField label="Status">
            <Select name="isActive" defaultValue={String(user.is_active)}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </FormField>
        )}
        <div className="md:col-span-2">
          <CheckboxList
            title="Role Access"
            name="roleKeys"
            rows={roleOptions}
            selected={selectedRoleKeys}
            valueKey="key"
            labelKey="name"
            onRowOpen={onRoleOpen}
            onSelectionChange={setSelectedRoleKeys}
          />
        </div>
        {canResetPassword && (
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold">Password reset</p>
              <p className="mt-1 text-xs text-slate-500">
                Set a temporary password for this tenant user.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onResetPassword?.(user)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm font-bold shadow-sm transition hover:bg-slate-100"
            >
              <KeyRound size={16} />
              <span>Reset Password</span>
            </button>
          </div>
        )}
        <Actions
          busy={busy}
          back={back}
          label={user ? "Save User" : "Create User"}
        />
      </form>
    </Card>
  );
}

export function DepartmentForm({
  title,
  department,
  branches,
  busy,
  onSubmit,
  back,
}: any) {
  return (
    <Card>
      <Header
        title={title}
        subtitle={
          department?.code ||
          "Medical departments are used for doctors, schedules, appointments, and patient routing."
        }
        back={back}
      />
      <form
        onSubmit={onSubmit}
        autoComplete="off"
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <Field label="Name">
          <SuggestionInput
            name="name"
            defaultValue={department?.name || ""}
            placeholder="General Medicine"
            suggestions={basicMedicalDepartmentSuggestions}
            required
            disabled={isLocked(department)}
          />
        </Field>
        <FormField label="Branch">
          <Select
            name="branchId"
            defaultValue={department?.branch_id || ""}
            disabled={isLocked(department)}
          >
            <option value="">All branches</option>
            {branches.map((branch: any) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </FormField>
        {department && (
          <FormField label="Status">
            <Select
              name="isActive"
              defaultValue={String(department.is_active)}
              disabled={isLocked(department)}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </FormField>
        )}
        <div className="md:col-span-2">
          <FormField label="Description">
            <Input
              name="description"
              defaultValue={department?.description || ""}
              disabled={isLocked(department)}
              placeholder="Enter department description"
            />
          </FormField>
        </div>
        <Actions
          busy={busy}
          back={back}
          disabled={isLocked(department)}
          label={
            department ? "Save Medical Department" : "Create Medical Department"
          }
        />
      </form>
    </Card>
  );
}

export function BranchForm({
  title,
  branch,
  branchCount,
  busy,
  onSubmit,
  back,
}: any) {
  return (
    <Card>
      <Header
        title={title}
        subtitle={
          branch
            ? "Update branch details."
            : "Branch creation is checked against the active subscription limit."
        }
        back={back}
      />
      {!branch && branchCount >= 1 && (
        <div className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          Single-clinic plans usually allow one branch. If this tenant is on a
          single-branch plan, the API will ask for a subscription upgrade before
          creating another branch.
        </div>
      )}
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <FormField label="Branch Name">
          <Input
            name="name"
            defaultValue={branch?.name || ""}
            required
            disabled={isLocked(branch)}
            placeholder="Enter branch name"
          />
        </FormField>
        <FormField label="Code">
          <Input
            name="code"
            defaultValue={branch?.code || ""}
            required
            disabled={isLocked(branch)}
            placeholder="Enter branch code"
          />
        </FormField>
        <FormField label="City">
          <Input
            name="city"
            defaultValue={branch?.city || ""}
            disabled={isLocked(branch)}
            placeholder="Enter city name"
          />
        </FormField>
        <Field label="Area">
          <Input
            name="area"
            defaultValue={branch?.area || ""}
            disabled={isLocked(branch)}
            placeholder="Enter branch area"
          />
        </Field>
        <Field label="State">
          <Input
            name="state"
            defaultValue={branch?.state || ""}
            disabled={isLocked(branch)}
            placeholder="Enter state name"
          />
        </Field>
        {branch && (
          <FormField label="Status">
            <Select
              name="isActive"
              defaultValue={String(branch.is_active)}
              disabled={isLocked(branch)}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </FormField>
        )}
        <div className="md:col-span-2">
          <FormField label="Address">
            <Input
              name="address"
              defaultValue={branch?.address || ""}
              disabled={isLocked(branch)}
              placeholder="Enter branch address"
            />
          </FormField>
        </div>
        <Actions
          busy={busy}
          back={back}
          disabled={isLocked(branch)}
          label={branch ? "Save Branch" : "Create Branch"}
        />
      </form>
    </Card>
  );
}

export function SupplierForm({ title, supplier, busy, onSubmit, back }: any) {
  return (
    <Card>
      <Header
        title={title}
        subtitle={
          supplier?.id ||
          "Suppliers can be used by medicines, lab tests, Service, and physiotherapy equipment."
        }
        back={back}
      />
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <FormField label="Supplier Name">
          <Input
            name="name"
            defaultValue={supplier?.name || ""}
            required
            placeholder="Enter supplier name"
          />
        </FormField>
        <FormField label="GSTIN">
          <Input
            name="gstin"
            defaultValue={supplier?.gstin || ""}
            placeholder="Enter GSTIN"
          />
        </FormField>
        <FormField label="Phone">
          <Input
            name="phone"
            defaultValue={supplier?.phone || ""}
            placeholder="Enter supplier mobile number"
          />
        </FormField>
        <FormField label="Email">
          <Input
            name="email"
            type="email"
            defaultValue={supplier?.email || ""}
            placeholder="Enter supplier email"
          />
        </FormField>
        {supplier && (
          <FormField label="Status">
            <Select name="isActive" defaultValue={String(supplier.is_active)}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </FormField>
        )}
        <div className="md:col-span-2">
          <FormField label="Address">
            <Input name="address" defaultValue={supplier?.address || ""} placeholder="Enter supplier address"/>
          </FormField>
        </div>
        <Actions
          busy={busy}
          back={back}
          label={supplier ? "Save Supplier" : "Create Supplier"}
        />
      </form>
    </Card>
  );
}

export function TaxRuleForm({
  title,
  rule,
  branches,
  busy,
  onSubmit,
  back,
}: any) {
  return (
    <Card>
      <Header
        title={title}
        subtitle="Tax is selected by branch and service scope during invoice generation."
        back={back}
      />
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <FormField label="Name">
          <Input name="name" defaultValue={rule?.name || ""} required placeholder='Enter tax name'/>
        </FormField>
        <FormField label="Branch">
          <Select name="branchId" defaultValue={rule?.branch_id || ""}>
            <option value="">All branches</option>
            {branches.map((branch: any) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Service Scope">
          <Select
            name="serviceScope"
            defaultValue={rule?.service_scope || "all"}
          >
            {serviceScopes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Tax Label">
          <Input
            name="taxLabel"
            defaultValue={rule?.tax_label || "GST"}
            required
          />
        </FormField>
        <FormField label="Tax Percentage">
          <Input
            name="taxPercentage"
            type="number"
            min="0"
            max="100"
            defaultValue={rule?.tax_percentage ?? 0}
            required
          />
        </FormField>
        {rule && (
          <FormField label="Status">
            <Select name="isActive" defaultValue={String(rule.is_active)}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </FormField>
        )}
        <Actions
          busy={busy}
          back={back}
          label={rule ? "Save Tax Rule" : "Create Tax Rule"}
        />
      </form>
    </Card>
  );
}

export function DiscountOfferForm({
  title,
  offer,
  branches,
  busy,
  onSubmit,
  back,
}: any) {
  return (
    <Card>
      <Header
        title={title}
        subtitle="Offers can be applied to consultation, lab, pharmacy, or item invoices with an optional minimum bill amount."
        back={back}
      />
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <FormField label="Offer Name">
          <Input name="name" defaultValue={offer?.name || ""} required placeholder="Enter offer name" />
        </FormField>
        <FormField label="Code">
          <Input
            name="code"
            defaultValue={offer?.code || ""}
            placeholder="HEALTH10"
          />
        </FormField>
        <FormField label="Branch">
          <Select name="branchId" defaultValue={offer?.branch_id || ""}>
            <option value="">All branches</option>
            {branches.map((branch: any) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Service Scope">
          <Select
            name="serviceScope"
            defaultValue={offer?.service_scope || "all"}
          >
            {serviceScopes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Discount Type">
          <Select
            name="discountType"
            defaultValue={offer?.discount_type || "percentage"}
          >
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </Select>
        </FormField>
        <FormField label="Value">
          <Input
            name="value"
            type="number"
            min="0"
            defaultValue={offer?.value ?? 0}
            required
          />
        </FormField>
        <FormField label="Minimum Bill Amount">
          <Input
            name="minimumBillAmount"
            type="number"
            min="0"
            defaultValue={offer?.minimum_bill_amount ?? 0}
          />
        </FormField>
        <FormField label="Max Discount">
          <Input
            name="maxDiscountAmount"
            type="number"
            min="0"
            defaultValue={offer?.max_discount_amount ?? ""}
            placeholder="Enter maximum amount"
          />
        </FormField>
        <FormField label="Valid From">
          <Input
            name="validFrom"
            type="date"
            defaultValue={dateToInput(offer?.valid_from)}
          />
        </FormField>
        <FormField label="Valid Until">
          <Input
            name="validUntil"
            type="date"
            defaultValue={dateToInput(offer?.valid_until)}
          />
        </FormField>
        {offer && (
          <FormField label="Status">
            <Select name="isActive" defaultValue={String(offer.is_active)}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </FormField>
        )}
        <Actions
          busy={busy}
          back={back}
          label={offer ? "Save Offer" : "Create Offer"}
        />
      </form>
    </Card>
  );
}

export function PermissionCheckboxes({ permissions, selected, disabled }: any) {
  const catalog = [...permissions];
  for (const permission of requiredRolePermissions) {
    if (!catalog.some((item: any) => item.key === permission.key))
      catalog.push(permission);
  }
  const grouped = catalog.reduce((acc: any, permission: any) => {
    acc[permission.module] = [...(acc[permission.module] || []), permission];
    return acc;
  }, {});
  const buckets = [
    ["manage", "Manage", ["manage", "sign", "approve", "export"]],
    ["create", "Create", ["create"]],
    ["read", "Read", ["read", "view"]],
    ["edit", "Edit", ["edit", "write"]],
    ["delete", "Delete", ["delete", "cancel"]],
  ];
  const modules = Object.keys(grouped).sort();
  const selectedSet = new Set(selected || []);
  const normalizedAction = (permission: any) =>
    String(permission.action || "manage")
      .split(".")
      .pop() || "manage";
  const bucketFor = (permission: any) =>
    buckets.find((bucket: any) =>
      bucket[2].includes(normalizedAction(permission)),
    ) || buckets[0];
  const labelFor = (permission: any) =>
    title(
      String(permission.action || "manage")
        .replaceAll("_", " ")
        .replaceAll(".", " "),
    );
  return (
    <div>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h4 className="text-base lg:text-lg font-bold">Module Permissions</h4>
          <p className="text-xs lg:text-sm text-slate-500">
            Enable permissions by module. Use Manage for full workflow/action
            access, then Create, Read, Edit, and Delete as needed.
          </p>
        </div>
        <Badge tone="slate" className="w-[20%] lg:w-[15%] py-2 rounded-lg">
          {selectedSet.size} selected
        </Badge>
      </div>
      <div className="mt-3 grid gap-4 xl:grid-cols-2">
        {modules.map((module) => (
          <div
            key={module}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div>
                <h5 className="font-bold">{permissionModuleTitle(module)}</h5>
                <p className="text-xs text-slate-500">
                  {grouped[module].length} permissions
                </p>
              </div>
              <Badge tone="slate" className="rounded-lg py-2 px-2">
                Module
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {buckets.map((bucket: any) => {
                const bucketPermissions = grouped[module]
                  .filter(
                    (permission: any) => bucketFor(permission)[0] === bucket[0],
                  )
                  .sort((a: any, b: any) => a.key.localeCompare(b.key));
                return (
                  <div
                    key={`${module}-${bucket[0]}`}
                    className="rounded-2xl bg-slate-50 p-3"
                  >
                    <p className="mb-2 text-xs font-bold uppercase text-slate-500">
                      {bucket[1]}
                    </p>
                    <div className="grid gap-2">
                      {bucketPermissions.length ? (
                        bucketPermissions.map((permission: any) => (
                          <label
                            key={permission.key}
                            className="flex items-start gap-2 text-sm"
                          >
                            <input
                              name="permissionKeys"
                              type="checkbox"
                              value={permission.key}
                              defaultChecked={selectedSet.has(permission.key)}
                              disabled={disabled}
                              className="mt-1 h-4 w-4"
                            />
                            <span>
                              <span className="font-semibold">
                                {labelFor(permission)}
                              </span>
                              <span className="block break-all text-xs text-slate-400">
                                {permission.key}
                              </span>
                            </span>
                          </label>
                        ))
                      ) : (
                        <span className="text-xs text-slate-300">
                          No access
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
