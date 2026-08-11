import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

import { FormField } from "@/app/components/FormElements";
import { Badge, Card, Input } from "@/app/components/common/ui";
import { apiFetch } from "@/lib/api";
import {
  FilterConfig,
  FilterSection,
} from "@/app/components/common/FilterSection";
import { DataTable } from "@/app/components/common/DataTable";
import { Column } from "@/utils/types";

type QueueItem = {
  id: string;
  flow_key: string;
  recipient_name: string;
  recipient_masked: string;
  status: "queued" | "processing" | "sent" | "failed" | "cancelled";
  resource_type?: string | null;
  resource_reference?: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at?: string | null;
  failure_reason?: string | null;
  created_at: string;
  sent_at?: string | null;
};

type QueueResponse = {
  items: QueueItem[];
  total: number;
  limit: number;
  offset: number;
  counts: Record<
    "queued" | "processing" | "sent" | "failed" | "cancelled",
    number
  >;
};

const emptyQueue: QueueResponse = {
  items: [],
  total: 0,
  limit: 20,
  offset: 0,
  counts: { queued: 0, processing: 0, sent: 0, failed: 0, cancelled: 0 },
};

const flowLabels: Record<string, string> = {
  appointment_booked_patient: "Patient appointment",
  appointment_booked_doctor: "Doctor appointment",
  invoice_paid_patient: "Paid invoice",
  payment_pending_patient: "Pending payment",
  appointment_cancelled_patient: "Patient cancellation",
  appointment_cancelled_doctor: "Doctor cancellation",
  invoice_refunded_patient: "Invoice refund",
  lab_report_ready_patient: "Lab report ready",
  prescription_ready_patient: "Prescription ready",
  follow_up_advice_patient: "Follow-up advice",
  appointment_reminder_patient: "Appointment reminder",
  medicine_refill_patient: "Medicine refill",
  membership_renewal_patient: "Membership renewal",
  patient_reengagement: "Patient re-engagement",
  home_care_booking_patient: "Home care booking",
  home_care_visit_patient: "Home care visit",
  home_visit_booking_patient: "Home visit booking",
  home_visit_reminder_patient: "Home visit reminder",
  ip_admission_patient: "IP admission",
  ip_discharge_patient: "IP discharge",
  physiotherapy_case_patient: "Physiotherapy case",
  physiotherapy_session_patient: "Physiotherapy session",
  pharmacy_dispense_patient: "Pharmacy dispense",
  service_invoice_patient: "Service invoice",
  service_follow_up_patient: "Service follow-up",
};

const statusTone: Record<string, "blue" | "green" | "red" | "slate" | "amber"> =
  {
    queued: "blue",
    processing: "amber",
    sent: "green",
    failed: "red",
    cancelled: "slate",
  };

function dateTime(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-IN");
}

const flowFilterOptions: FilterConfig[] = [
  {
    key: "flow",
    label: "Flow",
    options: [
      { value: "all", label: "All flows" },
      ...Object.entries(flowLabels).map(([value, label]) => ({
        value,
        label,
      })),
    ],
  },
];

