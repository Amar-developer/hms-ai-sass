import { BadgeCheck, Clock3, WalletCards } from "lucide-react";
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
    {
      label: "Pending Claims",
      value: String(pending.length),
      icon: Clock3,
      tone: "bg-amber-50 text-amber-600 ring-amber-100",
    },
    {
      label: "This Month Total",
      value: money(thisMonthTotal),
      icon: WalletCards,
      tone: "bg-sky-50 text-sky-600 ring-sky-100",
    },
    {
      label: "Awaiting Approval",
      value: money(awaitingApprovalTotal),
      icon: BadgeCheck,
      tone: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {tiles.map(({ label, value, icon: Icon, tone }) => (
        <div
          key={label}
          className="flex min-h-[74px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-slate-300"
        >
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ${tone}`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <p className="mt-0.5 text-xl font-black leading-none text-slate-950">
              {value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
