import { Stethoscope } from "lucide-react";
import { DataTable } from "@/app/components/common/DataTable";
import { AppointmentReportsProps } from "../types";
import CollapsibleReportSection from "./CollapsibleReportSection";

const AppointmentReports = ({
  doctorRows,
  openSections,
  setOpenSections,
  money,
  percent,
  onOpenInvoices,
}: AppointmentReportsProps) => {
  const moneyOrDash = (value: any) =>
    Number(value || 0) === 0 ? "-" : money(value);
  const columns = [
    {
      key: "s.no",
      header: "S.No",
      width: "50px",
      className: "text-center",
      cellClassName: "text-center",
      sortable: true,
      render: (_, index: number) => index + 1,
    },
    {
      key: "doctor",
      header: "Doctor",
      width: "140px",
      render: (row: any) =>(
        <div className="max-w-[130px]">
          <p className="truncate font-semibold" title={row.doctor}>
            {row.doctor}
          </p>
        </div>
      ),
    },
    {
      key: "consultations",
      header: "Consultations",
      width: "140px",
    },
    {
      key: "invoices",
      header: "Invoices",
      width: "80px",
    },
    {
      key: "grossRevenue",
      width: "90px",
      header: "Total",
      render: (row: any) => moneyOrDash(row.grossRevenue),
    },
    {
      key: "paidRevenue",
      header: "Paid",
      width: "80px",
      render: (row: any) => moneyOrDash(row.paidRevenue),
    },
    {
      key: "balance",
      header: "Due",
      width: "110px",
      render: (row: any) => moneyOrDash(row.balance),
    },
    {
      key: "paymentMode",
      header: "Payment",
      width: "130px",
      render: (row:any)=> (
        <div className="max-w-[120px]">
          <p className="truncate" title= {row.paymentMode}>
            {row.paymentMode}
          </p>
        </div>
      )
    },
    {
      key: "paidTax",
      header: "Paid GST",
      width: "100px",
      render: (row: any) => moneyOrDash(row.paidTax),
    },
    {
      key: "doctorFee",
      header: "Doctor Fee",
      width: "120px",
      render: (row: any) => moneyOrDash(row.doctorFee),
    },
    {
      key: "clinicFee",
      header: "Clinic Fee",
      width: "110px",
      render: (row: any) => moneyOrDash(row.clinicFee),
    },

    {
      key: "finalProfit",
      header: "Final Profit",
      width: "130px",
      render: (row: any) => (
        <span className="font-bold">{moneyOrDash(row.finalProfit)}</span>
      ),
    },
    {
      key: "grossProfitPercentage",
      header: "Profit Margin",
      width: "150px",
      render: (row: any) =>
        Number(row.finalProfit || 0) === 0
          ? "-"
          : percent(
              row.finalProfit,
              row.paidRevenue - row.paidTax,
              row.grossRevenue,
            ),
    },
  ];
  const totals = doctorRows.reduce(
    (sum: any, row: any) => {
      for (const key of [
        "consultations",
        "invoices",
        "grossRevenue",
        "paidRevenue",
        "balance",
        "paidTax",
        "doctorFee",
        "clinicFee",
        "finalProfit",
      ]) {
        sum[key] += Number(row[key] || 0);
      }
      return sum;
    },
    {
      consultations: 0,
      invoices: 0,
      grossRevenue: 0,
      paidRevenue: 0,
      balance: 0,
      paidTax: 0,
      doctorFee: 0,
      clinicFee: 0,
      finalProfit: 0,
    },
  );
  const profitBasis = totals.paidRevenue - totals.paidTax;
  return (
    <div>
      <CollapsibleReportSection
        title="Doctor Fee & Profitability"
        subtitle="Doctor fee is deducted once for settled consultations, including fully covered membership visits."
        badge={`${doctorRows.length} doctors`}
        isOpen={openSections.doctor}
        onToggle={() =>
          setOpenSections((state: any) => ({ ...state, doctor: !state.doctor }))
        }
      >
        <div className="overflow-auto scrollbar-hidden rounded-lg border border-slate-200">
          <DataTable
            columns={columns}
            data={doctorRows}
            onRowClick={(row: any) => onOpenInvoices(row.invoiceIds)}
            paginate
            className="w-full min-w-[1280px] text-left text-sm"
            emptyMessage="No healthcare invoices match this filter."
            emptyDescription="Doctor fee and profitability details will appear here once consultations are settled."
            emptyIcon={Stethoscope}
            minBodyHeight={`${doctorRows.length > 0 ?'':'220px'}`}
            footer={
              <tr className="font-bold text-slate-900">
                <td colSpan={2} className="px-4 py-4 text-right">Filtered Totals</td>
                <td className="px-4 py-4">{totals.consultations}</td>
                <td className="px-4 py-4">{totals.invoices}</td>
                <td className="px-4 py-4">{moneyOrDash(totals.grossRevenue)}</td>
                <td className="px-4 py-4">{moneyOrDash(totals.paidRevenue)}</td>
                <td className="px-4 py-4">{moneyOrDash(totals.balance)}</td>
                <td className="px-4 py-4">-</td>
                <td className="px-4 py-4">{moneyOrDash(totals.paidTax)}</td>
                <td className="px-4 py-4">{moneyOrDash(totals.doctorFee)}</td>
                <td className="px-4 py-4">{moneyOrDash(totals.clinicFee)}</td>
                <td className="px-4 py-4">{moneyOrDash(totals.finalProfit)}</td>
                <td className="px-4 py-4">
                  {profitBasis ? percent(totals.finalProfit, profitBasis) : "-"}
                </td>
              </tr>
            }
          />
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default AppointmentReports;
