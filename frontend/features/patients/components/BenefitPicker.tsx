import { apiFetch } from "@/lib/api";
import { money } from "@/utils/helper";
import { benefitLabel,sameName } from "../helpers";
import { useEffect, useState } from "react";
import { FormField } from "@/app/components/FormElements";
import { Badge,Input } from "@/app/components/common/ui";

export function BenefitPicker({
  label,
  kind,
  rows,
  selected,
  onChange,
  priceKey,
  emptyHint,
  apiSession,
  searchPath,
  quantities,
  onQuantityChange,
}: any) {
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<any[]>([]);
  const normalized = query.trim().toLowerCase();
  const selectedSet = new Set(selected);
  const filtered = (rows || [])
    .filter(
      (row: any) =>
        !selectedSet.has(row.id) &&
        [row.name, row.code, row.generic_name, row.department, row.form]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized),
    )
    .slice(0, 8);
  const exact = (rows || []).some((row: any) => sameName(row, query));
  const localNames = new Set(
    (rows || []).map((r: any) =>
      String(r.name || "")
        .trim()
        .toLowerCase(),
    ),
  );
  const remoteSuggestions = (remote || [])
    .filter(
      (r: any) =>
        r?.name && !localNames.has(String(r.name).trim().toLowerCase()),
    )
    .slice(0, 8);
  useEffect(() => {
    const q = query.trim();
    if (!apiSession || !searchPath || q.length < 2) {
      setRemote([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      const sep = searchPath.includes("?") ? "&" : "?";
      apiFetch(
        `${searchPath}${sep}search=${encodeURIComponent(q)}&page_size=10`,
        apiSession,
      )
        .then((data: any) => {
          if (alive) setRemote(Array.isArray(data) ? data : data?.items || []);
        })
        .catch(() => {
          if (alive) setRemote([]);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, apiSession, searchPath]);
  function add(value: string) {
    if (!value || selectedSet.has(value)) return;
    onChange([...selected, value]);
    setQuery("");
    setRemote([]);
  }
  function remove(value: string) {
    onChange(selected.filter((item: string) => item !== value));
  }
  function addRemote(item: any) {
    const local = (rows || []).find((r: any) => sameName(r, item.name));
    add(local ? local.id : `new:${String(item.name).trim()}`);
  }
  return (
    <div>
      <FormField label={label}>
        <Input
          value={query}
          onChange={(e: any) => setQuery(e.target.value)}
          placeholder={`Search existing ${kind} or type new name`}
        />
      </FormField>
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selected.map((value: string) => {
            const itemLabel = value.startsWith("new:")
              ? value.slice(4)
              : benefitLabel(value, rows);
            if (!onQuantityChange) {
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => remove(value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
                >
                  {itemLabel} ×
                </button>
              );
            }
            return (
              <span
                key={value}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
              >
                <span>{itemLabel}</span>
                <span className="flex items-center gap-1 text-slate-500">
                  free ×
                  <input
                    type="number"
                    min={1}
                    value={Number(quantities?.[value]) || 1}
                    onChange={(e: any) =>
                      onQuantityChange(
                        value,
                        Math.max(Number(e.target.value) || 1, 1),
                      )
                    }
                    className="w-12 rounded-lg border border-slate-200 px-1 py-0.5 text-center text-xs font-bold text-slate-700"
                  />
                </span>
                <button
                  type="button"
                  onClick={() => remove(value)}
                  className="text-slate-400 hover:text-red-500"
                  aria-label={`Remove ${itemLabel}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      {query && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          <div className="max-h-56 overflow-auto">
            {filtered.length === 0 && remoteSuggestions.length === 0 && (
              <p className="px-3 py-2 text-sm text-slate-500">
                No matching {kind} found.
              </p>
            )}
            {filtered.map((row: any) => (
              <button
                key={row.id}
                type="button"
                onClick={() => add(row.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span>
                  <b>{row.name}</b>
                  <span className="block text-xs text-slate-500">
                    {[row.code, row.generic_name, row.department, row.form]
                      .filter(Boolean)
                      .join(" · ") || row.id}
                  </span>
                </span>
                <span className="text-xs font-bold">
                  {money(row[priceKey])}
                </span>
              </button>
            ))}
            {remoteSuggestions.map((item: any, index: number) => (
              <button
                key={`remote-${item.id || item.slug || index}`}
                type="button"
                onClick={() => addRemote(item)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span>
                  <b>{item.name}</b>
                  <span className="block text-xs text-slate-500">
                    {[item.code, item.generic_name, item.department]
                      .filter(Boolean)
                      .join(" · ") || "External catalog"}
                  </span>
                </span>
                <Badge tone="blue">External</Badge>
              </button>
            ))}
          </div>
          {query.trim() && !exact && (
            <button
              type="button"
              onClick={() => add(`new:${query.trim()}`)}
              className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-left text-sm font-bold text-white"
            >
              Add new {kind}: {query.trim()}
            </button>
          )}
        </div>
      )}
      {emptyHint && selected.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">{emptyHint}</p>
      )}
    </div>
  );
}
