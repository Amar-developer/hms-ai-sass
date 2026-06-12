import { ALL_BRANCHES } from "./constants";

export function activeTenantOptions(tenants: any[]) {
  const seen = new Set<string>();
  return (tenants || []).filter((tenant: any) => {
    if (tenant.status === "suspended") return false;
    const key = String(tenant.name || tenant.id || "").trim().toLowerCase();
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
}

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

export function selectedSchedulePayloads(fd: FormData, allBranchIds: string[] = []) {
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
  const roomNumber = rawRoomNumber ? rawRoomNumber.padStart(3, "0").slice(0, 3) : null;
  const branchValue = String(fd.get("branchId") || "");
  const branchIds =
    branchValue === ALL_BRANCHES
      ? allBranchIds.filter(Boolean)
      : [branchValue];
  return branchIds.flatMap((branch_id) =>
    selectedWeekdays.flatMap((weekday) =>
      ranges.map((range) => ({
        branch_id,
        department_id: fd.get("departmentId") || null,
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

export function scheduleGroupKey(row: any) {
  return [
    row.practitioner_id,
    row.branch_id,
    row.department_id || "",
    row.room_number || "",
    row.slot_minutes,
  ].join("|");
}

export function groupSchedules(rows: any[]) {
  const groups = new Map<string, any>();
  for (const row of rows) {
    const key = scheduleGroupKey(row);
    const existing = groups.get(key);
    if (existing) {
      existing.schedules.push(row);
      existing.updated_at = [
        existing.updated_at,
        row.updated_at,
        row.created_at,
      ]
        .filter(Boolean)
        .sort()
        .at(-1);
      existing.is_active = existing.schedules.some(
        (item: any) => item.is_active,
      );
    } else {
      groups.set(key, {
        ...row,
        id: key,
        schedules: [row],
        group_key: key,
        is_active: row.is_active,
      });
    }
  }
  return Array.from(groups.values()).map((group: any) => ({
    ...group,
    schedules: [...group.schedules].sort(
      (a: any, b: any) =>
        a.weekday - b.weekday ||
        String(a.start_time).localeCompare(String(b.start_time)),
    ),
  }));
}