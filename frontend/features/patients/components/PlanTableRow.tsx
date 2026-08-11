import { money } from "@/utils/helper";
import { Badge } from "@/app/components/common/ui";
import { PlanRowActions } from "./PlanRowActions";

export function PlanTableRow({
  plan,
  activeEnrollmentCount,
  busy,
  requestDeletePlan,
  startEdit,
  togglePlanActive,
  canDeletePlans,
  canEditPlans,
  openDetail,
}: any) {
  return (
    <tr className="bg-white align-middle hover:bg-slate-50">
      <td className="px-4 py-3">
        <button type="button" onClick={openDetail} className="text-left">
          <b className="block text-sm text-slate-950">{plan.name}</b>
          {/* <span className="text-xs font-semibold uppercase text-slate-500">
            {plan.code || "-"}
          </span> */}
        </button>
      </td>
      <td className="px-4 py-3 font-semibold text-slate-950">
        {money(plan.price_amount)}
      </td>
      <td className="px-4 py-3 text-slate-700">{plan.duration_days} days</td>
      <td className="px-4 py-3 text-slate-700">{plan.free_consultations}</td>
      {/* <td className="max-w-[180px] px-4 py-3 text-slate-700">Tenant</td> */}
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1">
          <Badge
            tone={plan.is_active ? "green" : "red"}
            className="rounded-full px-2 py-1 text-xs"
          >
            {plan.is_active ? "Active" : "Paused"}
          </Badge>
        </div>
      </td>
      <td className="px-4 py-3">
        {activeEnrollmentCount > 0 && (
          <span className="text-sm font-semibold text-slate-500">
            {activeEnrollmentCount} enrolled
          </span>
        )}
      </td>
      <td className="px-4 py-3 flex justify-center">
        <PlanRowActions
          plan={plan}
          activeEnrollmentCount={activeEnrollmentCount}
          busy={busy}
          openDetail={openDetail}
          startEdit={startEdit}
          togglePlanActive={togglePlanActive}
          requestDeletePlan={requestDeletePlan}
          canDeletePlans={canDeletePlans}
          canEditPlans={canEditPlans}
          className="right-10 -bottom-2"
        />
      </td>
    </tr>
  );
}
