"use client";

import { useEffect, useState } from "react";
import {  Card, Input, RefreshButton } from "@/app/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";
import { TenantPicker } from "../shared/TenantPicker";
import { Pagination } from "@/app/components/common/Pagination";
import { FormField } from "@/app/components/FormElements";
import { DataTable } from "@/app/components/common/DataTable";
import { getBranchColumns } from "./Column";

export function BranchesManagement({
  tenants,
  selectedId,
  setSelectedId,
  selected,
  branches,
  canCopyIds = false,
  setSelectedBranchId,
  setSection,
  setConfirmAction,
  onRefresh,
  busy,
}: any) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const filtered = branches.filter((branch: any) =>
    [
      branch.name,
      branch.code,
      branch.area,
      branch.city,
      branch.state,
      branch.is_active ? "active" : "inactive",
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
  }, [query, branches.length]);

  const branchColumns = getBranchColumns({
    canCopyIds,
    setSelectedBranchId,
    setSection,
    setConfirmAction,
  });

  return (
    <div className="mt-3">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h3 className="card-title font-bold">Branches</h3>
            <p className="card-desc text-slate-500">
              {selected?.is_primary
                ? "Primary tenant branches are reusable templates. Assign them to clinics to avoid duplicate setup."
                : "Manage tenant branches used by appointments, users, billing, lab, pharmacy, and reports."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh ? <RefreshButton onRefresh={onRefresh} /> : null}
            <CreateActionButton
              label="Create Branch"
              onClick={() => setSection("branchCreate")}
            />
          </div>
        </div>
        <div className="mt-4 grid gap-1 md:grid-cols-3">
          <FormField label="Search">
            <Input
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              placeholder="Search branch name, code, area, city, status"
            />
          </FormField>
          <TenantPicker
            tenants={tenants}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200">
          {busy && rows.length === 0 ? (
            <TableSkeleton />
          ) : (
            <DataTable
              columns={branchColumns}
              data={rows}
              emptyMessage="No branches match your search."
              onRowClick={(branch) => {
                setSelectedBranchId(branch.id);
                setSection("branchEdit");
              }}
            />
          )}
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
