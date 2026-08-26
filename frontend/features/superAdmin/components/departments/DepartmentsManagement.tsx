"use client";

import { Badge, Card } from "@/app/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { DataTable } from "@/app/components/common/DataTable";
import { getDepartmentColumns } from "./Column";
import { Layers } from "lucide-react";

// Search, sort, reset, the "+ Add a Filter" custom builder, and the Tenant
// picker now live in the breadcrumb row (AdaptiveFilterTrigger/
// AdaptiveSortTrigger/AdaptiveResultCount, rendered by SuperAdminDashboard)
// — this stays a header (title + create button) wrapped around a DataTable
// over whatever pre-filtered/sorted `rows` it's given.
export function DepartmentsManagement({
  selected,
  rows,
  setSelectedDepartmentId,
  setSection,
  setConfirmAction,
  busy,
}: any) {
  const departmentColumns = getDepartmentColumns({
    setSelectedDepartmentId,
    setSection,
    setConfirmAction,
  });

  return (
    <div className="mt-3">
      <Card className="pt-2">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <div className="flex">
              <h3 className="card-title font-bold mr-3">
                Medical Departments
              </h3>
              <Badge tone="blue" className="normal-label">
                {rows.length} departments
              </Badge>
            </div>
            <p className="card-desc text-slate-500">
              {selected?.is_primary
                ? "Primary tenant medical departments are global templates. Assign templates to customer tenants to keep clinical routing consistent."
                : "Manage tenant medical departments used for practitioner mapping, schedules, and appointment booking."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CreateActionButton
              label="Create Department"
              onClick={() => setSection("departmentCreate")}
            />
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <div className="min-w-[980px]">
            <DataTable
              columns={departmentColumns}
              data={rows}
              loading={busy && rows.length === 0}
              paginate
              pageSize={8}
              emptyMessage="No medical departments match your search."
              emptyDescription="Medical departments created for this tenant will show up here."
              emptyIcon={Layers}
              minBodyHeight={`${rows.length > 0 ? "" : "220px"}`}
              onRowClick={(department) => {
                setSelectedDepartmentId(department.id);
                setSection("departmentEdit");
              }}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
