import { describe, expect, it } from "vitest";

import { dayCount, recurrenceEndDate } from "./calendar";

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
