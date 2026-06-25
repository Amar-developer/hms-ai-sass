"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Input, RefreshButton } from "@/app/components/common/ui";
import { formatDate } from "@/utils/superAdmin/superAdmin";
import { CreateActionButton } from "../shared/CreateActionButton";
import {Empty} from "@/app/components/admin/Empty";
import { Pagination } from "@/app/components/admin/Pagination";
import { TenantPicker } from "../shared/TenantPicker";

export function BranchesManagement({
  tenants,
  selectedId,
  setSelectedId,
  selected,
  branches,
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

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-base lg:text-lg font-bold">Branches</h3>
          <p className="text-xs lg:text-sm text-slate-500">
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
      <div className="mt-4 grid gap-1 md:grid-cols-2 :grid-cols-[1fr_280px]">
        <Input
          value={query}
          onChange={(e: any) => setQuery(e.target.value)}
          placeholder="Search branch name, code, area, city, status"
          className="rounded-lg px-2 py-2 lg:px-4 lg:py-1 text-xs lg:text-sm w-2/3 lg:w-[40%] mt-5"
        />
        <TenantPicker
          tenants={tenants}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className="hidden grid-cols-[1.1fr_.8fr_1.3fr_.5fr_.8fr_1.2fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 md:grid">
          <span>Branch</span>
          <span>Code</span>
          <span>Location</span>
          <span>Status</span>
          <span>Modified</span>
          <span>Actions</span>
        </div>
        <div className="divide-y divide-slate-200">
          {rows.length === 0 && <Empty text="No branches match your search." />}
          {rows.map((branch: any) => {
            const locked =
              branch.is_template_locked || branch.source_template_branch_id;
            return (
              <div
                key={branch.id}
                className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1.1fr_.7fr_1.3fr_.7fr_.8fr_1.2fr]
                lg:grid-cols-[1.1fr_.8fr_1.2fr_.5fr_.8fr_1.2fr] md:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-xs lg:text-sm">{branch.name}</b>
                    {branch.is_global_template && (
                      <Badge tone="blue">Global</Badge>
                    )}
                    {locked && <Badge tone="purple">Locked</Badge>}
                  </div>
                  <p className="break-all text-[10px] lg:text-xs text-slate-500">
                    {branch.id}
                  </p>
                </div>
                <span className="text-xs lg:text-sm">{branch.code}</span>
                <span className="text-xs lg:text-sm text-slate-500">
                  {[branch.address, branch.area, branch.city, branch.state]
                    .filter(Boolean)
                    .join(", ") || "-"}
                </span>
                <Badge
                  tone={branch.is_active ? "green" : "red"}
                  className="rounded-full py-1 px-1 text-xs lg:text-sm"
                >
                  {branch.is_active ? "Active" : "Inactive"}
                </Badge>
                <span className="text-xs lg:text-sm">
                  {formatDate(branch.updated_at || branch.created_at)}
                </span>
                <div className="flex flex-wrap gap-2">
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBranchId(branch.id);
                        setSection("branchEdit");
                      }}
                      className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBranchId(branch.id);
                      setSection("branchAssign");
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
                          entity: "branch",
                          kind: "status",
                          branch,
                        })
                      }
                      className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
                    >
                      {branch.is_active ? "Inactive" : "Active"}
                    </button>
                  )}
                  {!locked && (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmAction({
                          entity: "branch",
                          kind: "delete",
                          branch,
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
