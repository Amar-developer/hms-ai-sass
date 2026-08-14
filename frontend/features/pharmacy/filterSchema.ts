import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";

type PharmacySchemaParams = {
  sourceOptions: { value: string; label: string }[];
  statusOptions: { value: string; label: string }[];
};

export function getPharmacyTableSchema({
  sourceOptions,
  statusOptions,
}: PharmacySchemaParams): TableSchema {
  return {
    id: "pharmacy",
    searchLabel: "Patient",
    searchPlaceholder: "Search by patient",
    filters: [
      { key: "source", label: "Source", options: sourceOptions },
      { key: "status", label: "Status", options: statusOptions },
    ],
    sortFields: [
      { key: "created_at", label: "Date & time" },
      { key: "source", label: "Source" },
      { key: "status", label: "Status" },
      { key: "amount", label: "Amount" },
    ],
  };
}
