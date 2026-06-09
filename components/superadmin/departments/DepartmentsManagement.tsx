"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Input } from "@/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { Empty } from "../shared/Empty";
import { Pagination } from "../shared/Pagination";
import { TenantPicker } from "../shared/TenantPicker";
import { displayDate } from "@/utils/helper";

export function DepartmentsManagement({
  tenants,
  selectedId,
  setSelectedId,
  selected,
  departments,
  setSelectedDepartmentId,
  setSection,
  setConfirmAction,
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

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-lg font-bold">Medical Departments</h3>
          <p className="text-sm text-slate-500">
            {selected?.is_primary
              ? "Primary tenant medical departments are global templates. Assign templates to customer tenants to keep clinical routing consistent."
              : "Manage tenant medical departments used for practitioner mapping, schedules, and appointment booking."}
          </p>
        </div>
        <div className="flex justify-start item-center">
          <CreateActionButton
          label="Create Medical Department"
          onClick={() => setSection("departmentCreate")}
        />
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3 ">
        <Input
          value={query}
          onChange={(e: any) => setQuery(e.target.value)}
          placeholder="Search medical department name, code, status"
          className='rounded-lg px-2 py-2 lg:px-4 lg:py-1 text-xs lg:text-sm w-2/3 mt-5'
        />      
        <TenantPicker
          tenants={tenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <div className="min-w-[1180px]">
          <div className="hidden grid-cols-[1.15fr_.65fr_1.35fr_.65fr_.7fr_1.65fr] items-center gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 md:grid">
            <span>Medical Department</span>
            <span>Code</span>
            <span>Description</span>
            <span>Status</span>
            <span>Modified</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-slate-200">
            {rows.length === 0 && (
              <Empty text="No medical departments match your search." />
            )}
            {rows.map((department: any) => {
              const locked =
                department.is_template_locked ||
                department.source_template_department_id;
              return (
                <div
                  key={department.id}
                  className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1.15fr_.65fr_1.35fr_.65fr_.7fr_1.65fr] md:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-xs lg:text-sm">{department.name}</b>
                      {department.is_global_template && (
                        <Badge tone="blue">Global</Badge>
                      )}
                      {locked && <Badge tone="purple">Locked</Badge>}
                    </div>
                    <p className="break-all text-[10px] lg:text-xs text-slate-500">
                      {department.id}
                    </p>
                  </div>
                  <span className="text-xs lg:text-sm">{department.code}</span>
                  <span className="text-slate-500 text-xs lg:text-sm">
                    {department.description || "-"}
                  </span>
                  <Badge tone={department.is_active ? "green" : "red"} >
                    {department.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <span className="text-xs lg:text-sm">
                    {displayDate(department.updated_at || department.created_at)}
                  </span>
                  <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDepartmentId(department.id);
                          setSection("departmentEdit");
                        }}
                        className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDepartmentId(department.id);
                        setSection("departmentAssign");
                      }}
                      className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
                    >
                      Assign
                    </button>
                    {!locked && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmAction({
                            entity: "department",
                            kind: "status",
                            department,
                          })
                        }
                        className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
                      >
                        {department.is_active ? "Inactive" : "Active"}
                      </button>
                    )}
                    {!locked && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmAction({
                            entity: "department",
                            kind: "delete",
                            department,
                          })
                        }
                        className="rounded-xl border px-3 py-2 text-xs font-bold text-red-600"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
