import type { TableSchema } from "@/app/components/common/AdaptiveFilterBar";
import { status_options } from "../superAdmin/constants";

type DoctorSchemaParams = {
  branches: any[];
  departments: any[];
};

export function getDoctorTableSchema({
  branches,
  departments,
}: DoctorSchemaParams): TableSchema {
  return {
    id: "doctors",
    searchLabel: "Doctors",
    searchPlaceholder: "Search doctors",
    filters: [
      {
        key: "branch",
        label: "Branch",
        options: [
          { value: "all", label: "All branches" },
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
          { value: "all", label: "All departments" },
          ...departments.map((department: any) => ({
            value: department.id,
            label: department.name,
          })),
        ],
      },
      {
        key: "status",
        label: "Status",
        options: status_options,
      },
    ],
    sortFields: [
      { key: "full_name", label: "Doctor name" },
      { key: "practitioner_type", label: "Type" },
      { key: "status", label: "Status" },
      { key: "updated_at", label: "Last updated" },
    ],
  };
}
