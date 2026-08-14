import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import { invoiceSourceOptions } from "./helpers";
import { status_options } from "./contants";

export function getBillingTableSchema(): TableSchema {
  return {
    id: "billing",
    searchLabel: "Invoices",
    searchPlaceholder: "Invoice, patient, source",
    filters: [
      {
        key: "source",
        label: "Source",
        options: [
          { value: "all", label: "All sources" },
          ...invoiceSourceOptions.map((s) => ({ value: s.key, label: s.label })),
        ],
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
    ],
  };
}
