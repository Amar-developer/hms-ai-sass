"use client";

import { Badge, Button, Card } from "@/components/common/ui";
import { formatTenantType } from "../../../utils/superAdmin/superAdmin";
import { Info } from "../shared/Info";

export function TenantCreatedModal({ details, onClose }: any) {
  const tenant = details.tenant;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-lg">
        <div className="flex flex-col gap-3">
          <Badge tone="green">Tenant Created</Badge>
          <div>
            <h3 className="text-xl font-bold">
              Tenant has been created successfully
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {tenant.name} is ready and the Tenants listing page is open with
              the latest record shown first.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Tenant ID" value={tenant.id} />
            <Info label="Type" value={formatTenantType(tenant.tenant_type)} />
            <Info label="Status" value={tenant.status} />
            <Info label="Branches" value={details.branchCount} />
            <Info
              label="Subscription"
              value={details.hasSubscription ? "Assigned" : "Not assigned"}
            />
            <Info label="Modules" value={details.moduleCount || 0} />
            <Info
              label="Plan"
              value={details.onboardingPlan?.name || "Selected plan"}
            />
            <Info label="Next Step" value="Create tenant admin user" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" onClick={onClose}>
              View Tenants
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border px-4 py-3 text-sm font-bold"
            >
              Close
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
