"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Trash2,
} from "lucide-react";

import { FormField } from "@/app/components/FormElements";
import { Pagination } from "@/app/components/common/Pagination";
import {
  ActionButton,
  Badge,
  Button,
  Card,
  Input,
  RefreshButton,
  SearchableSelect,
  StatusToast,
} from "@/app/components/common/ui";
import { apiFetch } from "@/lib/api";
import { pageSize } from "@/utils/constants";
import { displayDateTime } from "@/utils/helper";

function levelTone(level: string) {
  if (level === "critical" || level === "error") return "red";
  return "amber";
}

function statusLabel(row: any) {
  if (row.status_code) return `HTTP ${row.status_code}`;
  return row.category?.replace(/_/g, " ") || "Application";
}

export function ErrorLogs({ apiSession }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [source, setSource] = useState("all");
  const [category, setCategory] = useState("all");
  const [resolved, setResolved] = useState("all");
  const [selected, setSelected] = useState<any>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const permissions = apiSession?.user?.permissions || [];
  const canManage = Boolean(
    apiSession?.user?.is_super_admin ||
      apiSession?.user?.user_type === "tenant_admin" ||
      apiSession?.user?.roles?.includes("tenant_admin") ||
      permissions.includes("*") ||
      permissions.includes("error_logs.manage"),
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [summary, setSummary] = useState({ errors: 0, warnings: 0, permission: 0 });

  async function load() {
    if (!apiSession) return;
    setBusy("load");
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
      });
      if (appliedQuery) params.set("q", appliedQuery);
      if (level !== "all") params.set("level", level);
      if (source !== "all") params.set("source", source);
      if (category !== "all") params.set("category", category);
      if (resolved !== "all") params.set("resolved", String(resolved === "resolved"));
      if (apiSession.user?.is_super_admin) params.set("include_global", "true");
      const response = await apiFetch(`/error-logs?${params}`, apiSession);
      setRows(response?.items || []);
      setTotal(Number(response?.total || 0));
      setSummary({
        errors: Number(response?.summary?.errors || 0),
        warnings: Number(response?.summary?.warnings || 0),
        permission: Number(response?.summary?.permission_issues || 0),
      });
      if (selected) {
        const updated = (response?.items || []).find(
          (row: any) => row.id === selected.id,
        );
        if (updated) setSelected(updated);
      }
    } catch (error: any) {
      setMessage(error.message || "Could not load error logs.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    load();
  }, [
    apiSession?.tenantId,
    page,
    appliedQuery,
    level,
    source,
    category,
    resolved,
    refreshKey,
  ]);

  function applySearch() {
    setPage(1);
    setAppliedQuery(query.trim());
  }

  async function updateResolved(nextResolved: boolean) {
    if (!selected || !canManage) return;
    setBusy("resolve");
    try {
      const updated = await apiFetch(`/error-logs/${selected.id}`, apiSession, {
        method: "PATCH",
        body: JSON.stringify({
          resolved: nextResolved,
          resolution_note: resolutionNote || null,
        }),
      });
      setSelected(updated);
      setResolutionNote(updated.resolution_note || "");
      setMessage(nextResolved ? "Error log resolved." : "Error log reopened.");
      setRefreshKey((value) => value + 1);
    } catch (error: any) {
      setMessage(error.message || "Could not update error log.");
    } finally {
      setBusy("");
    }
  }

  async function deleteSelected() {
    if (!selected || !canManage) return;
    if (!window.confirm("Delete this error log permanently?")) return;
    setBusy("delete");
    try {
      await apiFetch(`/error-logs/${selected.id}`, apiSession, {
        method: "DELETE",
      });
      setSelected(null);
      setMessage("Error log deleted.");
      setRefreshKey((value) => value + 1);
    } catch (error: any) {
      setMessage(error.message || "Could not delete error log.");
    } finally {
      setBusy("");
    }
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <StatusToast message={message} onClose={() => setMessage("")} />
        <Card>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={levelTone(selected.level) as any}>
                  {selected.level}
                </Badge>
                <Badge tone={selected.is_resolved ? "green" : "amber"}>
                  {selected.is_resolved ? "Resolved" : "Open"}
                </Badge>
                <Badge>{statusLabel(selected)}</Badge>
                {selected.occurrence_count > 1 && (
                  <Badge tone="purple">
                    {selected.occurrence_count} occurrences
                  </Badge>
                )}
              </div>
              <h2 className="mt-3 break-words text-xl font-bold text-slate-950">
                {selected.event}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Last seen {displayDateTime(selected.last_seen_at)}
              </p>
            </div>
            <ActionButton onClick={() => setSelected(null)}>
              Back to Error Logs
            </ActionButton>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              ["Source", selected.source],
              ["Category", selected.category],
              ["Module", selected.module || "-"],
              ["Method / Route", `${selected.method || ""} ${selected.route || "-"}`],
              ["Request ID", selected.request_id || "-"],
              ["User ID", selected.user_id || "-"],
              ["First seen", displayDateTime(selected.first_seen_at)],
              ["Last seen", displayDateTime(selected.last_seen_at)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">
                  {label}
                </p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-700">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 p-4">
            <p className="text-[10px] font-bold uppercase text-slate-400">
              Message
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">
              {selected.message}
            </p>
          </div>

          {selected.stack_trace && (
            <div className="mt-4 rounded-xl bg-slate-950 p-4 text-slate-100">
              <p className="text-[10px] font-bold uppercase text-slate-400">
                Stack trace
              </p>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
                {selected.stack_trace}
              </pre>
            </div>
          )}

          {selected.metadata_json && selected.metadata_json !== "{}" && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase text-slate-400">
                Context
              </p>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700">
                {selected.metadata_json}
              </pre>
            </div>
          )}

          {!canManage && selected.resolution_note && (
            <div className="mt-4 rounded-xl bg-emerald-50 p-4">
              <p className="text-[10px] font-bold uppercase text-emerald-700">
                Resolution note
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                {selected.resolution_note}
              </p>
            </div>
          )}

          {canManage && (
            <div className="mt-4 rounded-xl border border-slate-200 p-4">
              <FormField label="Resolution note">
                <textarea
                  value={resolutionNote}
                  onChange={(event) => setResolutionNote(event.target.value)}
                  rows={3}
                  placeholder="What was fixed, ignored, or investigated?"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                />
              </FormField>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  disabled={busy === "resolve"}
                  onClick={() => updateResolved(!selected.is_resolved)}
                >
                  {selected.is_resolved ? "Reopen" : "Mark Resolved"}
                </Button>
                <ActionButton
                  tone="danger"
                  disabled={busy === "delete"}
                  onClick={deleteSelected}
                >
                  <Trash2 size={14} /> Delete
                </ActionButton>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StatusToast message={message} onClose={() => setMessage("")} />
      <Card>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Error Logs</h2>
            <p className="mt-1 text-sm text-slate-500">
              Frontend errors, API failures, permission issues, warnings, and
              slow backend requests.
            </p>
          </div>
          <RefreshButton onRefresh={() => setRefreshKey((value) => value + 1)} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-rose-50 p-3">
            <CircleAlert className="text-rose-600" size={18} />
            <p className="mt-2 text-2xl font-bold">{summary.errors}</p>
            <p className="text-xs text-slate-500">Errors</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-3">
            <AlertTriangle className="text-amber-600" size={18} />
            <p className="mt-2 text-2xl font-bold">{summary.warnings}</p>
            <p className="text-xs text-slate-500">Warnings</p>
          </div>
          <div className="rounded-xl bg-blue-50 p-3">
            <CheckCircle2 className="text-blue-600" size={18} />
            <p className="mt-2 text-2xl font-bold">{summary.permission}</p>
            <p className="text-xs text-slate-500">Permission issues</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_repeat(4,.75fr)_auto] lg:items-end">
          <FormField label="Search">
            <Input
              value={query}
              onChange={(event: any) => setQuery(event.target.value)}
              onKeyDown={(event: any) => {
                if (event.key === "Enter") applySearch();
              }}
              placeholder="Message, event, route, request ID"
            />
          </FormField>
          <FormField label="Level">
            <SearchableSelect
              value={level}
              onChange={(value: string) => {
                setPage(1);
                setLevel(value);
              }}
              searchable={false}
              options={[
                { value: "all", label: "All levels" },
                { value: "error", label: "Error" },
                { value: "critical", label: "Critical" },
                { value: "warning", label: "Warning" },
              ]}
            />
          </FormField>
          <FormField label="Source">
            <SearchableSelect
              value={source}
              onChange={(value: string) => {
                setPage(1);
                setSource(value);
              }}
              searchable={false}
              options={[
                { value: "all", label: "All sources" },
                { value: "backend_api", label: "Backend API" },
                { value: "frontend", label: "Frontend" },
              ]}
            />
          </FormField>
          <FormField label="Category">
            <SearchableSelect
              value={category}
              onChange={(value: string) => {
                setPage(1);
                setCategory(value);
              }}
              searchable={false}
              options={[
                { value: "all", label: "All categories" },
                { value: "api", label: "API" },
                { value: "permission", label: "Permission" },
                { value: "validation", label: "Validation" },
                { value: "performance", label: "Performance" },
                { value: "frontend", label: "Frontend" },
                { value: "not_found", label: "Not found" },
              ]}
            />
          </FormField>
          <FormField label="Status">
            <SearchableSelect
              value={resolved}
              onChange={(value: string) => {
                setPage(1);
                setResolved(value);
              }}
              searchable={false}
              options={[
                { value: "all", label: "All" },
                { value: "open", label: "Open" },
                { value: "resolved", label: "Resolved" },
              ]}
            />
          </FormField>
          <Button onClick={applySearch}>Search</Button>
        </div>
      </Card>

      <Card>
        <div className="overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Level</th>
                <th>Event / Message</th>
                <th>Source</th>
                <th>Status</th>
                <th>Occurrences</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-slate-500">
                    {busy === "load"
                      ? "Loading error logs..."
                      : "No error logs match these filters."}
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => {
                    setSelected(row);
                    setResolutionNote(row.resolution_note || "");
                  }}
                  className="cursor-pointer transition hover:bg-slate-50"
                >
                  <td className="px-4 py-4">
                    <Badge tone={levelTone(row.level) as any}>{row.level}</Badge>
                  </td>
                  <td className="max-w-[420px] py-4 pr-4">
                    <p className="truncate font-bold text-slate-900">
                      {row.event}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {row.message}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-slate-400">
                      {row.method || ""} {row.route || row.request_id || ""}
                    </p>
                  </td>
                  <td className="py-4 pr-4">
                    <p className="font-semibold">{row.source}</p>
                    <p className="text-xs text-slate-500">{row.category}</p>
                  </td>
                  <td className="py-4 pr-4">
                    <Badge tone={row.is_resolved ? "green" : "amber"}>
                      {row.is_resolved ? "Resolved" : statusLabel(row)}
                    </Badge>
                  </td>
                  <td className="py-4 pr-4 font-bold">
                    {row.occurrence_count}
                  </td>
                  <td className="whitespace-nowrap py-4 pr-4 text-xs text-slate-500">
                    {displayDateTime(row.last_seen_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPage={setPage}
        />
      </Card>
    </div>
  );
}
