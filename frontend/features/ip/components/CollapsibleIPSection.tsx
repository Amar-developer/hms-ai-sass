import { Card, Badge } from "@/app/components/common/ui";
import { ChevronDown } from "lucide-react";

export function CollapsibleIPSection({
  title,
  badge,
  summary,
  isOpen,
  onToggle,
  children,
}: any) {
  return (
    <Card className="overflow-hidden !p-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-bold">{title}</h4>
            {badge && <Badge tone="blue">{badge}</Badge>}
          </div>
          {summary && (
            <p className="mt-1 truncate text-sm font-semibold text-slate-500">
              {summary}
            </p>
          )}
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white">
          <ChevronDown
            size={18}
            className={`transition ${isOpen ? "rotate-180" : "rotate-0"}`}
          />
        </span>
      </button>
      {isOpen && (
        <div className="border-t border-slate-100 px-5 py-4">{children}</div>
      )}
    </Card>
  );
}
