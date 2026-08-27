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
  percent: (value: number, total: number, fallbackTotal?: number) => string;
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
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">
            Revenue
          </h4>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            icon={IndianRupee}
            label="Gross"
            value={money(totals.grossRevenue)}
            hint={`${totals.invoices || 0} invoices`}
            trend={changeLine(totals.grossRevenue, previousTotals.grossRevenue)}
            tone="emerald"
          />
          <Metric
            icon={ReceiptIndianRupee}
            label="Collected"
            value={money(totals.paidRevenue)}
            hint={`Due ${money(totals.balance)}`}
            trend={changeLine(totals.paidRevenue, previousTotals.paidRevenue)}
            tone="blue"
          />
          <Metric
            icon={ReceiptIndianRupee}
            label="Consultation"
            value={money(totals.consultationRevenue)}
            hint="Paid consultation invoices"
            trend={changeLine(
              totals.consultationRevenue,
              previousTotals.consultationRevenue,
            )}
            tone="violet"
          />
          <Metric
            icon={ReceiptIndianRupee}
            label="Lab"
            value={money(totals.labRevenue)}
            hint="Paid lab invoices"
            trend={changeLine(totals.labRevenue, previousTotals.labRevenue)}
            tone="sky"
          />
          <Metric
            icon={ReceiptIndianRupee}
            label="Service"
            value={money(totals.serviceRevenue)}
            hint="Paid Service category items"
            trend={changeLine(
              totals.serviceRevenue,
              previousTotals.serviceRevenue,
            )}
            tone="indigo"
          />
          <Metric
            icon={ReceiptIndianRupee}
            label="Pharmacy"
            value={money(totals.pharmacyRevenue)}
            hint="Paid pharmacy invoices"
            trend={changeLine(
              totals.pharmacyRevenue,
              previousTotals.pharmacyRevenue,
            )}
            tone="rose"
          />
          <Metric
            icon={Home}
            label="Home Care"
            value={money(totals.homeCareRevenue)}
            hint="Paid home care invoices"
            trend={changeLine(
              totals.homeCareRevenue,
              previousTotals.homeCareRevenue,
            )}
            tone="amber"
          />
          <Metric
            icon={Stethoscope}
            label="Home Visit"
            value={money(totals.homeVisitRevenue)}
            hint="Paid home visit invoices"
            trend={changeLine(
              totals.homeVisitRevenue,
              previousTotals.homeVisitRevenue,
            )}
            tone="emerald"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">
          Settlement &amp; Profit
        </h4>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Metric
            icon={Stethoscope}
            label="Doctor Cost"
            value={money(totals.doctorFee)}
            hint={`Other settlement ${money(totals.settlement)}`}
            trend={changeLine(totals.doctorFee, previousTotals.doctorFee)}
            tone="violet"
          />
          <Metric
            icon={ReceiptIndianRupee}
            label="Lab Cost"
            value={money(labSettlementSummary.purchaseCost)}
            hint={`Lab profit ${money(labSettlementSummary.profit)}`}
            tone="amber"
          />
          <Metric
            icon={Activity}
            label="Net Profit"
            value={money(finalProfit)}
            hint={`${percent(finalProfit, totals.paidRevenue - totals.paidTax, totals.grossRevenue)} of paid/service value · Gross ${money(grossProfit)} (${percent(grossProfit, Math.max(totals.grossRevenue - totals.membershipDiscount - totals.tax, 0), totals.grossRevenue)})`}
            trend={changeLine(finalProfit, previousFinalProfit)}
            tone="emerald"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">
          Discounts &amp; Membership
        </h4>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            icon={ReceiptIndianRupee}
            label="Billing Discount"
            value={money(totals.billingDiscount)}
            hint="Approved + offers + membership"
            trend={changeLine(
              totals.billingDiscount,
              previousTotals.billingDiscount,
            )}
            tone="indigo"
          />
          <Metric
            icon={ReceiptIndianRupee}
            label="Admin Discount"
            value={money(totals.approvedDiscount)}
            hint="Executed discount requests only"
            trend={changeLine(
              totals.approvedDiscount,
              previousTotals.approvedDiscount,
            )}
            tone="violet"
          />
          <Metric
            icon={Users}
            label="Enrollments"
            value={totals.membershipEnrollCount || 0}
            hint={`Purchase ${money(totals.membershipEnrollAmount)}`}
            trend={changeLine(
              totals.membershipEnrollCount,
              previousTotals.membershipEnrollCount,
            )}
            tone="sky"
          />
          <Metric
            icon={ReceiptIndianRupee}
            label="Membership Used"
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
            tone="emerald"
          />
        </div>
      </section>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
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
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-sm uppercase tracking-wide text-slate-500">
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
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-brand ring-1 ring-emerald-100">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-950">
                Metrics Dashboard
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Revenue, settlement, profit and membership usage in one view
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selected && (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Current month
              </button>
            )}
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600">
              {selected ? `${selected.period_label} closed` : "Current Month"}
            </span>
            {snapshotMessage && (
              <span className="text-[11px] font-bold text-emerald-700">
                {snapshotMessage}
              </span>
            )}
            {selected && onRecalculateSnapshot && (
              <button
                type="button"
                onClick={() => onRecalculateSnapshot(selected)}
                disabled={recalculatingSnapshotId === selected.id}
                className="h-8 rounded-lg border border-amber-200 bg-amber-50 px-3 text-[11px] font-bold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {recalculatingSnapshotId === selected.id
                  ? "Recalculating..."
                  : "Recalculate"}
              </button>
            )}
            {selected && (
              <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-700">
                Frozen at month end
              </span>
            )}
          </div>
        </div>
      </section>

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
