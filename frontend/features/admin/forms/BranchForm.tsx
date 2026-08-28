import { useForm } from "react-hook-form";
import { Actions } from "../components/Actions";
import { Header } from "../components/Header";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, Input, SearchableSelect } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { isLocked } from "../helpers";
import { BranchFormValues, branchSchema } from "../settings.schema";
import { useEffect } from "react";
import { FormError } from "@/app/components/common/FormError";
import { branch_status_options } from "../constants";
import { TenantPicker } from "@/features/superAdmin/components/shared/TenantPicker";

export function BranchForm({
  title,
  branch,
  branchCount,
  branchLimit,
  busy,
  onSubmit,
  back,
  tenants,
  selectedId,
  setSelectedId,
  readOnly = false,
  onEdit,
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
    <Card className="bg-white p-4">
      <Header
        title={title}
        subtitle={
          branch
            ? "Update branch details."
            : "Branch creation is checked against the active subscription limit."
        }
        back={back}
        readOnly={readOnly}
        onEdit={onEdit}
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
        <fieldset disabled={readOnly} className="contents">
        {tenants && !branch && (
          <TenantPicker
            tenants={tenants}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
        )}

        <FormField label="Branch Name" required>
          <Input
            {...register("name")}
            disabled={isLocked(branch)}
            placeholder="Enter branch name"
          />
          {errors.name && <FormError error={errors.name?.message} />}
        </FormField>
        <FormField label="Code" required>
          <Input
            {...register("code")}
            disabled={isLocked(branch)}
            placeholder="Enter branch code"
          />
          {errors.code && <FormError error={errors.code?.message} />}
        </FormField>
        <FormField label="City">
          <Input
            {...register("city")}
            disabled={isLocked(branch)}
            placeholder="Enter city name"
          />
          {errors.city && (
            <FormError error={errors.city?.message} />
          )}
        </FormField>
        <FormField label="Area">
          <Input
            {...register("area")}
            disabled={isLocked(branch)}
            placeholder="Enter branch area"
          />
          {errors.area && (
            <FormError error={errors.area?.message}/>
          )}
        </FormField>
        <FormField label="State">
          <Input
            {...register("state")}
            disabled={isLocked(branch)}
            placeholder="Enter state name"
          />
          {errors.state && (
            <FormError error={errors.state?.message}/>
          )}
        </FormField>
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
              options={branch_status_options}
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
            {errors.address && (
              <FormError error={errors.address?.message}/>
            )}
          </FormField>
        </div>
        </fieldset>

        {!readOnly && (
          <Actions
            busy={busy}
            back={back}
            disabled={isLocked(branch) || planLimitReached}
            label={branch ? "Save Branch" : "Create Branch"}
          />
        )}
      </form>
    </Card>
  );
}
