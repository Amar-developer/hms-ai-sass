"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AlertTriangle, CheckCircle2, CircleAlert, Trash2 } from "lucide-react";

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

import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";

import { pageSize } from "@/utils/constants";
import { displayDateTime } from "@/utils/helper";

import {
  category_options,
  error_level_options,
  source_options,
  eror_status_options,
} from "./constants";

import {
  fetchErrorLog,
  useErrorLogsData,
  useErrorLogsActions,
} from "./api";
import { levelTone, statusLabel } from "./helpers";

export function ErrorLogs({ apiSession, selectedId = "" }: any) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [source, setSource] = useState("all");
  const [category, setCategory] = useState("all");
  const [resolved, setResolved] = useState("all");
  const [fetchedDetail, setFetchedDetail] = useState<any>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const permissions = apiSession?.user?.permissions || [];

  const canManage = Boolean(
    apiSession?.user?.is_super_admin ||
    apiSession?.user?.user_type === "tenant_admin" ||
    apiSession?.user?.roles?.includes("tenant_admin") ||
    permissions.includes("*") ||
    permissions.includes("error_logs.manage"),
  );

  const { rows, total, summary, loading, error } = useErrorLogsData({
    apiSession,

    page,

    appliedQuery,

    level,

    source,

    category,

    resolved,

    refreshKey,
  });

  const { resolve, remove, busy, message, setMessage } =
    useErrorLogsActions(apiSession);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // The detail row usually comes straight from the already-loaded page, but
  // a direct/bookmarked link can name a log that isn't on the current page
  // — fetch it directly in that case.
  const selected = selectedId
    ? rows.find((row: any) => row.id === selectedId) || fetchedDetail
    : null;

  useEffect(() => {
    setFetchedDetail(null);
    if (!selectedId || rows.some((row: any) => row.id === selectedId)) return;
    let cancelled = false;
    fetchErrorLog(selectedId, apiSession)
      .then((row: any) => {
        if (!cancelled) setFetchedDetail(row);
      })
      .catch(() => {
        if (!cancelled) router.replace("/error_logs");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    setResolutionNote(selected?.resolution_note || "");
  }, [selected]);

  function applySearch() {
    setPage(1);

    setAppliedQuery(query.trim());
  }

  async function handleResolve() {
    if (!selected || !canManage) return;

    const updated = await resolve(
      selected,
      !selected.is_resolved,
      resolutionNote,
    );

    setFetchedDetail(updated);

    setResolutionNote(updated.resolution_note || "");

    setRefreshKey((value) => value + 1);
  }

  async function handleDelete() {
    if (!selected || !canManage) return;

    if (!window.confirm("Delete this error log permanently?")) {
      return;
    }

    await remove(selected);

    router.push("/error_logs");

    setRefreshKey((value) => value + 1);
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
            <ActionButton onClick={() => router.push("/error_logs")}>
              Back to Error Logs
            </ActionButton>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              ["Source", selected.source],
              ["Category", selected.category],
              ["Module", selected.module || "-"],
              [
                "Method / Route",
                `${selected.method || ""} ${selected.route || "-"}`,
              ],
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
                <Button disabled={busy === "resolve"} onClick={handleResolve}>
                  <ButtonLoader loading={busy === "resolve"}>
                    {busy === "resolve"
                      ? "Resolving..."
                      : selected.is_resolved
                        ? "Reopen"
                        : "Mark Resolved"}
                  </ButtonLoader>
                </Button>
                <ActionButton
                  tone="danger"
                  disabled={busy === "delete"}
                  onClick={handleDelete}
                >
                  <ButtonLoader loading={busy === "delete"}>
                    <Trash2 size={14} />{" "}
                    {busy === "delete" ? "Deleting..." : "Delete"}
                  </ButtonLoader>
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
          <RefreshButton
            onRefresh={() => setRefreshKey((value) => value + 1)}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="flex min-h-[82px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-rose-100">
              <CircleAlert size={17} />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Open errors
              </p>
              <p className="mt-1 text-xl font-black leading-none text-slate-950">
                {summary.errors}
              </p>
            </div>
          </div>
          <div className="flex min-h-[82px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-100">
              <AlertTriangle size={17} />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Open warnings
              </p>
              <p className="mt-1 text-xl font-black leading-none text-slate-950">
                {summary.warnings}
              </p>
            </div>
          </div>
          <div className="flex min-h-[82px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <CheckCircle2 size={17} />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Permission issues
              </p>
              <p className="mt-1 text-xl font-black leading-none text-slate-950">
                {summary.permission}
              </p>
            </div>
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
              options={error_level_options}
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
              options={source_options}
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
              options={category_options}
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
              options={eror_status_options}
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
              {busy === "load" && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-0">
                    <TableSkeleton columns={6} />
                  </td>
                </tr>
              )}
              {busy !== "load" && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-slate-500">
                    No error logs match these filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/error_logs/${row.id}`)}
                  className="cursor-pointer transition hover:bg-slate-50"
                >
                  <td className="px-4 py-4">
                    <Badge
                      tone={levelTone(row.level) as any}
                      className="normal-badge"
                    >
                      {row.level}
                    </Badge>
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
                    <Badge
                      tone={row.is_resolved ? "green" : "amber"}
                      className="normal-badge"
                    >
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
