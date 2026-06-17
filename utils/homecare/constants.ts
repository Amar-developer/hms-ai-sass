import { today } from "../physiotherapy/helpers";

export const statuses = [
  ["requested", "Requested"],
  ["scheduled", "Scheduled"],
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

export const staffTypeOptions = [
  ["nurse", "Nurse"],
  ["staff", "Staff"],
  ["doctor", "Doctor"],
  ["physiotherapist", "Physiotherapist"],
  ["receptionist", "Receptionist"],
  ["custom", "Custom"],
];

export const LOCKED_STATUSES = ["invoiced", "paid", "completed", "cancelled"];

export const emptyForm = {
  patient_id: "",
  assigned_staff_user_id: "",
  assigned_staff_name: "",
  staff_type: "nurse",
  recurrence: "daily",
  start_date: today(),
  end_date: today(),
  status: "requested",
  complaints: "",
  notes: "",
};

export const emptyLine = {
  service_id: "",
  description: "",
  quantity: "1",
  unit_amount: "0",
};