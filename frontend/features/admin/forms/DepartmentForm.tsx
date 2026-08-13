import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Actions } from "../components/Actions";
import { Header } from "../components/Header";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card,Field,Input, SearchableSelect, SuggestionInput } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { DepartmentFormValues, departmentSchema } from "../settings.schema";
import { basicMedicalDepartmentSuggestions } from "@/lib/options";
import { isLocked } from "../helpers";
import { TenantPicker } from "@/features/superAdmin/components/shared/TenantPicker";



export function DepartmentForm({
  title,
  department,
  departments = [],
  branches,
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
  } = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentSchema),

    defaultValues: {
      name: department?.name || "",

      branchId: department?.branch_id || "",

      description: department?.description || "",

      isActive: String(department?.is_active ?? true),
    },
  });

  // `department` can arrive asynchronously after this form has already
  // mounted (e.g. a direct URL to an edit link, before the list loads), so
  // react-hook-form's initial defaultValues alone would leave every field
  // blank. Reset once the real record shows up.
  useEffect(() => {
    if (!department?.id) return;
    reset({
      name: department?.name || "",
      branchId: department?.branch_id || "",
      description: department?.description || "",
      isActive: String(department?.is_active ?? true),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department?.id]);

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
    <Card className="mt-3">
      <Header
        title={title}
        subtitle={
          department?.code ||
          "Medical departments are used for doctors, schedules, appointments, and patient routing."
        }
        back={back}
        readOnly={readOnly}
        onEdit={onEdit}
      />

      <form
        onSubmit={handleSubmit(onSubmit)}
        autoComplete="off"
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        <fieldset disabled={readOnly} className="contents">
        {tenants && !department && (
          <TenantPicker
            tenants={tenants}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
        )}

        <Field label="Name" required>
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

        </fieldset>

        {!readOnly && (
          <Actions
            busy={busy}
            back={back}
            disabled={isLocked(department) || scopeConflict}
            label={
              department
                ? "Save Medical Department"
                : "Create Medical Department"
            }
          />
        )}
      </form>
    </Card>
  );
}
