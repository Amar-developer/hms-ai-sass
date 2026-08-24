"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input, SearchableSelect } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { FormError } from "@/app/components/common/FormError";
import { EXPENSE_CATEGORY_OPTIONS } from "../constants";
import {
  expenseSubcategorySchema,
  type ExpenseSubcategoryFormValues,
} from "../expenses.schema";
import type { ExpenseSubcategoryConfig } from "../types";

type ExpenseSubcategoryFormProps = {
  subcategory?: ExpenseSubcategoryConfig | null;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (values: ExpenseSubcategoryFormValues) => void;
};

export function ExpenseSubcategoryForm({
  subcategory,
  busy,
  onCancel,
  onSubmit,
}: ExpenseSubcategoryFormProps) {
  const {
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ExpenseSubcategoryFormValues>({
    resolver: zodResolver(expenseSubcategorySchema),
    defaultValues: {
      category: subcategory?.category ?? "supplies",
      name: subcategory?.name ?? "",
      defaultAmount:
        subcategory?.defaultAmount != null ? String(subcategory.defaultAmount) : "",
      requiresQuantity: subcategory?.requiresQuantity ?? false,
      isActive: subcategory ? String(subcategory.isActive) : undefined,
    },
  });

  useEffect(() => {
    if (!subcategory?.id) return;
    reset({
      category: subcategory.category,
      name: subcategory.name,
      defaultAmount:
        subcategory.defaultAmount != null ? String(subcategory.defaultAmount) : "",
      requiresQuantity: subcategory.requiresQuantity,
      isActive: String(subcategory.isActive),
    });
  }, [subcategory?.id]);

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

      <FormField label="Sub Category Name" required>
        <Controller
          name="name"
          control={control}
          render={({ field }) => (
            <Input
              placeholder="e.g. Petrol, Milk, Stationery"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <FormError error={errors.name?.message} />
      </FormField>

      <FormField label="Default Amount" hint="Leave blank if there's no fixed amount">
        <Controller
          name="defaultAmount"
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
        <FormError error={errors.defaultAmount?.message} />
      </FormField>

      <FormField label="Requires Quantity">
        <SearchableSelect
          value={String(watch("requiresQuantity"))}
          onChange={(value) => setValue("requiresQuantity", value === "true")}
          searchable={false}
          options={[
            { value: "false", label: "No" },
            { value: "true", label: "Yes — show a Quantity field on the expense form" },
          ]}
        />
      </FormField>

      {subcategory && (
        <FormField label="Status">
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

      <div className="mt-2 flex justify-end gap-2">
        <Button
          type="button"
          onClick={onCancel}
          className="close-button hover:bg-slate-300 bg-slate-100 text-slate-900"
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy} className="save-button">
          {busy ? "Saving..." : subcategory ? "Save Changes" : "Create Subcategory"}
        </Button>
      </div>
    </form>
  );
}
