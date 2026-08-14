import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import { itemTypes, price_options } from "@/features/items/constants";

export function getItemsTableSchema(): TableSchema {
  return {
    id: "items",
    searchLabel: "Items",
    searchPlaceholder: "Search items",
    filters: [
      {
        key: "type",
        label: "Type",
        options: [
          { value: "all", label: "All item types" },
          ...itemTypes.map(([value, label]) => ({ value, label })),
        ],
      },
      {
        key: "priceBand",
        label: "Price",
        options: price_options,
      },
    ],
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
