import { ChevronRight } from "lucide-react";
import { money } from "@/utils/helper";
import type { MonthGroup } from "./helpers";

export function getMonthColumns() {
  return [
    {
      key: "label",
      header: "Month",
      sortable: true,
      render: (row: MonthGroup) => <span className="text-sm font-bold">{row.label}</span>,
    },
    {
      key: "count",
      header: "Expenses",
      width: "120px",
      className: "text-center",
      cellClassName: "text-center",
      sortable: true,
      render: (row: MonthGroup) => <span className="text-sm">{row.count}</span>,
    },
    {
      key: "total",
      header: "Total Amount",
      width: "160px",
      className: "text-right",
      cellClassName: "text-right",
      sortable: true,
      render: (row: MonthGroup) => <b className="text-sm">{money(row.total)}</b>,
    },
    {
      key: "chevron",
      header: "",
      width: "40px",
      className: "text-center",
      cellClassName: "text-center",
      render: () => <ChevronRight size={16} className="inline text-slate-400" />,
    },
  ];
}
