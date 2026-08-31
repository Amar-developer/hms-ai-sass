import { z } from "zod";

export const patientSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(3, "Full name must contain at least 3 characters"),
    mobile: z
      .string()
      .regex(
        /^[6-9]\d{9}$/,
        "Mobile number must be exactly 10 digits and start with 6, 7, 8 or 9",
      )
      .optional()
      .or(z.literal("")),

    alternateMobile: z
      .string()
      .regex(
        /^[6-9]\d{9}$/,
        "Secondary mobile number must be exactly 10 digits and start with 6, 7, 8 or 9",
      )
      .optional()
      .or(z.literal("")),

    guardianName: z.string().optional(),

    guardianMobile: z
      .string()
      .regex(
        /^[6-9]\d{9}$/,
        "Guardian mobile number must be exactly 10 digits and start with 6, 7, 8 or 9",
      )
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

    email: z
      .string()
      .email("Please enter a valid email address")
      .optional()
      .or(z.literal("")),

    area: z.string().optional(),

    bloodGroup: z.string().optional(),

    address: z.string().trim().min(1, "Address is required"),

    status: z.string().optional(),

    whatsappConsentStatus: z.enum(["not_recorded", "opted_in", "opted_out"]),

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

    smsConsentStatus: z.enum(["not_recorded", "opted_in", "opted_out"]),

    smsConsentSource: z.string().optional(),

    smsPreferredLanguage: z.enum([
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

    monthlyTrackingEnabled: z.boolean().optional(),

    monthlyRefillOn: z.string().optional(),

    monthlyRefillNotes: z.string().optional(),

    monthlyLabOn: z.string().optional(),

    monthlyLabTestName: z.string().optional(),

    monthlyLabNotes: z.string().optional(),

    familyRelatedPatientId: z.string().optional(),

    familyRelationship: z.string().optional(),

    familyNotes: z.string().optional(),
  })
  .superRefine((values, context) => {
    const mobile = values.mobile?.trim();
    const alternateMobile = values.alternateMobile?.trim();
    const guardianMobile = values.guardianMobile?.trim();

    if (!mobile && !alternateMobile && !guardianMobile) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mobile"],
        message:
          "Primary, secondary, or guardian mobile number is required",
      });
    }

    // Prevent same number in both fields
    if (mobile && alternateMobile && mobile === alternateMobile) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["alternateMobile"],
        message:
          "Secondary mobile number must be different from the primary mobile number",
      });
    }

    if (
      values.smsConsentStatus !== "not_recorded" &&
      !values.smsConsentSource?.trim()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["smsConsentSource"],
        message: "Preference source is required when SMS consent is recorded",
      });
    }
  });

export type PatientFormValues = z.infer<typeof patientSchema>;
