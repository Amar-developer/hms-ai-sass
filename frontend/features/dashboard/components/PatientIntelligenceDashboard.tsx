"use client";

import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, CalendarClock, Flag, MessageCircle, Users } from "lucide-react";

import {
  ActionButton,
  Card,
  Input,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { Pagination } from "@/app/components/common/Pagination";
import { Skeleton } from "@/app/components/common/loader/Skeleton";
import {
  fetchIntelligenceDashboard,
  queueRecommendedEngagementActions,
} from "@/features/patient_intelligence/api/patientIntelligence.api";
import { displayDate, money } from "@/utils/helper";

const PAGE_SIZE = 20;

function IntelligenceBadge({ flag }: any) {
  return (
    <span
      title={`${flag.label} · ${flag.category} · ${flag.severity}`}
      style={{
        backgroundColor: flag.background_color || "#f8fafc",
        color: flag.text_color || "#334155",
        borderColor: flag.border_color || "#cbd5e1",
      }}
      className="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold"
    >
      {flag.label}
    </span>
  );
}

function humanizeKey(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function communicationLabel(status: string | null | undefined) {
  const normalized = String(status || "not_sent");
  if (normalized === "not_sent") return "Not sent";
  return humanizeKey(normalized);
}

function CommunicationStatus({ status, at }: { status?: string; at?: string }) {
  const normalized = String(status || "not_sent");
  const styles: Record<string, string> = {
    sent: "bg-emerald-100 text-emerald-800 border-emerald-200",
    queued: "bg-blue-100 text-blue-800 border-blue-200",
    approved: "bg-indigo-100 text-indigo-800 border-indigo-200",
    recommended: "bg-amber-100 text-amber-800 border-amber-200",
    failed: "bg-red-100 text-red-800 border-red-200",
    suppressed: "bg-slate-100 text-slate-700 border-slate-200",
    cancelled: "bg-slate-100 text-slate-500 border-slate-200",
    not_sent: "bg-white text-slate-500 border-slate-200",
  };
  return (
    <div>
      <span
        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${
          styles[normalized] || styles.not_sent
        }`}
      >
        {communicationLabel(normalized)}
      </span>
      {at && normalized !== "not_sent" && (
        <p className="mt-1 text-[10px] font-semibold text-slate-500">
          {displayDate(at)}
        </p>
      )}
    </div>
  );
}

export function PatientIntelligenceDashboard({
  apiSession,
  branchId,
  setActive,
}: any) {
  const [filters, setFilters] = useState({
    q: "",
    fromDate: "",
    toDate: "",
    flagKey: "",
    category: "",
    engagementStatus: "",
  });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    if (!apiSession) return;
    setLoading(true);
    try {
      setData(
        await fetchIntelligenceDashboard(
          apiSession,
          {
            branchId,
            query: applied.q,
            fromDate: applied.fromDate,
            toDate: applied.toDate,
            flagKey: applied.flagKey,
            category: applied.category,
            engagementStatus: applied.engagementStatus,
            limit: PAGE_SIZE,
            offset: (page - 1) * PAGE_SIZE,
          },
        ),
      );
    } catch (error: any) {
      setMessage(error.message || "Could not load Patient Intelligence dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [apiSession?.tenantId, branchId, page, applied]);

  const flagOptions = useMemo(
    () =>
      Array.from(
        new Map(
          (data?.flag_options || []).map((row: any) => [row.flag_key, row]),
        ).values(),
      ) as any[],
    [data?.flag_options],
  );
  const categories = useMemo(
    () =>
      [...new Set(flagOptions.map((row: any) => row.category))] as string[],
    [flagOptions],
  );
  const totalPages = Math.max(1, Math.ceil(Number(data?.total || 0) / PAGE_SIZE));

  function openPatient(row: any) {
    sessionStorage.setItem("medizinhub.patientId", row.patient_id);
    setActive?.("patients");
  }

  async function bulkQueueRecommended() {
    if (!apiSession) return;
    setLoading(true);
    setMessage("");
    try {
      const payload = {
        flag_key: applied.flagKey || null,
        category: applied.category || null,
        limit: 500,
      };
      const preview: any = await queueRecommendedEngagementActions(
        apiSession,
        { ...payload, dry_run: true },
      );
      if (!preview.matched) {
        setMessage("No recommended WhatsApp engagement actions match these filters.");
        return;
      }
      const confirmed = window.confirm(
        `Queue ${preview.matched} recommended WhatsApp engagement action${
          preview.matched === 1 ? "" : "s"
        } for the current filters?`,
      );
      if (!confirmed) return;
      const result: any = await queueRecommendedEngagementActions(
        apiSession,
        { ...payload, dry_run: false },
      );
      setMessage(
        `Queued ${result.queued || 0}. Suppressed ${result.suppressed || 0}. Failed ${result.failed || 0}.`,
      );
      await load();
    } catch (error: any) {
      setMessage(error.message || "Could not queue engagement campaign.");
    } finally {
      setLoading(false);
    }
  }

  const cards = [
    ["Patients", data?.summary?.total_patients || 0, Users],
    ["Patients With Flags", data?.summary?.patients_with_flags || 0, Flag],
    ["Active Flags", data?.summary?.active_flags || 0, BrainCircuit],
    ["Open Engagement", data?.summary?.open_engagement_actions || 0, MessageCircle],
    [
      "Upcoming Medicine Reminders",
      data?.summary?.upcoming_refill_reminders || 0,
      CalendarClock,
    ],
    [
      "Today's Monthly Medicine Patients",
      data?.summary?.today_medicine_patients || 0,
      CalendarClock,
    ],
    [
      "Upcoming Lab Test Reminders",
      data?.summary?.upcoming_lab_test_reminders || 0,
      CalendarClock,
    ],
    [
      "Today's Monthly Lab Test Patients",
      data?.summary?.today_lab_test_patients || 0,
      CalendarClock,
    ],
    ["Value Score", data?.summary?.value_score_total || 0, BrainCircuit],
    ["Engagement Score", data?.summary?.engagement_score_total || 0, MessageCircle],
    ["Risk Score", data?.summary?.risk_score_total || 0, Flag],
    ["Loyalty Score", data?.summary?.loyalty_score_total || 0, Users],
  ];

  return (
    <div className="space-y-5">
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon]: any) => (
          <Card key={label}>
            <div className="flex items-center gap-2 text-slate-500"><Icon size={17} /><b className="text-xs">{label}</b></div>
            {loading && !data ? <Skeleton className="mt-3 h-7 w-16" /> : <p className="mt-3 text-2xl font-black">{value}</p>}
          </Card>
        ))}
      </div>

      <Card>
        <div>
          <h3 className="card-title font-bold">Patient Intelligence Filters</h3>
          <p className="card-desc text-slate-500">Filter analytics and patient details across value, behavior and engagement signals.</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <FormField label="Patient Search"><Input value={filters.q} onChange={(e: any) => setFilters({ ...filters, q: e.target.value })} onKeyDown={(e: any) => { if (e.key === "Enter") { setPage(1); setApplied(filters); } }} placeholder="Name, ID or mobile" /></FormField>
          <FormField label="Last Activity From"><Input type="date" value={filters.fromDate} onChange={(e: any) => setFilters({ ...filters, fromDate: e.target.value })} /></FormField>
          <FormField label="Last Activity To"><Input type="date" value={filters.toDate} onChange={(e: any) => setFilters({ ...filters, toDate: e.target.value })} /></FormField>
          <FormField label="Flag"><Select value={filters.flagKey} onChange={(e: any) => setFilters({ ...filters, flagKey: e.target.value })}><option value="">All flags</option>{flagOptions.map((row: any) => <option key={row.flag_key} value={row.flag_key}>{row.label}</option>)}</Select></FormField>
          <FormField label="Category"><Select value={filters.category} onChange={(e: any) => setFilters({ ...filters, category: e.target.value })}><option value="">All categories</option>{categories.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</Select></FormField>
          <FormField label="Engagement"><Select value={filters.engagementStatus} onChange={(e: any) => setFilters({ ...filters, engagementStatus: e.target.value })}><option value="">All actions</option><option value="recommended">Recommended</option><option value="approved">Approved</option><option value="queued">Queued</option><option value="sent">Sent</option><option value="suppressed">Suppressed</option><option value="failed">Failed</option></Select></FormField>
        </div>
        <div className="mt-3 flex gap-2"><ActionButton tone="primary" onClick={() => { setPage(1); setApplied(filters); }}>Apply Filters</ActionButton><ActionButton onClick={() => { const empty = { q: "", fromDate: "", toDate: "", flagKey: "", category: "", engagementStatus: "" }; setFilters(empty); setApplied(empty); setPage(1); }}>Clear</ActionButton></div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="card-title font-bold">Campaign Queue</h3>
            <p className="card-desc text-slate-500">
              Queue recommended Patient Intelligence WhatsApp actions for the
              current flag/category filters. Opt-in and template readiness are
              still enforced before any message is queued.
            </p>
          </div>
          <ActionButton
            tone="primary"
            onClick={bulkQueueRecommended}
            disabled={loading}
          >
            Queue Recommended WhatsApp
          </ActionButton>
        </div>
      </Card>

      <Card>
        <h3 className="card-title font-bold">Flag Distribution</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {(data?.badge_distribution || []).map((row: any) => <button key={row.flag_key} type="button" onClick={() => { const next = { ...filters, flagKey: row.flag_key }; setFilters(next); setApplied(next); setPage(1); }}><IntelligenceBadge flag={row} /> <span className="ml-1 text-xs font-bold">{row.count}</span></button>)}
          {!loading && !(data?.badge_distribution || []).length && <p className="text-sm text-slate-500">No flags match the current filters.</p>}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="card-title font-bold">Segment Overview</h3>
            <p className="card-desc text-slate-500">
              Review which patient segments have campaign-ready engagement
              actions before sending WhatsApp messages.
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.segments || []).map((segment: any) => (
            <button
              key={segment.flag_key}
              type="button"
              onClick={() => {
                const next = { ...filters, flagKey: segment.flag_key };
                setFilters(next);
                setApplied(next);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left hover:border-slate-300 hover:bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <IntelligenceBadge flag={segment} />
                <span className="text-[11px] font-bold uppercase text-slate-400">
                  {humanizeKey(segment.category)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="font-black text-slate-950">{segment.patient_count}</p>
                  <p className="text-slate-500">Patients</p>
                </div>
                <div>
                  <p className="font-black text-blue-700">
                    {segment.recommended_count}
                  </p>
                  <p className="text-slate-500">Recommended</p>
                </div>
                <div>
                  <p className="font-black text-amber-700">
                    {segment.suppressed_count}
                  </p>
                  <p className="text-slate-500">Suppressed</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Open: {segment.open_engagement_count} · Queued:{" "}
                {segment.queued_count} · Sent: {segment.sent_count} · Failed:{" "}
                {segment.failed_count}
              </p>
            </button>
          ))}
          {!loading && !(data?.segments || []).length && (
            <p className="text-sm text-slate-500">
              No active segments match the current filters.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1450px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Patient</th>
                <th className="px-3 py-3">Last Activity</th>
                <th className="px-3 py-3">30-day Value</th>
                <th className="px-3 py-3">Annual Value</th>
                <th className="px-3 py-3">Visits</th>
                <th className="px-3 py-3">Scores</th>
                <th className="px-3 py-3">Flags</th>
                <th className="px-3 py-3">Monthly Reminder</th>
                <th className="px-3 py-3">Membership Renewal</th>
                <th className="px-3 py-3">Health Tip</th>
                <th className="px-3 py-3">Medicine / Lab Tracking</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.rows || []).map((row: any) => (
                <tr key={row.patient_id} className="hover:bg-slate-50">
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => openPatient(row)}
                      className="text-left"
                    >
                      <b>{row.full_name}</b>
                      <p className="text-xs text-slate-500">
                        {row.patient_number} · {row.mobile || "No mobile"}
                      </p>
                    </button>
                  </td>
                  <td className="px-3 py-3">{displayDate(row.last_activity_at)}</td>
                  <td className="px-3 py-3 font-semibold">
                    {money(row.net_collected_30d)}
                  </td>
                  <td className="px-3 py-3 font-semibold">
                    {money(row.net_collected_365d)}
                  </td>
                  <td className="px-3 py-3">{row.completed_visits}</td>
                  <td className="px-3 py-3 text-xs">
                    <b>{row.score_summary?.total || 0}</b>
                    <p className="text-slate-500">
                      V {row.score_summary?.value || 0} · E{" "}
                      {row.score_summary?.engagement || 0} · R{" "}
                      {row.score_summary?.risk || 0}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-72 flex-wrap gap-1">
                      {row.flags.map((flag: any) => (
                        <IntelligenceBadge key={flag.flag_key} flag={flag} />
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {row.active_flag_count} active · {row.open_engagement_count} open
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <CommunicationStatus
                      status={row.monthly_reminder_status}
                      at={row.monthly_reminder_at}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <CommunicationStatus
                      status={row.membership_reminder_status}
                      at={row.membership_reminder_at}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <CommunicationStatus
                      status={row.health_tip_status}
                      at={row.health_tip_at}
                    />
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <b>Medicine: {displayDate(row.expected_refill_at)}</b>
                    {row.manual_expected_refill_at && (
                      <p className="font-bold text-blue-600">Monthly patient field</p>
                    )}
                    <p className="mt-1">
                      <b>Lab: {displayDate(row.manual_expected_lab_at)}</b>
                      {row.manual_lab_test_name && (
                        <span className="block text-slate-500">
                          {row.manual_lab_test_name}
                        </span>
                      )}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <ActionButton onClick={() => openPatient(row)}>
                      Patient Details
                    </ActionButton>
                  </td>
                </tr>
              ))}
              {!loading && !(data?.rows || []).length && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                    No patients match the selected intelligence filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} total={Number(data?.total || 0)} onPage={setPage} />
      </Card>
    </div>
  );
}
