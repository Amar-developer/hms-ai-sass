import React from "react";
import CollapsibleReportSection from "./CollapsibleReportSection";
import { DataTable } from "./DataTable";
import { PharmacyReportsProps } from "../types";



const PharmacyReports = ({
  pharmacySettlementRows,
  openSections,
  setOpenSections,
  money,
  onOpenInvoices,
}: PharmacyReportsProps) => {
  const columns = [
    {
      key: "supplier",
      header: "Supplier",
      width:'90px',
      render: (row: any) => <b>{row.supplier}</b>,
    },
    {
      key: "item",
      header: "Medicine",
      width:'90px',
    },
    {
      key: "issueCount",
      header: "Issues",
      width:'90px',
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
      key: "total",
      header: "Total",
      render: (row: any) => money(row.total),
    },
    {
      key: "revenue",
      header: "Paid Revenue",
      render: (row: any) => money(row.revenue),
    },
    {
      key: "balance",
      header: "Balance",
      render: (row: any) => money(row.balance),
    },
    {
      key: "membershipBenefit",
      header: "Membership Benefit",
      width: '160px',
      render: (row: any) => money(row.membershipBenefit),
    },
    {
      key: "paymentMode",
      header: "Mode of Payment",
      width: "140px",
    },
    {
      key: "tax",
      header: "GST",
      render: (row: any) => money(row.tax),
    },
    {
      key: "purchaseCost",
      header: "Purchase Cost",
      render: (row: any) => money(row.purchaseCost),
    },
    {
      key: "settlementPercent",
      header: "Settlement %",
      width: "120px",
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
        subtitle="Medicine cost is frozen on each invoice line; legacy invoices fall back to catalog setup."
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
            onRowClick={(row: any) => onOpenInvoices(row.invoices)}
            paginate
            emptyMessage="No paid pharmacy invoices match this filter."
            className="w-full min-w-[1220px] text-left text-sm"
          />
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default PharmacyReports;
