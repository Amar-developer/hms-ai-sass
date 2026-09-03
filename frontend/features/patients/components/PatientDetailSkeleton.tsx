import { ClipboardList } from "lucide-react";
import { SECTION_TABS } from "../constants";
import { PatientSectionId } from "../types";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-slate-200 ${className}`} />;
}

function InfoGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-[82px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
        >
          <Bar className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Bar className="h-3 w-20" />
            <Bar className="mt-2 h-4 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CardMetricsSkeleton({ metrics = 4 }: { metrics?: number }) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
      <div className="flex items-center justify-between">
        <div>
          <Bar className="h-4 w-48" />
          <Bar className="mt-2 h-3 w-64" />
        </div>
        <Bar className="h-5 w-20 rounded-full" />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        {Array.from({ length: metrics }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-3">
            <Bar className="h-3 w-16" />
            <Bar className="mt-2 h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ListRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div>
          <Bar className="h-4 w-40" />
          <Bar className="mt-2 h-3 w-56" />
        </div>
        <Bar className="h-5 w-16 rounded-full" />
      </div>
      <div className="mt-3 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5"
          >
            <Bar className="h-4 w-40" />
            <Bar className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TableSectionSkeleton({
  columns,
  rows = 4,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <Bar className="h-4 w-32" />
        <Bar className="h-7 w-7 rounded-lg" />
      </div>
      <div className="p-3">
        <div className="rounded-lg border border-slate-200">
          <div className="flex gap-4 border-b border-slate-100 bg-slate-50 px-3 py-2.5">
            {Array.from({ length: columns }).map((_, i) => (
              <Bar key={i} className="h-3 w-16" />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b border-slate-100 px-3 py-3 last:border-b-0">
              {Array.from({ length: columns }).map((__, j) => (
                <Bar key={j} className="h-4 w-20" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Body shape follows PatientDetail.tsx's real markup per section, so the
// swap from skeleton -> real content doesn't visibly jump: home is an info
// grid, membership/family are card panels, consultations/billing are tables
// sized to their real column counts.
export function SectionBody({ section }: { section: PatientSectionId }) {
  switch (section) {
    case "home":
      return <InfoGridSkeleton count={8} />;
    case "membership":
      return <CardMetricsSkeleton metrics={4} />;
    case "family":
      return <ListRowsSkeleton rows={3} />;
    case "consultations":
      return <TableSectionSkeleton columns={5} rows={4} />;
    case "billing":
      return (
        <>
          <CardMetricsSkeleton metrics={3} />
          <TableSectionSkeleton columns={6} rows={5} />
        </>
      );
    case "patient_tracking":
      return (
        <>
          <CardMetricsSkeleton metrics={2} />
          <TableSectionSkeleton columns={7} rows={4} />
        </>
      );
    default:
      return <InfoGridSkeleton count={6} />;
  }
}

/**
 * Stands in for PatientFlow while the detail bundle for `section` is still
 * loading (e.g. right after a tab-switch remount, before `selected` exists)
 * — same header/tab chrome so nothing shifts once real content lands, but a
 * body shaped like that section instead of the generic list-page skeleton.
 */
export function PatientDetailSkeleton({
  section,
  onBack,
}: {
  section: PatientSectionId;
  onBack?: () => void;
}) {
  return (
    <div className="grid gap-4">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-brand">
            <ClipboardList className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-950">
              Patient Workspace
            </h2>
            <p className="text-xs font-medium text-slate-500">
              Membership, family, consultations, labs, medicines and billing details in one place
            </p>
          </div>
        </div>

        <nav
          className="scrollbar-hidden flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 py-1.5"
          aria-label="Patient workspace sections"
        >
          {SECTION_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === section;
            return (
              <span
                key={tab.id}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-bold ${
                  isActive
                    ? "bg-brand text-brand-fg"
                    : "text-slate-400"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </span>
            );
          })}
        </nav>
      </section>

      <div className="animate-pulse space-y-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 shrink-0 rounded-2xl bg-slate-200" />
          <div className="flex-1">
            <Bar className="h-4 w-48" />
            <Bar className="mt-2 h-3 w-32" />
          </div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="close-button shrink-0 font-bold"
            >
              Back to Patients
            </button>
          )}
        </div>
        <SectionBody section={section} />
      </div>
    </div>
  );
}

export default PatientDetailSkeleton;
