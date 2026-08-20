import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import {
  optionMapValues,
  standardAuditQueryFields,
  type QueryFieldOption,
  type QueryFieldSchema,
} from "@/utils/queryFilter";
import { humanizeOptionLabel } from "@/lib/options";

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
      { key: "acquisition_source", label: "Source" },
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
  rows,
  filterOptions,
}: {
  sourceOptions: { value: string; label: string }[];
  statusOptions: { value: string; label: string }[];
  rows?: any[];
  filterOptions?: Record<string, QueryFieldOption[]>;
}): QueryFieldSchema[] {
  return [
    { key: "lab_order_number", label: "Order ID", type: "text" },
    { key: "patient_name", label: "Patient Name", type: "text" },
    { key: "patient_number", label: "Patient Number", type: "text" },
    { key: "tests", label: "Tests / Services", type: "text" },
    { key: "notes", label: "Notes", type: "text" },
    { key: "external_referrer", label: "External Referrer", type: "text" },
    {
      key: "acquisition_source",
      label: "Source",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "acquisition_source",
        sourceOptions.filter((option) => option.value !== "all"),
        humanizeOptionLabel,
      ),
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "status",
        statusOptions.filter((option) => option.value !== "all"),
        humanizeOptionLabel,
      ),
    },
    {
      key: "priority",
      label: "Priority",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "priority",
        [],
        humanizeOptionLabel,
      ),
    },
    { key: "amount", label: "Amount", type: "number" },
    { key: "order_date", label: "Order Date", type: "date" },
    { key: "sample_collected_at", label: "Sample Collected At", type: "date" },
    { key: "result_ready_at", label: "Result Ready At", type: "date" },
    ...standardAuditQueryFields({ rows, filterOptions, includeUpdatedBy: true }),
  ];
}
