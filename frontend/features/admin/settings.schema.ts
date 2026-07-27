import { z } from "zod";
import {
  requiredString,
  emailSchema,
  mobileSchema,
} from "@/app/validations/common";

export const userSchema = z.object({
  name: requiredString("Name is required"),
  email: emailSchema,
  userType: z.enum([
    "tenant_admin",
    "staff",
    "receptionist",
    "nurse",
    "lab",
    "doctor",
    "pharmacy",
    "billing",
    "back_office",
    "staff",
  ]),
  mobile: mobileSchema,
  branchId: z.string().optional(),
  password: z
    .string()
    .optional()
    .refine((value) => !value || value.trim().length >= 8, {
      message: "Password must be at least 8 characters",
    }),
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

  city: z.string().min(1, "City is required"),

  area: z.string().min(1, "Area is required"),

  state: z.string().min(1, "State is required"),

  address: z.string().min(1, "Address is required"),

  isActive: z.string().optional(),
});

export type BranchFormValues = z.infer<typeof branchSchema>;

export const supplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Supplier name must have atlease 2 characters"),
  gstin: z.string().trim().optional(),
  phone: mobileSchema,
  email: emailSchema,
  address: z.string().min(1, "Address is required"),
  isActive: z.string().optional(),
});

export type SupplierFormValues = z.infer<typeof supplierSchema>;

export const taxRuleSchema = z.object({
  name: z.string().trim().min(2, "Tax name must contain at least 2 characters"),

  branchId: z.string(),

  serviceScope: z.enum([
    "all",
    "consultation",
    "lab",
    "pharmacy",
    "home_care",
    "home_visit",
    "physiotherapy",
    "ip",
    "service",
  ]),

  taxLabel: z.string().trim().min(1, "Tax label is required"),

  taxPercentage: z.number()
    .min(1, "Tax percentage should be greater than 0")
    .max(100, "Tax percentage cannot exceed 100"),

  isActive: z.string().optional(),
});

export type TaxRuleFormValues = z.infer<typeof taxRuleSchema>;

export const discountOfferSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Offer name must contain at least 2 characters"),

    code: z.string().trim().min(3,'Code is required'),

    branchId: z.string().optional(),

    serviceScope: z.enum([
      "all",
      "consultation",
      "lab",
      "pharmacy",
      "home_care",
      "home_visit",
      "physiotherapy",
      "ip",
      "service",
    ]),

    discountType: z.enum(["percentage", "fixed"]),

    value: z.number().min(0.01, "Discount value is required"),

    minimumBillAmount: z.number().min(0).optional(),

    maxDiscountAmount: z.number().min(0).optional(),

    validFrom: z.string().min(1,"Validity start date is required"),

    validUntil: z.string().min(1,'Validity end date is required'),

    isActive: z.string().optional(),
  })
  .refine(
    (data) => data.discountType !== "percentage" || data.value <= 100,
    {
      path: ["value"],
      message: "Percentage discount cannot exceed 100%",
    },
  )
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
  name: z.string().trim().min(2,"Plan name is required"),

  code: z.string().optional(),

  priceAmount: z.number().min(1,'Price is required'),

  durationDays: z.number().min(1,'Duration days is required'),

  activationAfterDays: z.number().min(0,"Activation After days is required"),

  freeConsultations: z.number().min(0),

  labDiscount: z.number().min(0).max(100),

  pharmacyDiscount: z.number().min(0).max(100),

  minDiscountAmount: z.number().min(1,"Minimum Bill amount is required"),
});

export type PlanFormInput = z.input<typeof planSchema>;

export type PlanFormValues = z.infer<typeof planSchema>;

export const documentUploadSchema = z.object({
  file: z.any().refine((files) => files?.length === 1, "File is required"),

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

export type DocumentUploadFormValues = z.infer<typeof documentUploadSchema>;
