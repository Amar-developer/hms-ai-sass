"use client";

import { userRoleLabels } from "@/utils/superAdmin/superAdmin";

export function UserRoleList({ user }: any) {
  const labels = userRoleLabels(user);
  if (!labels.length) return <span className="text-slate-400">-</span>;
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {labels.map((label: string) => (
        <span
          key={label}
          title={labels.join(", ")}
          className="max-w-full truncate rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 flex justify-center items-center"
        >
          {label}
        </span>
      ))}
    </span>
  );
}
