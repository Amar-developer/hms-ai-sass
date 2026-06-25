import React from "react";
import CollapsibleReportSection from "@/app/components/reports/CollapsibleReportSection";
import { DataTable } from "@/app/components/reports/DataTable";

export type AppointmentReportsProps = {
  openSections: any;
  setOpenSections: any;
  money: any;
  doctorRows: any;
  percent: any;
};
const AppointmentReports = ({
  doctorRows,
  openSections,
  setOpenSections,
  money,
  percent,
}: AppointmentReportsProps) => {
  const columns = [
    {
      key: "doctor",
      header: "Doctor",
      render: (row: any) => <b>{row.doctor}</b>,
    },
    {
      key: "consultations",
      header: "Consultations",
    },
    {
      key: "invoices",
      header: "Invoices",
    },
    {
      key: "grossRevenue",
      header: "Gross Revenue",
      render: (row: any) => money(row.grossRevenue),
    },
    {
      key: "paidRevenue",
      header: "Paid",
      render: (row: any) => money(row.paidRevenue),
    },
    {
      key: "doctorFee",
      header: "Doctor Fee",
      render: (row: any) => money(row.doctorFee),
    },
    {
      key: "settlement",
      header: "Settlement",
      render: (row: any) => money(row.settlement),
    },
    {
      key: "clinicFee",
      header: "Clinic Fee",
      render: (row: any) => money(row.clinicFee),
    },
    {
      key: "grossProfitPercentage",
      header: "Gross Profit %",
      render: (row: any) =>
        percent(
          Math.max(row.grossRevenue - row.doctorFee, 0),
          row.grossRevenue,
        ),
    },
    {
      key: "finalProfit",
      header: "Final Profit",
      render: (row: any) => (
        <span className="font-bold">{money(row.finalProfit)}</span>
      ),
    },
  ];
  return (
    <div>
      <CollapsibleReportSection
        title="Doctor Settlement & Profitability"
        subtitle="Profit and settlement use only fully paid invoices, so issued or due invoices do not overstate doctor payout or clinic profit."
        badge={`${doctorRows.length} doctors`}
        isOpen={openSections.doctor}
        onToggle={() =>
          setOpenSections((state: any) => ({ ...state, doctor: !state.doctor }))
        }
      >
        <div className="mt-4 overflow-auto rounded-2xl border">
          <DataTable
          columns={columns}
          data={doctorRows}
          className="w-full min-w-[1280px] text-left text-sm"
          emptyMessage="No healthcare invoices match this filter."
          />
        </div>
      </CollapsibleReportSection>
    </div>
  );
};

export default AppointmentReports;
