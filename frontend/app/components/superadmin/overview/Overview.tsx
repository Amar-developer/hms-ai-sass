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
}: any) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Metric
        icon={Building2}
        label="Customer Tenants"
        value={customerTenants.length}
      />
      <Metric icon={ShieldCheck} label="Active" value={activeTenants} />
      <Metric icon={Users} label="Trial" value={trialTenants} />
      <Metric
        icon={CreditCard}
        label="Plans"
        value={plans.filter((p: any) => p.is_active).length}
      />
      <Metric
        icon={Activity}
        label="Monthly Revenue"
        value={`₹${estimatedRevenue}`}
      />
    </div>
  );
}
