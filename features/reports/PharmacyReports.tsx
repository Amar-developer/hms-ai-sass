import React from "react";
import CollapsibleReportSection from "@/components/reports/CollapsibleReportSection";

export type PharmacyReportsProps = {
  pharmacySettlementRows: any;
  openSections: any;
  setOpenSections: any;
  money: any;
};

const PharmacyReports = ({
  pharmacySettlementRows,
  openSections,
  setOpenSections,
  money,
}: PharmacyReportsProps) => {
  return (
    <div>
      <CollapsibleReportSection
        title="Pharmacy Settlement & Profitability"
        subtitle="Medicine purchase cost is taken from each medicine supplier setup."
        badge={`${pharmacySettlementRows.length} medicines`}
        isOpen={openSections.pharmacy}
        onToggle={() =>
          setOpenSections((state: any) => ({
            ...state,
            pharmacy: !state.pharmacy,
          }))
        }
      >
        <div className="mt-4 overflow-auto rounded-2xl border">
          <table className="w-full min-w-[1220px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Supplier</th>
                <th>Medicine</th>
                <th>Issues</th>
                <th>Invoices</th>
                <th>Qty</th>
                <th>Revenue</th>
                <th>Purchase Cost</th>
                <th>Pharmacy Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pharmacySettlementRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-slate-500">
                    No paid pharmacy invoices match this filter.
                  </td>
                </tr>
              )}
              {pharmacySettlementRows.map((row: any) => (
                <tr key={row.id}>
                  <td className="px-4 py-4">
                    <b>{row.supplier}</b>
                  </td>
                  <td>{row.item}</td>
                  <td>{row.issueCount}</td>
                  <td>{row.invoiceCount}</td>
                  <td>{row.quantity}</td>
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

export default PharmacyReports;
