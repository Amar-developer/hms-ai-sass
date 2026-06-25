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
