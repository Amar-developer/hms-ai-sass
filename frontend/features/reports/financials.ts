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

/** Value of services/items supplied free through a membership plan. */
export function membershipFreeItemUsage(invoice: any) {
  return Math.max(amount(invoice?.membership_free_items_amount), 0);
}

/** Membership reduction excluding free items, which are reported separately. */
export function membershipDiscountUsage(invoice: any) {
  return Math.max(
    membershipBenefitUsage(invoice) - membershipFreeItemUsage(invoice),
    0,
  );
}

export function dashboardProfitSummary(totals: any) {
  const paidRevenue = amount(totals?.paidRevenue);
  const paidTax = Math.min(Math.max(amount(totals?.paidTax), 0), paidRevenue);
  const recognizedRevenue = Math.max(paidRevenue - paidTax, 0);
  const doctorSettlement = amount(totals?.doctorFee ?? totals?.doctor);
  const supplierSettlement = amount(
    totals?.supplierSettlement ?? totals?.supplier ?? totals?.settlement,
  );
  const homeCareStaffSettlement = amount(
    totals?.homeCareStaffSettlement ?? totals?.homeCareStaff,
  );
  const monthlyExpenses = amount(totals?.monthlyExpenses);
  const membershipFreeItems = amount(totals?.membershipFreeItems);
  const membershipDiscount = amount(
    totals?.membershipStandardDiscount ??
      Math.max(amount(totals?.membershipDiscount) - membershipFreeItems, 0),
  );
  const manualDiscount = amount(
    totals?.approvedDiscount ?? totals?.requestDiscount,
  );
  const offerDiscount = amount(totals?.offerDiscount);
  const revenueAdjustments =
    membershipDiscount +
    membershipFreeItems +
    manualDiscount +
    offerDiscount;
  // Invoice paid_amount is already net of billing discounts. Subtracting the
  // same discounts here would count them twice. GST is collected for the tax
  // authority, while settlements and recognized expenses are actual costs.
  const profitDeductions =
    paidTax +
    doctorSettlement +
    supplierSettlement +
    homeCareStaffSettlement +
    monthlyExpenses;
  const grossProfit = paidRevenue - profitDeductions;
  const incomeMargin = recognizedRevenue
    ? (grossProfit / recognizedRevenue) * 100
    : 0;

  return {
    paidRevenue,
    paidTax,
    recognizedRevenue,
    doctorSettlement,
    supplierSettlement,
    membershipDiscount,
    membershipFreeItems,
    manualDiscount,
    offerDiscount,
    homeCareStaffSettlement,
    monthlyExpenses,
    revenueAdjustments,
    profitDeductions,
    grossProfit,
    incomeMargin,
  };
}

function paymentModeGroup(method: any) {
  const value = String(method || "").toLowerCase();
  if (value === "cash") return "cash";
  if (["upi", "gpay", "paytm"].includes(value)) return "upi";
  if (["credit_card", "debit_card", "card"].includes(value)) return "card";
  return "others";
}

export function aggregatePaymentModeTotals(
  invoices: any[],
  invoiceDetailById: Map<string, any>,
) {
  return invoices.reduce(
    (totals, invoice) => {
      const paid = recognizedInvoiceRevenue(invoice);
      if (paid <= 0) return totals;
      const payments = (invoiceDetailById.get(invoice.id)?.payments || [])
        .map((payment: any) => ({
          group: paymentModeGroup(payment.method),
          amount: Math.max(
            amount(payment.amount) - amount(payment.refunded_amount),
            0,
          ),
          status: String(payment.status || "").toLowerCase(),
        }))
        .filter(
          (payment: any) =>
            payment.status === "recorded" && payment.amount > 0,
        );
      const paymentTotal = payments.reduce(
        (sum: number, payment: any) => sum + payment.amount,
        0,
      );
      if (paymentTotal > 0) {
        let allocated = 0;
        payments.forEach((payment: any, index: number) => {
          const share =
            index === payments.length - 1
              ? paid - allocated
              : Math.round((paid * payment.amount) / paymentTotal);
          totals[payment.group] += share;
          allocated += share;
        });
        return totals;
      }

      const methods = Array.from(
        new Set<string>(
          (Array.isArray(invoice.payment_methods)
            ? invoice.payment_methods
            : []
          ).map(paymentModeGroup),
        ),
      );
      totals[methods.length === 1 ? methods[0] : "others"] += paid;
      return totals;
    },
    { cash: 0, upi: 0, card: 0, others: 0 } as Record<string, number>,
  );
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
