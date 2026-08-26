import { ChevronDown } from "lucide-react";

export function DetailSection({
  title,
  description,
  count,
  children,
  defaultOpen = true,
}: any) {
  return (
    <div
      // open={defaultOpen}
      className="group rounded-lg border border-slate-200 bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <div>
          <h4 className="text-sm font-black text-slate-950 lg:text-base">{title}</h4>
          {description && (
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {count !== undefined && (
            <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">
              {count}
            </span>
          )}

        </div>
      </summary>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}
