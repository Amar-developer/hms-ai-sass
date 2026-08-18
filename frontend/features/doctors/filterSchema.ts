import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import type { QueryFieldSchema } from "@/utils/queryFilter";
import { status_options } from "../superAdmin/constants";
import { doctorTypes } from "./constants";

type DoctorSchemaParams = {
  branches: any[];
  departments: any[];
};

export function getDoctorTableSchema({
  branches,
  departments,
}: DoctorSchemaParams): TableSchema {
  return {
    id: "doctors",
    searchLabel: "Doctors",
    searchPlaceholder: "Search doctors",
    filters: [
      {
        key: "branch",
        label: "Branch",
        options: [
          { value: "all", label: "All branches" },
          ...branches.map((branch: any) => ({
            value: branch.id,
            label: branch.name,
          })),
        ],
      },
      {
        key: "department",
        label: "Department",
        options: [
          { value: "all", label: "All departments" },
          ...departments.map((department: any) => ({
            value: department.id,
            label: department.name,
          })),
        ],
      },
      // Status dropped — a doctor's status is a scalar field, so the "+ Add
      // a Filter" builder's own "Status" select field already covers it.
      // Branch/Department stay: a doctor can have many, and the generic
      // builder has no clean array-membership operator to replace them.
    ],
    sortFields: [
      { key: "full_name", label: "Doctor name" },
      { key: "practitioner_type", label: "Type" },
      { key: "status", label: "Status" },
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

export function getDoctorQueryFields({
  rows,
}: {
  rows: any[];
}): QueryFieldSchema[] {
  const typeLabel = (value: string) =>
    doctorTypes.find(([v]) => v === value)?.[1] || value;
  const statusLabel = (value: string) =>
    status_options.find((o) => o.value === value)?.label || value;

  return [
    { key: "full_name", label: "Doctor Name", type: "text" },
    { key: "primary_specialty", label: "Primary Specialty", type: "text" },
    { key: "registration_number", label: "Registration Number", type: "text" },
    { key: "mobile", label: "Mobile", type: "text" },
    { key: "email", label: "Email", type: "text" },
    {
      key: "practitioner_type",
      label: "Type",
      type: "select",
      options: distinctFieldOptions(rows, "practitioner_type", typeLabel),
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: distinctFieldOptions(rows, "status", statusLabel),
    },
    { key: "created_at", label: "Created On", type: "date" },
    { key: "updated_at", label: "Last Updated", type: "date" },
  ];
}
