export type TimespanKey = "7d" | "30d" | "90d" | "180d" | "365d" | "all";

export const TIMESPAN_OPTIONS: { key: TimespanKey; label: string }[] = [
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "1 Month" },
  { key: "90d", label: "3 Months" },
  { key: "180d", label: "6 Months" },
  { key: "365d", label: "1 Year" },
  { key: "all", label: "All Time" },
];

const TIMESPAN_DAYS: Record<TimespanKey, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
  all: null,
};

/**
 * Filters date-stamped points to a rolling window ending at the latest
 * point's date (not "today") — so a chart for a patient whose last reading
 * was months ago still shows that reading instead of an empty window.
 */
export function filterByTimespan<T extends Record<string, any>>(
  points: T[],
  timespan: TimespanKey,
  dateKey: keyof T = "date" as keyof T,
): T[] {
  if (points.length === 0) return points;
  const days = TIMESPAN_DAYS[timespan];
  if (!days) return points;
  const latest = new Date(`${points[points.length - 1][dateKey]}T00:00:00`);
  const cutoff = new Date(latest);
  cutoff.setDate(cutoff.getDate() - days);
  const filtered = points.filter(
    (point) => new Date(`${point[dateKey]}T00:00:00`) >= cutoff,
  );
  return filtered.length > 0 ? filtered : points.slice(-1);
}
