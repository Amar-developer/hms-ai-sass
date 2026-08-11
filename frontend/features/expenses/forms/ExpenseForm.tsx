"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input, SearchableSelect } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { FormError } from "@/app/components/common/FormError";
import { today } from "@/utils/helper";
import { EXPENSE_CATEGORY_OPTIONS } from "../constants";
import { expenseFormSchema, type ExpenseFormSchemaValues } from "../expenses.schema";

type ExpenseFormProps = {
  branchOptions: { value: string; label: string }[];
  recentSubcategories?: string[];
  busy?: boolean;
  initialValues?: ExpenseFormSchemaValues;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (values: ExpenseFormSchemaValues) => void;
};

export function ExpenseForm({
  branchOptions,
  recentSubcategories = [],
  busy,
  initialValues,
  submitLabel,
  onCancel,
  onSubmit,
}: ExpenseFormProps) {
  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ExpenseFormSchemaValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: initialValues ?? {
      category: "supplies",
      subcategory: "",
      amount: "",
      incurredOn: today(),
      branchId: branchOptions[0]?.value ?? "",
      description: "",
    },
  });

  const subcategoryOptions = recentSubcategories.map((value) => ({
    value,
    label: value,
  }));

  const submit = handleSubmit((values) => onSubmit(values));

  return (
    <form onSubmit={submit} className="grid gap-3">
      <FormField label="Category" required>
        <Controller
          name="category"
          control={control}
          render={({ field }) => (
            <SearchableSelect
              value={field.value}
              onChange={field.onChange}
              options={EXPENSE_CATEGORY_OPTIONS}
              searchable={false}
            />
          )}
        />
        <FormError error={errors.category?.message} />
      </FormField>

      <FormField label="Sub Category" required>
        <Controller
          name="subcategory"
          control={control}
          render={({ field }) => (
            <SearchableSelect
              value={field.value}
              onChange={field.onChange}
              options={subcategoryOptions}
              allowCustom
              searchPlaceholder="Type to search or add new"
              emptyText="No recent sub categories — type to add one"
              placeholder="e.g. Milk, Petrol, Stationery"
            />
          )}
        />
        <FormError error={errors.subcategory?.message} />
      </FormField>

      <FormField label="Branch" required>
        <Controller
          name="branchId"
          control={control}
          render={({ field }) => (
            <SearchableSelect
              value={field.value}
              onChange={field.onChange}
              options={branchOptions}
              searchable={false}
            />
          )}
        />
        <FormError error={errors.branchId?.message} />
      </FormField>

      <FormField label="Amount" required>
        <Controller
          name="amount"
          control={control}
          render={({ field }) => (
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <FormError error={errors.amount?.message} />
      </FormField>

      <FormField label="Date Incurred" required>
        <Controller
          name="incurredOn"
          control={control}
          render={({ field }) => (
            <Input
              type="date"
              max={today()}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <FormError error={errors.incurredOn?.message} />
      </FormField>

      <FormField label="Description" required>
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <Input
              placeholder="What was this expense for?"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <FormError error={errors.description?.message} />
      </FormField>

      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" onClick={onCancel} className="close-button bg-slate-100 text-slate-900">
          Cancel
        </Button>
        <Button type="submit" disabled={busy} className='close-button'>
          {busy ? "Submitting..." : submitLabel ?? "Submit Expense"}
        </Button>
      </div>
    </form>
  );
}
