import { z } from "zod";
import { requiredString, emailSchema, mobileSchema } from "./common";

export const userSchema = z.object({
  name: requiredString("Name is required"),
  email: emailSchema,
  userType: z.enum([
    "tenant_admin",
    "staff",
    "receptionist",
    "nurse",
    "lab",
    'doctor',
    "pharmacy",
    "billing",
    "back_office",
    "staff",
  ]),
  mobile: mobileSchema,
  branchId: z.string().optional(),
  password: z.string().optional(),
  mustChangePassword: z.string(),
  isActive: z.string().optional(),
  roleKeys: z.array(z.string()).min(1, "Select at least one role"),
});

export type UserFormValues = z.infer<typeof userSchema>;



export const departmentSchema = z.object({
  name: z.string().trim().min(2, "Department name is required"),

  branchId: z.string().optional(),

  description: z.string().optional(),

  isActive: z.string().optional(),
});

export type DepartmentFormValues = z.infer<typeof departmentSchema>;

export const branchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Branch name must contain at least 2 characters"),

  code: z.string().trim().min(1, "Branch code is required"),

  city: z.string().optional(),

  area: z.string().optional(),

  state: z.string().optional(),

  address: z.string().optional(),

  isActive: z.string().optional(),
});

export type BranchFormValues = z.infer<typeof branchSchema>;

export const supplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Supplier name must have atlease 2 characters"),
  gstin: z.string().trim().min(1, "GST is required"),
  phone: mobileSchema,
  email: emailSchema,
  address: z.string().trim(),
  isActive: z.string().optional(),
});

export type SupplierFormValues = z.infer<typeof supplierSchema>;

export const taxRuleSchema = z.object({
  name: z.string().trim().min(2, "Tax name must contain at least 2 characters"),

  branchId: z.string(),

  serviceScope: z.enum(["all", "consultation", "lab", "pharmacy", "service"]),

  taxLabel: z.string().trim().min(1, "Tax label is required"),

  taxPercentage: z.number().min(0).max(100),

  isActive: z.string().optional(),
});

export type TaxRuleFormValues = z.infer<typeof taxRuleSchema>;

export const discountOfferSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Offer name must contain at least 2 characters"),

    code: z.string().trim().optional(),

    branchId: z.string().optional(),

    serviceScope: z.enum(["all", "consultation", "lab", "pharmacy", "service"]),

    discountType: z.enum(["percentage", "fixed"]),

    value: z.number().min(0.01, "Discount value is required"),

    minimumBillAmount: z.number().min(0).optional(),

    maxDiscountAmount: z.number().min(0).optional(),

    validFrom: z.string().optional(),

    validUntil: z.string().optional(),

    isActive: z.string().optional(),
  })
  .refine(
    (data) => {
      if (!data.validFrom || !data.validUntil) return true;

      return new Date(data.validUntil) >= new Date(data.validFrom);
    },
    {
      path: ["validUntil"],
      message: "Valid Until must be after Valid From",
    },
  );

export type DiscountOfferFormValues = z.infer<typeof discountOfferSchema>;


export const planSchema = z.object({
  name: z.string().trim().min(2),

  code: z.string().optional(),

  priceAmount: z.number().min(0),

  durationDays: z.number().min(1),

  activationAfterDays: z.number().min(0),

  freeConsultations: z.number().min(0),

  labDiscount: z.number().min(0).max(100),

  pharmacyDiscount: z.number().min(0).max(100),

  minDiscountAmount: z.number().min(0),
});

export type PlanFormInput = z.input<typeof planSchema>;

export type PlanFormValues = z.infer<typeof planSchema>;



export const documentUploadSchema = z.object({

  file: z
    .any()
    .refine(
      (files) => files?.length === 1,
      "File is required"
    ),

  category: z.string().min(1, "Category is required"),

  branch_id: z.string().optional(),

  patient_id: z.string().optional(),

  source_module: z.string().optional(),

  attached_to_doctype: z.string().optional(),

  attached_to_name: z.string().optional(),

  attached_to_field: z.string().optional(),

  attached_to_label: z.string().optional(),

  folder: z.string().optional(),

  notes: z.string().optional(),
});


export type DocumentUploadFormValues =
  z.infer<typeof documentUploadSchema>;
