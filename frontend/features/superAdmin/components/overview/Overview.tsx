"use client";

import { useState } from "react";
import {
  Activity,
  Building2,
  CreditCard,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Metric } from "../shared/Metric";
import { SettingsWorkspaceHeader } from "../shared/SettingsWorkspaceHeader";

export function Overview({
  customerTenants,
  activeTenants,
  trialTenants,
  plans,
  estimatedRevenue,
  loading,
}: any) {
  const [activeTab, setActiveTab] = useState<"tenants" | "commercial">(
    "tenants",
  );

  return (
    <div className="space-y-3">
      <SettingsWorkspaceHeader<"tenants" | "commercial">
        icon={Activity}
        title="Platform Overview"
        description="Review tenant health and subscription performance."
        tabs={[
          { id: "tenants", label: "Tenant Health", icon: Building2 },
          { id: "commercial", label: "Plans & Revenue", icon: CreditCard },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      {activeTab === "tenants" && (
        <div className="grid gap-4 md:grid-cols-3">
          <Metric
            icon={Building2}
            label="Customer Tenants"
            value={customerTenants.length}
            loading={loading}
          />
          <Metric
            icon={ShieldCheck}
            label="Active"
            value={activeTenants}
            loading={loading}
          />
          <Metric
            icon={Users}
            label="Trial"
            value={trialTenants}
            loading={loading}
          />
        </div>
      )}
      {activeTab === "commercial" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Metric
            icon={CreditCard}
            label="Plans"
            value={plans.filter((p: any) => p.is_active).length}
            loading={loading}
          />
          <Metric
            icon={Activity}
            label="Monthly Revenue"
            value={`₹${estimatedRevenue}`}
            loading={loading}
          />
        </div>
      )}
    </div>
  );
}
