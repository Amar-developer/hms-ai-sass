export function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addCalendarMonth(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";
  const targetMonthStart = new Date(Date.UTC(year, month, 1));
  const targetYear = targetMonthStart.getUTCFullYear();
  const targetMonth = targetMonthStart.getUTCMonth();
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)),
  )
    .toISOString()
    .slice(0, 10);
}

export function recurrenceEndDate(startDate: string, recurrence: string) {
  if (!startDate) return "";
  if (recurrence === "custom") return "";
  if (recurrence === "one_week") return addDays(startDate, 6);
  if (recurrence === "monthly") {
    return addDays(addCalendarMonth(startDate), -1);
  }
  return startDate;
}

/** Weekday numbers use 0=Mon..6=Sun to match the backend. */
export const visitWeekdayOptions = [
  [0, "Mon"],
  [1, "Tue"],
  [2, "Wed"],
  [3, "Thu"],
  [4, "Fri"],
  [5, "Sat"],
  [6, "Sun"],
] as const;

export const visitDayModeOptions = [
  ["all", "Every day"],
  ["alternate", "Alternate days"],
  ["weekdays", "Specific weekdays"],
];

/**
 * The dates a booking is actually visited between start and end. Mirrors
 * backend app/modules/home_care/visit_days.py so the estimate shown while
 * booking matches what the server plans.
 */
export function plannedVisitDates(
  start: string,
  end: string,
  visitDayMode: string = "all",
  visitWeekdays: number[] = [],
) {
  if (!start) return [];
  const parse = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  };
  const first = parse(start);
  const last = parse(end || start);
  if (Number.isNaN(first.getTime()) || last < first) return [];

  const step = visitDayMode === "alternate" ? 2 : 1;
  const selected = new Set(visitWeekdays);
  const dates: string[] = [];
  for (
    const cursor = new Date(first);
    cursor <= last;
    cursor.setUTCDate(cursor.getUTCDate() + step)
  ) {
    // JS getUTCDay() is 0=Sun..6=Sat; shift to 0=Mon..6=Sun.
    const weekday = (cursor.getUTCDay() + 6) % 7;
    // An empty weekday selection would plan nothing, so treat it as no filter.
    if (
      visitDayMode !== "weekdays" ||
      selected.size === 0 ||
      selected.has(weekday)
    ) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
  }
  return dates;
}

export function plannedVisitCount(
  start: string,
  end: string,
  visitDayMode: string = "all",
  visitWeekdays: number[] = [],
) {
  return plannedVisitDates(start, end, visitDayMode, visitWeekdays).length;
}

export function dayCount(start: string, end: string) {
  if (!start) return 1;
  const parseUtcDate = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  const startTime = parseUtcDate(start);
  const endTime = parseUtcDate(end || start);
  const diff = Math.round((endTime - startTime) / 86400000) + 1;
  return diff > 0 ? diff : 1;
}
