import { Form, useForm } from "react-hook-form";
import { Actions } from "../components/Actions";
import { Header } from "../components/Header";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card,Input, SearchableSelect } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { TaxRuleFormValues, taxRuleSchema } from "../settings.schema";
import { serviceScopes } from "../constants";
import { FormError } from "@/app/components/common/FormError";


export function TaxRuleForm({
  title,
  rule,
  branches,
  busy,
  onSubmit,
  back,
  readOnly = false,
  onEdit,
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
        readOnly={readOnly}
        onEdit={onEdit}
      />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <fieldset disabled={readOnly} className="contents">
        <FormField label="Name" required>
          <Input
            {...register("name")}
            placeholder="Enter tax name"
          />
          {errors.name && (
            <FormError error={errors.name?.message}/>
          )}
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
          <Input {...register("taxLabel")} />
        </FormField>

        <FormField label="Tax Percentage" required>
          <Input
            {...register("taxPercentage",{valueAsNumber:true})}
            type="number"
            min="0"
            max="100"
            step="0.01"
          />
          {errors.taxPercentage && (
            <FormError error={errors.taxPercentage?.message}/>
          )}
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

        </fieldset>

        {!readOnly && (
          <Actions
            busy={busy}
            back={back}
            label={rule ? "Save Tax Rule" : "Create Tax Rule"}
          />
        )}
      </form>
    </Card>
  );
}
