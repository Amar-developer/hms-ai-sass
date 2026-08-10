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
import { apiFetch } from "@/lib/api";
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
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (branchId) params.set("branch_id", branchId);
      if (applied.q) params.set("q", applied.q);
      if (applied.fromDate) params.set("from_date", applied.fromDate);
      if (applied.toDate) params.set("to_date", applied.toDate);
      if (applied.flagKey) params.set("flag_key", applied.flagKey);
      if (applied.category) params.set("category", applied.category);
      if (applied.engagementStatus)
        params.set("engagement_status", applied.engagementStatus);
      setData(
        await apiFetch(
          `/patient-intelligence/dashboard?${params.toString()}`,
          apiSession,
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
  ];

  return (
    <div className="space-y-5">
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
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
        <h3 className="card-title font-bold">Flag Distribution</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {(data?.badge_distribution || []).map((row: any) => <button key={row.flag_key} type="button" onClick={() => { const next = { ...filters, flagKey: row.flag_key }; setFilters(next); setApplied(next); setPage(1); }}><IntelligenceBadge flag={row} /> <span className="ml-1 text-xs font-bold">{row.count}</span></button>)}
          {!loading && !(data?.badge_distribution || []).length && <p className="text-sm text-slate-500">No flags match the current filters.</p>}
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Patient</th><th className="px-3 py-3">Last Activity</th><th className="px-3 py-3">30-day Value</th><th className="px-3 py-3">Annual Value</th><th className="px-3 py-3">Visits</th><th className="px-3 py-3">Flags</th><th className="px-3 py-3">Engagement</th><th className="px-3 py-3">Prescription / Refill</th><th className="px-3 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.rows || []).map((row: any) => <tr key={row.patient_id} className="hover:bg-slate-50"><td className="px-3 py-3"><button type="button" onClick={() => openPatient(row)} className="text-left"><b>{row.full_name}</b><p className="text-xs text-slate-500">{row.patient_number} · {row.mobile || "No mobile"}</p></button></td><td className="px-3 py-3">{displayDate(row.last_activity_at)}</td><td className="px-3 py-3 font-semibold">{money(row.net_collected_30d)}</td><td className="px-3 py-3 font-semibold">{money(row.net_collected_365d)}</td><td className="px-3 py-3">{row.completed_visits}</td><td className="px-3 py-3"><div className="flex max-w-72 flex-wrap gap-1">{row.flags.map((flag: any) => <IntelligenceBadge key={flag.flag_key} flag={flag} />)}</div><p className="mt-1 text-[10px] text-slate-500">{row.active_flag_count} active</p></td><td className="px-3 py-3">{row.open_engagement_count} open</td><td className="px-3 py-3"><b>{displayDate(row.expected_refill_at)}</b>{row.manual_expected_refill_at && <p className="text-[10px] font-bold text-blue-600">Manually scheduled</p>}</td><td className="px-3 py-3"><ActionButton onClick={() => openPatient(row)}>Patient Details</ActionButton></td></tr>)}
              {!loading && !(data?.rows || []).length && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No patients match the selected intelligence filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} total={Number(data?.total || 0)} onPage={setPage} />
      </Card>
    </div>
  );
}
