function amount(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function recognizedInvoiceRevenue(invoice: any) {
  return Math.max(amount(invoice?.paid_amount), 0);
}

export function membershipBenefitUsage(invoice: any) {
  return Math.max(amount(invoice?.membership_discount_amount), 0);
}

// Report totals show the full value delivered: the net invoice amount plus
// the portion consumed from the patient's membership. Paid revenue remains
// separate and is the only basis for settlement and realized profit.
export function reportedInvoiceTotal(invoice: any) {
  return (
    Math.max(amount(invoice?.total_amount), 0) + membershipBenefitUsage(invoice)
  );
}

export function reportPaymentMode(
  invoice: any,
  payments: any[] = [],
  label: (value: string) => string = (value) => value,
) {
  const invoiceMethods = Array.isArray(invoice?.payment_methods)
    ? invoice.payment_methods
    : [];
  const recordedMethods = payments
    .filter(
      (payment) =>
        String(payment?.status || "").toLowerCase() === "recorded" &&
        amount(payment?.amount) - amount(payment?.refunded_amount) > 0,
    )
    .map((payment) => payment.method);
  const methods = [
    ...invoiceMethods,
    ...recordedMethods,
    ...(membershipBenefitUsage(invoice) > 0 ? ["membership_benefit"] : []),
  ];
  const labels = Array.from(
    new Set(methods.filter(Boolean).map((method) => label(String(method)))),
  );
  return labels.length ? labels.join(" + ") : "-";
}

export function realizedGrossProfit(invoice: any, settlementOrCost: number) {
  return Math.max(recognizedInvoiceRevenue(invoice) - amount(settlementOrCost), 0);
}

export function allocatedReportValue(
  lineAmount: number,
  invoiceSubtotal: number,
  invoiceValue: number,
) {
  if (lineAmount <= 0 || invoiceSubtotal <= 0 || invoiceValue <= 0) return 0;
  return Math.round((lineAmount * invoiceValue) / invoiceSubtotal);
}
