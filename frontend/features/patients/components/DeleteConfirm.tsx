import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";

export function DeleteConfirm({ plan, busy, deletePlan, onCancel }: any) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <span className="flex-1 text-xs font-semibold text-red-700">
        Deactivate <b>{plan.name}</b>? Existing patient records are kept and the
        plan can be reactivated later.
      </span>
      <button
        type="button"
        disabled={busy === `delete-${plan.id}`}
        onClick={() => deletePlan(plan.id)}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
      >
        <ButtonLoader loading={busy === `delete-${plan.id}`}>
          {busy === `delete-${plan.id}` ? "Deactivating..." : "Yes, Deactivate"}
        </ButtonLoader>
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
      >
        Cancel
      </button>
    </div>
  );
}
