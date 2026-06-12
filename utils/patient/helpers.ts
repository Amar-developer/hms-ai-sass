import { displayDate } from "../helper";

export function activeTenantOptions(tenants: any[]) {
  const seen = new Set<string>();
  return (tenants || []).filter((tenant: any) => {
    if (tenant.status === "suspended") return false;
    const key = String(tenant.name || tenant.id || "")
      .trim()
      .toLowerCase();
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
}


export function toRow(patient: any) {
  return { ...patient, active_alert_count: 0, critical_alert_count: 0 };
}

export function patientSearchText(patient: any, branch?: any) {
  return [
    patient.id,
    patient.patient_number,
    patient.full_name,
    patient.name,
    patient.mobile,
    patient.alternate_mobile,
    patient.guardian_name,
    patient.guardian,
    patient.guardian_mobile,
    patient.guardianMobile,
    patient.email,
    patient.area,
    patient.address,
    patient.status,
    branch?.name,
    branch?.code,
    branch?.area,
    branch?.city,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function fmtDate(val: string | null | undefined) {
  return displayDate(val);
}

export function money(value: any) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

export function splitListText(value: any) {
  const seen = new Set<string>();
  return String(value || "")
    .split(/\n|,/)
    .map((item: string) => item.trim())
    .filter((item: string) => {
      if (!item) return false;
      const key = item.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function uniqueClinicalRecords(rows: any[], getKey: (row: any) => string) {
  const seen = new Set<string>();
  return rows.filter((row: any) => {
    const key = getKey(row).toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeClinicalText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function clinicalRecordsWithUniqueItems(
  rows: any[],
  getValue: (row: any) => any,
) {
  const seen = new Set<string>();
  return rows
    .map((row: any) => {
      const items = splitListText(getValue(row)).filter((item: string) => {
        const key = normalizeClinicalText(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { row, items };
    })
    .filter(({ items }: any) => items.length > 0);
}