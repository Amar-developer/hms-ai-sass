import { Badge,ActionGroup,ActionButton } from "../common/ui";


export function PatientRow({ row, branches, onView, onEdit, onDelete }: any) {
  const branch = branches.find((item: any) => item.id === row.branch_id);
  const subscriptionStatus = row.subscription_status;
  const stop = (handler: () => void) => (event: any) => {
    event.stopPropagation();
    handler();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(event: any) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onView();
        }
      }}
      className="w-full cursor-pointer text-left transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
    >
      <div className="grid gap-4 px-5 py-4 text-sm md:grid-cols-[1.25fr_.85fr_1fr_.75fr_.95fr_.65fr_1.35fr] xl:items-center">
        <div className="min-w-0">
          <b className="block text-xs truncate text-slate-950">{row.full_name}</b>
          <p className="mt-0.5 text-[10px] lg:text-xs font-medium text-slate-500">
            {row.patient_number}
          </p>
        </div>
        <div className="min-w-0">
          {/* <p className="text-[11px] font-bold uppercase text-slate-400 xl:hidden">
            Mobile
          </p> */}
          <span className="block truncate text-xs text-slate-700">
            {row.mobile || row.guardian_mobile || "-"}
          </span>
        </div>
        <div className="min-w-0">
          {/* <p className="text-[11px] font-bold uppercase text-slate-400 xl:hidden">
            Branch
          </p> */}
          <span className="block truncate text-xs text-slate-700">
            {branch?.name || "No branch"}
          </span>
        </div>
        <div>
          {/* <p className="text-[11px] font-bold uppercase text-slate-400 xl:hidden">
            Gender / Age
          </p> */}
          <span className="text-xs text-slate-700">
            {row.gender || "-"} / {row.age_years ?? "-"}
          </span>
        </div>
        <div className="min-w-0">
          {row.subscription_plan_name ? (
            <>
              <span className="block truncate table-data text-slate-700">
                {row.subscription_plan_name}
              </span>
              <Badge
                tone={
                  subscriptionStatus === "active"
                    ? "green"
                    : subscriptionStatus === "expired"
                      ? "amber"
                      : "red"
                }
                className="mt-1 table-status"
              >
                {subscriptionStatus || "-"}
              </Badge>
            </>
          ) : (
            <span className=" text-xs text-slate-400">-</span>
          )}
        </div>
        <div>
          {/* <p className="text-[11px] font-bold uppercase text-slate-400 xl:hidden">
            Status
          </p> */}
          <Badge
            tone={
              row.status === "active"
                ? "green"
                : row.status === "deceased"
                  ? "purple"
                  : "red"
            }
            className="table-status text-xs"
          >
            {row.status}
          </Badge>
        </div>
        <ActionGroup className="justify-start md:justify-end">
          <ActionButton onClick={stop(onView)}d>View</ActionButton>
          <ActionButton onClick={stop(onEdit)}>Edit</ActionButton>
          <ActionButton tone="danger" onClick={stop(onDelete)}>
            Delete
          </ActionButton>
        </ActionGroup>
      </div>
    </div>
  );
}
