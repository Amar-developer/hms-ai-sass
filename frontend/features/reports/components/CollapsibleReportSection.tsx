import { Card,Badge } from "@/app/components/common/ui";


export function CollapsibleReportSection({
  title,
  subtitle,
  badge,
  isOpen,
  children,
}: any) {
  return (
    <Card>
      <button
        type="button"
        className="flex w-full flex-col justify-between gap-3 text-left md:flex-row md:items-center"
      >
        <div>
          <h3 className="card-title font-bold">{title}</h3>
          <p className="card-desc text-wrap text-slate-500">{subtitle}</p>
        </div>
          <Badge tone="blue" className="normal-badge w-[15%]">{badge}</Badge>

      </button>
      {isOpen && children}
    </Card>
  );
}

export default CollapsibleReportSection
