import React from "react";
import { Card,Badge } from "../common/ui";
import {ChevronDown} from 'lucide-react'


function CollapsibleReportSection({
  title,
  subtitle,
  badge,
  isOpen,
  onToggle,
  children,
}: any) {
  return (
    <Card>
      <button
        type="button"
        // onClick={onToggle}
        className="flex w-full flex-col justify-between gap-3 text-left md:flex-row md:items-center"
      >
        <div>
          <h3 className="card-title font-bold">{title}</h3>
          <p className="table-data text-wrap text-slate-500">{subtitle}</p>
        </div>
        {/* <div className="flex items-center gap-2"> */}
          <Badge tone="blue" className="normal-badge w-[15%]">{badge}</Badge>
          {/* <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600">
            <ChevronDown
              size={17}
              className={`transition ${isOpen ? "rotate-180" : ""}`}
            />
          </span> */}
        {/* </div> */}
      </button>
      {isOpen && children}
    </Card>
  );
}

export default CollapsibleReportSection
