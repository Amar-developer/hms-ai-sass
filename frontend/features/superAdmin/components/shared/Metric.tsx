"use client";

import { Card } from "@/app/components/common/ui";

export function Metric({ icon: Icon, label, value }: any) {
  return (
    <Card className="rounded-lg">
      <Icon className="mb-3 text-slate-500" />
      <p className="text-xs lg:text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xl lg:text-2xl font-bold">{value}</p>
    </Card>
  );
}
