import {
  Activity,
  Home,
  IndianRupee,
  ReceiptIndianRupee,
  Stethoscope,
  Users,
} from "lucide-react";

import Metric from "@/app/components/reports/Metric";

type MetrixProps = {
  totals: any;
  previousTotals: any;
  grossProfit: number;
  finalProfit: number;
  previousFinalProfit: number;
  labSettlementSummary: any;
  membershipClaimRows: any[];
  money: (value: number) => string;
  percent: (value: number, total: number) => string;
};

function changeLine(current: number, previous: number) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (prev === 0) {
    if (cur === 0) return { text: "No activity last month", tone: "flat" };
    return { text: "▲ New vs last month", tone: "up" };
  }
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (pct === 0) return { text: "0% vs last month", tone: "flat" };
  return {
    text: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs last month`,
    tone: pct > 0 ? "up" : "down",
  };
}

const MetricsReport = ({
  totals,
  previousTotals,
  grossProfit,
  finalProfit,
  previousFinalProfit,
  labSettlementSummary,
  membershipClaimRows,
  money,
  percent,
}: MetrixProps) => {
  const topMembershipClaim = membershipClaimRows[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={IndianRupee}
          label="Gross Revenue"
          value={money(totals.grossRevenue)}
          hint={`${totals.invoices} invoices`}
          trend={changeLine(totals.grossRevenue, previousTotals.grossRevenue)}
        />

        <Metric
          icon={ReceiptIndianRupee}
          label="Paid Revenue"
          value={money(totals.paidRevenue)}
          hint={`Due ${money(totals.balance)}`}
          trend={changeLine(totals.paidRevenue, previousTotals.paidRevenue)}
        />

        <Metric
          icon={Stethoscope}
          label="Doctor Fee"
          value={money(totals.doctorFee)}
          hint={`Settlement ${money(totals.settlement)}`}
          trend={changeLine(totals.doctorFee, previousTotals.doctorFee)}
        />

        <Metric
          icon={Activity}
          label="Final Profit"
          value={money(finalProfit)}
          hint={`${percent(finalProfit, totals.paidRevenue)} of paid · Gross ${money(grossProfit)} (${percent(grossProfit, totals.grossRevenue)})`}
          trend={changeLine(finalProfit, previousFinalProfit)}
        />
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={ReceiptIndianRupee}
          label="Consultation Revenue"
          value={money(totals.consultationRevenue)}
          hint="Paid consultation invoices"
          trend={changeLine(
            totals.consultationRevenue,
            previousTotals.consultationRevenue,
          )}
        />

        <Metric
          icon={ReceiptIndianRupee}
          label="Lab Revenue"
          value={money(totals.labRevenue)}
          hint="Paid lab invoices"
          trend={changeLine(totals.labRevenue, previousTotals.labRevenue)}
        />

        <Metric
          icon={ReceiptIndianRupee}
          label="Pharmacy Revenue"
          value={money(totals.pharmacyRevenue)}
          hint="Paid pharmacy invoices"
          trend={changeLine(
            totals.pharmacyRevenue,
            previousTotals.pharmacyRevenue,
          )}
        />

        <Metric
          icon={Home}
          label="Home Care Revenue"
          value={money(totals.homeCareRevenue)}
          hint="Paid home care invoices"
          trend={changeLine(
            totals.homeCareRevenue,
            previousTotals.homeCareRevenue,
          )}
        />
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={Stethoscope}
          label="Home Visit Revenue"
          value={money(totals.homeVisitRevenue)}
          hint="Paid home visit invoices"
          trend={changeLine(
            totals.homeVisitRevenue,
            previousTotals.homeVisitRevenue,
          )}
        />

        <Metric
          icon={Users}
          label="Membership Enrollments"
          value={totals.membershipEnrollCount}
          hint={`Purchase ${money(totals.membershipEnrollAmount)}`}
          trend={changeLine(
            totals.membershipEnrollCount,
            previousTotals.membershipEnrollCount,
          )}
        />

        <Metric
          icon={ReceiptIndianRupee}
          label="Membership Claimed"
          value={money(totals.membershipDiscount)}
          hint={
            topMembershipClaim
              ? `${topMembershipClaim.label} ${money(topMembershipClaim.claimedAmount)}`
              : "No membership benefit claimed"
          }
          trend={changeLine(
            totals.membershipDiscount,
            previousTotals.membershipDiscount,
          )}
        />

        <Metric
          icon={ReceiptIndianRupee}
          label="Lab Settlement"
          value={money(labSettlementSummary.purchaseCost)}
          hint={`Lab profit ${money(labSettlementSummary.profit)}`}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
          <h4 className="text-sm font-bold text-slate-950">
            Membership Claimed by Module
          </h4>
          <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            {membershipClaimRows.length}
          </span>
        </div>
        {membershipClaimRows.length === 0 ? (
          <p className="px-4 py-4 text-xs font-semibold text-slate-500">
            No membership benefits claimed in this period.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {membershipClaimRows.map((row: any) => (
              <div
                key={row.type}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 text-xs"
              >
                <span className="font-bold text-slate-900">{row.label}</span>
                <span className="font-semibold text-slate-500">
                  {row.invoices} invoices
                </span>
                <span className="text-right font-black tabular-nums text-emerald-700">
                  {money(row.claimedAmount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MetricsReport;
