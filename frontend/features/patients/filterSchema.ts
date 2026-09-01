import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import {
  optionMapValues,
  standardAuditQueryFields,
  type QueryFieldOption,
  type QueryFieldSchema,
} from "@/utils/queryFilter";
import { genders, patient_status_options } from "./constants";

type PatientSchemaParams = {
  isSuperAdmin: boolean;
  tenants: any[];
};

export function getPatientTableSchema({
  isSuperAdmin,
  tenants,
}: PatientSchemaParams): TableSchema {
  return {
    id: "patients",
    searchLabel: "Patient / Mobile",
    searchPlaceholder: "Search by name or mobile",
    // Branch/Status used to live here as fixed dropdowns — dropped since the
    // "+ Add a Filter" builder below covers those fields (and more) generically.
    // Tenant stays: switching it changes which tenant's data is fetched at
    // all, not just what's shown, so it isn't a "filter" in the same sense.
    filters: isSuperAdmin
      ? [
          {
            key: "tenant",
            label: "Tenant",
            options: tenants.map((t: any) => ({ value: t.id, label: t.name })),
          },
        ]
      : [],
    sortFields: [
      { key: "full_name", label: "Patient name" },
      { key: "patient_number", label: "Patient number" },
      { key: "branch_id", label: "Branch" },
      { key: "gender", label: "Gender" },
      { key: "status", label: "Status" },
      { key: "created_by_user_id", label: "Created By" },
      { key: "age_years", label: "Age" },
      { key: "created_at", label: "Created On" },
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

export function getPatientQueryFields({
  rows,
  branches,
  filterOptions,
}: {
  rows: any[];
  branches: any[];
  filterOptions?: Record<string, QueryFieldOption[]>;
}): QueryFieldSchema[] {
  const genderLabel = (value: string) =>
    genders.find(([v]) => v === value)?.[1] || value;
  const statusLabel = (value: string) =>
    patient_status_options.find((o) => o.value === value)?.label || value;
  const branchLabel = (id: string) =>
    branches.find((b: any) => b.id === id)?.name || id;

  return [
    { key: "full_name", label: "Patient Name", type: "text" },
    { key: "patient_number", label: "Patient Number", type: "text" },
    { key: "mobile", label: "Mobile", type: "text" },
    { key: "contact_mobile", label: "Contact Mobile", type: "text" },
    { key: "alternate_mobile", label: "Alternate Mobile", type: "text" },
    { key: "guardian_name", label: "Guardian Name", type: "text" },
    { key: "guardian_mobile", label: "Guardian Mobile", type: "text" },
    { key: "area", label: "Area", type: "text" },
    {
      key: "branch_id",
      label: "Branch",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "branch_id",
        distinctFieldOptions(rows, "branch_id", branchLabel),
      ),
    },
    {
      key: "gender",
      label: "Gender",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "gender",
        distinctFieldOptions(rows, "gender", genderLabel),
        genderLabel,
      ),
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "status",
        distinctFieldOptions(rows, "status", statusLabel),
        statusLabel,
      ),
    },
    {
      key: "subscription_plan_name",
      label: "Membership Plan",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "subscription_plan_name",
        distinctFieldOptions(rows, "subscription_plan_name"),
      ),
    },
    {
      key: "subscription_status",
      label: "Membership Status",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "subscription_status",
        distinctFieldOptions(rows, "subscription_status"),
      ),
    },
    ...standardAuditQueryFields({ rows, filterOptions, includeUpdatedBy: true }),
    { key: "age_years", label: "Age", type: "number" },
    { key: "active_alert_count", label: "Active Alerts", type: "number" },
    { key: "critical_alert_count", label: "Critical Alerts", type: "number" },
  ];
}
