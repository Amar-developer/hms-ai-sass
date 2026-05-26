import React from "react";
import { Card, Badge } from "../ui";
import { Pagination } from "./Pagination";

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
  return (
    <Card>
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
        <div>
          <h3 className="text-lg font-bold">Invoice Profit Details</h3>
          <p className="text-sm text-slate-500">
            Only paid invoices are shown in profit details.
          </p>
        </div>
        <Badge tone="green">{filteredInvoices.length} paid invoices</Badge>
      </div>
      <div className="mt-4 overflow-auto rounded-2xl border">
        <table className="w-full min-w-[1520px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th>Type</th>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Status</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Membership</th>
              <th>Doctor Fee</th>
              <th>Settlement</th>
              <th>Clinic Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredInvoices.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-4 text-slate-500">
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
        </table>
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
