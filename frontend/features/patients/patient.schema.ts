import { z } from "zod";

export const patientSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, "Full name must contain at least 3 characters"),

  mobile: z
    .string()
    .min(1, "Mobile number is required")
    .regex(/^\d{10}$/, "Mobile number must be exactly 10 digits"),

  branchId: z.string().min(1, "Please select a branch"),

  gender: z
    .string()
    .min(1)
    .refine((value) => value !== "select gender", {
      message: "Please select gender",
    }),

  dateOfBirth: z.string().optional(),

  ageYears: z.string().min(1, "Age is required"),

  guardianName: z.string().optional(),

  guardianMobile: z
    .string()
    .regex(/^\d{10}$/, "Guardian mobile must be exactly 10 digits")
    .optional()
    .or(z.literal("")),

  alternateMobile: z
    .string()
    .regex(/^\d{10}$/, "Alternate mobile must be exactly 10 digits")
    .optional()
    .or(z.literal("")),

  email: z
    .string()
    .email("Please enter a valid email address")
    .optional()
    .or(z.literal("")),

  area: z.string().optional(),

  bloodGroup: z.string().optional(),

  address: z.string().trim().min(1, "Address is required"),

  status: z.string().optional(),
});

export type PatientFormValues = z.infer<typeof patientSchema>;
