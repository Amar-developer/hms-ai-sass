export function formatPhysiotherapistName(row: any) {
  const name = row?.full_name || row?.name || "";
  if (!name) return "No physiotherapist selected";
  const withoutSuffix = name.replace(/,\s*PT$/i, "");
  return `${withoutSuffix}, PT`;
}

export function activePhysiotherapyFeeRule(
  feeRules: any[],
  physiotherapistId: string | undefined,
  branchId: string | undefined,
) {
  if (!physiotherapistId) return null;
  return (
    [...(feeRules || [])]
      .filter(
        (rule: any) =>
          rule.is_active &&
          rule.practitioner_id === physiotherapistId &&
          rule.appointment_type === "op" &&
          rule.treatment_type === "physiotherapy_session" &&
          (!rule.branch_id || !branchId || rule.branch_id === branchId),
      )
      .sort(
        (a: any, b: any) =>
          Number(Boolean(b.branch_id)) - Number(Boolean(a.branch_id)) ||
          new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime(),
      )[0] || null
  );
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function patientName(p: any) {
  return p?.name || p?.full_name || p?.patient_name || "Patient";
}
export function patientLabel(p: any) {
  const detail = [p?.patientNumber || p?.patient_number || p?.id, p?.mobile]
    .filter(Boolean)
    .join(" · ");
  return detail ? `${patientName(p)} · ${detail}` : patientName(p);
}
export function appointmentPatientId(row: any) {
  return row?.patientId || row?.patient_id || "";
}
export function appointmentLabel(row: any) {
  if (!row?.id) return "No linked appointment";
  return [
    row.patient,
    row.appointmentDate || row.appointment_date || row.date,
    row.doctor,
  ]
    .filter(Boolean)
    .join(" · ");
}
export function inr(value: any) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}
export function consentFiles(row: any) {
  try {
    const parsed = JSON.parse(row?.consent_files_json || "[]");
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return row?.consent_form_url
    ? [{ url: row.consent_form_url, name: row.consent_form_name || "Consent Form" }]
    : [];
}
