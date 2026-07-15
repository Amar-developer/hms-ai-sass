import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ChevronRight,
  History,
  Home,
  IndianRupee,
  ReceiptIndianRupee,
  Stethoscope,
  Users,
} from "lucide-react";

import Metric from "./Metric";
import { DashboardView, MetrixProps } from "../types";
import { Pagination } from "@/app/components/common/Pagination";
import { pageSize } from "@/utils/constants";



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

// Derive the dashboard card props from a stored month snapshot. The previous
// month for the comparison lines is the next-older snapshot in the (desc) list.
function snapshotView(snapshot: any, snapshots: any[]): DashboardView {
  const metrics = snapshot?.metrics || {};
  const totals = metrics.totals || {};
  const index = snapshots.findIndex((row) => row.id === snapshot.id);
  const older = index >= 0 ? snapshots[index + 1] : undefined;
  const olderMetrics = older?.metrics || {};
  return {
    totals,
    previousTotals: olderMetrics.totals || {},
    grossProfit: Number(metrics.grossProfit || 0),
    finalProfit: Number(metrics.finalProfit || 0),
    previousFinalProfit: Number(olderMetrics.finalProfit || 0),
    labSettlementSummary: metrics.labSettlement || {
      revenue: 0,
      purchaseCost: 0,
      profit: 0,
    },
    membershipClaimRows: totals.membershipClaims || [],
  };
}

function DashboardCards({
  view,
  money,
  percent,
}: {
  view: DashboardView;
  money: (value: number) => string;
  percent: (value: number, total: number) => string;
}) {
  const {
    totals,
    previousTotals,
    grossProfit,
    finalProfit,
    previousFinalProfit,
    labSettlementSummary,
    membershipClaimRows,
  } = view;
  const topMembershipClaim = membershipClaimRows[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={IndianRupee}
          label="Gross Revenue"
          value={money(totals.grossRevenue)}
          hint={`${totals.invoices || 0} invoices`}
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
          hint={`${percent(finalProfit, totals.paidRevenue)} of paid · Gross ${money(grossProfit)} (${percent(grossProfit, Math.max(totals.grossRevenue - totals.membershipDiscount, 0))})`}
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
          value={totals.membershipEnrollCount || 0}
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
}

function ClosedMonths({
  snapshots,
  selectedId,
  onSelect,
  money,
}: {
  snapshots: any[];
  selectedId: string | null;
  onSelect: (snapshot: any) => void;
  money: (value: number) => string;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(snapshots.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedSnapshots = snapshots.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-500" />
          <h4 className="text-sm font-bold text-slate-950">Closed Months</h4>
        </div>
        <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
          {snapshots.length}
        </span>
      </div>
      {snapshots.length === 0 ? (
        <p className="px-4 py-4 text-xs font-semibold text-slate-500">
          No closed months yet. Each month is frozen automatically once it ends,
          then appears here — click a month to reopen its dashboard.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-bold">Month</th>
                <th className="px-4 py-2 text-right font-bold">Invoices</th>
                <th className="px-4 py-2 text-right font-bold">Gross</th>
                <th className="px-4 py-2 text-right font-bold">Paid</th>
                <th className="px-4 py-2 text-right font-bold">Final Profit</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedSnapshots.map((snapshot: any) => {
                const active = snapshot.id === selectedId;
                return (
                  <tr
                    key={snapshot.id}
                    onClick={() => onSelect(snapshot)}
                    className={`cursor-pointer transition-colors ${
                      active ? "bg-emerald-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {snapshot.period_label}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {snapshot.invoice_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {money(snapshot.gross_revenue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {money(snapshot.paid_revenue)}
                    </td>
                    <td className="px-4 py-3 text-right font-black tabular-nums text-emerald-700">
                      {money(snapshot.final_profit)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 pb-4">
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={snapshots.length}
              onPage={setPage}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const MetricsReport = ({
  totals,
  previousTotals,
  grossProfit,
  finalProfit,
  previousFinalProfit,
  labSettlementSummary,
  membershipClaimRows,
  snapshots = [],
  recalculatingSnapshotId = null,
  snapshotMessage = "",
  onRecalculateSnapshot,
  money,
  percent,
}: MetrixProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = snapshots.find((row) => row.id === selectedId) || null;

  const liveView: DashboardView = {
    totals,
    previousTotals,
    grossProfit,
    finalProfit,
    previousFinalProfit,
    labSettlementSummary,
    membershipClaimRows,
  };
  const view = selected ? snapshotView(selected, snapshots) : liveView;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selected && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Current month
            </button>
          )}
          <h3 className="text-sm font-black text-slate-900">
            {selected ? `${selected.period_label} · Closed` : "Current Month"}
          </h3>
        </div>
        {selected && (
          <div className="flex items-center gap-2">
            {snapshotMessage && (
              <span className="text-[11px] font-bold text-emerald-700">
                {snapshotMessage}
              </span>
            )}
            {onRecalculateSnapshot && (
              <button
                type="button"
                onClick={() => onRecalculateSnapshot(selected)}
                disabled={recalculatingSnapshotId === selected.id}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {recalculatingSnapshotId === selected.id
                  ? "Recalculating..."
                  : "Recalculate"}
              </button>
            )}
            <span className="rounded-lg bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700">
              Frozen at month end
            </span>
          </div>
        )}
      </div>

      <DashboardCards view={view} money={money} percent={percent} />

      <ClosedMonths
        snapshots={snapshots}
        selectedId={selectedId}
        onSelect={(snapshot) =>
          setSelectedId((current) =>
            current === snapshot.id ? null : snapshot.id,
          )
        }
        money={money}
      />
    </div>
  );
};

export default MetricsReport;
