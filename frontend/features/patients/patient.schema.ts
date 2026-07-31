import { z } from "zod";

export const patientSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(3, "Full name must contain at least 3 characters"),

    mobile: z
      .string()
      .regex(/^\d{10}$/, "Mobile number must be exactly 10 digits")
      .optional()
      .or(z.literal("")),

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
      .regex(/^\d{10}$/, "Alternate phone number must be exactly 10 digits")
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

    whatsappConsentStatus: z.enum([
      "not_recorded",
      "opted_in",
      "opted_out",
    ]),

    whatsappConsentSource: z.string().optional(),

    whatsappPreferredLanguage: z.enum([
      "tenant_default",
      "en",
      "hi",
      "mr",
      "gu",
      "ta",
      "te",
      "kn",
      "ml",
      "bn",
      "pa",
      "ur",
    ]),
  })
  .superRefine((values, context) => {
    const mobile = values.mobile?.trim();
    const alternateMobile = values.alternateMobile?.trim();

    // At least one contact number is required
    if (!mobile && !alternateMobile) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mobile"],
        message:
          "Mobile number or alternate mobile number is required",
      });
    }

    // Prevent same number in both fields
    if (
      mobile &&
      alternateMobile &&
      mobile === alternateMobile
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["alternateMobile"],
        message:
          "Alternate phone number must be different from the primary mobile number",
      });
    }
  });

export type PatientFormValues = z.infer<typeof patientSchema>;
