"use client";

import { Badge, Card } from "@/app/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { DataTable } from "@/app/components/common/DataTable";
import { getRoleColumns } from "./Column";
import { ShieldCheck } from "lucide-react";

// Search, sort, reset, the "+ Add a Filter" custom builder, and the Tenant
// picker now live in the breadcrumb row (AdaptiveFilterTrigger/
// AdaptiveSortTrigger/AdaptiveResultCount, rendered by SuperAdminDashboard)
// — this stays a header (title + create button) wrapped around a DataTable
// over whatever pre-filtered/sorted `rows` (already grouped by name) it's
// given.
export function RolesManagement({
  selected,
  rows,
  canCopyIds = false,
  setSelectedRoleId,
  setSection,
  setConfirmAction,
  busy,
}: any) {
  const openRole = (role: any, sectionId = "rolePermissions") => {
    setSelectedRoleId(role.primary.id);
    setSection(sectionId);
  };

  const roleColumns = getRoleColumns({
    canCopyIds,
    openRole,
    setConfirmAction,
  });

  return (
    <div className="mt-3">
      <Card className="pt-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex">
              <h3 className="card-title font-bold mr-3">Roles</h3>
              <Badge
                tone={selected?.is_primary ? "blue" : "slate"}
                className="normal-label"
              >
                {selected?.is_primary
                  ? "Global templates"
                  : `${rows.length} roles`}
              </Badge>
            </div>
            <p className="card-desc text-slate-500">
              {selected?.is_primary
                ? "Primary tenant roles are global templates. Assign templates to customer tenants to avoid duplicate setup."
                : "Create, edit, deactivate, and search tenant roles with latest changes shown first."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CreateActionButton
              label="Create Role"
              onClick={() => setSection("roleCreate")}
            />
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <div className="min-w-[720px]">
            <DataTable
              columns={roleColumns}
              data={rows}
              loading={busy && rows.length === 0}
              paginate
              pageSize={8}
              emptyMessage="No roles match your search."
              emptyDescription="Roles created for this tenant will show up here."
              emptyIcon={ShieldCheck}
              minBodyHeight={`${rows.length > 0 ? "" : "220px"}`}
              onRowClick={(role) => openRole(role)}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
