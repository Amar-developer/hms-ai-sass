import { CircleAlert, CircleCheck, CircleX } from "lucide-react";

import { Badge } from "@/app/components/common/ui";
import { SmsHealth, SmsUsage } from "../types";

function moneyFromPaise(value: number | null) {
  if (value == null) return "Not priced";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(value / 100);
}

export function SmsUsagePanel({ usage }: { usage: SmsUsage | null }) {
  if (!usage) return null;
  const total = Math.max(usage.plan_segment_limit, 0);
  const percentage = total
    ? Math.min(Math.round((usage.segments_used / total) * 100), 100)
    : 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold text-slate-800">SMS usage</h3>
          <p className="card-desc mt-1 text-slate-500">
            {usage.plan_name} plan · messages and billable segments this month.
          </p>
        </div>
        <Badge tone={usage.limit_reached ? "red" : "blue"} className="normal-badge">
          {usage.segments_used} / {usage.plan_segment_limit} segments
        </Badge>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${usage.limit_reached ? "bg-red-500" : "bg-emerald-500"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Messages", usage.messages_used],
          ["Today", usage.messages_used_today],
          ["Segments remaining", usage.segments_remaining],
          ["Estimated cost", moneyFromPaise(usage.estimated_cost_paise)],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg bg-slate-50 p-3">
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SmsHealthPanel({ health }: { health: SmsHealth | null }) {
  if (!health) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="card-title font-bold text-slate-800">Delivery health</h3>
          <p className="card-desc mt-1 text-slate-500">
            Queue, provider acceptance, and handset delivery activity.
          </p>
        </div>
        <Badge
          tone={
            health.status === "critical"
              ? "red"
              : health.status === "warning"
                ? "amber"
                : "green"
          }
          className="normal-badge"
        >
          {health.status[0].toUpperCase() + health.status.slice(1)}
        </Badge>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Sent (24h)", health.sent_24h],
          ["Delivered", health.delivered_24h],
          ["Delivery rate", `${health.delivery_rate_24h}%`],
          ["Failed", health.failed_24h],
          ["Queued", health.queued],
          ["Awaiting receipt", health.awaiting_receipt],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg bg-slate-50 p-3">
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      {health.alerts.length > 0 && (
        <div className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {health.alerts.map((alert) => (
            <p key={alert}>{alert}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function SmsReadinessSummary({ readiness }: { readiness: any }) {
  if (!readiness) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="card-title font-bold text-slate-800">Rollout readiness</h3>
          <p className="card-desc mt-1 text-slate-500">
            Provider, DLT, compliance, and delivery checks.
          </p>
        </div>
        <Badge
          tone={readiness.status === "ready" ? "green" : readiness.status === "attention" ? "amber" : "red"}
          className="normal-badge"
        >
          {readiness.status === "ready" ? "Ready" : readiness.status === "attention" ? "Needs attention" : "Not ready"}
        </Badge>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {readiness.checks.map((check: any) => {
          const Icon = check.status === "pass" ? CircleCheck : check.status === "warning" ? CircleAlert : CircleX;
          const color = check.status === "pass" ? "text-emerald-600" : check.status === "warning" ? "text-amber-600" : "text-red-600";
          return (
            <div key={check.key} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
              <div>
                <p className="text-xs font-bold text-slate-800">{check.label}</p>
                <p className="mt-1 text-[11px] text-slate-500">{check.message}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {readiness.passed} passed · {readiness.warnings} warning(s) · {readiness.blockers} blocker(s)
      </p>
    </div>
  );
}
