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

export function patientDateInputValue(value: any) {
  const text = String(value || "").trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match?.[1] || "";
}

export function calculateAgeYears(dateOfBirth: string) {
  if (!dateOfBirth) return "";
  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 && age <= 130 ? String(age) : "";
}

export function displayPatientGender(value: any) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function isActivePatientRecord(patient: any) {
  const status = String(patient?.status || "active").trim().toLowerCase();
  return !["inactive", "deceased", "disabled", "archived"].includes(status);
}

export function patientDisplayName(patient: any) {
  return patient?.full_name || patient?.name || patient?.patient_name || "Patient";
}

export function patientDisplayNumber(patient: any) {
  return patient?.patient_number || patient?.patientNumber || patient?.id || "";
}

export function patientDisplayMobile(patient: any) {
  return (
    patient?.mobile ||
    patient?.alternate_mobile ||
    patient?.guardian_mobile ||
    patient?.guardianMobile ||
    ""
  );
}

export function patientPickerLabel(patient: any) {
  return [
    patientDisplayName(patient),
    patientDisplayNumber(patient),
    patientDisplayMobile(patient),
  ]
    .filter(Boolean)
    .join(" · ");
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


export type BranchOption = {
  id: string;
  name: string;
};

export type PatientFormPayload = {
  branchId: string;
  fullName: string;
  mobile: string;
  alternateMobile: string;
  email: string;
  gender: string;
  dateOfBirth: string;
  ageYears: string;
  guardianName: string;
  guardianMobile: string;
  area: string;
  address: string;
  bloodGroup: string;
  status: string;
};

export function formValue(fd: FormData, key: string) {
  return String(fd.get(key) || "").trim();
}

export function patientFormPayload(fd: FormData): PatientFormPayload {
  return {
    branchId: formValue(fd, "branchId"),
    fullName: formValue(fd, "fullName"),
    mobile: formValue(fd, "mobile"),
    alternateMobile: formValue(fd, "alternateMobile"),
    email: formValue(fd, "email"),
    gender: formValue(fd, "gender") || "unknown",
    dateOfBirth: formValue(fd, "dateOfBirth"),
    ageYears: formValue(fd, "ageYears"),
    guardianName: formValue(fd, "guardianName"),
    guardianMobile: formValue(fd, "guardianMobile"),
    area: formValue(fd, "area"),
    address: formValue(fd, "address"),
    bloodGroup: formValue(fd, "bloodGroup"),
    status: formValue(fd, "status") || "active",
  };
}

export function patientField(patient: any, snakeKey: string, camelKey?: string) {
  return patient?.[snakeKey] ?? patient?.[camelKey || snakeKey] ?? "";
}

export function todayInputValue() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}
