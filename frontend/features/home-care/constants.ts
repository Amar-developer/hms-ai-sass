import { today } from "@/utils/helper";

export const statuses = [
  ["requested", "Requested"],
  ["scheduled", "Scheduled"],
  ["assigned", "Assigned"],
  ["in_progress", "In Progress"],
  ["completed", "Completed"],
  ["invoiced", "Invoiced"],
  ["paid", "Paid"],
  ["cancelled", "Cancelled"],
];

export const recurrenceOptions = [
  ["daily", "Daily"],
  ["one_week", "One Week"],
  ["monthly", "Monthly"],
  ["custom", "Custom"],
];

export const bookingTypeOptions = [
  ["home_care", "Home Care"],
  ["home_visit", "Home Visit"],
];

export const staffTypeOptions = [
  ["nurse", "Nurse"],
  ["staff", "General Staff"],
  ["lab_technician", "Lab Technician"],
  ["doctor", "Doctor"],
  ["physiotherapist", "Physiotherapist"],
  ["receptionist", "Receptionist"],
  ["users", "Users"],
];

export const LOCKED_STATUSES = ["invoiced", "paid", "completed", "cancelled"];

export const editableBookingStatuses = [
  { value: "requested", label: "Requested" },
  { value: "scheduled", label: "Scheduled" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

export const emptyForm = {
  patient_id: "",
  assigned_staff_user_id: "",
  assigned_staff_name: "",
  booking_type: "home_care",
  staff_type: "nurse",
  recurrence: "daily",
  start_date: today(),
  end_date: today(),
  status: "requested",
  location: "",
  complaints: "",
  notes: "",
};

export const emptyLine = {
  service_id: "",
  description: "",
  quantity: "2",
  unit_amount: "500",
};

export const visitLogStatuses = [
  { value: "completed", label: "Completed / Billable" },
  { value: "missed", label: "Missed / Not billable" },
  { value: "cancelled", label: "Cancelled / Not billable" },
];

export const homeCareHourPrices: Record<string, string> = {
  "2": "500",
  "4": "800",
  "8": "1000",
  "10": "1100",
  "12": "1200",
  "24": "1500",
};
