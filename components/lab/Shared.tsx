import { humanizeOptionLabel } from "@/lib/options";
import { Card,ActionButton,Button } from "../common/ui";
import { displayDateTime } from "@/utils/helper";
import { pageSize } from "@/utils/lab/constants";


export function WorklistDetailModal({
  title,
  id,
  patient,
  createdAt,
  items,
  onClose,
}: any) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{patient}</p>
            <p className="text-xs text-slate-500">
              {createdAt ? displayDateTime(createdAt) : ""}
            </p>
          </div>
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>
        <div className="mt-5 grid gap-2">
          {items.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              No items found.
            </p>
          ) : (
            items.map((item: string, index: number) => (
              <div
                key={`${item}-${index}`}
                className="rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold"
              >
                {index + 1}. {item}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

export function ConsultReferralModal({
  a,
  detail,
  loading,
  busy,
  onClose,
  onCreate,
}: any) {
  const referrals: any[] = detail?.referrals || [];
  const labOnly = referrals.filter(
    (r: any) =>
      r.referral_type === "lab" ||
      r.referral_type === "scan" ||
      !r.referral_type,
  );
  const display = labOnly.length > 0 ? labOnly : referrals;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">Referral Detail</h3>
            <p className="mt-1 text-sm text-slate-500">
              {a.token} · {a.patient}
            </p>
          </div>
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>
        {loading && <p className="mt-4 text-sm text-slate-500">Loading...</p>}
        {detail && display.length > 0 && (
          <div className="mt-4 overflow-auto rounded-2xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th>Test / Item</th>
                  <th>Priority</th>
                  <th>Instructions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {display.map((r: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold uppercase">
                        {humanizeOptionLabel(r.referral_type || "lab")}
                      </span>
                    </td>
                    <td className="font-semibold">{r.item_name || "-"}</td>
                    <td>{humanizeOptionLabel(r.priority || "-")}</td>
                    <td className="pr-4 text-slate-500">
                      {r.instructions || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {detail && referrals.length === 0 && (
          <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
            No referrals in this consultation.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button
            disabled={busy === a.consultationId || loading}
            onClick={() => onCreate(a)}
          >
            {busy === a.consultationId ? "Creating..." : "Create Lab / Service Order"}
          </Button>
          <ActionButton onClick={onClose}>Cancel</ActionButton>
        </div>
      </Card>
    </div>
  );
}

