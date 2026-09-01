"use client";

import { Card } from "@/app/components/common/ui";
import { Skeleton } from "@/app/components/common/loader/Skeleton";

export function Metric({ icon: Icon, label, value, loading }: any) {
  return (
    <Card className="flex min-h-[82px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-slate-300">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-1.5 h-5 w-20" />
        ) : (
          <p className="mt-1 text-xl font-black leading-none text-slate-950">
            {value}
          </p>
        )}
      </div>
    </Card>
  );
}
