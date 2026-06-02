export type LiveSummary = {
  patients: number;
  appointments: number;
  queue: number;
  invoices: number;
  invoiceBalance: number;
};

export function mapPatient(row: any) {
  return {
    id: row.id,
    patientNumber: row.patient_number,
    name: row.full_name,
    age: row.age_years || 0,
    gender: row.gender,
    mobile: row.mobile,
    guardian: row.guardian_name,
    guardianMobile: row.guardian_mobile,
    area: row.area,
    blood: row.blood_group || '',
    allergies: row.critical_alert_count ? 'Important alerts available' : '',
    medicalHistory: '',
    status: row.status || 'Active',
    patientType: 'OP',
  };
}

export function mapAppointment(
  row: any,
  queue: any[],
  consultations: any[],
  patientMap: Map<string, any>,
  practitionerMap: Map<string, any>,
  clinicId: string,
  branchId: string,
  schedules?: any[],
) {
  const q = queue.find((x) => x.appointment_id === row.id);
  const c = consultations.find((x) => x.appointment_id === row.id);
  const p = patientMap.get(row.patient_id);
  const practitioner = practitionerMap.get(row.practitioner_id);

  // Resolve room number from today's active schedule for this practitioner+branch
  let roomNumber: string | null = null;
  if (schedules?.length && row.practitioner_id) {
    const apptDate = row.appointment_date ? new Date(row.appointment_date) : new Date();
    // JS: 0=Sun … 6=Sat  →  backend: 0=Mon … 6=Sun
    const weekday = (apptDate.getDay() + 6) % 7;
    const match = schedules.find(
      (s: any) =>
        s.practitioner_id === row.practitioner_id &&
        (!row.branch_id || s.branch_id === row.branch_id) &&
        Number(s.weekday) === weekday &&
        s.is_active !== false &&
        s.room_number,
    );
    roomNumber = match?.room_number ?? null;
  }

  return {
    id: row.id,
    queueEntryId: q?.id,
    consultationId: c?.id,
    consultationStatus: c?.status,
    treatmentType: c?.treatment_type,
    clinicId,
    branchId: row.branch_id || branchId,
    branch_id: row.branch_id || branchId,
    token: q?.token_number || row.id.slice(-4),
    tokenType: row.appointment_type === 'emergency' ? 'Emergency' : 'Normal',
    priority: q?.priority_rank || 2,
    patientId: row.patient_id,
    patient: p?.name || row.patient_id,
    departmentId: row.department_id || 'general',
    department_id: row.department_id || 'general',
    doctorId: row.practitioner_id || '',
    practitioner_id: row.practitioner_id || '',
    doctor: row.practitioner_name || practitioner?.full_name || practitioner?.name || 'Unassigned',
    appointmentDate: row.appointment_date,
    time: row.appointment_time || 'Today',
    status: row.status,
    queueStatus: q?.status || row.status,
    fee: 0,
    visitPurpose: row.visit_purpose,
    intakeVitals: row.intake_vitals || '',
    intakeComplaints: row.intake_complaints || '',
    isBillable: row.is_billable,
    visitType: row.appointment_type?.replaceAll?.('_', ' ')?.toUpperCase?.() || 'OP',
    roomNumber,
  };
}
