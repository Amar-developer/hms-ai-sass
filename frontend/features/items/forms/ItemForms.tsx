"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { itemSchema, ItemFormValues } from "../items.schema";
import { FormField } from "@/app/components/FormElements";
import {
  Input,
  SearchableSelect,
  Button,
  ActionButton,
} from "@/app/components/common/ui";
import { itemTypes, modalities, serviceItemTypes } from "@/features/items/constants";
import { FormError } from "@/app/components/common/FormError";
import { useEffect } from "react";

type ItemFormProps = {
  type: string;
  initialData?: any;
  stockSuppliers: any[];
  busy: boolean;
  onSubmit: (data: ItemFormValues) => void | boolean | Promise<void | boolean>;
  onCancel: () => void;
  editing?: any;
  onTypeChange?: (newType: string) => void;
};

export function ItemForm({
  type,
  initialData,
  stockSuppliers,
  busy,
  onSubmit,
  onCancel,
  editing,
  onTypeChange,
}: ItemFormProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: "",
      generic_name: "",
      mrp_price: "",
      price: "",
      purchase_price: "",
      supplier_id: "",
      reorder_level: "",
      sample_type: "",
      description: "",
      modality_type: "ift",
      manufacturer: "",
      model_number: "",
      serial_number: "",
      is_portable: "false",
    },
  });

  // Reset when editing item changes
  useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name || "",
        generic_name: initialData.generic_name || "",
        mrp_price: String(initialData.mrp_price || ""),
        price: String(
          initialData.default_sale_price ||
            initialData.default_price ||
            initialData.package_price ||
            ""
        ),
        purchase_price: String(initialData.purchase_price || ""),
        supplier_id: initialData.supplier_id || "",
        reorder_level: String(initialData.reorder_level || ""),
        sample_type: initialData.sample_type || "",
        description: initialData.description || "",
        modality_type: initialData.modality_type || "ift",
        manufacturer: initialData.manufacturer || "",
        model_number: initialData.model_number || "",
        serial_number: initialData.serial_number || "",
        is_portable: initialData.is_portable === true ? "true" : "false",
      });
    }
  }, [initialData, reset]);

  // Reset form when creating new item (after save)
  useEffect(() => {
    if (!editing) {
      reset();
    }
  }, [editing, reset]);

  const isService = serviceItemTypes.includes(type);

  const submitWithPriceCheck = handleSubmit(async (data) => {
    if (type !== "physio_equipment" && !data.price) {
      setError("price", { message: "Price is required" });
      return;
    }
    const result = await onSubmit(data);
    if (result !== false) {
      reset();
    }
  });

  return (
    <form onSubmit={submitWithPriceCheck} className="mt-5 grid gap-3 md:grid-cols-4">
      <FormField label="Item Type">
        <SearchableSelect
          value={type}
          onChange={(newType) => onTypeChange?.(newType)}
          disabled={!!editing}
          searchable={false}
          options={itemTypes.map(([value, label]) => ({ value, label }))}
        />
      </FormField>

      <FormField label={isService ? "Service Name" : "Item Name"}>
        <Input
          {...register("name")}
          placeholder={`Enter ${isService ? "Service" : "Item"} Name`}
        />
        <FormError error={errors.name?.message} />
      </FormField>

      <FormField label="Code / Serial">
        <Input
          value={initialData?.code || initialData?.serial_number || "AUTO"}
          disabled
        />
      </FormField>

      <FormField label="MRP Price (₹)">
        <Input {...register("mrp_price")} type="number" min="0" />
        <FormError error={errors.mrp_price?.message} />
      </FormField>

      {!type.includes("physio_equipment") && (
        <FormField label={isService ? "Service Price (₹)" : "Price (₹)"}>
          <Input {...register("price")} type="number" min="0" />
          <FormError error={errors.price?.message} />
        </FormField>
      )}

      {!isService && (
        <>
          <FormField label="Supplier">
            <Controller
              name="supplier_id"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  value={field.value || ""}
                  onChange={field.onChange}
                  options={[
                    { value: "", label: "No supplier" },
                    ...stockSuppliers.map((s: any) => ({
                      value: s.id,
                      label: s.name,
                    })),
                  ]}
                />
              )}
            />
          </FormField>

          <FormField label="Purchase Price (₹)">
            <Input {...register("purchase_price")} type="number" min="0" />
            <FormError error={errors.purchase_price?.message} />
          </FormField>
        </>
      )}

      {type === "medicine" && (
        <>
          <FormField label="Generic Name">
            <Input {...register("generic_name")} />
          </FormField>
          <FormField label="Reorder Level">
            <Input {...register("reorder_level")} type="number" min="0" />
          </FormField>
        </>
      )}

      {type === "lab_test" && (
        <FormField label="Sample Type">
          <Input {...register("sample_type")} />
        </FormField>
      )}

      {isService && (
        <FormField label="Description">
          <Input {...register("description")} />
        </FormField>
      )}

      {type === "physio_equipment" && (
        <>
          <FormField label="Modality">
            <Controller
              name="modality_type"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={modalities.map(([v, l]) => ({ value: v, label: l }))}
                />
              )}
            />
          </FormField>

          <FormField label="Manufacturer">
            <Input {...register("manufacturer")} />
          </FormField>

          <FormField label="Model Number">
            <Input {...register("model_number")} />
          </FormField>

          <FormField label="Portable">
            <Controller
              name="is_portable"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: "false", label: "No" },
                    { value: "true", label: "Yes" },
                  ]}
                />
              )}
            />
          </FormField>
        </>
      )}

      <div className="flex items-end gap-2 md:col-span-4">
        <Button disabled={busy} type="submit" className="save-button">
          {busy ? "Saving..." : editing ? "Update Item" : "Save Item"}
        </Button>
        {editing && (
          <ActionButton type="button" onClick={onCancel}>
            Cancel
          </ActionButton>
        )}
      </div>
    </form>
  );
}
