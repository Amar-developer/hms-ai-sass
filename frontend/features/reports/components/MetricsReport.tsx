import { useEffect, useId, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Banknote,
  BarChart3,
  CalendarDays,
  ChartPie,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  FlaskConical,
  Gift,
  History,
  Home,
  Info,
  LayoutGrid,
  Landmark,
  Percent,
  Pill,
  ReceiptIndianRupee,
  Smartphone,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import Metric from "./Metric";
import { DashboardView, MetrixProps } from "../types";
import { dashboardProfitSummary } from "../financials";
import { dashboardPeriodRanges } from "../helpers";
import { Pagination } from "@/app/components/common/Pagination";
import { pageSize } from "@/utils/constants";

const chartPeriodOptions = [
  { value: "today", label: "Today" },
  { value: "current_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "current_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "three_months", label: "Last 3 Months" },
  { value: "six_months", label: "Last 6 Months" },
  { value: "this_year", label: "This Year" },
  { value: "twelve_months", label: "Last 12 Months" },
  { value: "custom", label: "Custom Range" },
];

const emptyProfitSummary = {
  paidRevenue: 0,
  paidTax: 0,
  recognizedRevenue: 0,
  doctorSettlement: 0,
  supplierSettlement: 0,
  homeCareStaffSettlement: 0,
  monthlyExpenses: 0,
  membershipDiscount: 0,
  membershipFreeItems: 0,
  manualDiscount: 0,
  offerDiscount: 0,
  revenueAdjustments: 0,
  profitDeductions: 0,
  grossProfit: 0,
  incomeMargin: 0,
};

function filterMetricTrendRows(
  rows: any[],
  period: string,
  customStart: string,
  customEnd: string,
) {
  if (!rows.length) return [];
  const lastDate = rows[rows.length - 1]?.date;
  const today = lastDate ? new Date(`${lastDate}T12:00:00`) : new Date();
  let range: [string, string];

  if (period === "custom") {
    range = [customStart, customEnd];
  } else if (period === "today") {
    range = [lastDate, lastDate];
  } else if (
    ["three_months", "six_months", "this_year", "twelve_months"].includes(
      period,
    )
  ) {
    const start = new Date(today);
    start.setDate(1);
    if (period === "three_months") start.setMonth(start.getMonth() - 2);
    if (period === "six_months") start.setMonth(start.getMonth() - 5);
    if (period === "twelve_months") start.setMonth(start.getMonth() - 11);
    if (period === "this_year") start.setMonth(0);
    const startKey = [
      start.getFullYear(),
      String(start.getMonth() + 1).padStart(2, "0"),
      "01",
    ].join("-");
    range = [startKey, lastDate];
  } else {
    range = dashboardPeriodRanges(period as any, today).range;
  }

  return rows.filter(
    (row: any) => row.date >= range[0] && row.date <= range[1],
  );
}

function previousPeriodLabel(rows: any[]) {
  if (!rows.length) return "vs previous period";
  const start = new Date(`${rows[0].date}T12:00:00`);
  const end = new Date(`${rows[rows.length - 1].date}T12:00:00`);
  const duration = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86400000) + 1,
  );
  const previousEnd = new Date(start);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - duration + 1);
  const format = (date: Date) =>
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `vs ${format(previousStart)} – ${format(previousEnd)}`;
}

