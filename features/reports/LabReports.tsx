import React from "react";
import CollapsibleReportSection from "@/components/reports/CollapsibleReportSection";

export type LabReportsProps = {
  labSettlementRows:any
  openSections: any;
  setOpenSections: any;
  money: any;
};


const LabReports = ({labSettlementRows,openSections,setOpenSections,money}:LabReportsProps) => {
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
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Supplier</th>
                <th>Lab Test / Package</th>
                <th>Orders</th>
                <th>Invoices</th>
                <th>Revenue</th>
                <th>Purchase Cost</th>
                <th>Lab Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {labSettlementRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-slate-500">
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
          </table>
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default LabReports;
