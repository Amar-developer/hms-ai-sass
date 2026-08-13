import { money } from "@/utils/helper";
import { Badge } from "@/app/components/common/ui";
import { PlanRowActions } from "../patients/components/PlanRowActions";

interface GetPlanColumnsProps {
  activeEnrollmentCountByPlan: Map<string, number>;
  busy: string;
  requestDeletePlan: (plan: any) => void;
  startEdit: (plan: any) => void;
  togglePlanActive: (plan: any) => void;
  canDeletePlans: boolean;
  canEditPlans: boolean;
  openDetail: (plan: any) => void;
}

export function getPlanColumns({
  activeEnrollmentCountByPlan,
  busy,
  requestDeletePlan,
  startEdit,
  togglePlanActive,
  canDeletePlans,
  canEditPlans,
  openDetail,
}: GetPlanColumnsProps) {
  return [
    {
      key: "name",
      header: "Plan",
      render: (plan: any) => (
        <button
          type="button"
          onClick={() => openDetail(plan)}
          className="text-left"
        >
          <b className="block text-sm text-slate-950">{plan.name}</b>
        </button>
      ),
      disableRowClick: true,
    },
    {
      key: "price_amount",
      header: "Price",
      cellClassName: "font-semibold text-slate-950",
      render: (plan: any) => money(plan.price_amount),
    },
    {
      key: "duration_days",
      header: "Duration",
      cellClassName: "text-slate-700",
      render: (plan: any) => `${plan.duration_days} days`,
    },
    {
      key: "free_consultations",
      header: "Consults",
      cellClassName: "text-slate-700",
      render: (plan: any) => plan.free_consultations,
    },
    {
      key: "is_active",
      header: "Status",
      render: (plan: any) => (
        <div className="flex flex-col items-start gap-1">
          <Badge
            tone={plan.is_active ? "green" : "red"}
            className="rounded-full px-2 py-1 text-xs"
          >
            {plan.is_active ? "Active" : "Paused"}
          </Badge>
        </div>
      ),
    },
    {
      key: "enrolled",
      header: "Enrolled",
      render: (plan: any) => {
        const activeEnrollmentCount =
          activeEnrollmentCountByPlan.get(plan.id) || 0;
        return (
          activeEnrollmentCount > 0 && (
            <span className="text-sm font-semibold text-slate-500">
              {activeEnrollmentCount} enrolled
            </span>
          )
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-center",
      cellClassName: "flex justify-center",
      disableRowClick: true,
      render: (plan: any) => {
        const activeEnrollmentCount =
          activeEnrollmentCountByPlan.get(plan.id) || 0;
        return (
          <PlanRowActions
            plan={plan}
            activeEnrollmentCount={activeEnrollmentCount}
            busy={busy}
            openDetail={() => openDetail(plan)}
            startEdit={startEdit}
            togglePlanActive={togglePlanActive}
            requestDeletePlan={requestDeletePlan}
            canDeletePlans={canDeletePlans}
            canEditPlans={canEditPlans}
            className="right-10 -bottom-2"
          />
        );
      },
    },
  ];
}
