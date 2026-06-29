import { Column } from "./tenantAdmin/types";

export const pageSize = 10;


export const USER_COLUMNS: Column[] = [
  { label: "Name", width: "min-w-[200px]" },
  { label: "Email", width: "min-w-[220px]" },
  { label: "Roles", width: "min-w-[200px]" },
  { label: "Branch", width: "min-w-[180px]" },
  { label: "Status", width: "min-w-[120px]" },
  { label: "Created", width: "min-w-[100px]" },
  { label: "Actions", width: "min-w-[140px]" },
];


export const ROLE_COLUMNS: Column[] = [
  { label: "Role", width: "1.2fr" },
  { label: "Key", width: "1fr" },
  { label: "Status", width: "1fr" },
  { label: "Modified", width: "1fr" },
  { label: "Actions", width: "1.3fr" },
];
