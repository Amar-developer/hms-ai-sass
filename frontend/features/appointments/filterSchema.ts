import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import {
  optionMapValues,
  standardAuditQueryFields,
  type QueryFieldOption,
  type QueryFieldSchema,
} from "@/utils/queryFilter";
import { APPOINTMENT_STATUS_FILTER_OPTIONS, visit_type_options } from "./constants";

type AppointmentTableSchemaParams = {
  departmentOptions?: { value: string; label: string }[];
  statusOptions?: { value: string; label: string }[];
  includeStatus?: boolean;
};

function distinctFieldOptions(
  rows: any[],
  key: string,
  labelFor?: (value: string) => string,
): QueryFieldOption[] {
  const seen = new Map<string, string>();
  rows.forEach((row) => {
    const raw = row[key];
    if (raw === null || raw === undefined || raw === "") return;
    const value = String(raw);
    if (!seen.has(value)) seen.set(value, labelFor ? labelFor(value) : value);
  });
  return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
}

export function getAppointmentTableSchema({
  departmentOptions = [],
  statusOptions = APPOINTMENT_STATUS_FILTER_OPTIONS,
  includeStatus = true,
}: AppointmentTableSchemaParams = {}): TableSchema {
  return {
    id: "appointments",
    searchLabel: "Patient / Appointment",
    searchPlaceholder: "Search patient, mobile, token",
    filters: [
      {
        key: "department",
        label: "Department",
        options: [{ value: "all", label: "All Departments" }, ...departmentOptions],
      },
      ...(includeStatus
        ? [
            {
              key: "status",
              label: "Status",
              options: statusOptions,
            },
          ]
        : []),
    ],
    sortFields: [
      { key: "appointment_date", label: "Appointment Date" },
      { key: "appointment_time", label: "Appointment Time" },
      { key: "appointment_number", label: "Appointment Number" },
      { key: "patient_name", label: "Patient" },
      { key: "department_name", label: "Department" },
      { key: "practitioner_name", label: "Doctor" },
      { key: "status", label: "Status" },
      { key: "created_by_user_id", label: "Created By" },
      { key: "updated_by_user_id", label: "Last Updated By" },
      { key: "created_at", label: "Created On" },
      { key: "updated_at", label: "Last Modified" },
    ],
  };
}

export function getAppointmentQueryFields({
  rows,
  filterOptions,
}: {
  rows: any[];
  filterOptions?: Record<string, QueryFieldOption[]>;
}): QueryFieldSchema[] {
  const statusLabel = (value: string) =>
    APPOINTMENT_STATUS_FILTER_OPTIONS.find((o) => o.value === value)?.label || value;
  const visitTypeLabel = (value: string) =>
    visit_type_options.find((o) => o.value === value)?.label || value;

  return [
    { key: "appointment_number", label: "Appointment Number", type: "text" },
    { key: "patient_name", label: "Patient", type: "text" },
    { key: "patient_mobile", label: "Mobile", type: "text" },
    {
      key: "branch_id",
      label: "Branch",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "branch_id",
        distinctFieldOptions(rows, "branch_id"),
      ),
    },
    {
      key: "department_id",
      label: "Department",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "department_id",
        distinctFieldOptions(rows, "department_id"),
      ),
    },
    {
      key: "practitioner_id",
      label: "Doctor",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "practitioner_id",
        distinctFieldOptions(rows, "practitioner_id"),
      ),
    },
    {
      key: "appointment_type",
      label: "Visit Type",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "appointment_type",
        distinctFieldOptions(rows, "appointmentType", visitTypeLabel),
        visitTypeLabel,
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
      key: "consultation_status",
      label: "Consultation Status",
      type: "select",
      options: optionMapValues(filterOptions, "consultation_status"),
    },
    {
      key: "acquisition_source",
      label: "Source",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "acquisition_source",
        distinctFieldOptions(rows, "acquisitionSource"),
      ),
    },
    {
      key: "visit_purpose",
      label: "Visit Purpose",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "visit_purpose",
        distinctFieldOptions(rows, "visitPurpose"),
      ),
    },
    { key: "appointment_date", label: "Appointment Date", type: "date" },
    ...standardAuditQueryFields({ rows, filterOptions, includeUpdatedBy: true }),
  ];
}

export function getConsultationQueryFields({
  rows,
  filterOptions,
}: {
  rows: any[];
  filterOptions?: Record<string, QueryFieldOption[]>;
}): QueryFieldSchema[] {
  return [
    { key: "appointment_number", label: "Appointment Number", type: "text" },
    { key: "patient_name", label: "Patient", type: "text" },
    { key: "patient_mobile", label: "Mobile", type: "text" },
    {
      key: "branch_id",
      label: "Branch",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "branch_id",
        distinctFieldOptions(rows, "branch_id"),
      ),
    },
    {
      key: "practitioner_id",
      label: "Doctor",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "practitioner_id",
        distinctFieldOptions(rows, "practitioner_id"),
      ),
    },
    {
      key: "status",
      label: "Consultation Status",
      type: "select",
      options: optionMapValues(filterOptions, "status"),
    },
    {
      key: "treatment_type",
      label: "Treatment Type",
      type: "select",
      options: optionMapValues(
        filterOptions,
        "treatment_type",
        distinctFieldOptions(rows, "treatmentType"),
      ),
    },
    { key: "chief_complaint", label: "Chief Complaint", type: "text" },
    { key: "diagnosis", label: "Diagnosis", type: "text" },
    { key: "signed_at", label: "Signed On", type: "date" },
    {
      key: "signed_by_user_id",
      label: "Signed By",
      type: "select",
      options: optionMapValues(filterOptions, "signed_by_user_id"),
    },
    ...standardAuditQueryFields({ rows, filterOptions, includeUpdatedBy: true }),
  ];
}
