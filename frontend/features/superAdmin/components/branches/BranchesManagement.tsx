"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Input, RefreshButton } from "@/app/components/common/ui";
import { formatDate } from "../../helpers";
import { CreateActionButton } from "../shared/CreateActionButton";
import { Empty } from "@/app/components/common/Empty";
import { TenantPicker } from "../shared/TenantPicker";
import { Pagination } from "@/app/components/common/Pagination";
import { FormField } from "@/app/components/FormElements";
import { CopyIdButton } from "@/app/components/common/CopyIdButton";
import { RowActions } from "@/features/admin/components/RowActions";
import { Column } from "@/features/reports/types";
import { DataTable } from "@/features/reports/components/DataTable";

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

  const branchColumns: Column<any>[] = [
    {
      key: "name",
      header: "Branch",
      width:'250px',
      render: (branch: any) => {
        const locked =
          branch.is_template_locked || branch.source_template_branch_id;

        return (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-xs lg:text-sm">{branch.name}</b>

              <CopyIdButton
                value={branch.id}
                label="Branch ID"
                allowed={canCopyIds}
              />

              {branch.is_global_template && <Badge tone="blue">Global</Badge>}

              {locked && <Badge tone="purple">Locked</Badge>}
            </div>
          </div>
        );
      },
    },

    {
      key: "code",
      header: "Code",
      width:'150px',
      render: (branch: any) => (
        <span className="text-xs lg:text-sm">{branch.code}</span>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      width:'180px',
      className:'text-center',
      render: (branch: any) => (
        <Badge
          tone={branch.is_active ? "green" : "red"}
          className="rounded-full py-1 px-1 text-xs lg:text-sm"
        >
          {branch.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },

    {
      key: "updated_at",
      header: "Modified",
      width:'180px',
      render: (branch: any) => (
        <span className="text-xs lg:text-sm">
          {formatDate(branch.updated_at || branch.created_at)}
        </span>
      ),
    },

    {
      key: "actions",
      header: "Actions",
      disableRowClick: true,
      render: (branch: any) => {
        const locked =
          branch.is_template_locked || branch.source_template_branch_id;

        const actions = [
          {
            label: "Edit",
            hidden: locked,
            onClick: () => {
              setSelectedBranchId(branch.id);
              setSection("branchEdit");
            },
          },

          {
            label: "Assign",
            onClick: () => {
              setSelectedBranchId(branch.id);
              setSection("branchAssign");
            },
          },

          {
            label: branch.is_active ? "Inactive" : "Active",
            hidden: locked,
            onClick: () =>
              setConfirmAction({
                entity: "branch",
                kind: "status",
                branch,
              }),
          },

          {
            label: "Delete",
            danger: true,
            hidden: locked,
            onClick: () =>
              setConfirmAction({
                entity: "branch",
                kind: "delete",
                branch,
              }),
          },
        ];

        return <RowActions actions={actions} className="right-5 -bottom-7" />;
      },
    },
  ];

  return (
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
          <DataTable
            columns={branchColumns}
            data={rows}
            emptyMessage="No branches match your search."
            onRowClick={(branch) => {
              setSelectedBranchId(branch.id);
              setSection("branchEdit");
            }}
          />
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
