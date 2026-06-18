import { doctorTypes } from "@/utils/doctors/constants";
import { ActionButton,ActionGroup,Badge,Card,Button } from "../common/ui";
import { activeDoctorDepartmentFeeRules, activeDoctorFeeRule, formatPractitionerName } from "@/utils/doctors/helpers";

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
  const specialties = (row.department_ids || []).map((departmentId: string) => ({
    departmentId,
    departmentName:
      departments.find((department: any) => department.id === departmentId)
        ?.name || departmentId,
    feeRule: departmentFeeRules.find(
      (rule: any) => rule.department_id === departmentId,
    ) || fallbackFeeRule,
  }));
  const stop = (handler: any) => (event: any) => {
    event.stopPropagation();
    handler();
  };
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
      className="grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none md:grid-cols-[1.05fr_.65fr_.9fr_.9fr_.65fr_.7fr_.7fr_1.45fr] xl:items-center"
    >
      <div>
        <b className="table-data">{formatPractitionerName(row)}</b>
      </div>
      <span className="table-data">{typeLabel}</span>
      <span className="text-slate-600 table-data">
        {branchNames.length ? branchNames.join(", ") : "-"}
      </span>
      <div className="grid gap-1 text-slate-600 table-data">
        {specialties.length
          ? specialties.map((specialty: any) => (
              <span key={specialty.departmentId}>
                {specialty.departmentName}
              </span>
            ))
          : "-"}
      </div>
      <span className="break-all table-data">{row.mobile || row.email || "-"}</span>
      <div className="grid gap-1 table-data">
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
      <Badge tone={row.status === "active" ? "green" : "red"} className="table-status">
        {row.status === "active" ? "Active" : "Inactive"}
      </Badge>
      <ActionGroup className="justify-start xl:justify-end">
        <ActionButton onClick={stop(onEdit)}>Edit</ActionButton>
        <ActionButton onClick={stop(onStatus)}>
          {row.status === "active" ? "Inactive" : "Active"}
        </ActionButton>
        <ActionButton tone="danger" onClick={stop(onDelete)}>
          Delete
        </ActionButton>
      </ActionGroup>
    </div>
  );
}


export function Pagination({ page, totalPages, total, onPage }: any) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="table-data text-slate-500">
        {total} records · Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="close-button font-bold disabled:text-slate-300"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="close-button font-bold disabled:text-slate-300"
        >
          Next
        </button>
      </div>
    </div>
  );
}
export function Empty({ text }: any) {
  return (
    <div className="px-4 py-8 text-center text-sm text-slate-500">{text}</div>
  );
}
export function ConfirmModal({ confirm, busy, onClose, onConfirm }: any) {
  const isDelete = confirm.kind === "delete";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-md">
        <h3 className="text-lg font-bold">
          {isDelete ? "Delete Doctor" : "Change Doctor Status"}
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          {isDelete
            ? "This will deactivate the doctor so future scheduling cannot use them."
            : "Please confirm the doctor status change."}
        </p>
        <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold">
          {confirm.row.full_name}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "Working..." : "Confirm"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            Cancel
          </button>
        </div>
      </Card>
    </div>
  );
}

export function CheckboxGroup({ title, name, rows, selected, onChange, empty, allLabel }: any) {
  const selectedSet = new Set(selected || []);
  const allSelected = rows.length > 0 && rows.every((row: any) => selectedSet.has(row.id));
  function toggle(rowId: string, checked: boolean) {
    if (!onChange) return;
    const next = new Set(selectedSet);
    if (checked) next.add(rowId);
    else next.delete(rowId);
    onChange(Array.from(next));
  }
  function toggleAll(checked: boolean) {
    if (!onChange) return;
    onChange(checked ? rows.map((row: any) => row.id) : []);
  }
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-slate-500">{title}</p>
        {allLabel && onChange && rows.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event: any) => toggleAll(event.target.checked)}
            />
            <span>{allLabel}</span>
          </label>
        )}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 md:grid-cols-3">
        {rows.length === 0 && <p className="text-sm text-slate-500">{empty}</p>}
        {rows.map((row: any) => (
          <label
            key={row.id}
            className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm font-semibold"
          >
            <input
              type="checkbox"
              name={name}
              value={row.id}
              checked={onChange ? selectedSet.has(row.id) : undefined}
              defaultChecked={onChange ? undefined : selectedSet.has(row.id)}
              onChange={(event: any) => toggle(row.id, event.target.checked)}
            />
            <span className="table-data">{row.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
