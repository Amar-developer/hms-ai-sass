import { z } from "zod";

export const expenseFormSchema = z.object({
  category: z.enum([
    "rent",
    "utilities",
    "supplies",
    "travel",
    "maintenance",
    "other",
  ]),
  subcategory: z.string().trim().min(1, "Please enter a sub category"),
  amount: z
    .string()
    .min(1, "Please enter an amount")
    .refine((value) => Number(value) > 0, "Amount must be greater than 0"),
  incurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Please select a date"),
  branchId: z.string().min(1, "Please select a branch"),
  description: z.string().trim().min(1, "Please describe the expense"),
});

export type ExpenseFormSchemaValues = z.infer<typeof expenseFormSchema>;
