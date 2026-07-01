import { splitListText } from "@/utils/patient/helpers";
import { Badge,Card,Button } from "../common/ui";
import { humanizeOptionLabel } from "@/lib/options";

export function ClinicalItemList({ value, items: providedItems, empty = "-" }: any) {
  const items = providedItems || splitListText(value);
  if (items.length === 0) return <p className="mt-1 text-slate-700">{empty}</p>;
  return (
    <div className="mt-2 space-y-1.5">
      {items.map((item: string, index: number) => (
        <div
          key={`${item}-${index}`}
          className="rounded-xl bg-white/70 px-3 py-2 text-sm leading-relaxed text-slate-700"
        >
          {item}
        </div>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: any) {
  const tone =
    status === "completed" ||
    status === "paid" ||
    status === "dispensed" ||
    status === "active"
      ? "green"
      : status === "cancelled"
        ? "red"
        : status === "pending" || status === "issued"
          ? "amber"
          : "slate";
  return <Badge tone={tone} className="normal-badge">{humanizeOptionLabel(status)}</Badge>;
}



export function Row({ label, value }: any) {
  return (
    <div className="mt-2 ">
      <span className="text-xs font-semibold text-slate-500">{label}: </span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}
export function AlertCard({ alert }: any) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-sm">
      <b>{alert.title}</b>
      <p className="text-slate-600">{alert.description || alert.alert_type}</p>
      <Badge tone={alert.severity === "critical" ? "red" : "amber"}>
        {humanizeOptionLabel(alert.severity)}
      </Badge>
    </div>
  );
}
export function Info({ k, v }: any) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs text-slate-500">{k}</p>
      <p className="font-bold">{v}</p>
    </div>
  );
}
export function Empty({ text }: any) {
  return (
    <div className="px-4 py-8 text-center text-sm text-slate-500">{text}</div>
  );
}
export function SectionEmpty({ text }: any) {
  return <p className="mt-3 table-data text-slate-500">{text}</p>;
}
export function Pagination({ page, totalPages, total, onPage }: any) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">
        {total} records · Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-xl border px-3 py-2 font-bold disabled:text-slate-300"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-xl border px-3 py-2 font-bold disabled:text-slate-300"
        >
          Next
        </button>
      </div>
    </div>
  );
}
export function ConfirmModal({ row, busy, onClose, onConfirm }: any) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-md">
        <h3 className="text-lg font-bold">Delete Patient</h3>
        <p className="mt-2 text-sm text-slate-600">
          This will deactivate the patient record. Treatment history remains
          available for audit and care continuity.
        </p>
        <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold">
          {row.full_name}
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
