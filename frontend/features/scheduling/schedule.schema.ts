import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:MM format

const timeRangeSchema = z.object({
  start: z.string().regex(timeRegex, "Invalid start time (HH:MM)"),
  end: z.string().regex(timeRegex, "Invalid end time (HH:MM)"),
  isActive: z.boolean(),
}).superRefine((data, ctx) => {
  if (data.start >= data.end) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["end"],
      message: "End time must be after start time",
    });
  }
});

export const scheduleSchema = z
  .object({
  practitionerId: z.string().min(1, "Doctor is required"),
  branchId: z.string().min(1, "Branch is required"),
  departmentId: z.string().min(1, "Department is required"),

  // "" | "daily" | "mon-saturday" | "custom" (WeekdaySelector's WeekdayMode)
  weekdayMode: z.enum(["", "daily", "mon-saturday", "custom"]),
  // Only consulted when weekdayMode === "custom".
  weekdays: z.array(z.string()),

  // Time ranges
  ranges: z.array(timeRangeSchema).min(1, "Add at least one time range"),

  slotMinutes: z
    .string()
    .min(1, "Slot minutes required")
    .refine((val) => !isNaN(Number(val)) && Number(val) >= 1 && Number(val) <= 240, {
      message: "Slot minutes must be between 1 and 240",
    }),
  })
  .superRefine((data, ctx) => {
    if (!data.weekdayMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdayMode"],
        message: "Select Daily, Mon - Saturday, or Custom",
      });
    } else if (data.weekdayMode === "custom" && data.weekdays.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "Select at least one weekday",
      });
    }
  });

export type ScheduleFormValues = z.infer<typeof scheduleSchema>;
