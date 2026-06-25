import React from "react";
import CollapsibleReportSection from "@/app/components/reports/CollapsibleReportSection";
import { DataTable } from "@/app/components/reports/DataTable";

export type LabReportsProps = {
  labSettlementRows: any;
  openSections: any;
  setOpenSections: any;
  money: any;
};

const LabReports = ({
  labSettlementRows,
  openSections,
  setOpenSections,
  money,
}: LabReportsProps) => {
  const columns = [
    {
      key: "supplier",
      header: "Supplier",
      render: (row: any) => <b>{row.supplier}</b>,
    },
    {
      key: "item",
      header: "Lab Test / Package",
    },
    {
      key: "orderCount",
      header: "Orders",
    },
    {
      key: "invoiceCount",
      header: "Invoices",
    },
    {
      key: "revenue",
      header: "Revenue",
      render: (row: any) => money(row.revenue),
    },
    {
      key: "purchaseCost",
      header: "Purchase Cost",
      render: (row: any) => money(row.purchaseCost),
    },
    {
      key: "profit",
      header: "Lab Profit",
      render: (row: any) => (
        <span className="font-bold">{money(row.profit)}</span>
      ),
    },
  ];
  return (
    <div>
      <CollapsibleReportSection
        title="Lab Test Settlement & Profitability"
        subtitle="Outside lab purchase cost is taken from each lab test or package supplier setup."
        badge={`${labSettlementRows.length} lab items`}
        isOpen={openSections.lab}
        onToggle={() =>
          setOpenSections((state: any) => ({ ...state, lab: !state.lab }))
        }
      >
        <div className="mt-4 overflow-auto rounded-2xl border">
          {/* <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-[10px] lg:text-xs">Supplier</th>
                <th className="text-[10px] lg:text-xs">Lab Test / Package</th>
                <th className="text-[10px] lg:text-xs">Orders</th>
                <th className="text-[10px] lg:text-xs">Invoices</th>
                <th className="text-[10px] lg:text-xs">Revenue</th>
                <th className="text-[10px] lg:text-xs">Purchase Cost</th>
                <th className="text-[10px] lg:text-xs">Lab Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {labSettlementRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-4 text-xs lg:text-sm text-slate-500"
                  >
                    No paid lab invoices match this filter.
                  </td>
                </tr>
              )}
              {labSettlementRows.map((row: any) => (
                <tr key={row.id}>
                  <td className="px-4 py-4">
                    <b>{row.supplier}</b>
                  </td>
                  <td>{row.item}</td>
                  <td>{row.orderCount}</td>
                  <td>{row.invoiceCount}</td>
                  <td>{money(row.revenue)}</td>
                  <td>{money(row.purchaseCost)}</td>
                  <td className="font-bold">{money(row.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table> */}
          <DataTable
            columns={columns}
            data={labSettlementRows}
            emptyMessage="No paid lab invoices match this filter"
            className='w-full min-w-[1120px] text-left text-sm'
          />
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default LabReports;
