"use client";

import {
  Building2,
  CheckCircle2,
  CircleUserRound,
  Layers3,
  ReceiptText,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Badge, Button, Card } from "@/app/components/common/ui";
import { formatTenantType } from "@/utils/superAdmin/superAdmin";
import { Info } from "../shared/Info";

export function TenantCreatedModal({ details, onClose }: any) {
  const tenant = details.tenant;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-2xl overflow-hidden border-0 p-0 shadow-2xl">
        <div className="bg-gradient-to-r from-emerald-700 to-teal-700 px-6 py-6 text-white">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <Badge
                tone="green"
                className="mb-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-[10px] uppercase tracking-wider text-white"
              >
                Onboarding Complete
              </Badge>
              <h3 className="text-xl font-bold lg:text-2xl">
                {tenant.name} is ready
              </h3>
              <p className="mt-1 text-sm text-emerald-50">
                The tenant was provisioned successfully. Your super-admin
                session remains active and the tenant list has been refreshed.
              </p>
            </div>
          </div>
        </div>
        <div className="p-6">
          {details.logoWarning && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <TriangleAlert size={18} className="mt-0.5 shrink-0" />
              <span>{details.logoWarning}</span>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Info label="Tenant ID" value={tenant.id} />
            <Info label="Type" value={formatTenantType(tenant.tenant_type)} />
            <Info label="Status" value={tenant.status} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              [Building2, "Branches", details.branchCount],
              [ReceiptText, "Subscription", details.hasSubscription ? "Assigned" : "Trial assigned"],
              [Layers3, "Modules", details.moduleCount || 0],
              [ShieldCheck, "Roles", details.roleCount || 0],
              [CircleUserRound, "Tenant admin", details.adminEmail || "Created"],
              [ReceiptText, "Plan", details.onboardingPlan?.name || "Default trial"],
            ].map(([Icon, label, value]: any) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-slate-700 shadow-sm">
                  <Icon size={17} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {label}
                  </p>
                  <p className="truncate text-sm font-bold text-slate-900">
                    {value}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <p className="text-xs text-slate-500">
              The tenant admin can sign in with the email and temporary
              password configured in step 5.
            </p>
            <Button
              type="button"
              onClick={onClose}
              className="rounded-xl px-5 py-2.5 text-sm"
            >
              Continue to Tenants
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
