import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import {
  optionMapValues,
  standardAuditQueryFields,
  type QueryFieldOption,
  type QueryFieldSchema,
} from "@/utils/queryFilter";
import { invoiceSourceOptions } from "./helpers";
import { status_options } from "./contants";

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
  return {
    id: "billing",
    searchLabel: "Invoices",
    searchPlaceholder: "Invoice, patient, source",
    filters: [],
    sortFields: [
      { key: "invoice_date", label: "Date" },
      { key: "source", label: "Source" },
      { key: "patient", label: "Patient" },
      { key: "status", label: "Status" },
      { key: "total_amount", label: "Total" },
      { key: "paid_amount", label: "Paid" },
      { key: "due", label: "Due" },
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
    {
      key: "paidStatus",
      label: "Paid Status",
      type: "select",
      options: status_options,
    },
    { key: "total_amount", label: "Total Amount", type: "number" },
    { key: "paid_amount", label: "Paid Amount", type: "number" },
    { key: "balance_amount", label: "Balance Amount", type: "number" },
    { key: "due", label: "Due", type: "number" },
    { key: "invoice_date", label: "Invoice Date", type: "date" },
    ...standardAuditQueryFields({ rows, filterOptions }),
  ];
}
