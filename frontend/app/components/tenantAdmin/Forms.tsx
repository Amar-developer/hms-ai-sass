import { roleKeyFromName } from "@/utils/tenantAdmin/helpers";
import {
  Card,
  Input,
  Select,
  Field,
  SuggestionInput,
  Badge,
  SearchableSelect,
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
import { userTypes, serviceScopes } from "@/utils/tenantAdmin/constants";
import { KeyRound } from "lucide-react";
import { basicMedicalDepartmentSuggestions } from "@/lib/options";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  booleanOptions,
  discountTypeOptions,
  statusOptions,
  userTypeOptions,
} from "@/utils/tenantAdmin/options";
import {
  userSchema,
  UserFormValues,
  departmentSchema,
  DepartmentFormValues,
  BranchFormValues,
  branchSchema,
  supplierSchema,
  SupplierFormValues,
  TaxRuleFormValues,
  taxRuleSchema,
  DiscountOfferFormValues,
  discountOfferSchema,
} from "@/app/validations/settings.schema";

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
            <SearchableSelect
              name="isActive"
              value={String(role.is_active)}
              disabled={isLocked(role)}
              searchable={false}
              options={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
            />
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
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),

    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
      userType: user?.user_type || "staff",
      mobile: user?.mobile || "",
      branchId: user?.branch_id || "",
      password: user ? undefined : "TempPass123",
      mustChangePassword: String(user?.must_change_password ?? true),
      isActive: String(user?.is_active ?? true),
      roleKeys: user?.roles?.length
        ? user.roles
        : user?.user_type === "tenant_admin"
          ? ["tenant_admin"]
          : [],
    },
  });

  const userType = watch("userType");
  const selectedRoleKeys = watch("roleKeys") || [];
  const selectedBranch = watch("branchId");
  const mustChangePassword = watch("mustChangePassword");
  const isActive = watch("isActive");

  const hasTenantAdminAccess =
    userType === "tenant_admin" || selectedRoleKeys.includes("tenant_admin");

  const changeUserType = (nextType: string) => {
    setValue("userType", nextType as UserFormValues["userType"], {
      shouldValidate: true,
      shouldDirty: true,
    });

    if (nextType === "tenant_admin") {
      setValue("branchId", "", {
        shouldValidate: true,
        shouldDirty: true,
      });

      setValue(
        "roleKeys",
        selectedRoleKeys.includes("tenant_admin")
          ? selectedRoleKeys
          : [...selectedRoleKeys, "tenant_admin"],
        {
          shouldValidate: true,
          shouldDirty: true,
        },
      );
    } else {
      setValue(
        "roleKeys",
        selectedRoleKeys.filter((role: string) => role !== "tenant_admin"),
        {
          shouldValidate: true,
          shouldDirty: true,
        },
      );
    }
  };

  const changeRoleSelection = (nextRoleKeys: string[]) => {
    if (nextRoleKeys.includes("tenant_admin")) {
      setValue("userType", "tenant_admin", {
        shouldValidate: true,
        shouldDirty: true,
      });

      setValue("branchId", "", {
        shouldValidate: true,
        shouldDirty: true,
      });

      setValue("roleKeys", nextRoleKeys, {
        shouldValidate: true,
        shouldDirty: true,
      });

      return;
    }

    if (userType === "tenant_admin") {
      setValue(
        "roleKeys",
        Array.from(new Set([...nextRoleKeys, "tenant_admin"])),
        {
          shouldValidate: true,
          shouldDirty: true,
        },
      );

      return;
    }

    setValue("roleKeys", nextRoleKeys, {
      shouldValidate: true,
      shouldDirty: true,
    });
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

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-4 grid gap-6 md:grid-cols-2"
      >
        <FormField label="Name">
          <Input
            {...register("name")}
            placeholder="Enter user name"
          />

          {errors.name && (
            <p className="text-xs text-red-500">{errors.name.message}</p>
          )}
        </FormField>

        <FormField label="Email">
          <Input
            type="email"
            {...register("email")}
            placeholder="Enter user email"
          />

          {errors.email && (
            <p className="text-xs text-red-500">{errors.email.message}</p>
          )}
        </FormField>

        <FormField label="User Type">
          <SearchableSelect
            value={watch('userType')}
            onChange={(value)=>setValue('userType',value)}
            searchable={false}
            options={userTypeOptions}
            error={errors.userType?.message}
          />
        </FormField>

        <Field label="Mobile">
          <Input
            mobileNumber
            {...register("mobile")}
            placeholder="Enter mobile number"
          />
        </Field>

        <Field label="Branch Access">
          <SearchableSelect
            value={selectedBranch}
            onChange={(value) =>
              setValue("branchId", value, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
            disabled={hasTenantAdminAccess}
            searchable={branches.length > 8}
            placeholder="All branches"
            options={[
              {
                value: "",
                label: "All branches",
              },
              ...branches.map((branch: any) => ({
                value: branch.id,
                label: branch.name,
              })),
            ]}
            error={errors.branchId?.message}
          />
        </Field>

        {!user && (
          <FormField label="Temporary Password">
            <Input
              {...register("password")}
              type="text"
            />
          </FormField>
        )}

        <FormField label="Must Change Password">
          <SearchableSelect
            value={mustChangePassword}
            onChange={(value) =>
              setValue("mustChangePassword", value, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
            searchable={false}
            options={booleanOptions}
            error={errors.mustChangePassword?.message}
          />
        </FormField>

        {user && (
          <FormField label="Status">
            <SearchableSelect
              value={isActive}
              onChange={(value) =>
                setValue("isActive", value, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              searchable={false}
              options={[
                {
                  value: "true",
                  label: "Active",
                },
                {
                  value: "false",
                  label: "Inactive",
                },
              ]}
            />
          </FormField>
        )}

        <div className="md:col-span-2">
          <CheckboxList
            title="Role Access"
            rows={roleOptions}
            selected={selectedRoleKeys}
            valueKey="key"
            labelKey="name"
            onRowOpen={onRoleOpen}
            onSelectionChange={changeRoleSelection}
          />

          {errors.roleKeys && (
            <p className="text-xs text-red-500">{errors.roleKeys.message}</p>
          )}
        </div>

        {canResetPassword && (
          <div className="md:col-span-2">
            {/* existing reset password block */}
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
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentSchema),

    defaultValues: {
      name: department?.name || "",

      branchId: department?.branch_id || "",

      description: department?.description || "",

      isActive: String(department?.is_active ?? true),
    },
  });

  const departmentName = watch("name");
  const selectedBranchId = watch("branchId");

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
    (row: any) =>
      String(row.branch_id || "") === String(selectedBranchId || ""),
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
        onSubmit={handleSubmit(onSubmit)}
        autoComplete="off"
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <Field label="Name">
          <SuggestionInput
            value={watch("name")}
            onChange={(event: any) => {
              setValue("name", event.target.value, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
            placeholder="General Medicine"
            suggestions={basicMedicalDepartmentSuggestions}
            disabled={isLocked(department)}
          />

          {errors.name && (
            <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
          )}
        </Field>

        <FormField label="Branch">
          <SearchableSelect
            value={selectedBranchId}
            onChange={(value) => {
              setValue("branchId", value, {
                shouldValidate: true,
              });
            }}
            disabled={isLocked(department)}
            searchable={branches.length > 8}
            placeholder="All branches"
            options={[
              {
                value: "",
                label: "All branches",
              },

              ...branches.map((branch: any) => ({
                value: branch.id,
                label: branch.name,
              })),
            ]}
          />

          {errors.branchId && (
            <p className="mt-1 text-xs text-red-500">
              {errors.branchId.message}
            </p>
          )}
        </FormField>

        {scopeConflict && (
          <div className="md:col-span-2 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            {conflictMessage}
          </div>
        )}

        {department && (
          <FormField label="Status">
            <SearchableSelect
              value={watch("isActive")}
              onChange={(value) => {
                setValue("isActive", value, {
                  shouldValidate: true,
                });
              }}
              disabled={isLocked(department)}
              searchable={false}
              options={[
                {
                  value: "true",
                  label: "Active",
                },
                {
                  value: "false",
                  label: "Inactive",
                },
              ]}
            />
          </FormField>
        )}

        <div className="md:col-span-2">
          <FormField label="Description">
            <Input
              {...register("description")}
              disabled={isLocked(department)}
              placeholder="Enter department description"
            />

            {errors.description && (
              <p className="mt-1 text-xs text-red-500">
                {errors.description.message}
              </p>
            )}
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
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<BranchFormValues>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      name: "",
      code: "",
      city: "",
      state: "",
      address: "",
      isActive: "true",
    },
  });

  useEffect(() => {
    reset({
      name: branch?.name || "",
      code: branch?.code || "",
      city: branch?.city || "",
      area: branch?.area || "",
      state: branch?.state || "",
      address: branch?.address || "",
      isActive: String(branch?.is_active ?? true),
    });
  }, [branch, reset]);
  const activeBranchCount = Number(branchCount || 0);
  const planLimitReached =
    !branch &&
    Number.isFinite(Number(branchLimit)) &&
    activeBranchCount >= Number(branchLimit);
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
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <FormField label="Branch Name">
          <Input
            {...register("name")}
            disabled={isLocked(branch)}
            placeholder="Enter branch name"
          />
        </FormField>
        <FormField label="Code">
          <Input
            {...register("code")}
            disabled={isLocked(branch)}
            placeholder="Enter branch code"
          />
          {errors.code && (
            <p className="mt-1 text-xs text-red-500">{errors.code.message}</p>
          )}
        </FormField>
        <FormField label="City">
          <Input
            {...register("city")}
            disabled={isLocked(branch)}
            placeholder="Enter city name"
          />
        </FormField>
        <Field label="Area">
          <Input
            {...register("area")}
            disabled={isLocked(branch)}
            placeholder="Enter branch area"
          />
        </Field>
        <Field label="State">
          <Input
            {...register("state")}
            disabled={isLocked(branch)}
            placeholder="Enter state name"
          />
        </Field>
        {branch && (
          <FormField label="Status">
            <SearchableSelect
              value={watch("isActive")}
              onChange={(value) => {
                setValue("isActive", value, {
                  shouldValidate: true,
                });
              }}
              disabled={isLocked(branch)}
              searchable={false}
              options={[
                {
                  value: "true",
                  label: "Active",
                },
                {
                  value: "false",
                  label: "Inactive",
                },
              ]}
            />
          </FormField>
        )}
        <div className="md:col-span-2">
          <FormField label="Address">
            <Input
              {...register("address")}
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
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: supplier?.name || "",
      gstin: supplier?.gstin || "",
      phone: supplier?.phone || "",
      email: supplier?.email || "",
      address: supplier?.address || "",
      isActive: String(supplier?.is_active ?? true),
    },
  });

  useEffect(() => {
    reset({
      name: supplier?.name || "",
      gstin: supplier?.gstin || "",
      phone: supplier?.phone || "",
      email: supplier?.email || "",
      address: supplier?.address || "",
      isActive: String(supplier?.is_active ?? true),
    });
  }, [supplier, reset]);
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
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <FormField label="Supplier Name">
          <Input {...register("name")} placeholder="Enter supplier name" />
          {errors.name && (
            <p className="text-xs text-red-500">{errors.name.message}</p>
          )}
        </FormField>
        <FormField label="GSTIN">
          <Input {...register("gstin")} placeholder="Enter GSTIN" />
          {errors.gstin && (
            <p className="text-xs text-red-500">{errors.gstin.message}</p>
          )}
        </FormField>
        <FormField label="Phone">
          <Input
            mobileNumber
            {...register("phone")}
            placeholder="Enter supplier mobile number"
          />
          {errors.phone && (
            <p className="text-xs text-red-500">{errors.phone.message}</p>
          )}
        </FormField>
        <FormField label="Email">
          <Input {...register("email")} placeholder="Enter supplier email" />
          {errors.email && (
            <p className="text-xs text-red-500">{errors.email.message}</p>
          )}
        </FormField>
        {supplier && (
          <FormField label="Status">
            <SearchableSelect
              value={watch("isActive")}
              onChange={(value) =>
                setValue("isActive", value, {
                  shouldValidate: true,
                })
              }
              searchable={false}
              options={statusOptions}
            />
          </FormField>
        )}
        <div className="md:col-span-2">
          <FormField label="Address">
            <Input
              {...register("address")}
              placeholder="Enter supplier address"
            />
            {errors.address && (
              <p className="text-xs text-red-500">{errors.address.message}</p>
            )}
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
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<TaxRuleFormValues>({
    resolver: zodResolver(taxRuleSchema),
    defaultValues: {
      name: rule?.name || "",
      branchId: rule?.branch_id || "",
      serviceScope: rule?.service_scope || "all",
      taxLabel: rule?.tax_label || "GST",
      taxPercentage: rule?.tax_percentage ?? 0,
      isActive: rule ? String(rule.is_active) : undefined,
    },
  });

  return (
    <Card>
      <Header
        title={title}
        subtitle="Tax is selected by branch and service scope during invoice generation."
        back={back}
      />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <FormField label="Name" error={errors.name?.message}>
          <Input
            {...register("name")}
            required
            placeholder="Enter tax name"
          />
        </FormField>

        <FormField label="Branch" error={errors.branchId?.message}>
          <SearchableSelect
            value={watch("branchId")}
            onChange={(value) => setValue("branchId", value)}
            searchable={branches.length > 8}
            placeholder="All branches"
            options={[
              { value: "", label: "All branches" },
              ...branches.map((branch: any) => ({
                value: branch.id,
                label: branch.name,
              })),
            ]}
          />
        </FormField>

        <FormField label="Service Scope" error={errors.serviceScope?.message}>
          <SearchableSelect
            value={watch("serviceScope")}
            onChange={(value) => setValue("serviceScope", value)}
            searchable={false}
            options={serviceScopes.map(([value, label]) => ({ value, label }))}
          />
        </FormField>

        <FormField label="Tax Label" error={errors.taxLabel?.message}>
          <Input {...register("taxLabel")} required  />
        </FormField>

        <FormField label="Tax Percentage" error={errors.taxPercentage?.message}>
          <Input
            {...register("taxPercentage")}
            type="number"
            min="0"
            max="100"
            required
          />
        </FormField>

        {rule && (
          <FormField label="Status" error={errors.isActive?.message}>
            <SearchableSelect
              value={watch("isActive")}
              onChange={(value) => setValue("isActive", value)}
              searchable={false}
              options={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
            />
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
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<DiscountOfferFormValues>({
    resolver: zodResolver(discountOfferSchema),
    defaultValues: {
      name: offer?.name || "",
      code: offer?.code || "",
      branchId: offer?.branchId || "",
      serviceScope: offer?.serviceScope || "all",
      discountType: offer?.discountType || "percentage",
      value: offer?.value ?? 0,
      minimumBillAmount: offer?.minimumBillAmount ?? 0,
      maxDiscountAmount: offer?.maxDiscountAmount ?? 0,
      validFrom: offer?.validFrom || "",
      validUntil: offer?.validUntil || "",
      isActive: String(offer?.is_active ?? true),
    },
  });

  useEffect(() => {
    reset({
      name: offer?.name || "",
      code: offer?.code || "",
      branchId: offer?.branch_id || "",
      serviceScope: offer?.service_scope || "all",
      discountType: offer?.discount_type || "percentage",
      value: offer?.value ?? 0,
      minimumBillAmount: offer?.minimum_bill_amount ?? 0,
      maxDiscountAmount: offer?.max_discount_amount ?? 0,
      validFrom: offer?.valid_from || "",
      validUntil: offer?.valid_until || "",
      isActive: String(offer?.is_active ?? true),
    });
  }, [offer, reset]);
  return (
    <Card>
      <Header
        title={title}
        subtitle="Offers can be applied to consultation, lab, pharmacy, or item invoices with an optional minimum bill amount."
        back={back}
      />
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <FormField label="Offer Name">
          <Input
            {...register("name")}
            placeholder="Enter offer name"
          />
        </FormField>
        <FormField label="Code">
          <Input {...register("code")}  />
        </FormField>
        <FormField label="Branch">
          <SearchableSelect
            value={watch("branchId")}
            onChange={(value) => setValue("branchId", value)}
            searchable={branches.length > 8}
            placeholder="All branches"
            options={[
              { value: "", label: "All branches" },
              ...branches.map((branch: any) => ({
                value: branch.id,
                label: branch.name,
              })),
            ]}
          />
        </FormField>
        <FormField label="Service Scope">
          <SearchableSelect
            name="serviceScope"
            value={watch("serviceScope")}
            onChange={(value) => setValue("serviceScope", value)}
            searchable={false}
            options={serviceScopes.map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </FormField>
        <FormField label="Discount Type">
          <SearchableSelect
            name="discountType"
            value={watch("discountType")}
            onChange={(value) => setValue("discountType", value)}
            searchable={false}
            options={discountTypeOptions}
          />
        </FormField>
        <FormField label="Value">
          <Input {...register("value")}  />
        </FormField>
        <FormField label="Minimum Bill Amount">
          <Input {...register("minimumBillAmount")}  />
        </FormField>
        <FormField label="Max Discount">
          <Input {...register("maxDiscountAmount")}  />
        </FormField>
        <FormField label="Valid From">
          <Input
            {...register("validFrom")}
            type="date"

          />
        </FormField>
        <FormField label="Valid Until">
          <Input
            {...register("validUntil")}
            type="date"

          />
        </FormField>
        {offer && (
          <FormField label="Status">
            <SearchableSelect
              name="isActive"
              value={watch("isActive")}
              onChange={(value) => setValue("isActive", value)}
              searchable={false}
              options={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
            />
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
                <h5 className="text-base lg:text-sm font-bold">
                  {permissionModuleTitle(module)}
                </h5>
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
                    className="flex items-start gap-2  lg:text-[11px]"
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
                      <span className="text-sm lg:text-[12px] font-semibold">
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
