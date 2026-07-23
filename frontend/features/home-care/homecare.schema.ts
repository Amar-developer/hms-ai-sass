import { z } from "zod";

const lineItemSchema = z.object({
  service_id: z.string().optional(),
  description: z.string().optional(),
  quantity: z.string(),
  unit_amount: z.string(),
});

export const bookingSchema = z
  .object({
    patient_id: z.string().min(1, "Please select a patient"),
    booking_type: z.enum(["home_care", "home_visit"]),
    recurrence: z.string().min(1, "Recurrence is required"),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().min(1, "End date is required"),
    status: z.string().min(1, "Status is required"),
    location: z.string().min(1, "Location is required"),
    notes: z.string().optional(),

    lineItems: z.array(lineItemSchema),
  })
  .superRefine((data, ctx) => {
    data.lineItems.forEach((line, index) => {
      if (data.booking_type === "home_care") {
        if (line.service_id?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lineItems", index, "service_id"],
            message: "Home care service must be entered manually",
          });
        }
        if (!line.description?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lineItems", index, "description"],
            message: "Service name is required",
          });
        }
      } else {
        if (!line.service_id?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lineItems", index, "service_id"],
            message: "Please select a visit service",
          });
        }
      }
    });
  });

export type BookingFormValues = z.infer<typeof bookingSchema>;
