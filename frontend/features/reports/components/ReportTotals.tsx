import { Card } from "@/app/components/common/ui";

export default function ReportTotals({ totals, money, section }: any) {
  const moneyOrDash = (value: any) =>
    Number(value || 0) === 0 ? "-" : money(value);
  const paidProfitBasis =
    Number(totals.paidRevenue || 0) - Number(totals.paidTax || 0);
  const profitMargin = paidProfitBasis
    ? `${Math.round((Number(totals.grossProfit || 0) / paidProfitBasis) * 100)}%`
    : "-";
  const commonCards = [
    {
      label: "Total",
      value: moneyOrDash(totals.grandTotal),
      hint: "Filtered paid invoice value",
    },
    {
      label: "Paid Invoices",
      value: Number(totals.invoiceCount || 0).toLocaleString("en-IN"),
      hint: "Count after current filters",
    },
    {
      label: "Paid",
      value: moneyOrDash(totals.paidRevenue),
      hint: "Collected amount",
    },
    {
      label: "Amount Due",
      value: moneyOrDash(totals.due),
      hint: "Outstanding on filtered rows",
    },
    {
      label: "Admin Discount",
      value: moneyOrDash(totals.approvedDiscount),
      hint: "Approved discounts on paid invoices",
    },
    {
      label: "Offer Discount",
      value: moneyOrDash(totals.offerDiscount),
      hint: "Promotional offers on paid invoices",
    },
    {
      label: "Membership Benefit",
      value: moneyOrDash(totals.membershipBenefit),
      hint: "Membership value used on paid invoices",
    },
  ];
  const profitCards = [
    {
      label: "Paid GST",
      value: moneyOrDash(totals.paidTax),
      hint: "GST recognized from paid amount",
    },
    {
      label: section === "appointments" ? "Final Profit" : "Realized Profit",
      value: moneyOrDash(totals.grossProfit),
      hint: "Paid − paid GST − costs",
    },
    {
      label: "Profit Margin",
      value: profitMargin,
      hint: "Profit ÷ paid excluding GST",
    },
  ];
  const cards =
    section === "invoice"
      ? [
          {
            label: "Total",
            value: moneyOrDash(totals.grandTotal),
            hint: "Filtered paid invoice value",
          },
          {
            label: "Paid Invoices",
            value: Number(totals.invoiceCount || 0).toLocaleString("en-IN"),
            hint: "Count after current filters",
          },
          {
            label: "Paid",
            value: moneyOrDash(totals.paidRevenue),
            hint: "Collected amount",
          },
          {
            label: "Amount Due",
            value: moneyOrDash(totals.due),
            hint: "Outstanding on filtered rows",
          },
          {
            label: "Admin Discount",
            value: moneyOrDash(totals.approvedDiscount),
            hint: "Approved discounts on paid invoices",
          },
          {
            label: "Offer Discount",
            value: moneyOrDash(totals.offerDiscount),
            hint: "Promotional offers on paid invoices",
          },
          {
            label: "Membership Benefit",
            value: moneyOrDash(totals.membershipBenefit),
            hint: "Membership value used on paid invoices",
          },
          {
            label: "Doctor Cost",
            value: moneyOrDash(totals.doctorFee),
            hint: "Paid-basis doctor share",
          },
          {
            label: "Paid GST",
            value: moneyOrDash(totals.paidTax),
            hint: "GST recognized from paid amount",
          },
          {
            label: "Settlement",
            value: moneyOrDash(totals.settlement),
            hint: "Supplier or service cost",
          },
          {
            label: "Realized Profit",
            value: moneyOrDash(totals.grossProfit),
            hint: "Paid − paid GST − doctor cost − settlement",
          },
          {
            label: "Profit Margin",
            value: profitMargin,
            hint: "Realized profit ÷ paid excluding GST",
          },
        ]
      : section === "appointments"
        ? [
            ...commonCards,
            {
              label: "Doctor Fee",
              value: moneyOrDash(totals.doctorFee),
              hint: "Paid-basis doctor share",
            },
            ...profitCards.slice(0, 1),
            {
              label: "Clinic Fee",
              value: moneyOrDash(totals.clinicFee),
              hint: "Clinic share on paid consultations",
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
              hint:
                section === "lab" || section === "pharmacy"
                  ? "Supplier purchase cost"
                  : "Paid-basis service cost",
            },
            ...profitCards,
          ];

  return (
    <Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl bg-slate-50 px-4 py-4">
            <p className="text-xs font-bold uppercase text-slate-500">
              {card.label}
            </p>
            <p className="mt-2 text-xl font-black tabular-nums text-slate-900">
              {card.value}
            </p>
            {card.hint && (
              <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">
                {card.hint}
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
