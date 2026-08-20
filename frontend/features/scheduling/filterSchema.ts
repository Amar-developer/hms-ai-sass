import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import {
  optionMapValues,
  standardAuditQueryFields,
  type QueryFieldOption,
  type QueryFieldSchema,
} from "@/utils/queryFilter";
import { weekdays } from "./constants";

export function getScheduleTableSchema(): TableSchema {
  return {
    id: "scheduling",
    searchLabel: "Search",
    searchPlaceholder: "Search by doctor or department",
    filters: [
      // Branch/department/status dropped — each schedule row has exactly
      // one branch/department (scalar), and status is scalar too, so the
      // "+ Add a Filter" builder below covers them just as well. Weekday
      // stays: a schedule can span several weekdays, and the builder has
      // no clean array-membership operator to replace this.
      {
        key: "weekday",
        label: "Weekday",
        options: [
          { value: "all", label: "All days" },
          ...weekdays.map(([value, label]) => ({ value, label })),
        ],
      },
    ],
    sortFields: [
      { key: "doctor", label: "Doctor" },
      { key: "branch", label: "Branch" },
      { key: "department", label: "Department" },
      { key: "status", label: "Status" },
      { key: "created_at", label: "Created On" },
      { key: "updated_at", label: "Last Modified" },
    ],
  };
}

const SCHEDULE_MODE_LABELS: Record<string, string> = {
  daily: "Daily",
  mon_saturday: "Mon - Saturday",
  custom: "Custom",
};

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

// Weekday keeps its fixed dropdown above (array-membership, no clean
// generic equivalent) — everything else, including branch/department/
// status (each a scalar per row), lives here instead.
export function getScheduleQueryFields({
  rows,
  branches,
  departments,
  filterOptions,
}: {
  rows: any[];
  branches: any[];
  departments: any[];
  filterOptions?: Record<string, QueryFieldOption[]>;
}): QueryFieldSchema[] {
  return [
    { key: "practitioner_full_name", label: "Doctor Name", type: "text" },
    {
      key: "practitioner_id",
      label: "Doctor",
      type: "select",
      options: optionMapValues(filterOptions, "practitioner_id"),
    },
    {
      key: "branch_id",
      label: "Branch",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "branch_id",
        branches.map((branch: any) => ({
          value: branch.id,
          label: branch.name,
        })),
      ),
    },
    {
      key: "department_id",
      label: "Department",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "department_id",
        departments.map((department: any) => ({
          value: department.id,
          label: department.name,
        })),
      ),
    },
    {
      key: "mode",
      label: "Schedule Mode",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "mode",
        distinctFieldOptions(
          rows,
          "mode",
          (value) => SCHEDULE_MODE_LABELS[value] || value,
        ),
        (value) => SCHEDULE_MODE_LABELS[value] || value,
      ),
    },
    { key: "start_time", label: "Start Time", type: "text" },
    { key: "end_time", label: "End Time", type: "text" },
    { key: "slot_minutes", label: "Slot Duration (min)", type: "number" },
    {
      key: "is_active",
      label: "Status",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "is_active",
        distinctFieldOptions(rows, "is_active", (value) =>
          value === "true" ? "Active" : "Inactive",
        ),
      ),
    },
    ...standardAuditQueryFields({ rows, filterOptions, includeUpdatedBy: true }),
  ];
}
