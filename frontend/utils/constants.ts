import { Column } from "./tenantAdmin/types";

export const pageSize = 10;


export const USER_COLUMNS: Column[] = [
  { label: "Name", width: "min-w-[180px]" },
  { label: "Status", width: "min-w-[120px]" },
  { label: "Roles", width: "min-w-[200px]" },
  { label: "Email", width: "min-w-[230px]" },
  { label: "Branch", width: "min-w-[180px]" },
  // { label: "Created", width: "min-w-[100px]" },
  { label: "Actions", width: "min-w-[240px]" },
];


export const ROLE_COLUMNS: Column[] = [
  { label: "Role", width: "min-w-[200px]" },
  { label: "Key", width: "min-w-[180px]" },
  { label: "Status", width: "min-w-[140px]" },
  { label: "Modified", width: "min-w-[140px]" },
  { label: "Actions", width: "min-w-[160px]" },
];

export const DEPARTMENT_COLUMNS = [
  { label: "Medical Department", width: "min-w-[200px]" },
  { label: "Code", width: "min-w-[160px]" },
  { label: "Branches", width: "min-w-[200px]" },
  { label: "Status", width: "min-w-[120px]" },
  { label: "Actions", width: "min-w-[160px]" },
];

// Branch
export const BRANCH_COLUMNS: Column[] = [
  { label: "Name", width: "min-w-[200px]" },
  { label: "Code", width: "min-w-[100px]" },
  { label: "Location", width: "min-w-[260px]" },
  { label: "Status", width: "min-w-[120px]" },
  { label: "Actions", width: "min-w-[160px]" },
];

// Supplier
export const SUPPLIER_COLUMNS: Column[] = [
  { label: "Name", width: "min-w-[220px]" },
  { label: "GSTIN", width: "min-w-[160px]" },
  { label: "Contact", width: "min-w-[260px]" },
  { label: "Status", width: "min-w-[120px]" },
  { label: "Actions", width: "min-w-[160px]" },
];

// Tax Rules
export const TAX_RULE_COLUMNS: Column[] = [
  { label: "Name", width: "min-w-[180px]" },
  { label: "Scope", width: "min-w-[260px]" },
  { label: "Tax", width: "min-w-[140px]" },
  { label: "Status", width: "min-w-[120px]" },
  { label: "Actions", width: "min-w-[160px]" },
];

// Discount Offers
export const DISCOUNT_OFFER_COLUMNS: Column[] = [
  { label: "Offer", width: "min-w-[140px]" },
  { label: "Scope", width: "min-w-[260px]" },
  { label: "Value", width: "min-w-[200px]" },
  { label: "Status", width: "min-w-[100px]" },
  { label: "Actions", width: "min-w-[160px]" },
];


export const PLAN_COLUMNS: Column[] = [
  { label: "Plan", width: "min-w-[220px]" },
  { label: "Price", width: "min-w-[140px]" },
  { label: "Duration", width: "min-w-[140px]" },
  { label: "Consults", width: "min-w-[120px]" },
  { label: "Status", width: "min-w-[140px]" },
  { label: "Actions", width: "min-w-[180px]" },
];


export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];
