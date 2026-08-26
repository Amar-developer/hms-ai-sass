"use client";

import { Badge, Card } from "@/app/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { DataTable } from "@/app/components/common/DataTable";
import { getTenantColumns } from "./Column";
import { Landmark } from "lucide-react";

// Search, sort, reset, and the "+ Add a Filter" custom builder now live in
// the breadcrumb row (AdaptiveFilterTrigger/AdaptiveSortTrigger/
// AdaptiveResultCount, rendered by SuperAdminDashboard) — this stays a
// header (title + create button) wrapped around a DataTable over whatever
// pre-filtered/sorted `rows` it's given.
export function TenantManagement({
  rows,
  setSelectedId,
  setSection,
  switchTenant,
  apiSession,
  canCopyIds = false,
  busy,
  suspendTenant,
}: any) {
  const tenantColumns = getTenantColumns({
    setSelectedId,
    setSection,
    switchTenant,
    apiSession,
    canCopyIds,
    busy,
    suspendTenant,
  });

  return (
    <div className="mt-3">
      <Card className="pt-2">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <div className="flex ">
              <h3 className="text-lg font-bold mr-2">Tenants</h3>
              <Badge tone="blue" className="normal-label">
                {rows.length} tenants
              </Badge>
            </div>
            <p className="card-desc text-slate-500">
              Active and trial tenants appear here. Deactivated tenants are
              suspended and hidden from this workspace.
            </p>
          </div>
          <div className="flex items-center gap-2 ">
            <CreateActionButton
              label="Create Tenant"
              onClick={() => setSection("createTenant")}
            />
          </div>
        </div>
        <div className="mt-4 overflow-x-auto scrollbar-hidden rounded-lg border border-slate-200">
          <div className="min-w-[980px]">
            <DataTable
              columns={tenantColumns}
              data={rows}
              loading={busy && rows.length === 0}
              paginate
              pageSize={8}
              emptyMessage="No tenants match your search."
              emptyDescription="Tenants onboarded to this workspace will show up here."
              emptyIcon={Landmark}
              minBodyHeight={`${rows.length > 0 ? "" : "220px"}`}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
