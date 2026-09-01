import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { Badge } from "@/app/components/common/ui";

export function WhatsAppReadinessPanel({ readiness }: { readiness: any }) {
  if (!readiness) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h4 className="text-sm font-bold text-slate-800">
            Final rollout readiness
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            Application checks required before enabling notifications for all
            recipients.
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
        {readiness.checks.map((check: any) => {
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

export function WhatsAppUsagePanel({ usage }: { usage: any }) {
  if (!usage) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h4 className="card-title font-bold text-slate-800">
            Monthly notification usage
          </h4>
          <p className="mt-1 card-desc text-slate-500">
            {usage.plan_name} plan · resets at the start of each calendar
            month.
          </p>
        </div>
        <Badge tone={usage.limit_reached ? "red" : "blue"} className="normal-badge">
          {usage.used} / {usage.monthly_limit}
        </Badge>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${
            usage.limit_reached ? "bg-red-500" : "bg-emerald-500"
          }`}
          style={{
            width: `${Math.min(Number(usage.usage_percentage || 0), 100)}%`,
          }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-600">
        {usage.limit_reached
          ? "Monthly limit reached. New automatic notifications will not be queued."
          : `${usage.remaining} automatic notifications remaining this month.`}
      </p>
    </div>
  );
}

export function WhatsAppHealthPanel({ health }: { health: any }) {
  if (!health) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="card-title font-bold text-slate-800">
            Delivery health
          </h1>
          <p className="mt-1 card-desc text-slate-500">
            Application queue and delivery activity during the last 24 hours.
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
          {String(health.status).replace(/^./, (value) => value.toUpperCase())}
        </Badge>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Sent (24h)", health.sent_24h],
          ["Failed (24h)", health.failed_24h],
          ["Failure rate", `${health.failure_rate_24h}%`],
          ["Queued", health.queued],
          ["Retries", health.retry_pending],
          ["Stuck", health.stuck_processing],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg bg-slate-50 p-3">
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      {health.alerts?.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {health.alerts.map((alert: string) => (
            <p key={alert}>{alert}</p>
          ))}
        </div>
      )}
    </div>
  );
}
