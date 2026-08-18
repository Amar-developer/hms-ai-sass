import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import type { QueryFieldSchema } from "@/utils/queryFilter";

export function getPharmacyTableSchema(): TableSchema {
  return {
    id: "pharmacy",
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
// old fixed dropdowns used (minus their "All ..." placeholder).
export function getPharmacyQueryFields({
  sourceOptions,
  statusOptions,
}: {
  sourceOptions: { value: string; label: string }[];
  statusOptions: { value: string; label: string }[];
}): QueryFieldSchema[] {
  return [
    { key: "issue_number", label: "Issue ID", type: "text" },
    { key: "patient_name", label: "Patient Name", type: "text" },
    {
      key: "source",
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
