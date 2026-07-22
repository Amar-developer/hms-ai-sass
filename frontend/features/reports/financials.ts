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

/** Invoice-level discount approved through the request/approval workflow. */
export function approvedDiscountUsage(invoice: any) {
  return Math.max(amount(invoice?.approved_discount_amount), 0);
}

/** Invoice-level promotional offer discount. MRP markdown is never included. */
export function offerDiscountUsage(invoice: any) {
  return Math.max(amount(invoice?.offer_discount_amount), 0);
}

export function billingDiscountUsage(invoice: any) {
  return (
    approvedDiscountUsage(invoice) +
    offerDiscountUsage(invoice) +
    membershipBenefitUsage(invoice)
  );
}

export function recognizedInvoiceTax(invoice: any) {
  const total = Math.max(amount(invoice?.total_amount), 0);
  const paid = recognizedInvoiceRevenue(invoice);
  const tax = Math.max(amount(invoice?.tax_amount), 0);
  if (!total || !paid || !tax) return 0;
  return Math.min(Math.round((tax * paid) / total), paid, tax);
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
  return (
    recognizedInvoiceRevenue(invoice) -
    recognizedInvoiceTax(invoice) -
    amount(settlementOrCost)
  );
}

export function allocatedReportValue(
  lineAmount: number,
  invoiceSubtotal: number,
  invoiceValue: number,
) {
  if (lineAmount <= 0 || invoiceSubtotal <= 0 || invoiceValue <= 0) return 0;
  return Math.round((lineAmount * invoiceValue) / invoiceSubtotal);
}

export function allocateReportValues(
  lineAmounts: number[],
  invoiceSubtotal: number,
  invoiceValue: number,
) {
  const subtotal = Math.max(Math.round(amount(invoiceSubtotal)), 0);
  const value = Math.max(Math.round(amount(invoiceValue)), 0);
  const weights = lineAmounts.map((line) =>
    Math.max(Math.round(amount(line)), 0),
  );
  if (!subtotal || !value || weights.length === 0)
    return weights.map(() => 0);

  const target = Math.min(
    value,
    Math.round(
      (weights.reduce((sum, weight) => sum + weight, 0) * value) / subtotal,
    ),
  );
  const allocations = weights.map((weight) =>
    Math.floor((weight * value) / subtotal),
  );
  let remainder = target - allocations.reduce((sum, row) => sum + row, 0);
  const ranked = weights
    .map((weight, index) => ({
      index,
      remainder: (weight * value) % subtotal,
    }))
    .sort(
      (left, right) =>
        right.remainder - left.remainder || left.index - right.index,
    );
  for (const row of ranked) {
    if (remainder <= 0) break;
    allocations[row.index] += 1;
    remainder -= 1;
  }
  return allocations;
}
