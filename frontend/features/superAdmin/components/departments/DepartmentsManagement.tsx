"use client";

import { Badge, Card } from "@/app/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { DataTable } from "@/app/components/common/DataTable";
import { getDepartmentColumns } from "./Column";
import { ClipboardList, Layers } from "lucide-react";
import DataHeader from "@/app/components/common/DataHeader";

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
    <Card className="">
      <DataHeader
        title="Medical Departments"
        description={
          selected?.is_primary
            ? "Primary tenant medical departments are global templates. Assign templates to customer tenants to keep clinical routing consistent."
            : "Manage tenant medical departments used for practitioner mapping, schedules, and appointment booking."
        }
        buttonText="Create Department"
        cardIcon={ClipboardList}
        open={() => setSection("departmentCreate")}
        count={rows.length}
      />

      <div className="table-wrapper-width">
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
          className="table-width"
        />
      </div>
    </Card>
  );
}
