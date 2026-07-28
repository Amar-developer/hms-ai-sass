// schemas/appointment.schema.ts

import { z } from "zod";

export const appointmentSchema = z.object({
  departmentId: z.string().min(1, "Department is required"),

  doctorId: z.string().min(1, "Doctor is required"),

  appointmentType: z.enum([
    "op",
    "follow_up",
    "doctor_review",
    "fitness_certificate",
    "emergency",
  ]),

  appointmentDate: z.string().min(1, "Appointment date is required"),

  acquisitionSource: z.enum([
    "direct",
    "referral",
    "google",
    "facebook",
    "instagram",
    "website",
    "whatsapp",
    "ads",
    "campaign",
    "other",
  ]),

  referrerPatientId: z.string().optional(),

  referrerName: z.string().optional(),

  emergencyReason: z.string().optional(),

  isBillable: z.boolean(),

  customFee: z.coerce.number().optional(),

  billingNote: z.string().optional(),

  intakeBp: z.string().optional(),

  intakePulse: z.string().optional(),

  intakeSpo2: z.string().optional(),

  intakeTemp: z.string().optional(),

  intakeHeight: z.string().optional(),

  intakeWeight: z.string().optional(),

  intakeComplaints: z.string().optional(),
});

export type AppointmentFormValues = z.infer<typeof appointmentSchema>;
