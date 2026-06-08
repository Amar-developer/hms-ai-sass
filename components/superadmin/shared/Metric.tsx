"use client";

import { Card } from "@/components/common/ui";

export function Metric({ icon: Icon, label, value }: any) {
  return (
    <Card>
      <Icon className="mb-3 text-slate-500" />
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </Card>
  );
}
