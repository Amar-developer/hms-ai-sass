import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { Badge } from "@/app/components/common/ui";

import { SmsReadiness } from "../types";

export function SmsReadinessPanel({
  readiness,
}: {
  readiness: SmsReadiness | null;
}) {
  if (!readiness) return null;
  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h4 className="text-sm font-bold text-slate-800">
            SMSCountry and DLT readiness
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            Provider and regulatory checks required before any SMS workflow can
            go live.
          </p>
        </div>
        <Badge
          tone={
            readiness.status === "ready"
              ? "green"
              : readiness.status === "attention"
                ? "amber"
                : "red"
          }
          className="normal-badge"
        >
          {readiness.status === "ready"
            ? "Ready"
            : readiness.status === "attention"
              ? "Needs attention"
              : "Not ready"}
        </Badge>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {readiness.checks.map((check) => {
          const Icon =
            check.status === "pass"
              ? CircleCheck
              : check.status === "warning"
                ? CircleAlert
                : CircleX;
          const color =
            check.status === "pass"
              ? "text-emerald-600"
              : check.status === "warning"
                ? "text-amber-600"
                : "text-red-600";
          return (
            <div
              key={check.key}
              className="flex items-start gap-3 rounded-lg bg-slate-50 p-3"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
              <div>
                <p className="text-xs font-bold text-slate-800">
                  {check.label}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {check.message}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {readiness.passed} passed · {readiness.warnings} warning(s) ·{" "}
        {readiness.blockers} blocker(s)
      </p>
    </div>
  );
}
