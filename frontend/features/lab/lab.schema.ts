import { z } from "zod";

export const labOrderSchema = z
  .object({
    patient_id: z.string().min(1, "Please select a patient"),
    source: z.enum(["op_direct", "external_referral"]),
    external_referrer: z.string().trim().optional(),
  })
  .refine(
    (data) =>
      data.source !== "external_referral" || !!data.external_referrer?.trim(),
    {
      message: "External referrer name is required",
      path: ["external_referrer"],
    },
  );

export type LabOrderFormValues = z.infer<typeof labOrderSchema>;
