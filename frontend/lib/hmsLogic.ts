import { isActivePatientRecord } from "@/features/patients/helpers";

export function departmentPrefix(id: string) {
  const clean = String(id || "GEN").replace(/[^a-z0-9]/gi, "");
  return clean.slice(0, 3).toUpperCase() || "GEN";
}
export function doctorsByDepartment(
  list: any[],
  departmentId: string,
  role = "Doctor",
) {
  return list.filter(
    (p) =>
      (p.departmentIds || [p.departmentId]).includes(departmentId) &&
      p.role === role,
  );
}
export function consultationFee(
  clinic: any,
  departmentId: string,
  practitioner: any,
) {
  return (
    practitioner?.feeOverrides?.[clinic.id] ||
    clinic.consultationFees?.[departmentId] ||
    200
  );
}
export function isModuleEnabled(clinic: any, module: string) {
  return clinic.modules.includes(module);
}
export function generatePatientId(count: number) {
  return `PAT-${String(count + 1).padStart(4, "0")}`;
}
export function generateToken(
  departmentId: string,
  tokenType: "Normal" | "Emergency",
  count: number,
) {
  const prefix = departmentPrefix(departmentId);
  const n = String(count + 1).padStart(3, "0");
  return tokenType === "Emergency"
    ? `${prefix}-E${String(count + 1).padStart(2, "0")}`
    : `${prefix}${n}`;
}
export function searchPatients(patients: any[], q: string) {
  const s = q.trim().toLowerCase();
  const activePatients = patients.filter(isActivePatientRecord);
  if (!s) return activePatients;
  return activePatients.filter((p) =>
    [
      p.id,
      p.patient_number,
      p.name,
      p.full_name,
      p.mobile,
      p.alternate_mobile,
      p.guardian,
      p.guardian_name,
      p.guardianMobile,
      p.guardian_mobile,
      p.email,
      p.area,
      p.address,
    ]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(s)),
  );
}
export function sortQueue(appts: any[]) {
  return [...appts].sort(
    (a, b) =>
      a.priority - b.priority || String(a.time).localeCompare(String(b.time)),
  );
}
export function getDoctorFeeSetting(
  settings: any[],
  clinicId: string,
  doctorId: string,
  departmentId: string,
) {
  return (
    settings.find(
      (s) =>
        s.clinicId === clinicId &&
        s.doctorId === doctorId &&
        s.departmentId === departmentId,
    ) ||
    settings.find((s) => s.clinicId === clinicId && s.doctorId === doctorId) ||
    settings.find(
      (s) => s.clinicId === clinicId && s.departmentId === departmentId,
    )
  );
}

export function calculateConsultationCharge(
  setting: any,
  feeType: string,
  baseIpAmount = 0,
) {
  if (!setting) return 0;
  if (feeType === "IP Fixed") return setting.ipFixedFee || setting.opFee || 0;
  if (feeType === "IP Percentage")
    return Math.round(
      ((Number(baseIpAmount) || 0) * (Number(setting.ipPercentage) || 0)) / 100,
    );
  if (feeType === "Online") return setting.onlineFee || setting.opFee || 0;
  if (feeType === "Home Visit")
    return setting.homeVisitFee || setting.opFee || 0;
  return setting.opFee || 0;
}
