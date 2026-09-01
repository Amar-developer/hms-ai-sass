"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  Bell,
  CheckCheck,
  ChevronRight,
  Megaphone,
  RefreshCw,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  notificationDestination,
  saveNotificationTarget,
} from "@/lib/notificationTarget";
import { useDropdown } from "@/hooks/useDropdown";
import { Modal } from "./Modal";
import { ActionButton, Button, SearchableSelect, StatusToast } from "./ui";
import {
  FormField,
  TextareaField,
  TextField,
} from "@/app/components/FormElements";

type NotificationRow = {
  id: string;
  category: string;
  event_type: string;
  priority: "low" | "normal" | "high" | "urgent";
  title: string;
  message: string;
  action_module?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  metadata_json?: string | null;
  is_read: boolean;
  created_at: string;
};

const categories = [
  ["all", "All categories"],
  ["appointment", "Appointments"],
  ["queue", "Queue"],
  ["billing", "Billing"],
  ["request", "Requests"],
  ["comment", "Mentions & comments"],
  ["feature_update", "Feature updates"],
  ["version_update", "Version updates"],
  ["maintenance", "Maintenance"],
  ["security", "Security"],
];

function relativeTime(value: string) {
  const created = new Date(value).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function categoryLabel(value?: string | null) {
  return String(value || "notification").replaceAll("_", " ");
}

function priorityStyle(priority: NotificationRow["priority"]) {
  if (priority === "urgent") return "border-l-red-500 bg-red-50/60";
  if (priority === "high") return "border-l-amber-500 bg-amber-50/50";
  return "border-l-slate-200 bg-white";
}

function ViewportPortal({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  if (!enabled || typeof document === "undefined") return children;
  return createPortal(children, document.body);
}

export function NotificationCenter({ apiSession, navigatePage, onOpen }: any) {
  const fullInboxRef = useRef<HTMLDivElement>(null);
  const { open, setOpen, ref, buttonRef } = useDropdown(fullInboxRef);
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState("all");
  const [publishing, setPublishing] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [announcement, setAnnouncement] = useState({
    category: "feature_update",
    priority: "normal",
    title: "",
    message: "",
    version: "",
    action_module: "",
    platformWide: false,
  });

  const user = apiSession?.user;
  const isPublisher = Boolean(
    user?.is_super_admin ||
    user?.user_type === "tenant_admin" ||
    user?.roles?.includes("tenant_admin"),
  );

  const query = useMemo(() => {
    const params = new URLSearchParams({
      limit: expanded ? "100" : "8",
      unread_only: unreadOnly ? "true" : "false",
    });
    if (category !== "all") params.set("category", category);
    return params.toString();
  }, [category, expanded, unreadOnly]);

  const load = useCallback(
    async (quiet = false) => {
      if (!apiSession) return;
      if (!quiet) setLoading(true);
      try {
        const data = await apiFetch(
          `/notifications/in-app?${query}`,
          apiSession,
        );
        setRows(data.items || []);
        setUnreadCount(Number(data.unread_count || 0));
        setTotal(Number(data.total || 0));
        if (!quiet) setStatusMessage("");
      } catch (err: any) {
        if (!quiet)
          setStatusMessage(err.message || "Could not load notifications.");
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [apiSession, query],
  );

  useEffect(() => {
    load(true);
    const timer = window.setInterval(() => load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!apiSession) return;
    apiFetch("/health", apiSession)
      .then((data: any) => setAppVersion(String(data?.version || "")))
      .catch(() => {});
  }, [apiSession?.tenantId]);

  useEffect(() => {
    if (open) load();
  }, [open, expanded, unreadOnly, category, load]);

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  async function updateRow(
    row: NotificationRow,
    payload: { is_read?: boolean; archived?: boolean },
  ) {
    const updated = await apiFetch(
      `/notifications/in-app/${row.id}`,
      apiSession,
      { method: "PATCH", body: JSON.stringify(payload) },
    );
    setRows((current) =>
      payload.archived
        ? current.filter((item) => item.id !== row.id)
        : current.map((item) => (item.id === row.id ? updated : item)),
    );
    if (payload.is_read && !row.is_read) {
      setUnreadCount((count) => Math.max(0, count - 1));
    }
  }

  async function openNotification(row: NotificationRow) {
    try {
      if (!row.is_read) await updateRow(row, { is_read: true });
    } catch {}
    if (typeof window !== "undefined" && row.resource_id) {
      saveNotificationTarget(row);
      if (row.resource_type === "invoice") {
        window.sessionStorage.setItem(
          "medizinhub.billingInvoiceId",
          row.resource_id,
        );
      }
      if (row.resource_type === "appointment") {
        window.sessionStorage.setItem(
          "medizinhub.notificationAppointmentId",
          row.resource_id,
        );
      }
    }
    const destination = notificationDestination(row);
    if (row.resource_type === "appointment" && row.resource_id) {
      navigatePage({ id: "opd", appointmentId: row.resource_id });
    } else if (destination) {
      navigatePage(destination);
    }
    setOpen(false);
    setExpanded(false);
  }

  async function markAllRead() {
    await apiFetch("/notifications/in-app/read-all", apiSession, {
      method: "POST",
      body: "{}",
    });
    setRows((current) => current.map((row) => ({ ...row, is_read: true })));
    setUnreadCount(0);
  }

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (!announcement.title.trim() || !announcement.message.trim()) return;
    setPublishing(true);
    setStatusMessage("");
    try {
      const result = await apiFetch(
        "/notifications/in-app/announcements",
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            target_tenant_id:
              user?.is_super_admin && announcement.platformWide
                ? null
                : apiSession.tenantId,
            category: announcement.category,
            priority: announcement.priority,
            title: announcement.title.trim(),
            message: announcement.message.trim(),
            version: announcement.version.trim() || null,
            action_module: announcement.action_module || null,
          }),
        },
      );
      setAnnouncement((current) => ({
        ...current,
        title: "",
        message: "",
        version: "",
      }));
      setPublishOpen(false);
      await load();
      setStatusMessage(`Published to ${result.delivered_count || 0} users.`);
    } catch (err: any) {
      setStatusMessage(err.message || "Could not publish announcement.");
    } finally {
      setPublishing(false);
    }
  }

  const panelClass = expanded
    ? "fixed inset-3 z-[70] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-y-10 sm:left-1/2 sm:right-auto sm:w-[680px] sm:-translate-x-1/2"
    : "fixed left-3 right-3 top-20 z-[70] flex max-h-[min(78vh,680px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:absolute md:left-auto md:right-[-3.25rem] md:top-[calc(100%+0.75rem)] md:w-[430px]";
  const hasUnread = unreadCount > 0;
  const unreadLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((value) => !value);
        }}
        className={`relative grid h-9 w-8 place-items-center transition-colors ${
          hasUnread
            ? "text-red-600 hover:text-red-700"
            : "text-slate-600 hover:text-slate-950"
        }`}
        title={
          hasUnread ? `${unreadCount} unread notifications` : "Notifications"
        }
        aria-label={`${unreadCount} unread notifications`}
        aria-expanded={open}
      >
        <Bell size={18} fill={hasUnread ? "currentColor" : "none"} />
        {hasUnread && (
          <span
            role="status"
            aria-label={`${unreadCount} unread`}
            className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black leading-none text-white ring-2 ring-white"
          >
            {unreadLabel}
          </span>
        )}
      </button>

      {open && (
        <ViewportPortal enabled={expanded}>
          <div ref={expanded ? fullInboxRef : undefined} className="contents">
            {expanded && (
              <button
                type="button"
                aria-label="Close full notification inbox"
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-[60] cursor-default bg-slate-950/20"
              />
            )}
            <section className={panelClass} aria-label="Notification inbox">
              <div className="flex min-h-[64px] items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div className="min-w-0">
                  <h3 className="font-black text-slate-900">Notifications</h3>
                  <p className="truncate text-xs text-slate-500">
                    {unreadCount} unread · {total} shown
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => load()}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                    title="Refresh"
                  >
                    <RefreshCw
                      size={16}
                      className={loading ? "animate-spin" : ""}
                    />
                  </button>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                      title="Mark all read"
                    >
                      <CheckCheck size={17} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      buttonRef.current?.focus();
                    }}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setUnreadOnly((value) => !value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    unreadOnly
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 text-slate-600"
                  }`}
                >
                  Unread only
                </button>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 outline-none"
                >
                  {categories.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {isPublisher && (
                  <ActionButton
                    onClick={() => {
                      setOpen(false);
                      setPublishOpen(true);
                    }}
                    className="shrink-0 gap-1.5 rounded-full border px-3 text-xs"
                    title="Publish update"
                  >
                    <Megaphone size={14} />
                    <span className="hidden sm:inline">Publish update</span>
                  </ActionButton>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {!loading && rows.length === 0 && (
                  <div className="grid place-items-center px-6 py-14 text-center">
                    <Bell size={26} className="mb-3 text-slate-300" />
                    <p className="font-bold text-slate-700">No notifications</p>
                    <p className="mt-1 text-xs text-slate-500">
                      New appointments, requests, and product updates will
                      appear here.
                    </p>
                  </div>
                )}
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className={`group flex border-b border-l-4 border-b-slate-100 ${priorityStyle(row.priority)} ${
                      row.is_read ? "opacity-75" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openNotification(row)}
                      className="min-w-0 flex-1 px-4 py-3 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {!row.is_read && (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                            )}
                            <p className="truncate text-sm font-black text-slate-900">
                              {row.title}
                            </p>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                            {row.message}
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            <span>{categoryLabel(row.category)}</span>
                            <span>·</span>
                            <span>{relativeTime(row.created_at)}</span>
                          </div>
                        </div>
                        {row.action_module && (
                          <ChevronRight
                            size={16}
                            className="mt-1 shrink-0 text-slate-300"
                          />
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateRow(row, { archived: true })}
                      className="self-center rounded-lg p-2 text-slate-300 opacity-0 hover:bg-white hover:text-slate-600 group-hover:opacity-100"
                      title="Archive"
                    >
                      <Archive size={15} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-[11px] font-semibold text-slate-500">
                  {appVersion ? `MedizinHub v${appVersion}` : "MedizinHub HMS"}
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded((value) => !value)}
                  className="text-xs font-black text-slate-800"
                >
                  {expanded ? "Compact view" : "View full inbox"}
                </button>
              </div>
            </section>
          </div>
        </ViewportPortal>
      )}

      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish product update"
        description="Send a feature, version, maintenance, or security notice to eligible users."
        maxWidth="lg"
      >
        <form onSubmit={publish} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Update type" required>
              <SearchableSelect
                searchable={false}
                value={announcement.category}
                onChange={(value) =>
                  setAnnouncement((row) => ({ ...row, category: value }))
                }
                options={[
                  { value: "feature_update", label: "Feature update" },
                  { value: "version_update", label: "Version update" },
                  { value: "maintenance", label: "Maintenance" },
                  { value: "security", label: "Security" },
                ]}
                required
              />
            </FormField>
            <FormField label="Priority" required>
              <SearchableSelect
                searchable={false}
                value={announcement.priority}
                onChange={(value) =>
                  setAnnouncement((row) => ({ ...row, priority: value }))
                }
                options={[
                  { value: "normal", label: "Normal" },
                  { value: "high", label: "High" },
                  { value: "urgent", label: "Urgent" },
                ]}
                required
              />
            </FormField>
          </div>

          <TextField
            label="Title"
            className="search-input"
            value={announcement.title}
            onChange={(value) =>
              setAnnouncement((row) => ({ ...row, title: value }))
            }
            placeholder="Example: New appointment calendar available"
            maxLength={200}
            required
          />

          <TextareaField
            label="Message"
            value={announcement.message}
            onChange={(value) =>
              setAnnouncement((row) => ({ ...row, message: value }))
            }
            placeholder="Explain what changed and who is affected."
            maxLength={4000}
            rows={4}
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Version"
              className="search-input"
              value={announcement.version}
              onChange={(value) =>
                setAnnouncement((row) => ({ ...row, version: value }))
              }
              placeholder="Optional, for example 1.2.0"
              maxLength={60}
            />
            <FormField label="Open module">
              <SearchableSelect
                searchable={false}
                value={announcement.action_module}
                onChange={(value) =>
                  setAnnouncement((row) => ({ ...row, action_module: value }))
                }
                options={[
                  { value: "", label: "No destination" },
                  { value: "dashboard", label: "Dashboard" },
                  { value: "appointments", label: "Appointments" },
                  { value: "billing", label: "Invoices" },
                  { value: "admin", label: "Tenant Admin" },
                ]}
              />
            </FormField>
          </div>

          {user?.is_super_admin && (
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={announcement.platformWide}
                onChange={(event) =>
                  setAnnouncement((row) => ({
                    ...row,
                    platformWide: event.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="block font-bold">Platform-wide audience</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Deliver this update to every eligible active SaaS user.
                </span>
              </span>
            </label>
          )}

          <div className="mt-1 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
            <ActionButton
              onClick={() => setPublishOpen(false)}
              disabled={publishing}
            >
              Cancel
            </ActionButton>
            <Button
              type="submit"
              disabled={publishing}
              className="min-w-32 px-4 py-2.5 text-sm"
            >
              {publishing ? "Publishing..." : "Publish update"}
            </Button>
          </div>
        </form>
      </Modal>

      <StatusToast
        message={statusMessage}
        onClose={() => setStatusMessage("")}
      />
    </div>
  );
}
