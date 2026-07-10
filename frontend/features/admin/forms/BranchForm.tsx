import { useForm } from "react-hook-form";
import { Actions } from "../components/Actions";
import { Header } from "../components/Header";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card,Field,Input, SearchableSelect  } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { isLocked } from "../helpers";
import { BranchFormValues, branchSchema } from "../settings.schema";
import { useEffect } from "react";


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
