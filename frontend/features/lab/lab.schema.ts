import { z } from "zod";

export const labOrderSchema = z
  .object({
    patient_id: z.string().min(1, "Please select a patient"),
    order_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Please select an order date"),
    acquisition_source: z.enum([
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
    referrer_patient_id: z.string().optional(),
    referrer_name: z.string().trim().optional(),
  })
  .refine(
    (data) =>
      data.acquisition_source !== "referral" || !!data.referrer_name?.trim(),
    {
      message: "Referrer name is required",
      path: ["referrer_name"],
    },
  );

export type LabOrderFormValues = z.infer<typeof labOrderSchema>;
