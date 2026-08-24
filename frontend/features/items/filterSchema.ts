import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import {
  optionMapValues,
  standardAuditQueryFields,
  type QueryFieldOption,
  type QueryFieldSchema,
} from "@/utils/queryFilter";

export function getItemsTableSchema(): TableSchema {
  return {
    id: "items",
    searchLabel: "Items",
    searchPlaceholder: "Search items",
    // Type/Price dropped — both are scalar (Type = "kind" below, Price is
    // just a number field with a > 0 / = 0 operator) so the "+ Add a
    // Filter" builder already covers them.
    filters: [],
    sortFields: [
      { key: "name", label: "Name" },
      { key: "created_at", label: "Recently added" },
      { key: "updated_at", label: "Last modified" },
      { key: "type", label: "Type" },
      { key: "code", label: "Code" },
      { key: "department", label: "Department" },
      { key: "sample_type", label: "Sample Type" },
      { key: "modality_type", label: "Modality" },
      { key: "mrp_price", label: "MRP" },
      { key: "price", label: "Sale price" },
      { key: "updated_at", label: "Last Modified" },
    ],
  };
}

function distinctFieldOptions(
  rows: any[],
  key: string,
  labelFor?: (value: string) => string,
): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  rows.forEach((row) => {
    const raw = row[key];
    if (raw === null || raw === undefined || raw === "") return;
    const value = String(raw);
    if (!seen.has(value)) seen.set(value, labelFor ? labelFor(value) : value);
  });
  return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
}

export function getItemsQueryFields({
  rows,
  filterOptions,
}: {
  rows: any[];
  filterOptions?: Record<string, QueryFieldOption[]>;
}): QueryFieldSchema[] {
  return [
    { key: "name", label: "Name", type: "text" },
    { key: "code", label: "Code", type: "text" },
    {
      key: "kind",
      label: "Item Kind",
      type: "select",
      options: distinctFieldOptions(rows, "kind"),
    },
    {
      key: "supplier_id",
      label: "Supplier",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "supplier_id",
        distinctFieldOptions(rows, "supplier_id", (id) => {
          const row = rows.find((item: any) => String(item.supplier_id) === id);
          return row?.supplier || id;
        }),
      ),
    },
    {
      key: "branch_id",
      label: "Branch",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "branch_id",
        distinctFieldOptions(rows, "branch_id"),
      ),
    },
    {
      key: "form",
      label: "Form",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "form",
        distinctFieldOptions(rows, "form"),
      ),
    },
    {
      key: "department",
      label: "Department",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "department",
        distinctFieldOptions(rows, "department"),
      ),
    },
    {
      key: "sample_type",
      label: "Sample Type",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "sample_type",
        distinctFieldOptions(rows, "sample_type"),
      ),
    },
    {
      key: "manufacturer",
      label: "Manufacturer",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "manufacturer",
        distinctFieldOptions(rows, "manufacturer"),
      ),
    },
    {
      key: "modality_type",
      label: "Modality",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "modality_type",
        distinctFieldOptions(rows, "modality_type"),
      ),
    },
    {
      key: "is_portable",
      label: "Portability",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "is_portable",
        distinctFieldOptions(rows, "is_portable", (value) =>
          value === "true" ? "Portable" : "Fixed",
        ),
      ),
    },
    { key: "meta", label: "Details", type: "text" },
    { key: "generic_name", label: "Generic Name", type: "text" },
    { key: "mrp_price", label: "MRP", type: "number" },
    { key: "price", label: "Sale Price", type: "number" },
    { key: "purchase_price", label: "Purchase Price", type: "number" },
    ...standardAuditQueryFields({ rows, filterOptions, includeUpdatedBy: true }),
  ];
}
