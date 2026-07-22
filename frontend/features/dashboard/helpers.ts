
export type ShortcutTarget = string | { id: string; section?: string };


export function shortcutTargetId(target: ShortcutTarget) {
  return typeof target === "string" ? target : target.id;
}

export function rupees(value: any) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

export function dateKey(value: any) {
  return String(value || "").slice(0, 10);
}

export function monthKey(value: any) {
  return dateKey(value).slice(0, 7);
}

export function normalized(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
}

export function isCompletedAppointment(row: any) {
  const values = [
    row.status,
    row.queueStatus,
    row.queue_status,
    row.consultationStatus,
    row.consultation_status,
  ].map(normalized);
  return values.some((value) =>
    [
      "consultation_completed",
      "consultation_done",
      "completed",
      "done",
      "seen",
      "signed",
      "billed",
    ].includes(value),
  );
}

export function invoiceAmount(row: any) {
  return Number(
    row.paid_amount ?? row.total_amount ?? row.total ?? row.amount ?? 0,
  );
}

export function invoiceBalance(row: any) {
  return Number(row.balance_amount ?? row.balance ?? 0);
}

export function invoiceItemTotal(row: any) {
  return Number(
    row.subtotal_amount ?? row.total_amount ?? row.total ?? row.amount ?? 0,
  );
}

export function invoiceMembershipBenefit(row: any) {
  return Number(row.membership_discount_amount || 0);
}

export function invoiceOfferDiscount(row: any) {
  return Math.max(Number(row.offer_discount_amount || 0), 0);
}

export function invoiceApprovedDiscount(row: any) {
  return Math.max(Number(row.approved_discount_amount || 0), 0);
}

export function invoiceBillingDiscount(row: any) {
  return (
    invoiceMembershipBenefit(row) +
    invoiceOfferDiscount(row) +
    invoiceApprovedDiscount(row)
  );
}

export function topRows(
  rows: any[],
  keyGetter: (row: any) => string,
  labelGetter: (key: string) => string,
) {
  const buckets = rows.reduce((acc: Record<string, number>, row: any) => {
    const key = keyGetter(row) || "unassigned";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(buckets)
    .map(([key, count]) => ({
      key,
      label: labelGetter(key),
      count: Number(count),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
