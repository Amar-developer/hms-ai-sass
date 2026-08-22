import { Column } from "@/features/admin/types";

export const pageSize = 10;

export const PLAN_COLUMNS: Column[] = [
  { label: "Plan", width: "min-w-[220px]" },
  { label: "Price", width: "min-w-[140px]" },
  { label: "Duration", width: "min-w-[140px]" },
  { label: "Consults", width: "min-w-[120px]" },
  { label: "Status", width: "min-w-[140px]" },
  { label: "Actions", width: "min-w-[180px]" },
];

export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export const ValidationMessages = {
  required: "This field is required.",
  email: "Please enter a valid email address.",
  passwordRequired: "Password is required.",
  passwordMin: "Password must be at least 8 characters.",
};

export const COLORS = [
  "bg-red-700",
  "bg-orange-700",
  "bg-amber-700",
  "bg-yellow-700",
  "bg-lime-700",
  "bg-green-700",
  "bg-emerald-700",
  "bg-emerald-700",
  "bg-cyan-700",
  "bg-sky-700",
  "bg-blue-700",
  "bg-indigo-700",
  "bg-violet-700",
  "bg-purple-700",
  "bg-fuchsia-700",
  "bg-pink-700",
  "bg-rose-700",
] as const;
export const colorList = Object.values(COLORS);
