import { z } from "zod";

export const itemSchema = z.object({
  name: z.string().trim().min(2, "Item name must be at least 2 characters"),
  generic_name: z.string().trim().optional(),
  mrp_price: z
    .string()
    .min(1, "MRP Price is required")
    .refine((val) => !isNaN(Number(val)) && Number(val) >= 0, "MRP must be a valid positive number"),

  price: z
    .string()
    .optional()
    .refine((val) => !val || (!isNaN(Number(val)) && Number(val) >= 0), "Price must be a valid positive number"),

  purchase_price: z
    .string()
    .optional()
    .refine((val) => !val || (!isNaN(Number(val)) && Number(val) >= 0), "Purchase price must be valid"),

  supplier_id: z.string().optional(),
  reorder_level: z
    .string()
    .optional()
    .refine((val) => !val || (!isNaN(Number(val)) && Number(val) >= 0), "Reorder level must be valid"),

  sample_type: z.string().optional(),
  description: z.string().optional(),
  modality_type: z.string().optional(),
  manufacturer: z.string().optional(),
  model_number: z.string().optional(),
  serial_number: z.string().optional(),
  is_portable: z.enum(["true", "false"]),
});

export type ItemFormValues = z.infer<typeof itemSchema>;
