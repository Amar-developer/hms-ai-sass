import { Card } from "@/app/components/common/ui";

export default function ReportTotals({ totals, money }: any) {
  const cards = [
    ["Grand Total", money(totals.grandTotal)],
    ["Total Invoices", Number(totals.invoiceCount || 0).toLocaleString("en-IN")],
    ["Settlement", money(totals.settlement)],
    ["Due", money(totals.due)],
    ["Gross Profit", money(totals.grossProfit)],
    ["Membership Benefit", money(totals.membershipBenefit)],
  ];

  return (
    <Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 px-4 py-4">
            <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-black tabular-nums text-slate-900">
              {value}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
