export function money(value: any) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

export function numberValue(value: any) {
  return Number(value || 0);
}

export function dateKey(value: any) {
  return String(value || "").slice(0, 10);
}

export function normalized(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
}

export function isCompleted(row: any) {
  return [
    row.status,
    row.queueStatus,
    row.queue_status,
    row.consultationStatus,
    row.consultation_status,
  ]
    .map(normalized)
    .some((status) =>
      [
        "consultation_completed",
        "consultation_done",
        "completed",
        "done",
        "seen",
        "signed",
        "billed",
      ].includes(status),
    );
}

export function currentRange(period: string) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (period === "daily") {
    return [toInputDate(start), toInputDate(end)];
  }
  if (period === "weekly") {
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    end.setDate(start.getDate() + 6);
    return [toInputDate(start), toInputDate(end)];
  }
  start.setDate(1);
  end.setMonth(end.getMonth() + 1, 0);
  return [toInputDate(start), toInputDate(end)];
}

export function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function percent(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export function settlementPaidBasis(invoice: any) {
  const total = numberValue(invoice.total_amount);
  const paid = numberValue(invoice.paid_amount);
  const doctorShare = numberValue(invoice.doctor_share_amount);
  if (!total || !paid || !doctorShare) return 0;
  return Math.min(Math.round((doctorShare * paid) / total), paid);
}

export function rowDate(invoice: any) {
  return dateKey(invoice.created_at || invoice.invoice_date || invoice.updated_at);
}

export function isPaidInvoice(invoice: any) {
  const status = normalized(invoice.status);
  const paid = numberValue(invoice.paid_amount);
  const balance = numberValue(invoice.balance_amount);
  return status === "paid" || (paid > 0 && balance <= 0);
}

export function invoiceType(invoice: any) {
  if (invoice.pharmacy_issue_id) return "pharmacy";
  if (invoice.lab_order_id) return "lab";
  return "consultation";
}

export function invoiceTypeLabel(type: string) {
  if (type === "pharmacy") return "Pharmacy";
  if (type === "lab") return "Lab";
  return "Consultation";
}

export function csvCell(value: any) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadBlob(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function tableToCsv(headers: string[], rows: any[][]) {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

export function htmlEscape(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function htmlTable(headers: string[], rows: any[][]) {
  const headerStyle =
    "background-color:#2f6b52;color:#ffffff;font-family:Roboto,Arial,sans-serif;font-size:13px;font-weight:bold;border:1px solid #b7c5bd;padding:9px 10px;text-align:left;white-space:nowrap;";
  const textStyle =
    "font-family:Roboto,Arial,sans-serif;font-size:13px;color:#1f2937;border:1px solid #d9e2dd;padding:8px 10px;text-align:left;";
  const numberStyle =
    "font-family:Roboto,Arial,sans-serif;font-size:13px;color:#1f2937;border:1px solid #d9e2dd;padding:8px 10px;text-align:right;";
  const emptyStyle =
    "font-family:Roboto,Arial,sans-serif;font-size:13px;color:#64748b;border:1px solid #d9e2dd;padding:12px 10px;text-align:left;";
  return `
    <table style="border-collapse:collapse;width:100%;margin-bottom:22px;">
      <thead>
        <tr>${headers.map((header) => `<th style="${headerStyle}">${htmlEscape(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows
                .map((row, index) => {
                  const isTotal = row[0] === "Total";
                  const background = isTotal ? "#e6f2ec" : index % 2 ? "#f8faf9" : "#ffffff";
                  return (
                    `<tr>${row
                      .map((cell) => {
                        const style = `${typeof cell === "number" ? numberStyle : textStyle}${isTotal ? "font-weight:bold;" : ""}`;
                        return `<td style="${style}background-color:${background};">${htmlEscape(cell)}</td>`;
                      })
                      .join("")}</tr>`
                  );
                })
                .join("")
            : `<tr><td colspan="${headers.length}" style="${emptyStyle}">No rows</td></tr>`
        }
      </tbody>
    </table>
  `;
}

export function titledHtmlTable(title: string, headers: string[], rows: any[][]) {
  const titleStyle =
    "font-family:Roboto,Arial,sans-serif;font-size:16px;font-weight:bold;color:#0f172a;background-color:#eef6f1;border:1px solid #b7c5bd;padding:10px 12px;text-align:left;";
  return `
    <table style="border-collapse:collapse;width:100%;margin-bottom:22px;">
      <thead>
        <tr><th colspan="${headers.length}" style="${titleStyle}">${htmlEscape(title)}</th></tr>
      </thead>
    </table>
    ${htmlTable(headers, rows)}
  `;
}

export function parseEmailList(value: string) {
  return value
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}