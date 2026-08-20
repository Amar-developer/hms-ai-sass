import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import {
  optionMapValues,
  standardAuditQueryFields,
  type QueryFieldOption,
  type QueryFieldSchema,
} from "@/utils/queryFilter";
import { invoiceSourceOptions } from "./helpers";
import { status_options } from "./contants";

function labelOptions(
  options: QueryFieldOption[],
  labelFor: (value: string) => string,
) {
  return options.map((option) => ({
    ...option,
    label: labelFor(option.value),
  }));
}

function invoiceSourceLabel(value: string) {
  return invoiceSourceOptions.find((source) => source.key === value)?.label || value;
}

function invoiceStatusLabel(value: string) {
  return status_options.find((option) => option.value === value)?.label || value;
}

export function getBillingTableSchema({
  filterOptions,
}: {
  filterOptions?: Record<string, QueryFieldOption[]>;
} = {}): TableSchema {
  const sourceOptions = filterOptions?.source?.length
    ? labelOptions(filterOptions.source, invoiceSourceLabel)
    : invoiceSourceOptions.map((source) => ({
        value: source.key,
        label: source.label,
      }));
  return {
    id: "billing",
    searchLabel: "Invoices",
    searchPlaceholder: "Invoice, patient, source",
    filters: [
      {
        key: "source",
        label: "Source",
        options: [{ value: "all", label: "All sources" }, ...sourceOptions],
      },
      {
        key: "paidStatus",
        label: "Paid Status",
        options: status_options,
      },
    ],
    sortFields: [
      { key: "invoice_date", label: "Date" },
      { key: "source", label: "Source" },
      { key: "patient", label: "Patient" },
      { key: "status", label: "Status" },
      { key: "total_amount", label: "Total" },
      { key: "paid_amount", label: "Paid" },
      { key: "due", label: "Due" },
      { key: "created_at", label: "Created On" },
      { key: "created_by_user_id", label: "Created By" },
      { key: "updated_at", label: "Last Updated On" },
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

export function getBillingQueryFields({
  rows,
  filterOptions,
}: {
  rows: any[];
  filterOptions?: Record<string, QueryFieldOption[]>;
}): QueryFieldSchema[] {
  return [
    { key: "invoice_number", label: "Invoice Number", type: "text" },
    { key: "patient_name", label: "Patient Name", type: "text" },
    { key: "patient_number", label: "Patient Number", type: "text" },
    {
      key: "source",
      label: "Source",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "source",
        distinctFieldOptions(rows, "source"),
        invoiceSourceLabel,
      ),
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "status",
        distinctFieldOptions(rows, "status"),
        invoiceStatusLabel,
      ),
    },
    { key: "total_amount", label: "Total Amount", type: "number" },
    { key: "paid_amount", label: "Paid Amount", type: "number" },
    { key: "balance_amount", label: "Balance Amount", type: "number" },
    { key: "due", label: "Due", type: "number" },
    { key: "invoice_date", label: "Invoice Date", type: "date" },
    ...standardAuditQueryFields({ rows, filterOptions }),
  ];
}
