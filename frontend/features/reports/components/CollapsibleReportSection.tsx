import { Badge } from "@/app/components/common/ui";
import { ChevronDown } from "lucide-react";


export function CollapsibleReportSection({
  title,
  subtitle,
  badge,
  isOpen,
  onToggle,
  children,
}: any) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 text-left md:flex-row md:items-center"
      >
        <div>
          <h3 className="text-base font-black tracking-tight text-slate-950">
            {title}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-slate-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="blue" className="normal-badge whitespace-nowrap">
            {badge}
          </Badge>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>
      {isOpen && <div className="p-4">{children}</div>}
    </section>
  );
}

export default CollapsibleReportSection
