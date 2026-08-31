import { useCallback, useEffect, useState } from "react";
import { MessageSquare, RefreshCw } from "lucide-react";

import { FormField } from "@/app/components/FormElements";
import { DataTable } from "@/app/components/common/DataTable";
import { FilterConfig, FilterSection } from "@/app/components/common/FilterSection";
import { Badge, Card, Input } from "@/app/components/common/ui";
import { fetchSmsQueue, updateSmsQueueItem } from "@/features/admin/api/sms.api";
import { Column } from "@/utils/types";
import { flowOptions } from "../constants";
import { SmsQueueItem, SmsQueueResponse } from "../types";

const emptyQueue: SmsQueueResponse = {
  items: [],
  total: 0,
  limit: 20,
  offset: 0,
  counts: { queued: 0, processing: 0, sent: 0, failed: 0, cancelled: 0 },
};

const statusTone: Record<string, "blue" | "green" | "red" | "slate" | "amber"> = {
  queued: "blue",
  processing: "amber",
  sent: "green",
  failed: "red",
  cancelled: "slate",
};

const flowLabels = Object.fromEntries(
  flowOptions.map((flow) => [flow.key, flow.label]),
) as Record<string, string>;

const flowFilters: FilterConfig[] = [
  {
    key: "flow",
    label: "Flow",
    options: [
      { value: "all", label: "All flows" },
      ...flowOptions.map((flow) => ({ value: flow.key, label: flow.label })),
    ],
  },
];

function dateTime(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-IN");
}

