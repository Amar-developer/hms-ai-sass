import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import type { QueryFieldSchema } from "@/utils/queryFilter";

export function getLabTableSchema(): TableSchema {
  return {
    id: "lab",
    searchLabel: "Patient",
    searchPlaceholder: "Search by patient",
    // Source/status dropped — both scalar, so the "+ Add a Filter" builder
    // below covers them; Price Min/Max + From/To already cover amount and
    // created_at ranges with their own UX.
    filters: [],
    sortFields: [
      { key: "created_at", label: "Date & time" },
      { key: "source", label: "Source" },
      { key: "status", label: "Status" },
      { key: "amount", label: "Amount" },
    ],
  };
}

// sourceOptions/statusOptions are the same data-driven option lists the
// old fixed dropdowns used (minus their "All ..." placeholder) — reused
// here so the values line up with `acquisition_source`/`status` exactly.
export function getLabQueryFields({
  sourceOptions,
  statusOptions,
}: {
  sourceOptions: { value: string; label: string }[];
  statusOptions: { value: string; label: string }[];
}): QueryFieldSchema[] {
  return [
    { key: "lab_order_number", label: "Order ID", type: "text" },
    { key: "patient_name", label: "Patient Name", type: "text" },
    { key: "tests", label: "Tests / Services", type: "text" },
    {
      key: "acquisition_source",
      label: "Source",
      type: "select",
      options: sourceOptions.filter((option) => option.value !== "all"),
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: statusOptions.filter((option) => option.value !== "all"),
    },
  ];
}
