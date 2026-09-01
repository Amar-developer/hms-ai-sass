"use client";

import { Badge, Card } from "@/app/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { DataTable } from "@/app/components/common/DataTable";
import { getBranchColumns } from "./Column";
import { Building2 } from "lucide-react";
import DataHeader from "@/app/components/common/DataHeader";

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
        <DataHeader
          title="Branches"
          description={selected?.is_primary
                ? "Primary tenant branches are reusable templates. Assign them to clinics to avoid duplicate setup."
                : "Manage tenant branches used by appointments, users, billing, lab, pharmacy, and reports."}
          buttonText="Create Branch"
          cardIcon={Building2}
          open={() => setSection("branchCreate")}
          count={rows.length}
        />
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