export function SmsDeliveryQueue({
  apiSession,
  tenantId,
  onMessage,
}: {
  apiSession?: any;
  tenantId: string;
  onMessage: (message: string) => void;
}) {
  const [data, setData] = useState<SmsQueueResponse>(emptyQueue);
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [flowFilter, setFlowFilter] = useState("");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [offset, setOffset] = useState(0);

  const loadQueue = useCallback(async () => {
    if (!apiSession || !tenantId) return;
    setBusy(true);
    try {
      const response = await fetchSmsQueue(
        { ...apiSession, tenantId },
        {
          status: statusFilter,
          flowKey: flowFilter,
          query,
          fromDate,
          toDate,
          limit: 20,
          offset,
        },
      );
      setData({
        ...emptyQueue,
        ...response,
        items: Array.isArray(response?.items) ? response.items : [],
        counts: { ...emptyQueue.counts, ...(response?.counts || {}) },
      });
    } catch (error: any) {
      onMessage(error.message || "Could not load the SMS delivery queue.");
    } finally {
      setBusy(false);
    }
  }, [apiSession, flowFilter, fromDate, offset, onMessage, query, statusFilter, tenantId, toDate]);

  useEffect(() => {
    void loadQueue();
    const timer = window.setInterval(() => void loadQueue(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadQueue]);

  async function runAction(item: SmsQueueItem, action: "retry" | "cancel") {
    if (!apiSession || !tenantId) return;
    if (action === "cancel" && !window.confirm("Cancel this queued SMS?")) return;
    setActionId(item.id);
    try {
      await updateSmsQueueItem({ ...apiSession, tenantId }, item.id, action);
      onMessage(action === "retry" ? "SMS queued for retry." : "SMS cancelled.");
      await loadQueue();
    } catch (error: any) {
      onMessage(error.message || `Could not ${action} the SMS.`);
    } finally {
      setActionId("");
    }
  }

  const columns: Column<SmsQueueItem>[] = [
    {
      key: "recipient",
      header: "Recipient",
      width: "150px",
      render: (item) => (
        <>
          <p className="font-bold text-slate-800">{item.recipient_name}</p>
          <p className="text-slate-500">{item.recipient_masked}</p>
        </>
      ),
    },
    {
      key: "flow_key",
      header: "Flow",
      width: "140px",
      render: (item) => flowLabels[item.flow_key] || item.flow_key,
    },
    {
      key: "status",
      header: "Status",
      width: "120px",
      render: (item) => (
        <div className="space-y-1">
          <Badge tone={statusTone[item.status] || "slate"} className="normal-label">
            {item.status}
          </Badge>
          {item.delivery_status && <p className="text-[11px] text-slate-500">{item.delivery_status}</p>}
        </div>
      ),
    },
    {
      key: "segments",
      header: "Segments",
      width: "90px",
      render: (item) => item.segment_count ?? "—",
    },
    {
      key: "attempts",
      header: "Attempts",
      width: "90px",
      render: (item) => `${item.attempt_count}/${item.max_attempts}`,
    },
    {
      key: "created_at",
      header: "Created",
      width: "170px",
      render: (item) => dateTime(item.created_at),
    },
    {
      key: "failure_reason",
      header: "Failure",
      width: "180px",
      render: (item) => (
        <p className="max-w-[170px] truncate" title={item.failure_reason || "—"}>
          {item.failure_reason || "—"}
        </p>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "100px",
      disableRowClick: true,
      render: (item) => (
        <>
          {(item.status === "failed" || item.status === "cancelled") && (
            <button type="button" className="font-bold text-blue-700 disabled:opacity-50" disabled={actionId === item.id} onClick={() => void runAction(item, "retry")}>Retry</button>
          )}
          {item.status === "queued" && (
            <button type="button" className="font-bold text-red-700 disabled:opacity-50" disabled={actionId === item.id} onClick={() => void runAction(item, "cancel")}>Cancel</button>
          )}
        </>
      ),
    },
  ];

  const page = Math.floor(offset / 20) + 1;
  const pages = Math.max(1, Math.ceil(data.total / 20));
  return (
    <Card className="p-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="card-title font-bold text-slate-900">SMS delivery queue</h3>
          <p className="card-desc mt-1 text-slate-500">Monitor template sends, retries, segments, and delivery receipts.</p>
        </div>
        <button type="button" className="close-button" onClick={() => void loadQueue()} disabled={busy} aria-label="Refresh SMS delivery queue">
          <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        {(["queued", "processing", "sent", "failed", "cancelled"] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => { setStatusFilter(statusFilter === status ? "" : status); setOffset(0); }}
            className={`min-h-[74px] rounded-lg border bg-white px-3 py-2.5 text-left shadow-sm transition ${statusFilter === status ? "border-sky-500 ring-1 ring-sky-100" : "border-slate-200 hover:border-slate-300"}`}
          >
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{status}</p>
            <p className="mt-1 text-xl font-black text-slate-950">{data.counts[status]}</p>
          </button>
        ))}
      </div>
      <FilterSection
        title="Search"
        query={query}
        setQuery={(value) => { setQuery(value); setOffset(0); }}
        searchPlaceholder="Search patient, mobile or reference"
        className="lg:grid-cols-5"
        filters={flowFilters}
        filterValues={{ flow: flowFilter || "all" }}
        onFilterChange={(_key, value) => { setFlowFilter(value === "all" ? "" : value); setOffset(0); }}
        onReset={() => { setFromDate(""); setToDate(""); setOffset(0); }}
      >
        <FormField label="From date"><Input type="date" value={fromDate} onChange={(event: any) => { setFromDate(event.target.value); setOffset(0); }} /></FormField>
        <FormField label="To date"><Input type="date" value={toDate} onChange={(event: any) => { setToDate(event.target.value); setOffset(0); }} /></FormField>
      </FilterSection>
      <div className="mt-4">
        <DataTable
          columns={columns}
          data={data.items}
          loading={busy && data.items.length === 0}
          emptyMessage="No SMS delivery records match these filters."
          emptyDescription="Queued, sent, failed, or cancelled SMS notifications will appear here."
          emptyIcon={MessageSquare}
          minBodyHeight="220px"
          className="min-w-[1040px] text-xs"
        />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-slate-500">Page {page} of {pages} · {data.total} records</p>
        <div className="flex gap-2">
          <button type="button" className="close-button" disabled={offset === 0 || busy} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</button>
          <button type="button" className="close-button" disabled={offset + 20 >= data.total || busy} onClick={() => setOffset(offset + 20)}>Next</button>
        </div>
      </div>
    </Card>
  );
}
