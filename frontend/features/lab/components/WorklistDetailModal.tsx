import { Card,ActionButton } from "@/app/components/common/ui";
import { ActivityLog } from "@/app/components/common/ActivityLog";
import { displayDateTime } from "@/utils/helper";

export function WorklistDetailModal({
  title,
  id,
  patient,
  createdAt,
  items,
  onClose,
  apiSession,
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
        <ActivityLog resourceType="lab_order" resourceId={id} apiSession={apiSession} />
      </Card>
    </div>
  );
}
