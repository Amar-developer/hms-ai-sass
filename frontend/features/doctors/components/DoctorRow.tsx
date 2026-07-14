import { Badge } from "@/app/components/common/ui";
import { RowActions } from "@/features/admin/components/RowActions";
import { doctorTypes } from "../constants";
import { activeDoctorDepartmentFeeRules,activeDoctorFeeRule,formatPractitionerName } from "../helpers";
export function DoctorRow({
  row,
  branches,
  departments,
  feeRules,
  onEdit,
  onStatus,
  onDelete,
}: any) {
  const branchNames = (row.branch_ids || []).map(
    (id: string) =>
      branches.find((branch: any) => branch.id === id)?.name || id,
  );
  const typeLabel =
    doctorTypes.find(([value]) => value === row.practitioner_type)?.[1] ||
    row.practitioner_type;
  const departmentFeeRules = activeDoctorDepartmentFeeRules(feeRules, row);
  const fallbackFeeRule = activeDoctorFeeRule(feeRules, row);
  const specialties = (row.department_ids || []).map(
    (departmentId: string) => ({
      departmentId,
      departmentName:
        departments.find((department: any) => department.id === departmentId)
          ?.name || departmentId,
      feeRule:
        departmentFeeRules.find(
          (rule: any) => rule.department_id === departmentId,
        ) || fallbackFeeRule,
    }),
  );
  const stop = (handler: any) => (event: any) => {
    event.stopPropagation();
    handler();
  };
  const actions = [
    {
      label: "Edit",
      onClick: onEdit,
    },
    {
      label: row.status === "active" ? "Inactive" : "Active",
      onClick: onStatus,
      hidden: !onStatus,
    },
    {
      label: "Delete",
      onClick: onDelete,
      hidden: !onDelete,
      danger: true,
    },
  ];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event: any) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
      className="grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none md:grid-cols-[1.05fr_.65fr_.9fr_.9fr_.65fr_.7fr_.7fr_.65fr] xl:items-center"
    >
      <div>
        <b className="text-sm">{formatPractitionerName(row)}</b>
      </div>
      <span className="text-sm">{typeLabel}</span>
      <span className="text-slate-600 text-sm">
        {branchNames.length ? branchNames.join(", ") : "-"}
      </span>
      <div className="grid gap-1 text-slate-600 text-sm">
        {specialties.length
          ? specialties.map((specialty: any) => (
              <span key={specialty.departmentId}>
                {specialty.departmentName}
              </span>
            ))
          : "-"}
      </div>
      <span className="break-all text-sm">
        {row.mobile || row.email || "-"}
      </span>
      <div className="grid gap-1 text-sm">
        {specialties.length
          ? specialties.map((specialty: any) => (
              <span key={specialty.departmentId}>
                {specialty.feeRule
                  ? `₹${Number(
                      specialty.feeRule.fee_amount || 0,
                    ).toLocaleString("en-IN")}`
                  : "-"}
              </span>
            ))
          : "-"}
      </div>
      <Badge
        tone={row.status === "active" ? "green" : "red"}
        className="table-status text-sm"
      >
        {row.status === "active" ? "Active" : "Inactive"}
      </Badge>
      <div className="flex justify-center item-scenter ">
        <RowActions actions={actions} />
      </div>
    </div>
  );
}
