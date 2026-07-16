"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type SearchItem = {
  id: string;
  label: string;
  description?: string;
  keywords?: string;
  action: () => void;
};

type GlobalSearchProps = {
  items: SearchItem[];
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function GlobalSearch({ items }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredItems = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return items.slice(0, 8);
    return items
      .filter((item) =>
        normalize(`${item.label} ${item.description || ""} ${item.keywords || ""}`).includes(
          needle,
        ),
      )
      .slice(0, 8);
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g") {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleShortcut);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  function runItem(item?: SearchItem) {
    if (!item) return;
    item.action();
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 ">
        <Search size={17} className="shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) =>
                Math.min(index + 1, filteredItems.length - 1),
              );
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              runItem(filteredItems[activeIndex]);
            }
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Search a modules"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:font-medium placeholder:text-slate-400 placeholder:text-xs"
        />
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          {filteredItems.length > 0 ? (
            filteredItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runItem(item)}
                className={`flex w-full flex-col px-3 py-2 text-left text-sm ${
                  index === activeIndex ? "bg-slate-100" : "hover:bg-slate-50"
                }`}
              >
                <span className="font-semibold text-xs text-slate-900">{item.label}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-sm text-slate-500">No results found.</p>
          )}
        </div>
      )}
    </div>
  );
}
