"use client";

import { Card, Select } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";

type DepartmentFilterCardProps = {
  departmentId: string;
  setDepartmentId: (value: string) => void;
  departmentOptions: any[];
  title?: string;
  disabled?: boolean;
};

export function DepartmentFilterCard({
  departmentId,
  setDepartmentId,
  departmentOptions,
  title = "Medical Department",
  disabled = false,
}: DepartmentFilterCardProps) {
  if (!departmentOptions.length) return null;

  return (
    <Card className="px-4 py-3">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">
            {departmentOptions.find((department: any) => department.id === departmentId)
              ?.name || "Assigned medical department"}
          </p>
        </div>
        <div className="w-full md:w-80">
          <FormField label="Department">
            <Select
              value={departmentId}
              onChange={(event: any) => setDepartmentId(event.target.value)}
              disabled={disabled}
            >
              {departmentOptions.map((department: any) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </div>
    </Card>
  );
}
