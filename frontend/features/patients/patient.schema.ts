import { z } from "zod";

export const patientSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, "Full name is required"),

  mobile: z
    .string()
    .regex(/^\d{10}$/, "Mobile number must be 10 digits"),

  branchId: z.string().min(1, "Select a branch"),

  gender: z.string().min(1, "Select gender"),

  dateOfBirth: z.string().optional(),

  ageYears: z
    .string()
    .optional(),

  guardianName: z.string().optional(),

  guardianMobile: z
    .string()
    .regex(/^\d{10}$/, "Guardian mobile must be 10 digits")
    .optional()
    .or(z.literal("")),

  alternateMobile: z
    .string()
    .regex(/^\d{10}$/, "Alternate mobile must be 10 digits")
    .optional()
    .or(z.literal("")),

  email: z
    .string()
    .email("Invalid email")
    .optional()
    .or(z.literal("")),

  area: z.string().optional(),

  bloodGroup: z.string().optional(),

  address: z.string().optional(),

  status: z.string().optional(),
});

export type PatientFormValues = z.infer<typeof patientSchema>;
