"use client";

import { Badge, Card } from "@/app/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { DataTable } from "@/app/components/common/DataTable";
import { getUserColumns } from "./Column";
import { Users } from "lucide-react";

// Search, sort, reset, the "+ Add a Filter" custom builder, and the Tenant
// picker now live in the breadcrumb row (AdaptiveFilterTrigger/
// AdaptiveSortTrigger/AdaptiveResultCount, rendered by SuperAdminDashboard)
// — this stays a header (title + create button) wrapped around a DataTable
// over whatever pre-filtered/sorted `rows` it's given.
export function TenantUsers({
  rows,
  canCopyIds = false,
  setSelectedUserId,
  setSection,
  setConfirmAction,
  busy,
}: any) {
  const userColumns = getUserColumns({
    canCopyIds,
    setSelectedUserId,
    setSection,
    setConfirmAction,
  });

  return (
    <div className="mt-3">
      <Card className="pt-2">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <div className="flex ">
              <h3 className="card-title font-bold mr-3">Users</h3>
              <Badge tone="blue" className="normal-label">
                {rows.length} users
              </Badge>
            </div>
            <p className="card-desc text-slate-500">
              Create, edit, activate/deactivate, and search tenant users.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CreateActionButton
              label="Create User"
              onClick={() => setSection("userCreate")}
            />
          </div>
        </div>
        <div className="mt-4 overflow-x-auto scrollbar-hidden rounded-lg border border-slate-200 ">
          <div className="min-w-[1000px]">
            <DataTable
              columns={userColumns}
              data={rows}
              loading={busy && rows.length === 0}
              paginate
              pageSize={8}
              emptyMessage="No users match your search."
              emptyDescription="Users added for this tenant will show up here."
              emptyIcon={Users}
              minBodyHeight={`${rows.length > 0 ? "" : "220px"}`}
              onRowClick={(user) => {
                setSelectedUserId(user.id);
                setSection("userEdit");
              }}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
