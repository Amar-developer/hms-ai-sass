import {
  BadgeCheck,
  CircleDollarSign,
  Landmark,
  Percent,
  ReceiptText,
  Stethoscope,
  Tag,
  TrendingUp,
  WalletCards,
} from "lucide-react";

export default function ReportTotals({ totals, money, section }: any) {
  const moneyOrDash = (value: any) =>
    Number(value || 0) === 0 ? "-" : money(value);
  const paidProfitBasis =
    Number(totals.paidRevenue || 0) - Number(totals.paidTax || 0);
  const profitBasis = paidProfitBasis || Number(totals.grandTotal || 0);
  const profitMargin = profitBasis
    ? `${Math.round((Number(totals.grossProfit || 0) / profitBasis) * 100)}%`
    : "-";
  const commonCards = [
    {
      label: "Total Billed",
      value: moneyOrDash(totals.grandTotal),
      icon: ReceiptText,
      tone: "emerald",
    },
    {
      label: "Invoices",
      value: Number(totals.invoiceCount || 0).toLocaleString("en-IN"),
      icon: BadgeCheck,
      tone: "sky",
    },
    {
      label: "Collected",
      value: moneyOrDash(totals.paidRevenue),
      icon: WalletCards,
      tone: "emerald",
    },
    {
      label: "Due",
      value: moneyOrDash(totals.due),
      icon: CircleDollarSign,
      tone: "amber",
    },
    {
      label: "Admin Discount",
      value: moneyOrDash(totals.approvedDiscount),
      icon: Percent,
      tone: "violet",
    },
    {
      label: "Offer Discount",
      value: moneyOrDash(totals.offerDiscount),
      icon: Tag,
      tone: "rose",
    },
    {
      label: "Membership Used",
      value: moneyOrDash(totals.membershipBenefit),
      icon: BadgeCheck,
      tone: "indigo",
    },
  ];
  const profitCards = [
    {
      label: "Paid GST",
      value: moneyOrDash(totals.paidTax),
      icon: ReceiptText,
      tone: "sky",
    },
    {
      label: section === "appointments" ? "Final Profit" : "Net Profit",
      value: moneyOrDash(totals.grossProfit),
      icon: TrendingUp,
      tone: "emerald",
    },
    {
      label: "Profit Margin",
      value: profitMargin,
      icon: Percent,
      tone: "slate",
    },
  ];
  const cards =
    section === "invoice"
      ? [
          {
            label: "Total Billed",
            value: moneyOrDash(totals.grandTotal),
            icon: ReceiptText,
            tone: "emerald",
          },
          {
            label: "Invoices",
            value: Number(totals.invoiceCount || 0).toLocaleString("en-IN"),
            icon: BadgeCheck,
            tone: "sky",
          },
          {
            label: "Collected",
            value: moneyOrDash(totals.paidRevenue),
            icon: WalletCards,
            tone: "emerald",
          },
          {
            label: "Due",
            value: moneyOrDash(totals.due),
            icon: CircleDollarSign,
            tone: "amber",
          },
          {
            label: "Admin Discount",
            value: moneyOrDash(totals.approvedDiscount),
            icon: Percent,
            tone: "violet",
          },
          {
            label: "Offer Discount",
            value: moneyOrDash(totals.offerDiscount),
            icon: Tag,
            tone: "rose",
          },
          {
            label: "Membership Used",
            value: moneyOrDash(totals.membershipBenefit),
            icon: BadgeCheck,
            tone: "indigo",
          },
          {
            label: "Doctor Cost",
            value: moneyOrDash(totals.doctorFee),
            icon: Stethoscope,
            tone: "amber",
          },
          {
            label: "Paid GST",
            value: moneyOrDash(totals.paidTax),
            icon: ReceiptText,
            tone: "sky",
          },
          {
            label: "Settlement",
            value: moneyOrDash(totals.settlement),
            icon: Landmark,
            tone: "indigo",
          },
          {
            label: "Net Profit",
            value: moneyOrDash(totals.grossProfit),
            icon: TrendingUp,
            tone: "emerald",
          },
          {
            label: "Profit Margin",
            value: profitMargin,
            icon: Percent,
            tone: "slate",
          },
        ]
      : section === "appointments"
        ? [
            ...commonCards,
            {
              label: "Doctor Fee",
              value: moneyOrDash(totals.doctorFee),
              icon: Stethoscope,
              tone: "amber",
            },
            ...profitCards.slice(0, 1),
            {
              label: "Clinic Fee",
              value: moneyOrDash(totals.clinicFee),
              icon: Landmark,
              tone: "indigo",
            },
            ...profitCards.slice(1),
          ]
        : [
            ...commonCards,
            {
              label:
                section === "lab" || section === "pharmacy"
                  ? "Purchase Cost"
                  : "Settlement",
              value: moneyOrDash(totals.settlement),
              icon: Landmark,
              tone: "indigo",
            },
            ...profitCards,
          ];
  const toneClasses: Record<string, string> = {
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
    rose: "bg-rose-50 text-rose-600 ring-rose-100",
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
  };

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex h-full min-h-[74px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-slate-300"
        >
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ${
              toneClasses[card.tone || "emerald"]
            }`}
          >
            <card.icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {card.label}
            </p>
            <p className="mt-0.5 text-xl font-black tabular-nums text-slate-950">
              {card.value}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}
