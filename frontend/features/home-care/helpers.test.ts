import { describe, expect, it } from "vitest";

import {
  dayCount,
  plannedVisitCount,
  plannedVisitDates,
  recurrenceEndDate,
} from "./calendar";

describe("home care booking recurrence dates", () => {
  it("counts a one-week home care or home visit booking as seven days", () => {
    const end = recurrenceEndDate("2026-07-15", "one_week");

    expect(end).toBe("2026-07-21");
    expect(dayCount("2026-07-15", end)).toBe(7);
  });

  it.each([
    ["2026-01-01", 31],
    ["2026-02-01", 28],
    ["2024-02-01", 29],
    ["2026-04-01", 30],
  ])("uses the actual calendar-month length from %s", (start, expectedDays) => {
    const end = recurrenceEndDate(start, "monthly");

    expect(dayCount(start, end)).toBe(expectedDays);
  });

  it("does not overflow when a monthly booking starts at month end", () => {
    const end = recurrenceEndDate("2026-01-31", "monthly");

    expect(end).toBe("2026-02-27");
    expect(dayCount("2026-01-31", end)).toBe(28);
  });
});

describe("home care planned visit days", () => {
  it("counts every day in the range by default", () => {
    // 01 Aug 2026 (Sat) .. 15 Aug 2026 (Sat)
    expect(plannedVisitCount("2026-08-01", "2026-08-15")).toBe(15);
  });

  it("counts only the chosen weekdays across the range", () => {
    // Tue(1), Thu(3), Sat(5) between 01 and 15 August 2026.
    const dates = plannedVisitDates("2026-08-01", "2026-08-15", "weekdays", [
      1, 3, 5,
    ]);

    expect(dates).toEqual([
      "2026-08-01",
      "2026-08-04",
      "2026-08-06",
      "2026-08-08",
      "2026-08-11",
      "2026-08-13",
      "2026-08-15",
    ]);
    expect(dates).toHaveLength(7);
  });

  it("steps two days at a time for alternate-day bookings", () => {
    expect(plannedVisitDates("2026-08-01", "2026-08-07", "alternate")).toEqual([
      "2026-08-01",
      "2026-08-03",
      "2026-08-05",
      "2026-08-07",
    ]);
  });

  it("treats an empty weekday selection as no filter rather than no visits", () => {
    expect(plannedVisitCount("2026-08-01", "2026-08-03", "weekdays", [])).toBe(
      3,
    );
  });

  it("returns nothing when the range is inverted", () => {
    expect(plannedVisitDates("2026-08-10", "2026-08-01")).toEqual([]);
  });
});
