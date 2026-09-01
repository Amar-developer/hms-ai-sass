"use client";

import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input, SearchableSelect } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { FormError } from "@/app/components/common/FormError";
import { today } from "@/utils/helper";
import { EXPENSE_CATEGORY_OPTIONS } from "../constants";
import { expenseFormSchema, type ExpenseFormSchemaValues } from "../expenses.schema";
import { getMonthDateRange } from "../helpers";
import type { ExpenseSubcategoryConfig, RecentSubcategory } from "../types";

type ExpenseFormProps = {
  branchOptions: { value: string; label: string }[];
  subcategoryConfigs?: ExpenseSubcategoryConfig[];
  recentSubcategories?: RecentSubcategory[];
  busy?: boolean;
  initialValues?: ExpenseFormSchemaValues;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (values: ExpenseFormSchemaValues) => void;
  selectedMonth?: number;
  selectedYear?: number
};

export function ExpenseForm({
  branchOptions,
  subcategoryConfigs = [],
  recentSubcategories = [],
  busy,
  initialValues,
  submitLabel,
  onCancel,
  onSubmit,
  selectedMonth,
  selectedYear
}: ExpenseFormProps) {
  const {
    handleSubmit,
    control,
    watch,
    setValue,
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
      quantity: "",
    },
  });

  const hasMonthScope = Boolean(selectedMonth && selectedYear);
  const { min, max } = hasMonthScope
    ? getMonthDateRange(selectedMonth as number, selectedYear as number)
    : { min: undefined, max: undefined };

  const selectedCategory = watch("category");
  const selectedSubcategory = watch("subcategory");

  const categoryConfigs = useMemo(
    () =>
      subcategoryConfigs.filter(
        (config) => config.isActive && config.category === selectedCategory,
      ),
    [subcategoryConfigs, selectedCategory],
  );

  const subcategoryOptions = useMemo(() => {
    const fromConfig = categoryConfigs.map((config) => ({
      value: config.name,
      label: config.name,
    }));
    const configNames = new Set(
      fromConfig.map((option) => option.value.toLowerCase()),
    );
    const seenRecent = new Set<string>();
    const fromRecent = recentSubcategories
      .filter((item) => item.category === selectedCategory)
      .filter((item) => {
        const key = item.name.toLowerCase();
        if (configNames.has(key) || seenRecent.has(key)) return false;
        seenRecent.add(key);
        return true;
      })
      .map((item) => ({ value: item.name, label: item.name }));
    return [...fromConfig, ...fromRecent];
  }, [categoryConfigs, recentSubcategories, selectedCategory]);

  const matchedConfig = useMemo(
    () =>
      categoryConfigs.find(
        (config) =>
          config.name.toLowerCase() === selectedSubcategory?.trim().toLowerCase(),
      ) ?? null,
    [categoryConfigs, selectedSubcategory],
  );

  const requiresQuantity = Boolean(matchedConfig?.requiresQuantity);
  const isAmountLocked = matchedConfig?.defaultAmount != null;

  function handleSubcategoryChange(value: string) {
    setValue("subcategory", value);
    const config = categoryConfigs.find(
      (item) => item.name.toLowerCase() === value.trim().toLowerCase(),
    );
    if (config?.defaultAmount == null) return;
    if (config.requiresQuantity) {
      const currentQuantity = Number(watch("quantity")) || 0;
      const quantity = currentQuantity > 0 ? currentQuantity : 1;
      setValue("quantity", String(quantity));
      setValue("amount", String(config.defaultAmount * quantity));
    } else {
      setValue("amount", String(config.defaultAmount));
    }
  }

  function handleQuantityChange(value: string) {
    setValue("quantity", value);
    if (matchedConfig?.defaultAmount == null) return;
    const quantity = Number(value);
    if (value.trim() && quantity > 0) {
      setValue("amount", String(matchedConfig.defaultAmount * quantity));
    }
  }

  const submit = handleSubmit((values) => onSubmit(values));

  return (
    <form onSubmit={submit} className="grid gap-3 max-h-[70vh] overflow-y-auto scrollbar-hidden">
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
              onChange={handleSubcategoryChange}
              options={subcategoryOptions}
              allowCustom
              searchPlaceholder="Type to search or add new"
              emptyText="No sub categories for this category yet — type to add one"
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

      <FormField
        label="Amount"
        required
        hint={isAmountLocked ? "Fixed amount for this sub category" : undefined}
      >
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
              disabled={isAmountLocked}
            />
          )}
        />
        <FormError error={errors.amount?.message} />
      </FormField>

      {requiresQuantity && (
        <FormField
          label="Quantity"
          hint={
            matchedConfig?.defaultAmount != null
              ? "Amount is recalculated as unit price × quantity"
              : undefined
          }
        >
          <Controller
            name="quantity"
            control={control}
            render={({ field }) => (
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={field.value ?? ""}
                onChange={(e: any) => handleQuantityChange(e.target.value)}
              />
            )}
          />
          <FormError error={errors.quantity?.message} />
        </FormField>
      )}

      <FormField label="Date Incurred" required>
        <Controller
          name="incurredOn"
          control={control}
          render={({ field }) => (
            <Input
              type="date"
              value={field.value}
              onChange={field.onChange}
              min={min}
              max={max}
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
        <Button type="button" onClick={onCancel} className="close-button hover:bg-slate-300 bg-slate-500 text-slate-900">
          Cancel
        </Button>
        <Button type="submit" disabled={busy} className='save-button'>
          {busy ? "Submitting..." : submitLabel ?? "Submit Expense"}
        </Button>
      </div>
    </form>
  );
}
