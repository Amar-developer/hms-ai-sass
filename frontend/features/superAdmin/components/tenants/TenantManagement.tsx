"use client";

import { useMemo, useState } from "react";
import { Card } from "@/app/components/common/ui";
import { CreateActionButton } from "../shared/CreateActionButton";
import { SettingsWorkspaceHeader } from "../shared/SettingsWorkspaceHeader";
import { DataTable } from "@/app/components/common/DataTable";
import { getTenantColumns } from "./Column";
import { Building2, Clock3, Landmark, ShieldCheck } from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"all" | "active" | "trial">(
    "all",
  );
  const tenantColumns = getTenantColumns({
    setSelectedId,
    setSection,
    switchTenant,
    apiSession,
    canCopyIds,
    busy,
    suspendTenant,
  });
  const tabRows = useMemo(
    () =>
      activeTab === "all"
        ? rows
        : rows.filter((tenant: any) => tenant.status === activeTab),
    [activeTab, rows],
  );
  const tabs = [
    { id: "all" as const, label: "All Tenants", icon: Building2, count: rows.length },
    {
      id: "active" as const,
      label: "Active",
      icon: ShieldCheck,
      count: rows.filter((tenant: any) => tenant.status === "active").length,
    },
    {
      id: "trial" as const,
      label: "Trial",
      icon: Clock3,
      count: rows.filter((tenant: any) => tenant.status === "trial").length,
    },
  ];

  return (
    <div className="space-y-3">
      <SettingsWorkspaceHeader<"all" | "active" | "trial">
        icon={Landmark}
        title="Tenant Workspace"
        description="Onboard, review, and manage healthcare tenant organizations."
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        actions={
          <CreateActionButton
            label="Create Tenant"
            onClick={() => setSection("createTenant")}
          />
        }
      />
      <Card className="pt-2">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h3 className="card-title font-bold">
              {tabs.find((tab) => tab.id === activeTab)?.label}
            </h3>
            <p className="card-desc text-slate-500">
              {activeTab === "all"
                ? "Active and trial tenants appear here. Suspended tenants remain hidden."
                : `Showing ${activeTab} tenant organizations.`}
            </p>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto scrollbar-hidden rounded-lg border border-slate-200">
          <div className="min-w-[980px]">
            <DataTable
              columns={tenantColumns}
              data={tabRows}
              loading={busy && tabRows.length === 0}
              paginate
              pageSize={8}
              emptyMessage="No tenants match your search."
              emptyDescription="Tenants onboarded to this workspace will show up here."
              emptyIcon={Landmark}
              minBodyHeight={`${tabRows.length > 0 ? "" : "220px"}`}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
