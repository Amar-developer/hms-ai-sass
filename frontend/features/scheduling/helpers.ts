import { ScheduleFormValues } from "./schedule.schema";
import { ALL_BRANCHES } from "./constants";


export function formatPractitionerType(value: any) {
  return String(value || "doctor")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDisplayTime(value: any) {
  const raw = String(value || "").slice(0, 5);
  const [hourText, minuteText = "00"] = raw.split(":");
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return raw || "-";
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minuteText.padStart(2, "0")} ${period}`;
}

export function formatDisplayRange(start: any, end: any) {
  return `${formatDisplayTime(start)} - ${formatDisplayTime(end)}`;
}

const WEEKDAY_SHORT_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function formatWeekdaysLabel(mode: string, weekdays: number[] = []) {
  if (mode === "daily") return "Daily";
  if (mode === "mon_saturday") return "Mon - Saturday";
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_SHORT_LABELS[day] ?? "")
    .filter(Boolean)
    .join(", ") || "-";
}

// WeekdaySelector's WeekdayMode ("mon-saturday") vs. the backend's
// ScheduleMode ("mon_saturday") — the only place these two naming
// conventions need to be reconciled.
function toBackendMode(weekdayMode: string): "daily" | "mon_saturday" | "custom" {
  if (weekdayMode === "mon-saturday") return "mon_saturday";
  if (weekdayMode === "daily") return "daily";
  return "custom";
}

export function toWeekdayMode(backendMode: string | undefined): "" | "daily" | "mon-saturday" | "custom" {
  if (backendMode === "mon_saturday") return "mon-saturday";
  if (backendMode === "daily") return "daily";
  if (backendMode === "custom") return "custom";
  return "";
}

// One schedule is one row now: a row's `weekdays` covers every day it
// applies to, so this only fans out per branch (for "all branches") and per
// time range (a schedule can still have a morning + evening session).
export function selectedSchedulePayloadsFromRHF(
  data: ScheduleFormValues,
  doctorBranchIds: string[],
) {
  const payloads: any[] = [];
  const mode = toBackendMode(data.weekdayMode);
  const weekdays = mode === "custom" ? data.weekdays.map(Number) : [];

  data.ranges.forEach((range) => {
    const payload: any = {
      mode,
      weekdays,
      start_time: range.start,
      end_time: range.end,
      is_active: range.isActive,
      slot_minutes: Number(data.slotMinutes),
      department_id: data.departmentId,
    };

    if (data.branchId === ALL_BRANCHES) {
      doctorBranchIds.forEach((branchId) => {
        payloads.push({ ...payload, branch_id: branchId });
      });
    } else {
      payloads.push({ ...payload, branch_id: data.branchId });
    }
  });

  return payloads;
}
