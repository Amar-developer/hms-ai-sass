"use client";

import { Badge, Card } from "@/app/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { DataTable } from "@/app/components/common/DataTable";
import { getBranchColumns } from "./Column";
import { Building2 } from "lucide-react";

// Search, sort, reset, the "+ Add a Filter" custom builder, and the Tenant
// picker now live in the breadcrumb row (AdaptiveFilterTrigger/
// AdaptiveSortTrigger/AdaptiveResultCount, rendered by SuperAdminDashboard)
// — this stays a header (title + create button) wrapped around a DataTable
// over whatever pre-filtered/sorted `rows` it's given.
export function BranchesManagement({
  selected,
  rows,
  canCopyIds = false,
  setSelectedBranchId,
  setSection,
  setConfirmAction,
  busy,
}: any) {
  const branchColumns = getBranchColumns({
    canCopyIds,
    setSelectedBranchId,
    setSection,
    setConfirmAction,
  });

  return (
    <div className="mt-3">
      <Card className="pt-2">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <div className="flex">
              <h3 className="card-title font-bold mr-3">Branches</h3>
              <Badge tone="blue" className="normal-label">
                {rows.length} branches
              </Badge>
            </div>
            <p className="card-desc text-slate-500">
              {selected?.is_primary
                ? "Primary tenant branches are reusable templates. Assign them to clinics to avoid duplicate setup."
                : "Manage tenant branches used by appointments, users, billing, lab, pharmacy, and reports."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CreateActionButton
              label="Create Branch"
              onClick={() => setSection("branchCreate")}
            />
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-slate-200">
          <DataTable
            columns={branchColumns}
            data={rows}
            loading={busy && rows.length === 0}
            paginate
            pageSize={8}
            emptyMessage="No branches match your search."
            emptyDescription="Branches added for this tenant will show up here."
            emptyIcon={Building2}
            minBodyHeight={`${rows.length > 0 ? "" : "220px"}`}
            onRowClick={(branch) => {
              setSelectedBranchId(branch.id);
              setSection("branchEdit");
            }}
          />
        </div>
      </Card>
    </div>
  );
}
