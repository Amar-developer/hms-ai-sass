import { z } from "zod";

export const bookingSchema = z.object({
  patient_id: z.string().min(1, "Please select a patient"),
  booking_type: z.enum(["home_care", "home_visit"]),
  recurrence: z.string().min(1, "Recurrence is required"),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().optional(),
  status: z.string().min(1, "Status is required"),
  location: z.string().optional(),
  notes: z.string().optional(),
});

export type BookingFormValues = z.infer<typeof bookingSchema>;