export function WhatsAppDeliveryQueue({
  apiSession,
  tenantId,
  onMessage,
}: {
  apiSession?: any;
  tenantId: string;
  onMessage: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<QueueResponse>(emptyQueue);
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [flowFilter, setFlowFilter] = useState("");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [offset, setOffset] = useState(0);

  const loadQueue = useCallback(async () => {
    if (!apiSession || !tenantId || !expanded) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({
        limit: "20",
        offset: String(offset),
      });
      if (statusFilter) params.set("status_filter", statusFilter);
      if (flowFilter) params.set("flow_key", flowFilter);
      if (query.trim()) params.set("q", query.trim());
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      const response = await apiFetch(
        `/communications/whatsapp/queue?${params.toString()}`,
        { ...apiSession, tenantId },
      );
      setData({
        ...emptyQueue,
        ...response,
        counts: { ...emptyQueue.counts, ...(response?.counts || {}) },
      });
    } catch (error: any) {
      onMessage(error.message || "Could not load the delivery queue.");
    } finally {
      setBusy(false);
    }
  }, [
    apiSession,
    expanded,
    flowFilter,
    fromDate,
    offset,
    onMessage,
    query,
    statusFilter,
    tenantId,
    toDate,
  ]);

  useEffect(() => {
    if (!expanded) return undefined;
    void loadQueue();
    const timer = window.setInterval(() => void loadQueue(), 30_000);
    return () => window.clearInterval(timer);
  }, [expanded, loadQueue]);

  async function runAction(item: QueueItem, action: "retry" | "cancel") {
    if (!apiSession || !tenantId) return;
    if (
      action === "cancel" &&
      !window.confirm("Cancel this queued notification?")
    )
      return;
    setActionId(item.id);
    try {
      await apiFetch(
        `/communications/whatsapp/queue/${encodeURIComponent(item.id)}/${action}`,
        { ...apiSession, tenantId },
        { method: "POST" },
      );
      onMessage(
        action === "retry"
          ? "Notification queued for retry."
          : "Notification cancelled.",
      );
      await loadQueue();
    } catch (error: any) {
      onMessage(error.message || `Could not ${action} the notification.`);
    } finally {
      setActionId("");
    }
  }

  const page = Math.floor(offset / 20) + 1;
  const pages = Math.max(1, Math.ceil(data.total / 20));
  const completed = data.counts.sent + data.counts.failed;
  const successRate = completed
    ? Math.round((data.counts.sent / completed) * 100)
    : 0;

  const columns: Column<QueueItem>[] = [
    {
      key: "recipient",
      header: "Recipient",
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
      render: (item) => flowLabels[item.flow_key] || item.flow_key,
    },
    {
      key: "resource_reference",
      header: "Reference",
      render: (item) => item.resource_reference || "—",
    },
    {
      key: "status",
      header: "Status",
      render: (item) => (
        <Badge tone={statusTone[item.status] || "slate"} className="normal-badge">{item.status}</Badge>
      ),
    },
    {
      key: "attempts",
      header: "Attempts",
      render: (item) => `${item.attempt_count}/${item.max_attempts}`,
    },
    {
      key: "created_at",
      header: "Created",
      render: (item) => (
        <>
          <p>{dateTime(item.created_at)}</p>
          {item.status === "queued" && (
            <p className="mt-1 text-slate-500">
              Next: {dateTime(item.next_attempt_at)}
            </p>
          )}
        </>
      ),
    },
    {
      key: "failure_reason",
      header: "Failure",
      cellClassName: "max-w-56",
      render: (item) => item.failure_reason || "—",
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      cellClassName: "text-right",
      disableRowClick: true,
      render: (item) => (
        <>
          {(item.status === "failed" || item.status === "cancelled") && (
            <button
              type="button"
              className="font-bold text-blue-700 disabled:opacity-50"
              disabled={actionId === item.id}
              onClick={() => void runAction(item, "retry")}
            >
              Retry
            </button>
          )}
          {item.status === "queued" && (
            <button
              type="button"
              className="font-bold text-red-700 disabled:opacity-50"
              disabled={actionId === item.id}
              onClick={() => void runAction(item, "cancel")}
            >
              Cancel
            </button>
          )}
        </>
      ),
    },
  ];

  return (
    <Card className="mt-4 px-4 py-4 text-xs lg:text-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <div>
          <h3 className="card-title font-bold text-slate-900">
            Delivery queue
          </h3>
          <p className="card-desc mt-1 text-xs text-slate-500">
            Monitor queued, sent, failed and cancelled template notifications.
          </p>
        </div>
        <span
          className={`hover:scale-105 hover:font-bold ${expanded ? "rotate-180" : ""}`}
        >
          <ChevronDown size={18} />
        </span>
      </button>

      {expanded && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="grid gap-2 sm:grid-cols-5">
            {(
              ["queued", "processing", "sent", "failed", "cancelled"] as const
            ).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  setStatusFilter(statusFilter === status ? "" : status);
                  setOffset(0);
                }}
                className={`rounded-lg border p-3 text-left ${statusFilter === status ? "border-slate-500 bg-slate-50" : "border-slate-200"}`}
              >
                <p className="text-xs capitalize text-slate-500">{status}</p>
                <p className="mt-1 text-xl font-black text-slate-900">
                  {data.counts[status]}
                </p>
              </button>
            ))}
          </div>
          <p className="mt-2 text-right text-xs text-slate-500">
            Delivery success rate:{" "}
            <span className="font-bold text-slate-800">{successRate}%</span>
          </p>

          <div className="flex items-end justify-between gap-3">
            <div className="flex-1">
              <FilterSection
                title="Search"
                query={query}
                setQuery={(value) => {
                  setQuery(value);
                  setOffset(0);
                }}
                searchPlaceholder="Search patient, mobile or reference"
                className="lg:grid-cols-5"
                filters={flowFilterOptions}
                filterValues={{ flow: flowFilter || "all" }}
                onFilterChange={(key, value) => {
                  if (key === "flow") {
                    setFlowFilter(value === "all" ? "" : value);
                    setOffset(0);
                  }
                }}
                onReset={() => {
                  setFromDate("");
                  setToDate("");
                  setOffset(0);
                }}
              >
                <FormField label="From date">
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(event: any) => {
                      setFromDate(event.target.value);
                      setOffset(0);
                    }}
                  />
                </FormField>
                <FormField label="To date">
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(event: any) => {
                      setToDate(event.target.value);
                      setOffset(0);
                    }}
                  />
                </FormField>
              </FilterSection>
            </div>
            <button
              type="button"
              className="close-button mt-4"
              onClick={() => void loadQueue()}
              disabled={busy}
              aria-label="Refresh delivery queue"
            >
              <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="mt-4">
            <DataTable
              columns={columns}
              data={data.items}
              loading={busy && data.items.length === 0}
              emptyMessage="No delivery records match these filters."
              className="min-w-[940px] text-xs"
            />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Page {page} of {pages} · {data.total} records
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="close-button"
                disabled={offset === 0 || busy}
                onClick={() => setOffset(Math.max(0, offset - 20))}
              >
                Previous
              </button>
              <button
                type="button"
                className="close-button"
                disabled={offset + 20 >= data.total || busy}
                onClick={() => setOffset(offset + 20)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
