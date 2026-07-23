import { useForm } from "react-hook-form";
import { Actions } from "../components/Actions";
import { Header } from "../components/Header";
import { CheckboxList } from "../components/CheckboxList";
import { UserFormValues, userSchema } from "../settings.schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { tenantRoleOptions } from "../helpers";
import { canResetTenantUserPassword } from "../permissions";
import { Card,Field,Input, SearchableSelect } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { booleanOptions, userTypeOptions } from "../options";
import { FormError } from "@/app/components/common/FormError";

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
      tenantRoleOptions(roles, branches, selectedBranch, selectedRoleKeys),
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
        <FormField label="Name" required>
          <Input
            {...register("name")}
            placeholder="Enter user name"
          />

          {errors.name && (
            <p className="text-xs text-red-500">{errors.name.message}</p>
          )}
        </FormField>

        <FormField label="Email" required>
          <Input
            type="email"
            {...register("email")}
            placeholder="Enter user email"
          />

          {errors.email && (
            <p className="text-xs text-red-500">{errors.email.message}</p>
          )}
        </FormField>

        <FormField label="User Type" required>
          <SearchableSelect
            value={watch('userType')}
            onChange={(value)=>setValue('userType',value)}
            searchable={false}
            options={userTypeOptions}
            error={errors.userType?.message}
          />
        </FormField>

        <FormField label="Mobile" required>
          <Input
            mobileNumber
            type='number'
            {...register("mobile")}
            placeholder="Enter mobile number"
          />
          <FormError error={errors.mobile?.message}/>
        </FormField>

        <FormField label="Branch Access" required>
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
        </FormField>

        {!user && (
          <FormField label="Temporary Password" required>
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
