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
  const [mobile, setMobile] = useState(user?.mobile || "");
  const changeUserType = (nextType: string) => {
    setUserType(nextType);
    if (nextType === "tenant_admin") {
      setSelectedBranch("");
      setSelectedRoleKeys((previous) =>
        previous.includes("tenant_admin")
          ? previous
          : [...previous, "tenant_admin"],
      );
    } else {
      setSelectedRoleKeys((previous) =>
        previous.filter((roleKey) => roleKey !== "tenant_admin"),
      );
    }
  };
  const changeRoleSelection = (nextRoleKeys: string[]) => {
    const hasTenantAdmin = nextRoleKeys.includes("tenant_admin");
    if (hasTenantAdmin) {
      setSelectedRoleKeys(nextRoleKeys);
      setUserType("tenant_admin");
      setSelectedBranch("");
    } else if (userType === "tenant_admin") {
      setSelectedRoleKeys(
        Array.from(new Set([...nextRoleKeys, "tenant_admin"])),
      );
    } else {
      setSelectedRoleKeys(nextRoleKeys);
    }
  };
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
            className='search-input'
          />
        </FormField>
        <FormField label="Email">
          <Input
            name="email"
            type="email"
            placeholder="Enter user email"
            defaultValue={user?.email || ""}
            required
            className='search-input'
          />
        </FormField>
        <FormField label="User Type">
          <Select
            name="userType"
            value={userType}
            onChange={(event: any) => changeUserType(event.target.value)}
          >
            {userTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <Field label="Mobile">
          <Input
            name="mobile"
            mobileNumber
            value={mobile}
            onChange={(e: any) => setMobile(e.target.value)}
            placeholder="Enter patient mobile number"
            className='search-input'
          />
        </Field>
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
              className='search-input'
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
            onSelectionChange={changeRoleSelection}
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
              <span className="text-xs">Reset Password</span>
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
  departments = [],
  branches,
  busy,
  onSubmit,
  back,
}: any) {
  const [departmentName, setDepartmentName] = useState(department?.name || "");
  const [selectedBranchId, setSelectedBranchId] = useState(
    department?.branch_id || "",
  );
  const normalKey = (value: any) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const matchingDepartments = departments.filter(
    (row: any) =>
      row.id !== department?.id &&
      row.is_active !== false &&
      normalKey(row.name) === normalKey(departmentName),
  );
  const hasAllBranchDuplicate = matchingDepartments.some(
    (row: any) => !row.branch_id,
  );
  const hasBranchDuplicate = matchingDepartments.some(
    (row: any) => row.branch_id,
  );
  const hasSameBranchDuplicate = matchingDepartments.some(
    (row: any) => String(row.branch_id || "") === String(selectedBranchId || ""),
  );
  const scopeConflict =
    Boolean(normalKey(departmentName)) &&
    (hasSameBranchDuplicate ||
      (selectedBranchId && hasAllBranchDuplicate) ||
      (!selectedBranchId && hasBranchDuplicate));
  const conflictMessage = hasSameBranchDuplicate
    ? "This medical department already exists for the selected branch."
    : selectedBranchId && hasAllBranchDuplicate
      ? "This medical department already exists for all branches. Edit that row instead of creating a branch-specific duplicate."
      : "This medical department already exists in one or more branches. Remove those branch mappings before creating an all-branches department.";

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
            onChange={(event: any) => setDepartmentName(event.target.value)}
            placeholder="General Medicine"
            suggestions={basicMedicalDepartmentSuggestions}
            required
            disabled={isLocked(department)}
          />
        </Field>
        <FormField label="Branch">
          <Select
            name="branchId"
            value={selectedBranchId}
            onChange={(event: any) => setSelectedBranchId(event.target.value)}
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
        {scopeConflict && (
          <div className="md:col-span-2 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            {conflictMessage}
          </div>
        )}
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
          disabled={isLocked(department) || scopeConflict}
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
  branchLimit,
  busy,
  onSubmit,
  back,
}: any) {
  const activeBranchCount = Number(branchCount || 0);
  const planLimitReached =
    !branch && Number.isFinite(Number(branchLimit)) && activeBranchCount >= Number(branchLimit);
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
      {planLimitReached && (
        <div className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          Current plan allows {branchLimit} active branch
          {Number(branchLimit) === 1 ? "" : "es"}. Upgrade the subscription to
          create another branch.
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
          disabled={isLocked(branch) || planLimitReached}
          label={branch ? "Save Branch" : "Create Branch"}
        />
      </form>
    </Card>
  );
}

export function SupplierForm({ title, supplier, busy, onSubmit, back }: any) {
  const [mobile, setMobile] = useState(supplier?.mobile);
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
            mobileNumber
            value={mobile}
            onChange={(e: any) => setMobile(e.target.value)}
            placeholder="Enter patient mobile number"
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
            <Input
              name="address"
              defaultValue={supplier?.address || ""}
              placeholder="Enter supplier address"
            />
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
          <Input
            name="name"
            defaultValue={rule?.name || ""}
            required
            placeholder="Enter tax name"
          />
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
          <Input
            name="name"
            defaultValue={offer?.name || ""}
            required
            placeholder="Enter offer name"
          />
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
  const catalog = [...(permissions || [])];
  const grouped = catalog.reduce((acc: any, permission: any) => {
    acc[permission.module] = [...(acc[permission.module] || []), permission];
    return acc;
  }, {});
  const modules = Object.keys(grouped).sort();
  const selectedSet = new Set(selected || []);
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
          <h4 className="card-title font-bold">Module Permissions</h4>
          <p className="card-desc text-slate-500">
            Enable the exact workflow actions this role may use. Manage grants
            the module's administrative workflows where supported.
          </p>
        </div>
        <Badge tone="slate" className="w-[20%] lg:w-[15%] normal-badge">
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
              <div className="flex justify-between  w-full">
                <h5 className="font-bold">{permissionModuleTitle(module)}</h5>
                <p className="text-xs text-slate-500">
                  {grouped[module].length} permissions
                </p>
              </div>
              {/* <Badge tone="slate" className="rounded-lg py-2 px-2">
                Module
              </Badge> */}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {grouped[module]
                .sort((a: any, b: any) => a.key.localeCompare(b.key))
                .map((permission: any) => (
                  <label
                    key={permission.key}
                    className="flex items-start gap-2 text-[11px]"
                    title={permission.description || permission.key}
                  >
                    <input
                      name="permissionKeys"
                      type="checkbox"
                      value={permission.key}
                      defaultChecked={selectedSet.has(permission.key)}
                      disabled={disabled}
                      className="mt-1 h-3 w-3"
                    />
                    <span>
                      <span className="text-[12px] font-semibold">
                        {labelFor(permission)}
                      </span>
                      {/* <span className="block break-all text-[11px] text-slate-400">
                                {permission.key}
                              </span> */}
                    </span>
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
