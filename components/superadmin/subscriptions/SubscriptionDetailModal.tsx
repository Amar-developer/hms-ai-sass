"use client";

import { Button, Card } from "@/components/common/ui";
import { formatDate } from "../../../utils/superAdmin/superAdmin";
import { Info } from "../shared/Info";

export function SubscriptionDetailModal({
  subscription,
  onClose,
  onUpgrade,
  onCredits,
}: any) {
  const plan = subscription.plan || {};
  const tenant = subscription.tenant || {};
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-3xl">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h3 className="text-lg font-bold">Subscription Details</h3>
            <p className="text-sm text-slate-500">
              {tenant.name ||
                subscription.tenant_name ||
                subscription.tenant_id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            Close
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Info
            label="Tenant"
            value={tenant.name || subscription.tenant_name || "-"}
          />
          <Info label="Plan" value={plan.name || subscription.plan_id} />
          <Info label="Status" value={subscription.status} />
          <Info label="Start" value={formatDate(subscription.starts_on)} />
          <Info label="End" value={formatDate(subscription.ends_on)} />
          <Info
            label="Amount"
            value={`₹${subscription.billing_amount ?? 0}`}
          />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Info label="Tenant ID" value={subscription.tenant_id} />
          <Info label="Plan Key" value={plan.key || "-"} />
          <Info label="Subscription ID" value={subscription.id} />
          <Info
            label="Updated"
            value={formatDate(
              subscription.updated_at || subscription.created_at,
            )}
          />
        </div>
        {subscription.notes && (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <b>Notes</b>
            <p className="mt-1">{subscription.notes}</p>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" onClick={onUpgrade}>
            Upgrade
          </Button>
          <button
            type="button"
            onClick={onCredits}
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            Credits
          </button>
        </div>
      </Card>
    </div>
  );
}
