import React from "react";
import CollapsibleReportSection from "./CollapsibleReportSection";
import { DataTable } from "./DataTable";
import { LabReportsProps } from "../types";



const LabReports = ({
  labSettlementRows,
  openSections,
  setOpenSections,
  money,
  onOpenInvoices,
}: LabReportsProps) => {
  const columns = [
    {
      key: "supplier",
      header: "Supplier",
      render: (row: any) => <b>{row.supplier}</b>,
    },
    {
      key: "item",
      header: "Lab / Package",
      width: '160px'
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
      key: "purchaseCost",
      header: "Purchase Cost",
      width: '160px',
      render: (row: any) => money(row.purchaseCost),
    },
    {
      key: "settlementPercent",
      header: "Settlement %",
      width: "120px",
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
        subtitle="Supplier tests use purchase cost from setup. In-house tenant hospital tests show zero purchase cost."
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
            onRowClick={(row: any) => onOpenInvoices(row.invoices)}
            paginate
            emptyMessage="No paid lab invoices match this filter"
            className='w-full min-w-[1120px] text-left text-sm'
          />
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default LabReports;
