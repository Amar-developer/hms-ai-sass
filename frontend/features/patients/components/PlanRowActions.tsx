import { useDropdown } from "@/hooks/useDropdown";
import { MoreHorizontal } from "lucide-react";

export function PlanRowActions({
  plan,
  busy,
  openDetail,
  startEdit,
  togglePlanActive,
  requestDeletePlan,
  canDeletePlans,
  canEditPlans,
  className = "right-0 top-0",
}: any) {
  const { open, setOpen, ref, buttonRef } = useDropdown();

  const stop = (fn: any) => (e: any) => {
    e.stopPropagation();
    fn?.();
    setOpen(false);
  };
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      {/* 3-dot button */}
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {/* dropdown */}
      {open && (
        <div
          className={`absolute ${className} z-50 mt-2 w-22 text-xs rounded-lg border bg-white shadow-lg`}
        >
          <button
            onClick={stop(openDetail)}
            className="block w-full px-4 py-1 text-left hover:bg-slate-100"
          >
            View
          </button>

          {canEditPlans && (
            <button
              onClick={stop(() => startEdit(plan))}
              className="block w-full px-4 py-1 text-left hover:bg-slate-100"
            >
              Edit
            </button>
          )}

          {canEditPlans && (
            <button
              disabled={busy === `toggle-${plan.id}`}
              onClick={stop(() => togglePlanActive(plan))}
              className="block w-full px-4 py-1 text-left hover:bg-slate-100"
            >
              {plan.is_active ? "Pause" : "Activate"}
            </button>
          )}

          {canDeletePlans && plan.is_active && (
            <button
              onClick={stop(() => requestDeletePlan(plan))}
              className="block w-full px-4 py-1 text-left text-red-600 hover:bg-red-50"
            >
              Deactivate
            </button>
          )}
        </div>
      )}
    </div>
  );
}
