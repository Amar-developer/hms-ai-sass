import {
  Activity,
  CalendarDays,
  IndianRupee,
  Percent,
  ReceiptIndianRupee,
  Stethoscope,
} from "lucide-react";

import Metric from "@/app/components/reports/Metric";

type MetrixProps = {
  totals: any;
  grossProfit: number;
  finalProfit: number;
  completedAppointments: any[];
  patients: any[];
  ipAdmissions: any[];
  labSettlementSummary: any;
  pharmacySettlementSummary: any;
  money: (value: number) => string;
  percent: (value: number, total: number) => string;
};

const MetricsReport = ({
  totals,
  grossProfit,
  finalProfit,
  completedAppointments,
  patients,
  ipAdmissions,
  labSettlementSummary,
  pharmacySettlementSummary,
  money,
  percent,
}: MetrixProps) => {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-4 lg:grid-cols-4">
        <Metric
          icon={IndianRupee}
          label="Gross Revenue"
          value={money(totals.grossRevenue)}
          hint={`${totals.invoices} invoices`}
        />

        <Metric
          icon={ReceiptIndianRupee}
          label="Paid Revenue"
          value={money(totals.paidRevenue)}
          hint={`Due ${money(totals.balance)}`}
        />

        <Metric
          icon={Stethoscope}
          label="Doctor Fee"
          value={money(totals.doctorFee)}
          hint={`Settlement ${money(totals.settlement)}`}
        />

        <Metric
          icon={Activity}
          label="Final Profit"
          value={money(finalProfit)}
          hint={`Gross profit ${money(grossProfit)}`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          icon={Percent}
          label="Gross Profit %"
          value={percent(grossProfit, totals.grossRevenue)}
          hint="After doctor fee on invoice value"
        />

        <Metric
          icon={Percent}
          label="Final Profit %"
          value={percent(finalProfit, totals.paidRevenue)}
          hint="After paid-basis doctor settlement"
        />

        <Metric
          icon={CalendarDays}
          label="Completed Consultations"
          value={completedAppointments.length}
          hint={`${patients.length} patient records · ${ipAdmissions.length} IP records`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          icon={ReceiptIndianRupee}
          label="Consultation Revenue"
          value={money(totals.consultationRevenue)}
          hint="Paid consultation invoices"
        />

        <Metric
          icon={ReceiptIndianRupee}
          label="Lab Revenue"
          value={money(totals.labRevenue)}
          hint="Paid lab invoices"
        />

        <Metric
          icon={ReceiptIndianRupee}
          label="Pharmacy Revenue"
          value={money(totals.pharmacyRevenue)}
          hint="Paid pharmacy invoices"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Metric
          icon={ReceiptIndianRupee}
          label="Lab Settlement"
          value={money(labSettlementSummary.purchaseCost)}
          hint={`Lab profit ${money(labSettlementSummary.profit)}`}
        />

        <Metric
          icon={ReceiptIndianRupee}
          label="Pharmacy Settlement"
          value={money(pharmacySettlementSummary.purchaseCost)}
          hint={`Pharmacy profit ${money(pharmacySettlementSummary.profit)}`}
        />
      </div>
    </div>
  );
};

export default MetricsReport;
