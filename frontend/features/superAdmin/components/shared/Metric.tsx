"use client";

import { Card } from "@/app/components/common/ui";
import { Skeleton } from "@/app/components/common/loader/Skeleton";

export function Metric({ icon: Icon, label, value, loading }: any) {
  return (
    <Card className="rounded-lg">
      <Icon className="mb-3 text-slate-500" />
      <p className="text-xs lg:text-sm text-slate-500">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-7 w-24" />
      ) : (
        <p className="mt-1 text-xl lg:text-2xl font-bold">{value}</p>
      )}
    </Card>
  );
}