function changeLine(current: number, previous: number) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (prev === 0) {
    if (cur === 0) return { text: "No activity in previous period", tone: "flat" };
    return { text: "▲ New vs previous period", tone: "up" };
  }
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (pct === 0) return { text: "0% vs previous period", tone: "flat" };
  return {
    text: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs previous period`,
    tone: pct > 0 ? "up" : "down",
  };
}

function MoneyTooltip({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-bold text-slate-900">{label}</p>
      {payload.map((row: any) => (
        <p
          key={`${String(row.dataKey)}-${String(row.name)}`}
          className="mt-1 flex items-center justify-between gap-5 text-slate-600"
        >
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: row.payload?.color || row.color,
              }}
            />
            {row.name}
          </span>
          <span className="font-black tabular-nums text-slate-900">
            {String(row.dataKey).toLowerCase().includes("rate")
              ? `${Number(row.value || 0).toLocaleString("en-IN", {
                  maximumFractionDigits: 1,
                })}%`
              : money(Number(row.value || 0))}
          </span>
        </p>
      ))}
    </div>
  );
}

function ExpenseCategoryTooltip({ active, payload, money, total }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  const amount = Number(row.amount || 0);
  const share = total ? Math.round((amount / total) * 100) : 0;
  return (
    <div className="min-w-36 rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{
            background: `linear-gradient(135deg, ${row.softColor}, ${row.color})`,
          }}
        />
        <p className="text-[10px] font-black text-slate-700">{row.name}</p>
      </div>
      <p className="mt-1.5 text-base font-black tabular-nums text-slate-950">
        {money(amount)}
      </p>
      <p className="mt-0.5 text-[9px] font-semibold text-slate-400">
        {share}% of selected-period expenses
      </p>
    </div>
  );
}

function ChartPanel({ title, action, children, className = "" }: any) {
  return (
    <section
      className={`flex h-[282px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${className}`}
    >
      <div className="mb-3 flex min-h-7 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="min-w-0 truncate text-[11px] font-bold text-slate-800">
            {title}
          </h3>
          <Info className="h-3 w-3 shrink-0 text-slate-400" aria-label={`${title} information`} />
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ChartFilter({ label, value, onChange, options, className = "" }: any) {
  return (
    <select
      aria-label={`${label} filter`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`h-7 max-w-32 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-600 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${className}`}
    >
      {options.map((option: any) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function PremiumDateFilter({ label, value, onChange }: any) {
  return (
    <label className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-slate-600 shadow-sm transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
      <CalendarDays className="h-4 w-4 text-blue-600" />
      <span className="sr-only">{label}</span>
      <select
        aria-label={`${label} filter`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-28 bg-transparent text-xs font-bold text-slate-700 outline-none"
      >
        {chartPeriodOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChartInsight({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  compact = false,
}: any) {
  const tones: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 ring-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
    amber: "bg-amber-50 text-amber-500 ring-amber-100",
  };
  return (
    <div
      className={`flex min-w-0 items-center border-slate-200 sm:border-r sm:last:border-r-0 ${
        compact ? "gap-1.5 px-1.5 py-2" : "gap-2 px-2 py-2"
      }`}
    >
      <span
        className={`grid shrink-0 place-items-center rounded-lg ring-1 ${
          compact ? "h-7 w-7" : "h-8 w-8"
        } ${tones[tone] || tones.blue}`}
      >
        <Icon
          className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}
          fill="currentColor"
          fillOpacity={0.1}
          strokeWidth={2.15}
        />
      </span>
      <div className="min-w-0">
        <p
          title={label}
          className={`truncate font-medium text-slate-500 ${
            compact ? "text-[8px]" : "text-[9px]"
          }`}
        >
          {label}
        </p>
        <p
          title={String(value)}
          className={`truncate font-black tabular-nums text-slate-950 ${
            compact ? "text-[11px]" : "text-xs"
          }`}
        >
          {value}
        </p>
        {!compact && (
          <p className="truncate text-[8px] font-medium text-slate-500">
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

function RevenueAreaChart({ data, money }: any) {
  return (
    <div className="h-full min-h-0 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="paidRevenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 5" stroke="#dbe5f2" />
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            tick={{ fontSize: 10, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
            minTickGap={30}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
            width={58}
            tickFormatter={compactRupee}
          />
          <Tooltip content={<MoneyTooltip money={money} />} />
          <Area
            type="monotone"
            dataKey="recognizedRevenue"
            name="Revenue excluding GST"
            stroke="#2563eb"
            strokeWidth={2.75}
            fill="url(#paidRevenueFill)"
            dot={{ r: 2.4, fill: "#2563eb", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#2563eb", stroke: "white", strokeWidth: 2 }}
            animationDuration={500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function compactRupee(value: any) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 100000) return `₹${Math.round(amount / 10000) / 10}L`;
  if (Math.abs(amount) >= 1000) return `₹${Math.round(amount / 100) / 10}k`;
  return `₹${amount}`;
}

function DonutBreakdown({ data, total, money }: any) {
  const chartId = useId().replaceAll(":", "");
  const visible = data.filter((row: any) => row.amount > 0);
  const chartData = visible.length
    ? visible
    : [{ name: "No activity", amount: 1, color: "#cbd5e1" }];
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(140px,1.02fr)_minmax(112px,0.98fr)] items-center gap-2">
      <div className="relative h-40">
        <div className="pointer-events-none absolute inset-6 rounded-full bg-gradient-to-br from-blue-100/50 via-violet-50/30 to-emerald-100/50 blur-xl" />
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              {chartData.map((row: any, index: number) => (
                <linearGradient
                  key={`${row.name}-${index}`}
                  id={`${chartId}-segment-${index}`}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <stop offset="0%" stopColor={row.color} stopOpacity={1} />
                  <stop offset="100%" stopColor={row.color} stopOpacity={0.68} />
                </linearGradient>
              ))}
              <filter id={`${chartId}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow
                  dx="0"
                  dy="3"
                  stdDeviation="3"
                  floodColor="#64748b"
                  floodOpacity="0.2"
                />
              </filter>
            </defs>
            <Pie
              data={chartData}
              dataKey="amount"
              nameKey="name"
              innerRadius={46}
              outerRadius={70}
              cornerRadius={4}
              paddingAngle={visible.length ? 2.5 : 0}
              stroke="white"
              strokeWidth={2.5}
              style={{ filter: `url(#${chartId}-shadow)` }}
            >
              {chartData.map((row: any, index: number) => (
                <Cell
                  key={row.name}
                  fill={`url(#${chartId}-segment-${index})`}
                />
              ))}
            </Pie>
            {visible.length > 0 && <Tooltip content={<MoneyTooltip money={money} />} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="mx-auto grid h-[72px] w-[72px] place-content-center rounded-full border border-white/90 bg-gradient-to-br from-white via-white to-slate-50 shadow-inner">
            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
              Total
            </span>
            <span className="mt-0.5 text-sm font-black tabular-nums text-slate-950">
              {money(total)}
            </span>
          </span>
        </div>
      </div>
      <div className="max-h-[202px] space-y-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {data.map((row: any) => (
          <div
            key={row.name}
            className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-100 bg-gradient-to-r from-white to-slate-50/80 px-2 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            <span
              className="h-6 w-1 shrink-0 rounded-full"
              style={{
                background: `linear-gradient(180deg, ${row.color}, ${row.color}99)`,
              }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10px] font-bold text-slate-700">
                {row.name}
              </span>
              <span className="block truncate text-[9px] font-medium tabular-nums text-slate-400">
                {money(row.amount)}
              </span>
            </span>
            <span
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black tabular-nums"
              style={{ color: row.color, backgroundColor: `${row.color}12` }}
            >
              {total ? Math.round((row.amount / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Sparkline({ data, dataKey, color }: any) {
  const gradientId = `spark-${useId().replaceAll(":", "")}`;
  const chartData =
    data.length <= 8
      ? data
      : Array.from({ length: 8 }, (_, index) =>
          data[Math.round((index * (data.length - 1)) / 7)],
        );
  return (
    <div className="h-12 w-36 max-w-[46%]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 3, bottom: 1, left: 3 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={{ r: 2, fill: color, strokeWidth: 0 }}
            activeDot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function RevenueKpiCard({
  label,
  value,
  change,
  icon: Icon,
  color,
  iconClass,
  data,
  dataKey,
  comparisonLabel,
  cardClass = "from-white to-slate-50/80",
}: any) {
  const ChangeIcon = change >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className={`h-36 min-w-0 rounded-2xl border border-slate-200 bg-gradient-to-br p-4 shadow-sm ${cardClass}`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ring-white/80 ${iconClass}`}>
          <Icon
            className="h-6 w-6"
            fill="currentColor"
            fillOpacity={0.12}
            strokeWidth={2.1}
          />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-600">{label}</p>
          <p className="mt-1 truncate text-2xl font-black tabular-nums text-slate-950">{value}</p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span className={`flex items-center gap-1 text-xs font-black ${change >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
            <ChangeIcon className="h-4 w-4" />
            {Math.abs(change)}%
          </span>
          <p className="mt-1 truncate text-[10px] font-medium text-slate-500">
            {comparisonLabel || "vs previous period"}
          </p>
        </div>
        <Sparkline data={data} dataKey={dataKey} color={color} />
      </div>
    </div>
  );
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
    profitSummary:
      metrics.profitSummary || dashboardProfitSummary(totals),
    previousProfitSummary:
      olderMetrics.profitSummary ||
      dashboardProfitSummary(olderMetrics.totals || {}),
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
  trendRows,
  comparisonLabel,
  money,
  percent,
}: {
  view: DashboardView;
  trendRows: any[];
  comparisonLabel: string;
  money: (value: number) => string;
  percent: (value: number, total: number, fallbackTotal?: number) => string;
}) {
  const { totals, previousTotals, membershipClaimRows } = view;
  const value = (input: any) => Number(input || 0);
  const {
    paidRevenue,
    doctorSettlement,
    supplierSettlement,
    membershipDiscount: membershipStandardDiscount,
    membershipFreeItems,
    manualDiscount,
    offerDiscount,
    homeCareStaffSettlement,
    monthlyExpenses,
    profitDeductions,
    grossProfit: dashboardGrossProfit,
  } = { ...emptyProfitSummary, ...(view.profitSummary || {}) };
  const previousSummary = {
    ...emptyProfitSummary,
    ...(view.previousProfitSummary || {}),
  };
  const previousProfit = previousSummary.grossProfit;
  const paidPercentage = (amount: number) => percent(amount, paidRevenue);
  const paymentModes = totals.paymentModes || {};
  const previousPaymentModes = previousTotals.paymentModes || {};

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">
            Profit Summary
          </h4>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            icon={WalletCards}
            label="Total Paid"
            value={money(paidRevenue)}
            percentage="100%"
            hint={`${totals.invoices || 0} paid invoices`}
            trend={changeLine(paidRevenue, previousTotals.paidRevenue)}
            tone="blue"
            data={trendRows}
            dataKey="paidRevenue"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={Activity}
            label="Gross Profit"
            value={money(dashboardGrossProfit)}
            percentage={paidPercentage(dashboardGrossProfit)}
            hint="Revenue after GST, costs and expenses"
            trend={changeLine(dashboardGrossProfit, previousProfit)}
            tone="emerald"
            data={trendRows}
            dataKey="grossProfit"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={Percent}
            label="Total Deductions"
            value={money(profitDeductions)}
            percentage={paidPercentage(profitDeductions)}
            hint="GST, settlements and expenses"
            trend={changeLine(
              profitDeductions,
              previousSummary.profitDeductions,
            )}
            tone="rose"
            data={trendRows}
            dataKey="totalDeductions"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={CircleDollarSign}
            label="Total Billed"
            value={money(totals.grossRevenue)}
            percentage={percent(paidRevenue, value(totals.grossRevenue))}
            hint="Collection rate"
            trend={changeLine(
              totals.grossRevenue,
              previousTotals.grossRevenue,
            )}
            tone="slate"
            data={trendRows}
            dataKey="grossRevenue"
            comparisonLabel={comparisonLabel}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">
          Costs & Revenue Adjustments
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            icon={Stethoscope}
            label="Doctor Settlement"
            value={money(doctorSettlement)}
            percentage={paidPercentage(doctorSettlement)}
            hint="Of total paid"
            trend={changeLine(totals.doctorFee, previousTotals.doctorFee)}
            tone="violet"
            data={trendRows}
            dataKey="doctor"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={Landmark}
            label="Supplier / Vendor"
            value={money(supplierSettlement)}
            percentage={paidPercentage(supplierSettlement)}
            hint="Of total paid"
            trend={changeLine(
              supplierSettlement,
              previousSummary.supplierSettlement,
            )}
            tone="amber"
            data={trendRows}
            dataKey="supplier"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={ReceiptIndianRupee}
            label="Membership Discount"
            value={money(membershipStandardDiscount)}
            percentage={paidPercentage(membershipStandardDiscount)}
            hint="Excluding free items"
            trend={changeLine(
              membershipStandardDiscount,
              previousSummary.membershipDiscount,
            )}
            tone="indigo"
            data={trendRows}
            dataKey="membershipDiscount"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={Gift}
            label="Membership Free Items"
            value={money(membershipFreeItems)}
            percentage={paidPercentage(membershipFreeItems)}
            hint="Of total paid"
            trend={changeLine(
              membershipFreeItems,
              previousSummary.membershipFreeItems,
            )}
            tone="rose"
            data={trendRows}
            dataKey="membershipFreeItems"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={ReceiptIndianRupee}
            label="Request-Based Discount"
            value={money(manualDiscount)}
            percentage={paidPercentage(manualDiscount)}
            hint="Executed discount requests"
            trend={changeLine(manualDiscount, previousTotals.approvedDiscount)}
            tone="sky"
            data={trendRows}
            dataKey="requestDiscount"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={Percent}
            label="Offer Discount"
            value={money(offerDiscount)}
            percentage={paidPercentage(offerDiscount)}
            hint="Discounts from the Offers module"
            trend={changeLine(
              offerDiscount,
              previousSummary.offerDiscount,
            )}
            tone="rose"
            data={trendRows}
            dataKey="offerDiscount"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={Home}
            label="Home Care Staff"
            value={money(homeCareStaffSettlement)}
            percentage={paidPercentage(homeCareStaffSettlement)}
            hint="Ready for staff settlement"
            trend={changeLine(
              homeCareStaffSettlement,
              previousTotals.homeCareStaffSettlement,
            )}
            tone="emerald"
            data={trendRows}
            dataKey="homeCareStaff"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={Banknote}
            label="Monthly Expenses"
            value={money(monthlyExpenses)}
            percentage={paidPercentage(monthlyExpenses)}
            hint="Approved Expense module claims"
            trend={changeLine(
              monthlyExpenses,
              previousSummary.monthlyExpenses,
            )}
            tone="amber"
            data={trendRows}
            dataKey="monthlyExpenses"
            comparisonLabel={comparisonLabel}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">
          Paid Revenue by Module
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            icon={Stethoscope}
            label="Consultation"
            value={money(totals.consultationRevenue)}
            percentage={paidPercentage(value(totals.consultationRevenue))}
            hint="Of total paid"
            trend={changeLine(
              totals.consultationRevenue,
              previousTotals.consultationRevenue,
            )}
            tone="violet"
            data={trendRows}
            dataKey="consultation"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={FlaskConical}
            label="Lab"
            value={money(totals.labRevenue)}
            percentage={paidPercentage(value(totals.labRevenue))}
            hint="Of total paid"
            trend={changeLine(totals.labRevenue, previousTotals.labRevenue)}
            tone="sky"
            data={trendRows}
            dataKey="lab"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={Activity}
            label="Service"
            value={money(totals.serviceRevenue)}
            percentage={paidPercentage(value(totals.serviceRevenue))}
            hint="Of total paid"
            trend={changeLine(
              totals.serviceRevenue,
              previousTotals.serviceRevenue,
            )}
            tone="indigo"
            data={trendRows}
            dataKey="service"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={Pill}
            label="Pharmacy"
            value={money(totals.pharmacyRevenue)}
            percentage={paidPercentage(value(totals.pharmacyRevenue))}
            hint="Of total paid"
            trend={changeLine(
              totals.pharmacyRevenue,
              previousTotals.pharmacyRevenue,
            )}
            tone="rose"
            data={trendRows}
            dataKey="pharmacy"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={Home}
            label="Home Care"
            value={money(totals.homeCareRevenue)}
            percentage={paidPercentage(value(totals.homeCareRevenue))}
            hint="Of total paid"
            trend={changeLine(
              totals.homeCareRevenue,
              previousTotals.homeCareRevenue,
            )}
            tone="amber"
            data={trendRows}
            dataKey="homeCare"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={Stethoscope}
            label="Home Visit"
            value={money(totals.homeVisitRevenue)}
            percentage={paidPercentage(value(totals.homeVisitRevenue))}
            hint="Of total paid"
            trend={changeLine(
              totals.homeVisitRevenue,
              previousTotals.homeVisitRevenue,
            )}
            tone="emerald"
            data={trendRows}
            dataKey="homeVisit"
            comparisonLabel={comparisonLabel}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">
          Paid by Payment Mode
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            icon={Banknote}
            label="Cash"
            value={money(paymentModes.cash)}
            percentage={paidPercentage(value(paymentModes.cash))}
            hint="Of total paid"
            trend={changeLine(paymentModes.cash, previousPaymentModes.cash)}
            tone="emerald"
            data={trendRows}
            dataKey="cash"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={Smartphone}
            label="UPI"
            value={money(paymentModes.upi)}
            percentage={paidPercentage(value(paymentModes.upi))}
            hint="UPI, GPay and Paytm"
            trend={changeLine(paymentModes.upi, previousPaymentModes.upi)}
            tone="sky"
            data={trendRows}
            dataKey="upi"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={CreditCard}
            label="Card"
            value={money(paymentModes.card)}
            percentage={paidPercentage(value(paymentModes.card))}
            hint="Credit and debit cards"
            trend={changeLine(paymentModes.card, previousPaymentModes.card)}
            tone="violet"
            data={trendRows}
            dataKey="card"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={ReceiptIndianRupee}
            label="Others"
            value={money(paymentModes.others)}
            percentage={paidPercentage(value(paymentModes.others))}
            hint="Bank transfer and other modes"
            trend={changeLine(paymentModes.others, previousPaymentModes.others)}
            tone="amber"
            data={trendRows}
            dataKey="others"
            comparisonLabel={comparisonLabel}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">
          Membership Activity
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            icon={Users}
            label="Enrollments"
            value={totals.membershipEnrollCount || 0}
            percentage={percent(
              value(totals.membershipEnrollCount),
              value(totals.invoices),
            )}
            hint={`Purchase ${money(totals.membershipEnrollAmount)}`}
            trend={changeLine(
              totals.membershipEnrollCount,
              previousTotals.membershipEnrollCount,
            )}
            tone="sky"
            data={trendRows}
            dataKey="membershipEnrollCount"
            comparisonLabel={comparisonLabel}
          />
          <Metric
            icon={ReceiptIndianRupee}
            label="Total Membership Used"
            value={money(totals.membershipDiscount)}
            percentage={paidPercentage(value(totals.membershipDiscount))}
            hint="Of total paid"
            trend={changeLine(
              totals.membershipDiscount,
              previousTotals.membershipDiscount,
            )}
            tone="emerald"
            data={trendRows}
            dataKey="membershipUsed"
            comparisonLabel={comparisonLabel}
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

function MetricsCharts({
  view,
  trendRows,
  globalPeriod,
  customStart,
  customEnd,
  money,
}: {
  view: DashboardView;
  trendRows: any[];
  globalPeriod: string;
  customStart: string;
  customEnd: string;
  money: (value: number) => string;
}) {
  const expenseChartId = `expense-column-${useId().replaceAll(":", "")}`;
  const { totals } = view;
  const summary = { ...emptyProfitSummary, ...(view.profitSummary || {}) };
  const paymentModes = totals.paymentModes || {};
  const fallbackRows = trendRows.length
    ? trendRows
    : [
        {
          date: new Date().toISOString().slice(0, 10),
          label: "Selected period",
          paidRevenue: summary.paidRevenue,
          paidTax: summary.paidTax,
          recognizedRevenue: summary.recognizedRevenue,
          grossRevenue: Number(totals.grossRevenue || 0),
          invoiceCount: Number(totals.invoices || 0),
          collectionRate: Number(totals.grossRevenue || 0)
            ? Math.round(
                (summary.paidRevenue / Number(totals.grossRevenue)) * 100,
              )
            : 0,
          grossProfit: summary.grossProfit,
          totalDeductions: summary.profitDeductions,
          monthlyExpenses: summary.monthlyExpenses,
          expenseRent: Number(totals.expenseRent || 0),
          expenseUtilities: Number(totals.expenseUtilities || 0),
          expenseSupplies: Number(totals.expenseSupplies || 0),
          expenseTravel: Number(totals.expenseTravel || 0),
          expenseMaintenance: Number(totals.expenseMaintenance || 0),
          expenseOther: Number(totals.expenseOther || 0),
          consultation: Number(totals.consultationRevenue || 0),
          lab: Number(totals.labRevenue || 0),
          service: Number(totals.serviceRevenue || 0),
          pharmacy: Number(totals.pharmacyRevenue || 0),
          homeCare: Number(totals.homeCareRevenue || 0),
          homeVisit: Number(totals.homeVisitRevenue || 0),
          doctor: summary.doctorSettlement,
          supplier: summary.supplierSettlement,
          membership: summary.membershipDiscount + summary.membershipFreeItems,
          membershipDiscount: summary.membershipDiscount,
          membershipFreeItems: summary.membershipFreeItems,
          requestDiscount: summary.manualDiscount,
          offerDiscount: summary.offerDiscount,
          homeCareStaff: summary.homeCareStaffSettlement,
          cash: Number(paymentModes.cash || 0),
          upi: Number(paymentModes.upi || 0),
          card: Number(paymentModes.card || 0),
          others: Number(paymentModes.others || 0),
        },
      ];
  const overviewPeriod = "last_month";
  const [modulePeriod, setModulePeriod] = useState(globalPeriod);
  const [paymentPeriod, setPaymentPeriod] = useState(globalPeriod);
  const [comparisonPeriod, setComparisonPeriod] = useState(globalPeriod);
  const [trendPeriod, setTrendPeriod] = useState(globalPeriod);
  const [expensePeriod, setExpensePeriod] = useState(globalPeriod);

  useEffect(() => {
    setModulePeriod(globalPeriod);
    setPaymentPeriod(globalPeriod);
    setComparisonPeriod(globalPeriod);
    setTrendPeriod(globalPeriod);
    setExpensePeriod(globalPeriod);
  }, [globalPeriod]);

  const lastRowDate = fallbackRows[fallbackRows.length - 1]?.date;
  const chartToday = lastRowDate
    ? new Date(`${lastRowDate}T12:00:00`)
    : new Date();
  const rowsForPeriod = (period: string) => {
    let range: [string, string];
    if (period === "custom") {
      range = [customStart, customEnd];
    } else if (period === "today") {
      const key = [
        chartToday.getFullYear(),
        String(chartToday.getMonth() + 1).padStart(2, "0"),
        String(chartToday.getDate()).padStart(2, "0"),
      ].join("-");
      range = [key, key];
    } else if (
      ["three_months", "six_months", "this_year", "twelve_months"].includes(
        period,
      )
    ) {
      const start = new Date(chartToday);
      start.setHours(0, 0, 0, 0);
      start.setDate(1);
      if (period === "three_months") start.setMonth(start.getMonth() - 2);
      if (period === "six_months") start.setMonth(start.getMonth() - 5);
      if (period === "twelve_months") start.setMonth(start.getMonth() - 11);
      if (period === "this_year") start.setMonth(0);
      const startKey = [
        start.getFullYear(),
        String(start.getMonth() + 1).padStart(2, "0"),
        "01",
      ].join("-");
      const endKey = [
        chartToday.getFullYear(),
        String(chartToday.getMonth() + 1).padStart(2, "0"),
        String(chartToday.getDate()).padStart(2, "0"),
      ].join("-");
      range = [startKey, endKey];
    } else {
      range = dashboardPeriodRanges(period as any, chartToday).range;
    }
    return fallbackRows.filter(
      (row: any) => row.date >= range[0] && row.date <= range[1],
    );
  };
  const sumRows = (rows: any[]) =>
    rows.reduce(
      (result: any, row: any) => {
        [
          "paidRevenue",
          "paidTax",
          "recognizedRevenue",
          "grossRevenue",
          "invoiceCount",
          "grossProfit",
          "totalDeductions",
          "monthlyExpenses",
          "expenseRent",
          "expenseUtilities",
          "expenseSupplies",
          "expenseTravel",
          "expenseMaintenance",
          "expenseOther",
          "balance",
          "consultation",
          "lab",
          "service",
          "pharmacy",
          "homeCare",
          "homeVisit",
          "doctor",
          "supplier",
          "membership",
          "membershipDiscount",
          "membershipFreeItems",
          "requestDiscount",
          "offerDiscount",
          "homeCareStaff",
          "cash",
          "upi",
          "card",
          "others",
        ].forEach((key) => {
          result[key] += Number(row[key] || 0);
        });
        return result;
      },
      {
        paidRevenue: 0,
        paidTax: 0,
        recognizedRevenue: 0,
        grossRevenue: 0,
        invoiceCount: 0,
        grossProfit: 0,
        totalDeductions: 0,
        monthlyExpenses: 0,
        expenseRent: 0,
        expenseUtilities: 0,
        expenseSupplies: 0,
        expenseTravel: 0,
        expenseMaintenance: 0,
        expenseOther: 0,
        balance: 0,
        consultation: 0,
        lab: 0,
        service: 0,
        pharmacy: 0,
        homeCare: 0,
        homeVisit: 0,
        doctor: 0,
        supplier: 0,
        membership: 0,
        membershipDiscount: 0,
        membershipFreeItems: 0,
        requestDiscount: 0,
        offerDiscount: 0,
        homeCareStaff: 0,
        cash: 0,
        upi: 0,
        card: 0,
        others: 0,
      },
    );
  const moduleBreakdown = (rows: any[]) => {
    const values = sumRows(rows);
    const laboratory = Math.max(values.lab - values.service, 0);
    const categorized =
      values.consultation +
      laboratory +
      values.service +
      values.pharmacy +
      values.homeCare +
      values.homeVisit;
    return {
      total: values.paidRevenue,
      data: [
        { name: "Consultation", amount: values.consultation, color: "#2563eb" },
        { name: "Laboratory", amount: laboratory, color: "#38bdf8" },
        { name: "Service", amount: values.service, color: "#8b5cf6" },
        { name: "Pharmacy", amount: values.pharmacy, color: "#fbbf24" },
        { name: "Home Care", amount: values.homeCare, color: "#34d399" },
        { name: "Home Visit", amount: values.homeVisit, color: "#fb7185" },
        { name: "Others", amount: Math.max(values.paidRevenue - categorized, 0), color: "#94a3b8" },
      ],
    };
  };
  const groupRows = (rows: any[], mode: "week" | "month") => {
    const grouped = new Map<string, any[]>();
    rows.forEach((row: any) => {
      const date = new Date(`${row.date}T12:00:00`);
      let key: string;
      if (mode === "month") {
        key = row.date.slice(0, 7);
      } else {
        const weekday = date.getDay();
        date.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1));
        key = date.toISOString().slice(0, 10);
      }
      grouped.set(key, [...(grouped.get(key) || []), row]);
    });
    return [...grouped.entries()].map(([key, rowsInGroup]) => {
      const values = sumRows(rowsInGroup);
      const date = new Date(`${key}${mode === "month" ? "-01" : ""}T12:00:00`);
      return {
        ...values,
        dayCount: rowsInGroup.length,
        incomeMargin: values.recognizedRevenue
          ? (values.grossProfit / values.recognizedRevenue) * 100
          : 0,
        date: key,
        label:
          mode === "month"
            ? date.toLocaleDateString("en-IN", { month: "short" })
            : `Wk ${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`,
      };
    });
  };

  const thisYearTotals = sumRows(rowsForPeriod("this_year"));
  const globalRows = rowsForPeriod(globalPeriod);
  const globalTotals = sumRows(globalRows);
  const globalChartRows = ["three_months", "six_months", "this_year", "twelve_months"].includes(
    globalPeriod,
  )
    ? groupRows(globalRows, "month")
    : globalRows;
  const comparisonDateLabel = (() => {
    if (!globalRows.length) return "vs previous period";
    const selectedStart = new Date(`${globalRows[0].date}T12:00:00`);
    const selectedEnd = new Date(
      `${globalRows[globalRows.length - 1].date}T12:00:00`,
    );
    const duration = Math.max(
      1,
      Math.round((selectedEnd.getTime() - selectedStart.getTime()) / 86400000) + 1,
    );
    const previousEnd = new Date(selectedStart);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - duration + 1);
    const dateText = (date: Date) =>
      date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    return `vs ${dateText(previousStart)} – ${dateText(previousEnd)}`;
  })();
  const selectedOverviewRows = rowsForPeriod(overviewPeriod);
  const previousOverviewRows = (() => {
    if (!selectedOverviewRows.length) return [];
    const selectedStart = new Date(`${selectedOverviewRows[0].date}T12:00:00`);
    const selectedEnd = new Date(
      `${selectedOverviewRows[selectedOverviewRows.length - 1].date}T12:00:00`,
    );
    const duration = Math.max(
      1,
      Math.round(
        (selectedEnd.getTime() - selectedStart.getTime()) / 86400000,
      ) + 1,
    );
    const previousEnd = new Date(selectedStart);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - duration + 1);
    const toDateKey = (date: Date) => date.toISOString().slice(0, 10);
    const startKey = toDateKey(previousStart);
    const endKey = toDateKey(previousEnd);
    return fallbackRows.filter(
      (row: any) => row.date >= startKey && row.date <= endKey,
    );
  })();
  const overviewRows = ["three_months", "six_months", "this_year", "twelve_months"].includes(
    overviewPeriod,
  )
    ? groupRows(selectedOverviewRows, "month")
    : selectedOverviewRows;
  const overviewTotals = sumRows(selectedOverviewRows);
  const previousOverviewTotals = sumRows(previousOverviewRows);
  const moduleResult = moduleBreakdown(rowsForPeriod(modulePeriod));
  const paymentTotals = sumRows(rowsForPeriod(paymentPeriod));
  const paymentData = [
    { name: "UPI", amount: paymentTotals.upi, color: "#2563eb" },
    { name: "Card", amount: paymentTotals.card, color: "#38bdf8" },
    { name: "Cash", amount: paymentTotals.cash, color: "#34d399" },
    { name: "Others", amount: paymentTotals.others, color: "#8b5cf6" },
  ];
  const comparisonResult = moduleBreakdown(rowsForPeriod(comparisonPeriod));
  const comparisonModules = [...comparisonResult.data].sort(
    (a, b) => b.amount - a.amount,
  );
  const activeComparisonModules = comparisonModules.filter(
    (row) => Number(row.amount || 0) > 0,
  );
  const topComparisonModule = activeComparisonModules[0] || null;
  const lowestComparisonModule =
    activeComparisonModules[activeComparisonModules.length - 1] || null;
  const comparisonMaximum = Math.max(
    ...comparisonModules.map((row) => Number(row.amount || 0)),
    1,
  );
  const moduleIcons: Record<string, any> = {
    Consultation: Stethoscope,
    Laboratory: FlaskConical,
    Service: Activity,
    Pharmacy: Pill,
    "Home Care": Home,
    "Home Visit": Home,
    Others: BarChart3,
  };
  const expenseTotals = sumRows(rowsForPeriod(expensePeriod));
  const expenseData = [
    {
      name: "Rent",
      amount: expenseTotals.expenseRent,
      color: "#7c3aed",
      softColor: "#c4b5fd",
    },
    {
      name: "Utilities",
      amount: expenseTotals.expenseUtilities,
      color: "#0891b2",
      softColor: "#67e8f9",
    },
    {
      name: "Supplies",
      amount: expenseTotals.expenseSupplies,
      color: "#f59e0b",
      softColor: "#fcd34d",
    },
    {
      name: "Travel",
      amount: expenseTotals.expenseTravel,
      color: "#e11d48",
      softColor: "#fda4af",
    },
    {
      name: "Maintenance",
      amount: expenseTotals.expenseMaintenance,
      color: "#059669",
      softColor: "#6ee7b7",
    },
    {
      name: "Other",
      amount: expenseTotals.expenseOther,
      color: "#64748b",
      softColor: "#cbd5e1",
    },
  ].sort((a, b) => b.amount - a.amount);
  const topExpenseData = expenseData.slice(0, 5);
  const totalExpenses = expenseTotals.monthlyExpenses;
  const trendRowsForWindow = rowsForPeriod(trendPeriod);
  const monthlyTrendRows = ["three_months", "six_months", "this_year", "twelve_months"].includes(
    trendPeriod,
  )
    ? groupRows(trendRowsForWindow, "month")
    : trendRowsForWindow;
  const globalSummary = {
    ...emptyProfitSummary,
    ...(view.profitSummary || {}),
  };
  const previousSummary = {
    ...emptyProfitSummary,
    ...(view.previousProfitSummary || {}),
  };
  const revenueChange = previousOverviewTotals.recognizedRevenue
    ? Math.round(
        ((overviewTotals.recognizedRevenue -
          previousOverviewTotals.recognizedRevenue) /
          Math.abs(previousOverviewTotals.recognizedRevenue)) *
          100,
      )
    : null;
  const percentChange = (current: number, previous: number) =>
    previous ? Math.round(((current - previous) / Math.abs(previous)) * 100) : current ? 100 : 0;
  const averageDailyRevenue = globalRows.length
    ? globalSummary.recognizedRevenue / globalRows.length
    : 0;
  const previousAverageDailyRevenue = globalRows.length
    ? previousSummary.recognizedRevenue / globalRows.length
    : 0;
  const averageIncomePercentage = Math.round(globalSummary.incomeMargin * 10) / 10;
  const previousIncomePercentage = previousSummary.incomeMargin;
  const globalKpiRows = globalChartRows.map((row: any) => {
    const dayCount = Number(row.dayCount || 1);
    return {
      ...row,
      totalRevenue: Number(row.recognizedRevenue || 0),
      netRevenue: Number(row.grossProfit || 0),
      averageDailyRevenue: Number(row.recognizedRevenue || 0) / dayCount,
      averageIncomePercentage: Number(row.incomeMargin || 0),
    };
  });
  const activeOverviewRows = overviewRows.filter(
    (row: any) => Number(row.recognizedRevenue || 0) > 0,
  );
  const highestRevenueRow = activeOverviewRows.reduce(
    (best: any, row: any) =>
      !best ||
      Number(row.recognizedRevenue || 0) >
        Number(best.recognizedRevenue || 0)
        ? row
        : best,
    null,
  );
  const lowestRevenueRow = activeOverviewRows.reduce(
    (best: any, row: any) =>
      !best ||
      Number(row.recognizedRevenue || 0) <
        Number(best.recognizedRevenue || 0)
        ? row
        : best,
    null,
  );
  const pointDateLabel = (row: any) => {
    if (!row?.date) return "No activity";
    const value = String(row.date);
    const date = new Date(`${value.length === 7 ? `${value}-01` : value}T12:00:00`);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: value.length === 7 ? undefined : "numeric",
      year: "numeric",
    });
  };
  const averageOverviewRevenue = selectedOverviewRows.length
    ? overviewTotals.recognizedRevenue / selectedOverviewRows.length
    : 0;
  const monthlyTrendTotals = sumRows(trendRowsForWindow);
  const billingTrendRows = monthlyTrendRows.map((row: any) => ({
    ...row,
    collectionRate: Number(row.grossRevenue || 0)
      ? Math.round(
          (Number(row.paidRevenue || 0) / Number(row.grossRevenue || 0)) *
            1000,
        ) / 10
      : 0,
  }));
  const billingCollectionRate = monthlyTrendTotals.grossRevenue
    ? Math.round(
        (monthlyTrendTotals.paidRevenue / monthlyTrendTotals.grossRevenue) *
          1000,
      ) / 10
    : 0;
  const collectionRate = Number(globalTotals.grossRevenue || 0)
    ? Math.round(
        (Number(globalTotals.paidRevenue || 0) /
          Number(globalTotals.grossRevenue || 0)) *
          1000,
      ) / 10
    : 0;
  const overviewPeriodLabel =
    chartPeriodOptions.find((option) => option.value === overviewPeriod)?.label ||
    "Selected dates";
  const overviewComparisonLabel = previousPeriodLabel(selectedOverviewRows);
  const trendPeriodLabel =
    chartPeriodOptions.find((option) => option.value === trendPeriod)?.label ||
    "Selected dates";
  const trendComparisonLabel = previousPeriodLabel(trendRowsForWindow);

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <RevenueKpiCard
          label="Total Revenue"
          value={money(globalSummary.recognizedRevenue)}
          change={percentChange(
            globalSummary.recognizedRevenue,
            previousSummary.recognizedRevenue,
          )}
          icon={WalletCards}
          color="#10b981"
          iconClass="bg-emerald-50 text-emerald-600"
          data={globalKpiRows}
          dataKey="totalRevenue"
          comparisonLabel={comparisonDateLabel}
          cardClass="from-emerald-50/70 via-white to-white"
        />
        <RevenueKpiCard
          label="Net Revenue"
          value={money(globalSummary.grossProfit)}
          change={percentChange(
            globalSummary.grossProfit,
            previousSummary.grossProfit,
          )}
          icon={ReceiptIndianRupee}
          color="#2563eb"
          iconClass="bg-blue-50 text-blue-600"
          data={globalKpiRows}
          dataKey="netRevenue"
          comparisonLabel={comparisonDateLabel}
          cardClass="from-blue-50/70 via-white to-white"
        />
        <RevenueKpiCard
          label="Average Daily Revenue"
          value={money(averageDailyRevenue)}
          change={percentChange(
            averageDailyRevenue,
            previousAverageDailyRevenue,
          )}
          icon={CircleDollarSign}
          color="#f59e0b"
          iconClass="bg-amber-50 text-amber-600"
          data={globalKpiRows}
          dataKey="averageDailyRevenue"
          comparisonLabel={comparisonDateLabel}
          cardClass="from-amber-50/70 via-white to-white"
        />
        <RevenueKpiCard
          label="Average Income %"
          value={`${averageIncomePercentage}%`}
          change={percentChange(
            averageIncomePercentage,
            previousIncomePercentage,
          )}
          icon={Percent}
          color="#8b5cf6"
          iconClass="bg-violet-50 text-violet-600"
          data={globalKpiRows}
          dataKey="averageIncomePercentage"
          comparisonLabel={comparisonDateLabel}
          cardClass="from-violet-50/70 via-white to-white"
        />
      </div>

      <div className="grid items-stretch gap-2.5 lg:grid-cols-2">
      <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <BarChart3 className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-base font-black tracking-tight text-slate-950">
                Revenue Overview
              </h3>
              <Info className="h-4 w-4 shrink-0 text-slate-400" />
            </div>
          </div>
          <span className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-600">
            <CalendarDays className="h-4 w-4 text-blue-600" />
            Last Month
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-black tabular-nums tracking-tight text-slate-950">
            {money(overviewTotals.recognizedRevenue)}
          </span>
          {revenueChange !== null && (
            <span
              className={`text-sm font-black ${
                revenueChange >= 0 ? "text-emerald-600" : "text-rose-500"
              }`}
            >
              {revenueChange >= 0 ? "↑" : "↓"} {Math.abs(revenueChange)}%
            </span>
          )}
          <span className="text-xs font-medium text-slate-500">
            {overviewComparisonLabel}
          </span>
        </div>

        <div className="mt-2 h-[170px] sm:h-[190px]">
          <RevenueAreaChart data={overviewRows} money={money} />
        </div>

        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40 sm:grid-cols-4">
          <ChartInsight
            icon={BarChart3}
            label="Highest Revenue"
            value={money(highestRevenueRow?.recognizedRevenue || 0)}
            detail={pointDateLabel(highestRevenueRow)}
            tone="blue"
          />
          <ChartInsight
            icon={TrendingUp}
            label="Lowest Revenue"
            value={money(lowestRevenueRow?.recognizedRevenue || 0)}
            detail={pointDateLabel(lowestRevenueRow)}
            tone="emerald"
          />
          <ChartInsight
            icon={Activity}
            label="Average Revenue"
            value={money(averageOverviewRevenue)}
            detail="Per day"
            tone="blue"
          />
          <ChartInsight
            icon={CircleDollarSign}
            label="Total Transactions"
            value={Number(overviewTotals.invoiceCount || 0).toLocaleString("en-IN")}
            detail={overviewPeriodLabel}
            tone="violet"
          />
        </div>
      </section>

      <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
              <Activity className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-base font-black tracking-tight text-slate-950">
                Billing, Discounts &amp; Collection
              </h3>
              <Info className="h-4 w-4 shrink-0 text-slate-400" />
            </div>
          </div>
          <PremiumDateFilter
            label="Billing discounts and collection"
            value={trendPeriod}
            onChange={setTrendPeriod}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-black tabular-nums tracking-tight text-slate-950">
            {money(monthlyTrendTotals.grossRevenue)}
          </span>
          <span className="text-sm font-black text-emerald-600">
            {billingCollectionRate}% collected
          </span>
          <span className="text-xs font-medium text-slate-500">
            {trendComparisonLabel}
          </span>
        </div>

        <div className="mt-2 h-[170px] sm:h-[190px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={billingTrendRows}
              margin={{ top: 12, right: 18, left: 4, bottom: 2 }}
            >
              <defs>
                <linearGradient id="monthlyPaidFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b5bfd" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0.72} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 5" stroke="#dbe5f2" />
              <XAxis
                dataKey="label"
                interval="preserveStartEnd"
                tick={{ fontSize: 11, fill: "#475569" }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                yAxisId="amount"
                tickFormatter={compactRupee}
                tick={{ fontSize: 11, fill: "#475569" }}
                axisLine={false}
                tickLine={false}
                width={58}
              />
              <YAxis
                yAxisId="rate"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
                tick={{ fontSize: 11, fill: "#10b981" }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip content={<MoneyTooltip money={money} />} />
              <Bar
                yAxisId="amount"
                dataKey="grossRevenue"
                name="Gross Billed"
                fill="url(#monthlyPaidFill)"
                radius={[7, 7, 0, 0]}
                maxBarSize={56}
              />
              <Bar
                yAxisId="amount"
                dataKey="requestDiscount"
                name="Request Discount"
                fill="#f59e0b"
                radius={[5, 5, 0, 0]}
                maxBarSize={24}
              />
              <Bar
                yAxisId="amount"
                dataKey="offerDiscount"
                name="Offer Discount"
                fill="#f43f5e"
                radius={[5, 5, 0, 0]}
                maxBarSize={24}
              />
              <Line
                yAxisId="rate"
                type="monotone"
                dataKey="collectionRate"
                name="Collection Rate"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ r: 3, fill: "#10b981", stroke: "white", strokeWidth: 1.5 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40 sm:grid-cols-4">
          <ChartInsight
            icon={ReceiptIndianRupee}
            label="Gross Billed"
            value={money(monthlyTrendTotals.grossRevenue)}
            detail={trendPeriodLabel}
            tone="blue"
            compact
          />
          <ChartInsight
            icon={WalletCards}
            label="Collected"
            value={money(monthlyTrendTotals.paidRevenue)}
            detail="Successfully paid"
            tone="emerald"
            compact
          />
          <ChartInsight
            icon={Users}
            label="Membership"
            value={money(monthlyTrendTotals.membership)}
            detail="Membership used"
            tone="violet"
            compact
          />
          <ChartInsight
            icon={ReceiptIndianRupee}
            label="Request Discount"
            value={money(monthlyTrendTotals.requestDiscount)}
            detail="Approved requests"
            tone="amber"
            compact
          />
        </div>
      </section>
      </div>

      <div className="grid items-stretch gap-2.5 md:grid-cols-2">
        <ChartPanel title="Revenue Mix by Module" className="bg-gradient-to-br from-white via-white to-violet-50/40" action={<ChartFilter label="Revenue mix by module" value={modulePeriod} onChange={setModulePeriod} options={chartPeriodOptions} />}>
          <DonutBreakdown data={moduleResult.data} total={moduleResult.total} money={money} />
        </ChartPanel>
        <ChartPanel title="Revenue by Payment Mode" className="bg-gradient-to-br from-white via-white to-sky-50/50" action={<ChartFilter label="Revenue by payment mode" value={paymentPeriod} onChange={setPaymentPeriod} options={chartPeriodOptions} />}>
          <DonutBreakdown data={paymentData} total={paymentTotals.paidRevenue} money={money} />
        </ChartPanel>
      </div>

      <div className="grid items-stretch gap-2.5 lg:grid-cols-2">
      <section className="h-auto overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:h-[360px]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-100">
              <BarChart3
                className="h-4 w-4"
                fill="currentColor"
                fillOpacity={0.1}
                strokeWidth={2.2}
              />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-black tracking-tight text-slate-950">
                  Revenue by Module
                </h3>
                <Info className="h-4 w-4 shrink-0 text-slate-400" />
              </div>
              <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
                Compare paid revenue across clinical and service modules
              </p>
            </div>
          </div>
          <PremiumDateFilter
            label="Revenue by module"
            value={comparisonPeriod}
            onChange={setComparisonPeriod}
          />
        </div>

        <div className="relative mt-3 space-y-1">
          <div className="pointer-events-none absolute bottom-0 left-[128px] right-14 top-0 hidden grid-cols-5 sm:grid">
            {Array.from({ length: 5 }, (_, index) => (
              <span
                key={`module-grid-${index}`}
                className="border-l border-dashed border-slate-200"
              />
            ))}
          </div>
          {comparisonModules.map((row) => {
            const ModuleIcon = moduleIcons[row.name] || BarChart3;
            const barWidth = Math.max(
              (Number(row.amount || 0) / comparisonMaximum) * 100,
              Number(row.amount || 0) > 0 ? 1.5 : 0,
            );
            return (
              <div
                key={row.name}
                className="relative z-10 grid min-h-6 grid-cols-[28px_72px_minmax(0,1fr)] items-center gap-1.5 sm:grid-cols-[28px_88px_minmax(0,1fr)]"
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded-md ring-1 ring-inset"
                  style={{
                    backgroundColor: `${row.color}14`,
                    color: row.color,
                    boxShadow: `inset 0 0 0 1px ${row.color}20`,
                  }}
                >
                  <ModuleIcon className="h-3.5 w-3.5" strokeWidth={2.1} />
                </span>
                <span className="truncate text-[10px] font-semibold text-slate-700">
                  {row.name}
                </span>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="h-3.5 min-w-0 flex-1 overflow-hidden rounded bg-slate-50">
                    <div
                      className="h-full rounded shadow-sm transition-[width] duration-500"
                      style={{
                        width: `${barWidth}%`,
                        background: `linear-gradient(90deg, ${row.color}, ${row.color}cc)`,
                      }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right text-[10px] font-black tabular-nums text-slate-800">
                    {money(row.amount)}
                  </span>
                </div>
              </div>
            );
          })}
          <div className="grid grid-cols-[28px_72px_minmax(0,1fr)] gap-1.5 sm:grid-cols-[28px_88px_minmax(0,1fr)]">
            <span />
            <span />
            <div className="mr-14 flex justify-between text-[8px] font-medium tabular-nums text-slate-400">
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                <span key={ratio}>{compactRupee(comparisonMaximum * ratio)}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40 sm:grid-cols-4">
          <ChartInsight
            icon={TrendingUp}
            label="Top Module"
            value={topComparisonModule?.name || "No activity"}
            detail={
              topComparisonModule
                ? `${money(topComparisonModule.amount)} (${comparisonResult.total ? Math.round((topComparisonModule.amount / comparisonResult.total) * 100) : 0}%)`
                : money(0)
            }
            tone="blue"
          />
          <ChartInsight
            icon={BarChart3}
            label="Lowest Module"
            value={lowestComparisonModule?.name || "No activity"}
            detail={
              lowestComparisonModule
                ? `${money(lowestComparisonModule.amount)} (${comparisonResult.total ? Math.round((lowestComparisonModule.amount / comparisonResult.total) * 100) : 0}%)`
                : money(0)
            }
            tone="emerald"
          />
          <ChartInsight
            icon={ChartPie}
            label="Total Revenue"
            value={money(comparisonResult.total)}
            detail={
              chartPeriodOptions.find(
                (option) => option.value === comparisonPeriod,
              )?.label || "Selected dates"
            }
            tone="violet"
          />
          <ChartInsight
            icon={CircleDollarSign}
            label="Active Modules"
            value={activeComparisonModules.length}
            detail={`${comparisonModules.length} tracked`}
            tone="amber"
          />
        </div>
      </section>
      <ChartPanel
        title="Monthly Expenses by Category"
        className="!h-auto lg:!h-[360px]"
        action={
          <ChartFilter
            label="Expense category period"
            value={expensePeriod}
            onChange={setExpensePeriod}
            options={chartPeriodOptions}
            className="w-28"
          />
        }
      >
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-lg font-black tabular-nums text-slate-950">
            {money(totalExpenses)}
          </span>
          <span className="text-[10px] font-bold text-slate-400">
            approved and reimbursed expense claims
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={topExpenseData}
              margin={{ top: 18, right: 8, bottom: 2, left: 0 }}
              barCategoryGap="30%"
            >
              <defs>
                {topExpenseData.map((row, index) => (
                  <linearGradient
                    key={row.name}
                    id={`${expenseChartId}-${index}`}
                    x1="0"
                    y1="1"
                    x2="0"
                    y2="0"
                  >
                    <stop offset="0%" stopColor={row.color} />
                    <stop offset="100%" stopColor={row.softColor} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                strokeDasharray="3 5"
                vertical={false}
                stroke="#dbe5e1"
              />
              <XAxis
                dataKey="name"
                interval={0}
                tick={{ fontSize: 8, fill: "#64748b", fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={compactRupee}
                tick={{ fontSize: 9, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip
                cursor={{ fill: "#f8fafc", radius: 8 }}
                content={
                  <ExpenseCategoryTooltip
                    money={money}
                    total={totalExpenses}
                  />
                }
              />
              <Bar
                dataKey="amount"
                name="Expense"
                radius={[8, 8, 2, 2]}
                maxBarSize={48}
              >
                {topExpenseData.map((row, index) => (
                  <Cell
                    key={row.name}
                    fill={`url(#${expenseChartId}-${index})`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-center text-[9px] font-semibold text-slate-400">
          Top five categories ranked by recognized expense amount
        </p>
      </ChartPanel>
      </div>

      <div className="overflow-hidden rounded-2xl border border-emerald-700/30 bg-gradient-to-r from-emerald-950 via-emerald-800 to-teal-600 p-3.5 text-white shadow-lg shadow-emerald-200/50">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { id: "selected-period-revenue", label: `${chartPeriodOptions.find((option) => option.value === globalPeriod)?.label || "Selected Period"} Revenue`, value: money(globalTotals.paidRevenue), key: "paidRevenue" },
            { id: "last-month-revenue", label: "Last Month Revenue", value: money(previousSummary.paidRevenue), key: "paidRevenue" },
            { id: "this-year-revenue", label: "This Year Revenue", value: money(thisYearTotals.paidRevenue), key: "paidRevenue" },
            { id: "selected-period-outstanding", label: "Outstanding Amount", value: money(globalTotals.balance), key: "balance" },
          ].map((item) => (
            <div key={item.id} className="min-w-0 border-white/20 lg:border-r lg:pr-4">
              <p className="truncate text-[10px] font-semibold text-white/75">{item.label}</p>
              <p className="mt-1 truncate text-base font-black tabular-nums">{item.value}</p>
              <div className="mt-1 h-7 max-w-36 opacity-90">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={globalChartRows}>
                    <Line type="monotone" dataKey={item.key} stroke="white" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-1">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-[6px] border-white/35 bg-white/10 text-base font-black">
              {collectionRate}%
            </div>
            <div>
              <p className="text-xs font-bold">Collection Rate</p>
              <p className="mt-1 text-[10px] font-semibold text-white/75">vs previous period</p>
            </div>
          </div>
        </div>
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
                <th className="px-4 py-2 text-right font-bold">Gross Profit</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedSnapshots.map((snapshot: any) => {
                const active = snapshot.id === selectedId;
                const closedGrossProfit = dashboardProfitSummary(
                  snapshot.metrics?.totals || {},
                ).grossProfit;
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
                      {money(closedGrossProfit)}
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
  profitSummary,
  previousProfitSummary,
  grossProfit,
  finalProfit,
  previousFinalProfit,
  labSettlementSummary,
  membershipClaimRows,
  trendRows = [],
  loading = false,
  error = "",
  snapshots = [],
  recalculatingSnapshotId = null,
  snapshotMessage = "",
  onRecalculateSnapshot,
  chartPeriod,
  customStart,
  customEnd,
  onChartPeriodChange,
  onCustomRangeChange,
  money,
  percent,
}: MetrixProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"cards" | "charts">("cards");
  const selected = snapshots.find((row) => row.id === selectedId) || null;
  const liveView: DashboardView = {
    totals,
    previousTotals,
    profitSummary,
    previousProfitSummary,
    grossProfit,
    finalProfit,
    previousFinalProfit,
    labSettlementSummary,
    membershipClaimRows,
  };
  const view = selected ? snapshotView(selected, snapshots) : liveView;
  const dashboardTrendRows = selected
    ? []
    : filterMetricTrendRows(trendRows, chartPeriod, customStart, customEnd);
  const dashboardComparisonLabel = previousPeriodLabel(dashboardTrendRows);

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
                Revenue, adjustments, costs and approved monthly expenses
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!selected && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 p-1.5">
                <CalendarDays className="ml-1 h-4 w-4 text-blue-600" />
                <select
                  aria-label="Metrics dashboard period"
                  value={chartPeriod}
                  onChange={(event) => onChartPeriodChange(event.target.value)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  {chartPeriodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {chartPeriod === "custom" && (
                  <>
                    <input
                      aria-label="Custom report start date"
                      type="date"
                      value={customStart}
                      max={customEnd || undefined}
                      onChange={(event) =>
                        onCustomRangeChange(event.target.value, customEnd)
                      }
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-blue-400"
                    />
                    <span className="text-[10px] font-bold text-slate-400">to</span>
                    <input
                      aria-label="Custom report end date"
                      type="date"
                      value={customEnd}
                      min={customStart || undefined}
                      onChange={(event) =>
                        onCustomRangeChange(customStart, event.target.value)
                      }
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-blue-400"
                    />
                  </>
                )}
              </div>
            )}
            {selected && (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Live report
              </button>
            )}
            {selected && (
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600">
                {selected.period_label} closed
              </span>
            )}
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
        <div className="flex items-center gap-1 border-t border-slate-100 bg-slate-50/60 px-4 py-2">
          <button
            type="button"
            onClick={() => setActiveTab("cards")}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${
              activeTab === "cards"
                ? "bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:bg-white hover:text-slate-800"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Cards
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setActiveTab("charts");
            }}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${
              activeTab === "charts"
                ? "bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:bg-white hover:text-slate-800"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Charts
          </button>
        </div>
      </section>

      {loading && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700">
          Loading verified dashboard figures from the server…
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {activeTab === "cards" ? (
        <DashboardCards
          view={view}
          trendRows={dashboardTrendRows}
          comparisonLabel={dashboardComparisonLabel}
          money={money}
          percent={percent}
        />
      ) : (
        <MetricsCharts
          view={view}
          trendRows={trendRows}
          globalPeriod={chartPeriod}
          customStart={customStart}
          customEnd={customEnd}
          money={money}
        />
      )}

      {activeTab === "cards" && (
        <ClosedMonths
          snapshots={snapshots}
          selectedId={selectedId}
          onSelect={(snapshot) => {
            setActiveTab("cards");
            setSelectedId((current) =>
              current === snapshot.id ? null : snapshot.id,
            );
          }}
          money={money}
        />
      )}
    </div>
  );
};

export default MetricsReport;
