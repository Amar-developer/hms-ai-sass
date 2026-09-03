"use client";

import {
  Bell,
  CalendarClock,
  CreditCard,
  FlaskConical,
  HeartPulse,
  Pill,
  ReceiptText,
  ShieldAlert,
  Stethoscope,
} from "lucide-react";
import { Badge } from "@/app/components/common/ui";
import { CompactMetric } from "../CompactMetric";
import { DetailSection } from "../DetailSection";
import { StatusBadge } from "../StatusBadge";
import { money } from "@/utils/helper";
import { fmtDate } from "../../helpers";
import { BmiTrendChart, bmiOf, zoneFor } from "./BmiTrendChart";
import { PatientVitalsIntakeForm } from "./PatientVitalsIntakeForm";
import { VitalsMetricsChart } from "./VitalsMetricsChart";

type TimelineEntry = {
  key: string;
  date: string;
  icon: any;
  iconTone: string;
  title: string;
  subtitle: string;
};

function ProgressBar({
  used,
  allocated,
  tone = "bg-brand",
}: {
  used: number;
  allocated: number;
  tone?: string;
}) {
  const pct =
    allocated > 0 ? Math.min(100, Math.round((used / allocated) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${tone}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function InsightChip({
  icon: Icon,
  tone,
  text,
}: {
  icon: any;
  tone: "green" | "amber" | "red" | "blue";
  text: string;
}) {
  const toneClass = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    red: "bg-red-50 text-red-700 ring-red-100",
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
  }[tone];
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ring-1 ${toneClass}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-xs font-semibold leading-snug">{text}</p>
    </div>
  );
}

function buildTimelineEntries({
  consultations,
  labServiceRows,
  medicineRows,
  patientInvoices,
}: {
  consultations: any[];
  labServiceRows: any[];
  medicineRows: any[];
  patientInvoices: any[];
}): TimelineEntry[] {
  return [
    ...consultations.slice(0, 5).map((row: any) => ({
      key: `consultation-${row.id}`,
      date: row.created_at,
      icon: Stethoscope,
      iconTone: "bg-blue-50 text-blue-600 ring-blue-100",
      title: "Consultation",
      subtitle:
        row.chief_complaint ||
        row.diagnosis ||
        String(row.treatment_type || "").replaceAll("_", " ") ||
        "Consultation recorded",
    })),
    ...labServiceRows.slice(0, 5).map((bundle: any) => ({
      key: `lab-${bundle.row.id}`,
      date: bundle.row.created_at || bundle.row.start_date,
      icon: FlaskConical,
      iconTone: "bg-violet-50 text-violet-600 ring-violet-100",
      title: bundle.source === "home_care" ? "Home Care Visit" : "Lab Order",
      subtitle: `${bundle.items.length} item(s) · ${bundle.row.status || "recorded"}`,
    })),
    ...medicineRows.slice(0, 5).map((bundle: any) => ({
      key: `medicine-${bundle.row.id}`,
      date: bundle.row.created_at,
      icon: Pill,
      iconTone: "bg-rose-50 text-rose-600 ring-rose-100",
      title: "Medicines Dispensed",
      subtitle: `${bundle.items.length} item(s) · ${bundle.row.status || "recorded"}`,
    })),
    ...patientInvoices.slice(0, 5).map((invoice: any) => ({
      key: `invoice-${invoice.id}`,
      date: invoice.created_at,
      icon: ReceiptText,
      iconTone: "bg-emerald-50 text-emerald-600 ring-emerald-100",
      title: `Invoice ${invoice.invoice_number || ""}`,
      subtitle: `${money(invoice.total_amount)} · ${String(invoice.status || "").replaceAll("_", " ")}`,
    })),
  ]
    .filter((entry) => entry.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 6);
}

/**
 * Standalone "Health Timeline" section — split out of the overview dashboard
 * so pages that want the timeline pinned at the very bottom (e.g. Patient
 * History) can render it separately, after every other section.
 */
export function PatientHealthTimeline({
  consultations,
  labServiceRows,
  medicineRows,
  patientInvoices,
}: any) {
  const timelineEntries = buildTimelineEntries({
    consultations,
    labServiceRows,
    medicineRows,
    patientInvoices,
  });

  return (
    <DetailSection
      title="Health Timeline"
      description="Most recent interactions across every module."
      count={timelineEntries.length}
    >
      {timelineEntries.length === 0 ? (
        <p className="text-xs font-semibold text-slate-400">
          No activity recorded for this patient yet.
        </p>
      ) : (
        <div className="space-y-3">
          {timelineEntries.map((entry) => {
            const Icon = entry.icon;
            return (
              <div key={entry.key} className="flex items-start gap-3">
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ${entry.iconTone}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">
                      {entry.title}
                    </p>
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                      <CalendarClock className="h-3 w-3" />
                      {fmtDate(entry.date)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {entry.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DetailSection>
  );
}

export function PatientOverviewDashboard({
  summary,
  vitals,
  consultations,
  labServiceRows,
  medicineRows,
  patientInvoices,
  totalBilled,
  totalDue,
  visibleMembership,
  freeConsultationsUsed,
  freeConsultationsAllocated,
  freeLabUsed,
  freeLabAllocated,
  freeMedicineUsed,
  freeMedicineAllocated,
  patientIntelligence,
  onOpenConsultation,
  onOpenInvoice,
  bmiReadings = [],
  vitalsLoading = false,
  createVital,
  savingVital = false,
  showTimeline = true,
}: any) {
  // A reading may only capture a subset of vitals (e.g. a BP-only triage
  // re-check), so each stat below is sourced from the most recent reading
  // that actually carries that field, rather than assuming one row has
  // everything.
  const sortedVitals = [...vitals].sort((a: any, b: any) =>
    String(a.recorded_at).localeCompare(String(b.recorded_at)),
  );
  const withBmiReading = sortedVitals.filter(
    (row: any) => row.height_cm && row.weight_kg,
  );
  const latestVital = withBmiReading[withBmiReading.length - 1];
  const previousVital = withBmiReading[withBmiReading.length - 2];
  const latestBpVital = [...sortedVitals].reverse().find((row: any) => row.bp);
  const latestBmi = latestVital
    ? bmiOf({
        date: "",
        heightCm: Number(latestVital.height_cm),
        weightKg: Number(latestVital.weight_kg),
      })
    : null;
  const bmiZone = latestBmi ? zoneFor(latestBmi) : null;
  const weightDelta =
    latestVital && previousVital
      ? Number(latestVital.weight_kg) - Number(previousVital.weight_kg)
      : null;

  const lastVisitDate = [
    consultations[0]?.created_at,
    labServiceRows[0]?.row?.created_at,
    medicineRows[0]?.row?.created_at,
  ]
    .filter(Boolean)
    .sort((a: string, b: string) => b.localeCompare(a))[0];

  const insights: {
    icon: any;
    tone: "green" | "amber" | "red" | "blue";
    text: string;
  }[] = [];
  if (bmiZone) {
    insights.push({
      icon: HeartPulse,
      tone:
        bmiZone.key === "normal"
          ? "green"
          : bmiZone.key === "obese"
            ? "red"
            : "amber",
      text:
        bmiZone.key === "normal"
          ? "BMI is in the normal range. Encourage maintaining current lifestyle."
          : `BMI falls in the ${bmiZone.label.toLowerCase()} range — consider a follow-up on diet and activity.`,
    });
  }
  if (totalDue > 0) {
    insights.push({
      icon: ReceiptText,
      tone: "amber",
      text: `${money(totalDue)} outstanding across this patient's invoices.`,
    });
  }
  const nextRefill = patientIntelligence?.metrics?.expected_refill_at;
  if (nextRefill && new Date(nextRefill) < new Date()) {
    insights.push({
      icon: Bell,
      tone: "red",
      text: `Medicine refill was expected on ${fmtDate(nextRefill)} — follow up with the patient.`,
    });
  }
  if (insights.length === 0) {
    insights.push({
      icon: ShieldAlert,
      tone: "blue",
      text: "No outstanding follow-ups detected from current records.",
    });
  }

  return (
    <div className="grid gap-4 bg-white p-3 rounded-lg">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 ">
        <CompactMetric
          label="BMI"
          value={
            latestBmi ? (
              <span className="inline-flex items-center gap-2">
                {latestBmi.toFixed(1)}
                {bmiZone && (
                  <Badge tone="slate" className="normal-label">
                    {bmiZone.label}
                  </Badge>
                )}
              </span>
            ) : (
              "-"
            )
          }
        />
        <CompactMetric
          label="Weight"
          value={
            latestVital ? (
              <span className="inline-flex items-center gap-1">
                {Number(latestVital.weight_kg).toFixed(1)} kg
                {weightDelta !== null && weightDelta !== 0 && (
                  <span
                    className={`text-[10px] font-bold ${weightDelta > 0 ? "text-red-600" : "text-emerald-600"}`}
                  >
                    {weightDelta > 0 ? "▲" : "▼"}{" "}
                    {Math.abs(weightDelta).toFixed(1)} kg
                  </span>
                )}
              </span>
            ) : (
              "-"
            )
          }
        />
        <CompactMetric
          label="Height"
          value={
            latestVital ? `${Number(latestVital.height_cm).toFixed(0)} cm` : "-"
          }
        />
        <CompactMetric label="BP" value={latestBpVital?.bp || "-"} />
        <CompactMetric
          label="Last Visit"
          value={lastVisitDate ? fmtDate(lastVisitDate) : "-"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 ">
        <DetailSection
          title="Recent Activity"
          description="Records logged for this patient."
        >
          <div className="grid grid-cols-2 gap-3">
            <CompactMetric label="Consultations" value={consultations.length} />
            <CompactMetric
              label="Lab & Services"
              value={labServiceRows.length}
            />
            <CompactMetric label="Medicines" value={medicineRows.length} />
            <CompactMetric
              label="Invoices"
              value={`${patientInvoices.length} · ${money(totalBilled)}`}
            />
          </div>
        </DetailSection>

        <DetailSection
          title="Membership Plan"
          description={
            visibleMembership ? "Active benefit usage." : "No active plan."
          }
        >
          {visibleMembership ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-slate-950">
                  {visibleMembership.plan?.name || "Membership plan"}
                </p>
                <Badge tone="green" className="normal-badge">
                  active
                </Badge>
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                  <span>Consultations</span>
                  <span>
                    {freeConsultationsUsed}/{freeConsultationsAllocated}
                  </span>
                </div>
                <ProgressBar
                  used={freeConsultationsUsed}
                  allocated={freeConsultationsAllocated}
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                  <span>Lab Tests</span>
                  <span>
                    {freeLabUsed}/{freeLabAllocated}
                  </span>
                </div>
                <ProgressBar
                  used={freeLabUsed}
                  allocated={freeLabAllocated}
                  tone="bg-violet-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                  <span>Medicines</span>
                  <span>
                    {freeMedicineUsed}/{freeMedicineAllocated}
                  </span>
                </div>
                <ProgressBar
                  used={freeMedicineUsed}
                  allocated={freeMedicineAllocated}
                  tone="bg-rose-500"
                />
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <CreditCard className="h-4 w-4" /> Patient has no active
              membership plan.
            </p>
          )}
        </DetailSection>

        <DetailSection
          title="Quick Health Summary"
          description="Allergies, conditions and notes."
        >
          <div className="grid grid-cols-2 gap-3">
            <CompactMetric
              label="Allergies"
              value={summary?.allergies?.length || 0}
            />
            <CompactMetric
              label="Chronic Conditions"
              value={summary?.chronic_conditions?.length || 0}
            />
            <CompactMetric
              label="Active Medicines"
              value={medicineRows.length}
            />
            <CompactMetric
              label="Health Notes"
              value={summary?.notes?.length || 0}
            />
          </div>
        </DetailSection>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-black text-slate-900">
          Health Trends
        </h3>
        {vitalsLoading ? (
          <div className="grid h-48 place-items-center rounded-lg border border-dashed border-slate-200 text-xs font-medium text-slate-400">
            Loading vitals…
          </div>
        ) : bmiReadings.length === 0 ? (
          <PatientVitalsIntakeForm
            onSubmit={createVital}
            saving={savingVital}
          />
        ) : (
          <BmiTrendChart readings={bmiReadings} />
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-black text-slate-900">Other Vitals</h3>
        <VitalsMetricsChart vitals={vitals} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <DetailSection
          title="Recent Consultations"
          count={consultations.length}
        >
          {consultations.length === 0 ? (
            <p className="text-xs font-semibold text-slate-400">
              No consultations yet.
            </p>
          ) : (
            <div className="space-y-2">
              {consultations.slice(0, 4).map((row: any) => (
                <button
                  type="button"
                  key={row.id}
                  onClick={() => onOpenConsultation?.(row)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900">
                      {row.practitioner_name || "Consultation"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {fmtDate(row.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </button>
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection
          title="Recent Lab & Services"
          count={labServiceRows.length}
        >
          {labServiceRows.length === 0 ? (
            <p className="text-xs font-semibold text-slate-400">
              No lab or service orders yet.
            </p>
          ) : (
            <div className="space-y-2">
              {labServiceRows.slice(0, 4).map((bundle: any) => (
                <div
                  key={bundle.row.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900">
                      {bundle.items.length} item(s)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {fmtDate(bundle.row.created_at || bundle.row.start_date)}
                    </p>
                  </div>
                  <StatusBadge status={bundle.row.status} />
                </div>
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection title="Recent Invoices" count={patientInvoices.length}>
          {patientInvoices.length === 0 ? (
            <p className="text-xs font-semibold text-slate-400">
              No invoices yet.
            </p>
          ) : (
            <div className="space-y-2">
              {patientInvoices.slice(0, 4).map((invoice: any) => (
                <button
                  type="button"
                  key={invoice.id}
                  onClick={() => onOpenInvoice?.(invoice)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900">
                      {invoice.invoice_number}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {money(invoice.total_amount)}
                    </p>
                  </div>
                  <StatusBadge status={invoice.status} />
                </button>
              ))}
            </div>
          )}
        </DetailSection>
      </div>

      <DetailSection
        title="Health Insights"
        description="Auto-generated from current records."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {insights.map((insight, index) => (
            <InsightChip
              key={index}
              icon={insight.icon}
              tone={insight.tone}
              text={insight.text}
            />
          ))}
        </div>
      </DetailSection>

      {showTimeline && (
        <PatientHealthTimeline
          consultations={consultations}
          labServiceRows={labServiceRows}
          medicineRows={medicineRows}
          patientInvoices={patientInvoices}
        />
      )}
    </div>
  );
}
