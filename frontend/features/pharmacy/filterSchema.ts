import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import {
  optionMapValues,
  standardAuditQueryFields,
  type QueryFieldOption,
  type QueryFieldSchema,
} from "@/utils/queryFilter";
import { humanizeOptionLabel } from "@/lib/options";

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
      { key: "issue_number", label: "Issue ID" },
      { key: "patient_name", label: "Patient" },
      { key: "source", label: "Source" },
      { key: "status", label: "Status" },
      { key: "amount", label: "Amount" },
      { key: "updated_at", label: "Last Modified" },
    ],
  };
}

// sourceOptions/statusOptions are the same data-driven option lists the
// old fixed dropdowns used (minus their "All ..." placeholder).
export function getPharmacyQueryFields({
  sourceOptions,
  statusOptions,
  rows = [],
  filterOptions,
}: {
  sourceOptions: { value: string; label: string }[];
  statusOptions: { value: string; label: string }[];
  rows?: any[];
  filterOptions?: Record<string, QueryFieldOption[]>;
}): QueryFieldSchema[] {
  const dispensedByFallback = rows
    .map((row) => row.dispensed_by_user_id)
    .filter(Boolean)
    .map((value) => ({ value: String(value), label: String(value) }));

  return [
    { key: "issue_number", label: "Issue ID", type: "text" },
    { key: "patient_name", label: "Patient Name", type: "text" },
    { key: "patient_number", label: "Patient Number", type: "text" },
    {
      key: "source",
      label: "Source",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "source",
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
    { key: "medicine_text", label: "Medicine", type: "text" },
    { key: "notes", label: "Notes", type: "text" },
    { key: "external_prescriber", label: "External Prescriber", type: "text" },
    { key: "amount", label: "Amount", type: "number" },
    {
      key: "dispensed_by_user_id",
      label: "Dispensed By",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "dispensed_by_user_id",
        dispensedByFallback,
      ),
    },
    { key: "dispensed_at", label: "Dispensed On", type: "date" },
    ...standardAuditQueryFields({ rows, filterOptions, includeUpdatedBy: true }),
  ];
}
