
export function activeDoctorFeeRule(feeRules: any[], doctor: any) {
  if (!doctor) return null;
  const branchIds = doctor.branch_ids || [];
  const treatmentType =
    doctor.practitioner_type === "physiotherapist"
      ? "physiotherapy_session"
      : null;
  return (
    [...(feeRules || [])]
      .filter(
        (rule: any) =>
          rule.is_active &&
          rule.practitioner_id === doctor.id &&
          rule.appointment_type === "op" &&
          (treatmentType
            ? rule.treatment_type === treatmentType
            : !rule.treatment_type) &&
          (!rule.branch_id || branchIds.includes(rule.branch_id)),
      )
      .sort(
        (a: any, b: any) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime(),
      )[0] || null
  );
}

export function activeDoctorDepartmentFeeRules(feeRules: any[], doctor: any) {
  if (!doctor) return [];
  const departmentIds = new Set(doctor.department_ids || []);
  const rulesByDepartment = new Map<string, any>();
  for (const rule of [...(feeRules || [])]
    .filter(
      (item: any) =>
        item.is_active &&
        item.practitioner_id === doctor.id &&
        item.appointment_type === "op" &&
        item.department_id &&
        departmentIds.has(item.department_id),
    )
    .sort(
      (a: any, b: any) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime(),
    )) {
    if (!rulesByDepartment.has(rule.department_id))
      rulesByDepartment.set(rule.department_id, rule);
  }
  return Array.from(rulesByDepartment.values());
}

export function formatPractitionerName(row: any) {
  const name = row?.full_name || row?.name || "-";
  if (row?.practitioner_type !== "physiotherapist") return name;
  const withoutSuffix = name.replace(/,\s*PT$/i, "");
  return `${withoutSuffix}, PT`;
}


export function appointmentDateKey(row: any) {
  return String(row.appointmentDate || row.appointment_date || "").slice(0, 10);
}
