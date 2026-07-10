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

export const scheduleSchema = z.object({
  practitionerId: z.string().min(1, "Doctor is required"),
  branchId: z.string().min(1, "Branch is required"),
  departmentId: z.string().min(1, "Department is required"),

  // Multiple weekdays
  weekdays: z.array(z.string()).min(1, "Select at least one weekday"),

  // Time ranges
  ranges: z.array(timeRangeSchema).min(1, "Add at least one time range"),

  slotMinutes: z
    .string()
    .min(1, "Slot minutes required")
    .refine((val) => !isNaN(Number(val)) && Number(val) >= 1 && Number(val) <= 240, {
      message: "Slot minutes must be between 1 and 240",
    }),

  roomNumber: z
    .string()
    .optional()
    .refine((val) => !val || (!isNaN(Number(val)) && Number(val) >= 1), {
      message: "Room number must be a positive number",
    }),
});

export type ScheduleFormValues = z.infer<typeof scheduleSchema>;
