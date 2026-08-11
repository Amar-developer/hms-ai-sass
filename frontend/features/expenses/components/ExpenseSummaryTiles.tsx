import { Card } from "@/app/components/common/ui";
import { money } from "@/utils/helper";
import type { Expense } from "../types";

function isSameMonth(isoDate: string, reference: Date) {
  const date = new Date(isoDate);
  return (
    date.getMonth() === reference.getMonth() &&
    date.getFullYear() === reference.getFullYear()
  );
}

export function ExpenseSummaryTiles({ expenses }: { expenses: Expense[] }) {
  const now = new Date();
  const pending = expenses.filter((e) => e.status === "pending");
  const thisMonthTotal = expenses
    .filter((e) => isSameMonth(e.incurredOn, now))
    .reduce((sum, e) => sum + e.amount, 0);
  const awaitingApprovalTotal = pending.reduce((sum, e) => sum + e.amount, 0);

  const tiles = [
    { label: "Pending Claims", value: String(pending.length) },
    { label: "This Month Total", value: money(thisMonthTotal) },
    { label: "Awaiting Approval", value: money(awaitingApprovalTotal) },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <Card key={tile.label} className="px-4 py-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {tile.label}
          </p>
          <p className="mt-1 text-xl font-bold text-slate-800">{tile.value}</p>
        </Card>
      ))}
    </div>
  );
}
