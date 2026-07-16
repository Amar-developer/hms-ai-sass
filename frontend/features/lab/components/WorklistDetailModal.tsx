import { Card,ActionButton } from "@/app/components/common/ui";
import { displayDateTime } from "@/utils/helper";
import {
  canCopyDatabaseIds,
  CopyIdButton,
} from "@/app/components/common/CopyIdButton";

export function WorklistDetailModal({
  title,
  id,
  patient,
  createdAt,
  items,
  onClose,
  apiSession,
}: any) {
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold">{title}</h3>
              <CopyIdButton
                value={id}
                label="Lab / Service Order ID"
                allowed={canCopyIds}
              />
            </div>
            <p className="mt-1 text-sm text-slate-500">{patient}</p>
            <p className="text-xs text-slate-500">
              {createdAt ? displayDateTime(createdAt) : ""}
            </p>
          </div>
          <ActionButton onClick={onClose}>Close</ActionButton>
        </div>
        <div className="mt-5 overflow-auto rounded-lg border border-slate-200">
          {items.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">
              No items found.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="w-16 px-4 py-3">#</th>
                  <th className="px-4 py-3">Lab Test / Service</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.map((item: string, index: number) => (
                  <tr key={`${item}-${index}`}>
                    <td className="px-4 py-3 text-slate-500">{index + 1}</td>
                    <td className="px-4 py-3 font-semibold">{item}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
