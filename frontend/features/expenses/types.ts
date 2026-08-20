export type ExpenseStatus = "pending" | "approved" | "rejected" | "reimbursed";

export type ExpenseCategory =
  | "rent"
  | "utilities"
  | "supplies"
  | "travel"
  | "maintenance"
  | "other";

export type Expense = {
  id: string;
  branchId: string | null;
  branchName: string;
  category: ExpenseCategory;
  subcategory: string | null;
  amount: number;
  currency: string;
  incurredOn: string;
  description: string;
  status: ExpenseStatus;
  submittedBy: string;
  approvedBy?: string;
  rejectionReason?: string;
  receiptName?: string;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseFormValues = {
  category: ExpenseCategory;
  subcategory: string;
  amount: string;
  incurredOn: string;
  branchId: string;
  description: string;
};
