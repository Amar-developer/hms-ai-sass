import React from "react";
import CollapsibleReportSection from "@/app/components/reports/CollapsibleReportSection";
import { DataTable } from "@/app/components/reports/DataTable";

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
  const columns = [
    {
      key: "supplier",
      header: "Supplier",
      render: (row: any) => <b>{row.supplier}</b>,
    },
    {
      key: "item",
      header: "Medicine",
    },
    {
      key: "issueCount",
      header: "Issues",
    },
    {
      key: "invoiceCount",
      header: "Invoices",
    },
    {
      key: "quantity",
      header: "Qty",
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
      header: "Pharmacy Profit",
      render: (row: any) => (
        <span className="font-bold">{money(row.profit)}</span>
      ),
    },
  ];
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
          {/* <table className="w-full min-w-[1220px] text-left text-sm">
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
          </table> */}
          <DataTable
            columns={columns}
            data={pharmacySettlementRows}
            emptyMessage="No paid pharmacy invoices match this filter."
            className="w-full min-w-[1220px] text-left text-sm"
          />
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default PharmacyReports;
