import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import type { QueryFieldSchema } from "@/utils/queryFilter";
import { staffTypeOptions, statuses } from "./constants";

export function getHomeCareTableSchema(): TableSchema {
  return {
    id: "home-care",
    searchLabel: "Bookings",
    searchPlaceholder: "Search bookings",
    // Status dropped — a booking's status is a scalar field, so the
    // "+ Add a Filter" builder's own "Status" select field covers it.
    filters: [],
    sortFields: [
      { key: "booking_number", label: "Booking ID" },
      { key: "patient", label: "Patient" },
      { key: "date_range", label: "Start date" },
      { key: "status", label: "Status" },
      { key: "total", label: "Total" },
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

// The From/To date inputs already cover start/end range filtering with
// their own UX — this builder adds everything else, including Status.
export function getHomeCareQueryFields({
  rows,
}: {
  rows: any[];
}): QueryFieldSchema[] {
  const staffTypeLabel = (value: string) =>
    staffTypeOptions.find(([v]) => v === value)?.[1] || value;
  const statusLabel = (value: string) =>
    statuses.find(([v]: [string, string]) => v === value)?.[1] || value;

  return [
    { key: "booking_number", label: "Booking ID", type: "text" },
    { key: "patient_name", label: "Patient Name", type: "text" },
    { key: "patient_number", label: "Patient Number", type: "text" },
    { key: "assigned_staff_name", label: "Assigned Staff", type: "text" },
    {
      key: "staff_type",
      label: "Staff Type",
      type: "select",
      options: distinctFieldOptions(rows, "staff_type", staffTypeLabel),
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: distinctFieldOptions(rows, "status", statusLabel),
    },
    { key: "complaints", label: "Complaints", type: "text" },
    { key: "start_date", label: "Start Date", type: "date" },
    { key: "end_date", label: "End Date", type: "date" },
  ];
}
