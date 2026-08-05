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

export function selectedSchedulePayloads(
  fd: FormData,
  allBranchIds: string[] = [],
) {
  const weekdays = fd
    .getAll("weekdays")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  const fallbackWeekday = fd.get("weekday");
  const selectedWeekdays = weekdays.length
    ? weekdays
    : [Number(fallbackWeekday ?? 0)];
  const rangeCount = Number(fd.get("rangeCount") || 1);
  const ranges = Array.from(
    { length: Math.max(1, rangeCount) },
    (_, index) => ({
      start_time: fd.get(`startTime_${index}`) || fd.get("startTime"),
      end_time: fd.get(`endTime_${index}`) || fd.get("endTime"),
      is_active: fd.get(`isActive_${index}`) !== "false",
    }),
  ).filter((range) => range.start_time && range.end_time);
  const rawRoomNumber = String(fd.get("roomNumber") || "").replace(/\D/g, "");
  const roomNumber = rawRoomNumber
    ? rawRoomNumber.padStart(3, "0").slice(0, 3)
    : null;
  const branchValue = String(fd.get("branchId") || "");
  const branchIds =
    branchValue === ALL_BRANCHES ? allBranchIds.filter(Boolean) : [branchValue];
  const departmentId = String(fd.get("departmentId") || "") || null;
  return branchIds.flatMap((branch_id) =>
    selectedWeekdays.flatMap((weekday) =>
      ranges.map((range) => ({
        branch_id,
        department_id: departmentId,
        weekday,
        start_time: range.start_time,
        end_time: range.end_time,
        is_active: range.is_active,
        slot_minutes: Number(fd.get("slotMinutes") || 15),
        room_number: roomNumber,
      })),
    ),
  );
}

// Schedule grouping now happens server-side and arrives from
// GET /practitioners/schedules/grouped as one row per editable schedule with
// its timings under `slots`, so the old client-side groupSchedules /
// scheduleGroupKey pair has been removed.

export function selectedSchedulePayloadsFromRHF(
  data: ScheduleFormValues,
  doctorBranchIds: string[]
) {
  const payloads: any[] = [];
  const isDateSchedule = data.scheduleMode === "date" && Boolean(data.scheduleDate);
  // A date-specific schedule targets one calendar date, so the weekday list
  // does not apply — the server derives the weekday from the date itself.
  const recurrenceKeys = isDateSchedule ? [null] : data.weekdays;

  data.ranges.forEach((range) => {
    recurrenceKeys.forEach((weekday) => {
      const payload: any = {
        start_time: range.start,
        end_time: range.end,
        is_active: range.isActive,
        slot_minutes: Number(data.slotMinutes),
        department_id: data.departmentId,
        // FIX: Send room_number as STRING or null
        room_number: data.roomNumber ? String(data.roomNumber) : null,
      };
      if (isDateSchedule) {
        payload.schedule_date = data.scheduleDate;
        payload.date_mode = data.dateMode;
      } else {
        payload.weekday = Number(weekday);
      }

      if (data.branchId === ALL_BRANCHES) {
        doctorBranchIds.forEach((branchId) => {
          payloads.push({ ...payload, branch_id: branchId });
        });
      } else {
        payloads.push({ ...payload, branch_id: data.branchId });
      }
    });
  });

  return payloads;
}
