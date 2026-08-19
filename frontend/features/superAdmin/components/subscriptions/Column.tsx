import { Badge } from "@/app/components/common/ui";
import { Column } from "@/utils/types";
import { RowActions } from "@/features/admin/components/RowActions";
import { formatDate, formatTenantType, limitLabel } from "../../helpers";

type SubscriptionColumnsParams = {
  tenantById: Map<string, any>;
  planById: Map<string, any>;
  setDetailSubscription: (value: any) => void;
  setSelectedId: (id: string) => void;
  openSubscriptionView: (view: string) => void;
};

export function getSubscriptionColumns({
  tenantById,
  planById,
  setDetailSubscription,
  setSelectedId,
  openSubscriptionView,
}: SubscriptionColumnsParams): Column<any>[] {
  return [
    {
      key: "s.no",
      header: "S.No",
      width: "50px",
      className: "text-center",
      cellClassName: "text-center",
      sortable: true,
      render: (_, index: number) => index + 1,
    },
    {
      key: "tenant",
      header: "Tenant",
      width: "200px",
      render: (subscription: any) => {
        const tenant = tenantById.get(subscription.tenant_id) as any;

        return (
          <div className="min-w-0">
            <b className="block truncate text-xs lg:text-sm">
              {subscription.tenant_name || tenant?.name || "Tenant"}
            </b>
          </div>
        );
      },
    },
    {
      key: "tenant-type",
      header: "Type",
      width: "180px",
      render: (subscription: any) => {
        const tenant = tenantById.get(subscription.tenant_id) as any;

        return (
          <div className="min-w-0">
            <b className="block truncate text-xs lg:text-sm">
              {formatTenantType(tenant?.tenant_type || "")}
            </b>
          </div>
        );
      },
    },
    {
      key: "plan",
      header: "Plan",
      width: "180px",
      render: (subscription: any) => {
        const plan = planById.get(subscription.plan_id) as any;

        return (
          <div className="min-w-0">
            <b className="block truncate text-xs lg:text-sm">
              {plan?.name || "Custom plan"}
            </b>
          </div>
        );
      },
    },

    {
      key: "status",
      header: "Status",
      className: "text-center",
      width: "120px",
      render: (subscription: any) => (
        <Badge
          tone={
            subscription.status === "active"
              ? "green"
              : subscription.status === "scheduled"
                ? "amber"
                : subscription.status === "expired"
                  ? "slate"
                  : "red"
          }
          className="rounded-full px-1 py-1 text-xs lg:text-sm"
        >
          {subscription.status}
        </Badge>
      ),
    },

    {
      key: "starts_on",
      header: "Start",
      width: "120px",
      render: (subscription: any) => (
        <span className="text-xs lg:text-sm">
          {formatDate(subscription.starts_on)}
        </span>
      ),
    },

    {
      key: "ends_on",
      header: "End",
      width: "120px",
      render: (subscription: any) => (
        <span className="text-xs lg:text-sm">
          {formatDate(subscription.ends_on)}
        </span>
      ),
    },

    {
      key: "billing_amount",
      header: "Amount",
      width: "120px",
      render: (subscription: any) => (
        <b className="text-xs lg:text-sm">₹{subscription.billing_amount}</b>
      ),
    },

    {
      key: "actions",
      header: "Actions",
      cellClassName: "text-center",
      width: "90px",
      disableRowClick: true,
      render: (subscription: any) => {
        const plan = planById.get(subscription.plan_id) as any;
        const tenant = tenantById.get(subscription.tenant_id) as any;

        const actions = [
          {
            label: "Details",
            onClick: () =>
              setDetailSubscription({
                ...subscription,
                plan,
                tenant,
              }),
          },
          {
            label: "Upgrade",
            onClick: () => {
              setSelectedId(subscription.tenant_id);
              openSubscriptionView("assign");
            },
          },
          {
            label: "Credits",
            onClick: () => {
              setSelectedId(subscription.tenant_id);
              openSubscriptionView("credits");
            },
          },
        ];

        return (
          <div
            className="flex justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            <RowActions actions={actions} className="right-8 -bottom-5" />
          </div>
        );
      },
    },
  ];
}

type PlanColumnsParams = {
  setDetailPlan: (plan: any) => void;
  setEditingPlan: (plan: any) => void;
  openSubscriptionView: (view: string) => void;
  setPlanStatusConfirm: (plan: any) => void;
};

export function getPlanColumns({
  setDetailPlan,
  setEditingPlan,
  openSubscriptionView,
  setPlanStatusConfirm,
}: PlanColumnsParams): Column<any>[] {
  return [
    {
      key: "name",
      header: "Plan",
      width: "180px",
      render: (plan: any) => (
        <div className="min-w-0">
          <b className="block truncate text-xs lg:text-sm">{plan.name}</b>
        </div>
      ),
    },
    {
      key: "price_inr_monthly",
      header: "Price",
      width: "120px",
      render: (plan: any) => (
        <b className="text-xs lg:text-sm">₹{plan.price_inr_monthly}</b>
      ),
    },
    {
      key: "limits",
      header: "Limits",
      width: "200px",
      render: (plan: any) => (
        <span className="text-xs text-slate-600 lg:text-sm">
          {limitLabel(plan.monthly_patient_limit)} patients ·{" "}
          {limitLabel(plan.included_branches)} branches ·{" "}
          {limitLabel(plan.monthly_whatsapp_message_limit)} messages
        </span>
      ),
    },
    {
      key: "modules",
      header: "Modules",
      width: "150px",
      className: "text-center",
      render: (plan: any) => (
        <Badge
          tone="slate"
          className="rounded-full px-1 py-1 text-xs lg:text-sm"
        >
          {(plan.enabled_modules || []).length}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "150px",
      className: "text-center",
      render: (plan: any) => (
        <Badge
          tone={plan.is_active ? "green" : "slate"}
          className="rounded-full px-1 py-1 text-xs lg:text-sm"
        >
          {plan.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "120px",
      className: "text-center",
      disableRowClick: true,
      render: (plan: any) => {
        const actions = [
          {
            label: "Details",
            onClick: () => setDetailPlan(plan),
          },
          {
            label: "Edit",
            onClick: () => {
              setEditingPlan(plan);
              openSubscriptionView("editPlan");
            },
          },
          {
            label: plan.is_active ? "Deactivate" : "Activate",
            onClick: () => setPlanStatusConfirm(plan),
          },
        ];

        return (
          <div
            className="flex justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            <RowActions actions={actions} className="right-10 -bottom-5 w-28" />
          </div>
        );
      },
    },
  ];
}
