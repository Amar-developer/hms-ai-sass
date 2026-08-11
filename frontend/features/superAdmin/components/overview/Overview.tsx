"use client";

import {
  Activity,
  Building2,
  CreditCard,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Metric } from "../shared/Metric";

export function Overview({
  customerTenants,
  activeTenants,
  trialTenants,
  plans,
  estimatedRevenue,
  loading,
}: any) {
  return (
    <div className="grid gap-4 md:grid-cols-5 mt-3">
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
  );
}
