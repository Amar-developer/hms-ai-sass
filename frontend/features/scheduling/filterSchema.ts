import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import { status_options } from "../superAdmin/constants";
import { weekdays } from "./constants";

type ScheduleSchemaParams = {
  branches: any[];
  departments: any[];
};

export function getScheduleTableSchema({
  branches,
  departments,
}: ScheduleSchemaParams): TableSchema {
  return {
    id: "scheduling",
    searchLabel: "Search",
    searchPlaceholder: "Search by doctor or department",
    filters: [
      {
        key: "branch",
        label: "Branch",
        options: [
          { value: "all", label: "All Branches" },
          ...branches.map((branch: any) => ({
            value: branch.id,
            label: branch.name,
          })),
        ],
      },
      {
        key: "department",
        label: "Department",
        options: [
          { value: "all", label: "All Departments" },
          ...departments.map((department: any) => ({
            value: department.id,
            label: department.name,
          })),
        ],
      },
      {
        key: "weekday",
        label: "Weekday",
        options: [
          { value: "all", label: "All days" },
          ...weekdays.map(([value, label]) => ({ value, label })),
        ],
      },
      {
        key: "status",
        label: "Status",
        options: status_options,
      },
    ],
    sortFields: [
      { key: "doctor", label: "Doctor" },
      { key: "branch", label: "Branch" },
      { key: "department", label: "Department" },
      { key: "status", label: "Status" },
      { key: "updated_at", label: "Last updated" },
    ],
  };
}
