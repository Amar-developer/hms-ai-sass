"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Input, RefreshButton } from "@/app/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { Empty } from "@/app/components/common/Empty";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";
import { TenantPicker } from "../shared/TenantPicker";
import { displayDate } from "@/utils/helper";
import { Pagination } from "@/app/components/common/Pagination";
import { RowActions } from "@/features/admin/components/RowActions";
import { FormField } from "@/app/components/FormElements";
import { DataTable } from "@/app/components/common/DataTable";
import { Column } from "@/utils/types";

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

  const departmentColumns: Column<any>[] = [
    {
      key: "name",
      header: "Department",
      render: (department: any) => {
        const locked =
          department.is_template_locked ||
          department.source_template_department_id;

        return (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-xs lg:text-sm">{department.name}</b>

              {department.is_global_template && (
                <Badge tone="blue" className="table-status">
                  Global
                </Badge>
              )}

              {locked && (
                <Badge tone="purple" className="table-status">
                  Locked
                </Badge>
              )}
            </div>
          </div>
        );
      },
    },

    {
      key: "code",
      header: "Code",
      render: (department: any) => (
        <span className="text-xs lg:text-sm">{department.code}</span>
      ),
    },

    {
      key: "is_active",
      header: "Status",
      render: (department: any) => (
        <Badge
          tone={department.is_active ? "green" : "red"}
          className="table-status w-[60%]"
        >
          {department.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },

    {
      key: "updated_at",
      header: "Modified",
      render: (department: any) => (
        <span className="text-xs lg:text-sm">
          {displayDate(department.updated_at || department.created_at)}
        </span>
      ),
    },

    {
      key: "actions",
      header: "Actions",
      disableRowClick: true,
      render: (department: any) => {
        const locked =
          department.is_template_locked ||
          department.source_template_department_id;

        return (
          <RowActions
            actions={[
              {
                label: "Edit",
                hidden: locked,
                onClick: () => {
                  setSelectedDepartmentId(department.id);
                  setSection("departmentEdit");
                },
              },
              {
                label: "Assign",
                onClick: () => {
                  setSelectedDepartmentId(department.id);
                  setSection("departmentAssign");
                },
              },
              {
                label: department.is_active ? "Inactive" : "Active",
                hidden: locked,
                onClick: () =>
                  setConfirmAction({
                    entity: "department",
                    kind: "status",
                    department,
                  }),
              },
              {
                label: "Delete",
                danger: true,
                hidden: locked,
                onClick: () =>
                  setConfirmAction({
                    entity: "department",
                    kind: "delete",
                    department,
                  }),
              },
            ]}
            className="right-40 -bottom-7"
          />
        );
      },
    },
  ];

  return (
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
  );
}
