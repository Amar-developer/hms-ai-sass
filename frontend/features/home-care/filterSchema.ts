import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import { statuses } from "./constants";

export function getHomeCareTableSchema(): TableSchema {
  return {
    id: "home-care",
    searchLabel: "Bookings",
    searchPlaceholder: "Search bookings",
    filters: [
      {
        key: "status",
        label: "Status",
        options: [
          { value: "all", label: "All statuses" },
          ...statuses.map(([value, label]: [string, string]) => ({
            value,
            label,
          })),
        ],
      },
    ],
    sortFields: [
      { key: "booking_number", label: "Booking ID" },
      { key: "patient", label: "Patient" },
      { key: "date_range", label: "Start date" },
      { key: "status", label: "Status" },
      { key: "total", label: "Total" },
    ],
  };
}
