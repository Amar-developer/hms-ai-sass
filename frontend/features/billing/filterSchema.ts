import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import type { QueryFieldSchema } from "@/utils/queryFilter";
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

// Source/paidStatus are server-side query params and stay as the fixed
// dropdowns above; From/To already cover invoice_date range filtering.
// invoice_date is still declared here (as "date") specifically so the
// "Fiscal Year" operator becomes available for it — invoices are financial
// records and that operator assumes an April–March fiscal year (see
// fiscalYearRange in utils/queryFilter.ts), same convention the rest of
// the app's billing/reporting uses; flagging since this is billing data.
// Invoices are also server-paginated (see Billing.tsx's loadInvoicePage),
// so — per the accepted scope limitation for this rollout — this ad-hoc
// builder only filters the current page's rows, not the full invoice set.
export function getBillingQueryFields({
  rows,
}: {
  rows: any[];
}): QueryFieldSchema[] {
  return [
    { key: "invoice_number", label: "Invoice Number", type: "text" },
    { key: "patient_name", label: "Patient Name", type: "text" },
    { key: "total_amount", label: "Total Amount", type: "number" },
    { key: "paid_amount", label: "Paid Amount", type: "number" },
    {
      key: "whatsapp_status",
      label: "WhatsApp Status",
      type: "select",
      options: distinctFieldOptions(rows, "whatsapp_status"),
    },
    { key: "invoice_date", label: "Invoice Date", type: "date" },
  ];
}
