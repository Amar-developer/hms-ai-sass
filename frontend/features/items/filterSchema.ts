import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import type { QueryFieldSchema } from "@/utils/queryFilter";

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
      { key: "type", label: "Type" },
      { key: "code", label: "Code" },
      { key: "mrp_price", label: "MRP" },
      { key: "price", label: "Sale price" },
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

export function getItemsQueryFields({ rows }: { rows: any[] }): QueryFieldSchema[] {
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
      key: "supplier",
      label: "Supplier",
      type: "select",
      options: distinctFieldOptions(rows, "supplier").filter(
        (option) => option.value !== "-",
      ),
    },
    { key: "meta", label: "Details", type: "text" },
    { key: "mrp_price", label: "MRP", type: "number" },
    { key: "price", label: "Sale Price", type: "number" },
    { key: "purchase_price", label: "Purchase Price", type: "number" },
    { key: "created_at", label: "Added On", type: "date" },
  ];
}
