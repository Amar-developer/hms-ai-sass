"use client";

import { Badge, Card } from "@/app/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { DataTable } from "@/app/components/common/DataTable";
import { getUserColumns } from "./Column";
import { Users } from "lucide-react";
import DataHeader from "@/app/components/common/DataHeader";

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
      <Card className="">
        <DataHeader
          title="Users"
          description="Create, edit, activate/deactivate, and search tenant users."
          buttonText="Create User"
          cardIcon={Users}
          open={()=>setSection('userCreate')}
          count={rows.length}
        />
          <div className="table-wrapper-width">
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
              className="table-width"
            />
          </div>
      </Card>
  );
}
