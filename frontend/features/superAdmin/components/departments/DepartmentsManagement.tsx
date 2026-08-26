"use client";

import { useEffect, useState } from "react";
import { Card, Input, RefreshButton } from "@/app/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";
import { TenantPicker } from "../shared/TenantPicker";
import { Pagination } from "@/app/components/common/Pagination";
import { FormField } from "@/app/components/FormElements";
import { DataTable } from "@/app/components/common/DataTable";
import { getDepartmentColumns } from "./Column";
import { Layers } from "lucide-react";

export function DepartmentsManagement({
  tenants,
  selectedId,
  setSelectedId,
  selected,
  departments,
  setSelectedDepartmentId,
  setSection,
  setConfirmAction,
  onRefresh,
  busy,
}: any) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const filtered = departments.filter((department: any) =>
    [
      department.name,
      department.code,
      department.description,
      department.is_active ? "active" : "inactive",
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, departments.length]);

  const  departmentColumns = getDepartmentColumns({
    setSelectedDepartmentId,
    setSection,
    setConfirmAction
  })

  return (
    <div className="mt-3">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h3 className="card-title font-bold">Medical Departments</h3>
            <p className="card-desc text-slate-500">
              {selected?.is_primary
                ? "Primary tenant medical departments are global templates. Assign templates to customer tenants to keep clinical routing consistent."
                : "Manage tenant medical departments used for practitioner mapping, schedules, and appointment booking."}
            </p>
          </div>
          <div className="flex items-center justify-start gap-2 w-[80%] lg:w-[30%]">
            {onRefresh ? <RefreshButton onRefresh={onRefresh} /> : null}
            <CreateActionButton
              label="Create Department"
              onClick={() => setSection("departmentCreate")}
            />
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3 ">
          <FormField label="Search">
            <Input
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              placeholder="Search medical department name, code, status"
            />
          </FormField>
          <TenantPicker
            tenants={tenants}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <div className="min-w-[980px]">
            {busy && rows.length === 0 ? (
              <TableSkeleton />
            ) : (
              <DataTable
                columns={departmentColumns}
                data={rows}
                emptyMessage="No medical departments match your search."
                emptyDescription="Medical departments created for this tenant will show up here."
                emptyIcon={Layers}
                minBodyHeight={`${rows.length > 0 ?'':'220px'}`}
                onRowClick={(department) => {
                  setSelectedDepartmentId(department.id);
                  setSection("departmentEdit");
                }}
              />
            )}
          </div>
        </div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={pageSize}
          onPage={setPage}
        />
      </Card>
    </div>
  );
}
