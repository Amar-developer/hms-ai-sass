"use client";

import { Card, SearchableSelect } from "@/app/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { SettingsWorkspaceHeader } from "../shared/SettingsWorkspaceHeader";
import { DataTable } from "@/app/components/common/DataTable";
import { getRoleColumns } from "./Column";
import { ShieldCheck, UserRoundCog, UsersRound } from "lucide-react";

export function RolesManagement({
  selected,
  tenants,
  selectedId,
  setSelectedId,
  rows,
  canCopyIds = false,
  setSelectedRoleId,
  setSection,
  setConfirmAction,
  busy,
}: any) {
  const primaryTenant = tenants.find((tenant: any) => tenant.is_primary);
  const customerTenants = tenants.filter((tenant: any) => !tenant.is_primary);
  const activeTab: "templates" | "tenant" = selected?.is_primary
    ? "templates"
    : "tenant";

  function changeTab(tab: "templates" | "tenant") {
    if (tab === "templates" && primaryTenant) {
      setSelectedId(primaryTenant.id);
    }
    if (tab === "tenant" && customerTenants.length > 0) {
      setSelectedId(
        customerTenants.some((tenant: any) => tenant.id === selectedId)
          ? selectedId
          : customerTenants[0].id,
      );
    }
  }

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
    <div className="space-y-3">
      <SettingsWorkspaceHeader
        icon={UserRoundCog}
        title="Role Workspace"
        description="Manage reusable role templates and tenant-specific access roles."
        tabs={[
          {
            id: "templates",
            label: "Global Templates",
            icon: ShieldCheck,
            count: activeTab === "templates" ? rows.length : undefined,
          },
          {
            id: "tenant",
            label: "Tenant Roles",
            icon: UsersRound,
            count: activeTab === "tenant" ? rows.length : undefined,
          },
        ]}
        activeTab={activeTab}
        onTabChange={changeTab}
        actions={
          <div className="flex items-center gap-2">
            {activeTab === "tenant" && (
              <SearchableSelect
                value={selectedId}
                onChange={setSelectedId}
                options={customerTenants.map((tenant: any) => ({
                  value: tenant.id,
                  label: tenant.name,
                }))}
                searchable={false}
                placeholder="Select tenant"
                className="w-[190px]"
              />
            )}
            <CreateActionButton
              label="Create Role"
              onClick={() => setSection("roleCreate")}
            />
          </div>
        }
      />
      <Card className="pt-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="card-title font-bold">
              {activeTab === "templates" ? "Global Role Templates" : selected?.name}
            </h3>
            <p className="card-desc text-slate-500">
              {selected?.is_primary
                ? "Primary tenant roles are global templates. Assign templates to customer tenants to avoid duplicate setup."
                : "Create, edit, deactivate, and search tenant roles with latest changes shown first."}
            </p>
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
