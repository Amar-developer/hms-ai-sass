import React from "react";
import { Card, Badge } from "../common/ui";
import { Pagination } from "./Pagination";
import { DataTable } from "./DataTable";

type InvoiceProps = {
  filteredInvoices: any;
  invoicePageRows: any;
  appointmentById: any;
  patientById: any;
  settlementPaidBasis: any;
  numberValue: any;
  doctorById: any;
  rowDate: any;
  invoiceTypeLabel: any;
  invoiceType: any;
  publicDisplayValue: any;
  humanizeOptionLabel: any;
  money: any;
  safeInvoicePage: any;
  // totalPages: number;
  total: any;
  // onPage: any;
  pageSize: number;
  totalInvoicePages:any
  setInvoicePage:any
  
};

const InvoiceReport = ({
  filteredInvoices,
  invoicePageRows,
  appointmentById,
  patientById,
  settlementPaidBasis,
  numberValue,
  doctorById,
  rowDate,
  invoiceTypeLabel,
  invoiceType,
  publicDisplayValue,
  humanizeOptionLabel,
  money,
  safeInvoicePage,
  pageSize,
  totalInvoicePages,
  setInvoicePage

}: InvoiceProps) => {
  const invoiceColumns = [
  {
    key: "invoice_number",
    header: "Invoice",
    render: (row: any) => (
      <>
        <b>{row.invoice_number}</b>
        <p className="text-xs text-slate-500">
          {rowDate(row)}
        </p>
      </>
    ),
  },
  {
    key: "type",
    header: "Type",
    render: (row: any) => invoiceTypeLabel(invoiceType(row)),
  },
  {
    key: "patient",
    header: "Patient",
    render: (row: any) => {
      const patient = patientById.get(row.patient_id);

      return (
        <b>
          {patient?.name ||
            patient?.full_name ||
            row.patient_name ||
            publicDisplayValue(row.patient_id)}
        </b>
      );
    },
  },
  {
    key: "doctor",
    header: "Doctor",
    render: (row: any) => {
      const appointment = appointmentById.get(row.appointment_id);

      return (
        appointment?.doctor ||
        doctorById.get(
          appointment?.doctorId || appointment?.practitioner_id,
        ) ||
        "Unassigned"
      );
    },
  },
  {
    key: "status",
    header: "Status",
    render: (row: any) => (
      <Badge
        tone={
          row.status === "paid"
            ? "green"
            : row.status === "partially_paid"
              ? "amber"
              : "slate"
        }
      >
        {humanizeOptionLabel(row.status)}
      </Badge>
    ),
  },
  {
    key: "total_amount",
    header: "Total",
    render: (row: any) => money(row.total_amount),
  },
  {
    key: "paid_amount",
    header: "Paid",
    render: (row: any) => money(numberValue(row.paid_amount)),
  },
  {
    key: "balance_amount",
    header: "Balance",
    render: (row: any) => money(row.balance_amount),
  },
  {
    key: "membership_discount_amount",
    header: "Membership",
    render: (row: any) =>
      money(row.membership_discount_amount),
  },
  {
    key: "doctor_share_amount",
    header: "Doctor Fee",
    render: (row: any) =>
      money(row.doctor_share_amount),
  },
  {
    key: "settlement",
    header: "Settlement",
    render: (row: any) =>
      money(settlementPaidBasis(row)),
  },
  {
    key: "clinic_profit",
    header: "Clinic Profit",
    render: (row: any) => {
      const paid = numberValue(row.paid_amount);
      const settlement = settlementPaidBasis(row);

      return (
        <span className="font-bold">
          {money(Math.max(paid - settlement, 0))}
        </span>
      );
    },
  },
];
  return (
    <Card>
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
        <div>
          <h3 className="text-base lg:text-lg font-bold">Invoice Profit Details</h3>
          <p className="text-xs lg:text-sm text-slate-500">
            Only paid invoices are shown in profit details.
          </p>
        </div>
        <Badge tone="green">{filteredInvoices.length} paid invoices</Badge>
      </div>
      <div className="mt-4 overflow-auto rounded-2xl border">
        {/* <table className="w-full min-w-[1520px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-xs lg:text-sm">Invoice</th>
              <th className="text-xs lg:text-sm">Type</th>
              <th className="text-xs lg:text-sm">Patient</th>
              <th className="text-xs lg:text-sm">Doctor</th>
              <th className="text-xs lg:text-sm">Status</th>
              <th className="text-xs lg:text-sm">Total</th>
              <th className="text-xs lg:text-sm">Paid</th>
              <th className="text-xs lg:text-sm">Balance</th>
              <th className="text-xs lg:text-sm">Membership</th>
              <th className="text-xs lg:text-sm">Doctor Fee</th>
              <th className="text-xs lg:text-sm">Settlement</th>
              <th className="text-xs lg:text-sm">Clinic Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredInvoices.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-4 text-xs lg:text-sm text-slate-500">
                  No paid invoices match this filter.
                </td>
              </tr>
            )}
            {invoicePageRows.map((invoice: any) => {
              const appointment: any = appointmentById.get(
                invoice.appointment_id,
              );
              const patient: any = patientById.get(invoice.patient_id);
              const settlement = settlementPaidBasis(invoice);
              const paid = numberValue(invoice.paid_amount);
              const doctorName =
                appointment?.doctor ||
                doctorById.get(
                  appointment?.doctorId || appointment?.practitioner_id,
                ) ||
                "Unassigned";
              return (
                <tr key={invoice.id}>
                  <td className="px-4 py-4">
                    <b>{invoice.invoice_number}</b>
                    <p className="text-xs text-slate-500">{rowDate(invoice)}</p>
                  </td>
                  <td>{invoiceTypeLabel(invoiceType(invoice))}</td>
                  <td>
                    <b>
                      {patient?.name ||
                        patient?.full_name ||
                        invoice.patient_name ||
                        publicDisplayValue(invoice.patient_id)}
                    </b>
                  </td>
                  <td>{doctorName}</td>
                  <td>
                    <Badge
                      tone={
                        invoice.status === "paid"
                          ? "green"
                          : invoice.status === "partially_paid"
                            ? "amber"
                            : "slate"
                      }
                    >
                      {humanizeOptionLabel(invoice.status)}
                    </Badge>
                  </td>
                  <td>{money(invoice.total_amount)}</td>
                  <td>{money(paid)}</td>
                  <td>{money(invoice.balance_amount)}</td>
                  <td>{money(invoice.membership_discount_amount)}</td>
                  <td>{money(invoice.doctor_share_amount)}</td>
                  <td>{money(settlement)}</td>
                  <td className="font-bold">
                    {money(Math.max(paid - settlement, 0))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table> */}
        <DataTable
          className="w-full min-w-[1520px] text-left text-sm"
          columns={invoiceColumns}
          data={filteredInvoices}
          emptyMessage="No paid invoices match this filter."
        />
      </div>
      <Pagination
        page={safeInvoicePage}
        totalPages={totalInvoicePages}
        total={filteredInvoices.length}
        onPage={setInvoicePage}
        pageSize={pageSize}
      />
    </Card>
  );
};

export default InvoiceReport;
