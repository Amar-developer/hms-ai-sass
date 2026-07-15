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
