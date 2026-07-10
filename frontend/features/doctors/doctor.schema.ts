import { z } from "zod";

const specialtyFeeSchema = z.object({
  departmentId: z.string().min(1, "Select a specialty"),
  fee: z
    .string()
    .min(1, "Fee is required")
    .refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
      message: "Fee must be a valid positive number",
    }),
  doctorSharePercentage: z
    .string()
    .min(1, "Doctor share is required")
    .refine(
      (val) => !isNaN(Number(val)) && Number(val) >= 0 && Number(val) <= 100,
      "Doctor share must be between 0 and 100",
    ),
});

export const doctorSchema = z
  .object({
    userId: z.string().optional(),
    fullName: z
      .string()
      .trim()
      .min(3, "Doctor name must be at least 3 characters"),
    practitionerType: z.enum(["doctor", "physiotherapist"]),
    registrationNumber: z.string().trim().optional(),
    mobile: z.string().regex(/^\d{10}$/, "Mobile number must be 10 digits"),
    email: z.string().email("Invalid email address").or(z.literal("")),
    status: z.enum(["active", "inactive"]),
    branchIds: z.array(z.string()).min(1, "Select at least one branch"),
    // We derive departmentIds from specialtyFees - no need to keep separate
    departmentIds: z.array(z.string()).optional(),
    specialtyFees: z
      .array(specialtyFeeSchema)
      .min(1, "Add at least one specialty"),
    shareTaxWithDoctor: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const deptIds = data.specialtyFees.map((s) => s.departmentId);
    const unique = new Set(deptIds);

    if (unique.size !== deptIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specialtyFees"],
        message: "The same specialty cannot be added more than once",
      });
    }
  });

export type DoctorFormValues = z.infer<typeof doctorSchema>;
