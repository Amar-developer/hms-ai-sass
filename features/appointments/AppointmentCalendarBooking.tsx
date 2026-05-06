'use client';

import {useEffect, useMemo, useState} from 'react';
import {CalendarPlus, Search, X} from 'lucide-react';

import {Badge, Button, Card, Field, Input, Select} from '@/components/ui';
import {apiFetch, type ApiSession} from '@/lib/api';
import {practitioners} from '@/lib/mockData';
import {generatePatientId, generateToken, practitionersByDepartment, searchPatients} from '@/lib/hmsLogic';

type Props = {
  clinic: any;
  branchId: string;
  departmentId: string;
  setDepartmentId: (value: string) => void;
  allowedDepartments: any[];
  patients: any[];
  setPatients: (value: any[]) => void;
  appointments: any[];
  setAppointments: (value: any[]) => void;
  apiSession: ApiSession | null;
  loadLiveData: (session: ApiSession) => Promise<void>;
};

type BookingStep = 'search' | 'newPatient' | 'appointment' | 'success';

const pageSize = 8;
const slotGroups = [
  {id: 'morning', label: 'Morning 10 AM - 1 PM', start: '10:00', end: '13:00'},
  {id: 'evening', label: 'Evening 6 PM - 9 PM', start: '18:00', end: '21:00'},
] as const;

export function AppointmentCalendarBooking(props: Props) {
  const {
    clinic,
    branchId,
    departmentId,
    setDepartmentId,
    allowedDepartments,
    patients,
    setPatients,
    appointments,
    setAppointments,
    apiSession,
    loadLiveData,
  } = props;
  const [mode, setMode] = useState<'list' | 'book'>('list');
  const [query, setQuery] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [page, setPage] = useState(1);
  const [patientSearch, setPatientSearch] = useState('');
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [bookingStep, setBookingStep] = useState<BookingStep>('search');
  const [appointmentDate, setAppointmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [appointmentType, setAppointmentType] = useState<'op' | 'follow_up' | 'doctor_review' | 'fitness_certificate' | 'emergency'>('op');
  const [isBillable, setIsBillable] = useState(true);
  const [billingNote, setBillingNote] = useState('');
  const [emergencyReason, setEmergencyReason] = useState('');
  const [slotGroup, setSlotGroup] = useState('morning');
  const [slotIntervalsEnabled, setSlotIntervalsEnabled] = useState(false);
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState(5);
  const [liveDoctors, setLiveDoctors] = useState<any[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [calendar, setCalendar] = useState<any>(null);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [booked, setBooked] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [platformTenants, setPlatformTenants] = useState<any[]>([]);
  const [platformTenantId, setPlatformTenantId] = useState('');
  const [platformDepartment, setPlatformDepartment] = useState('all');
  const [platformRows, setPlatformRows] = useState<any[]>([]);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);

  const patientMap = useMemo(() => new Map(patients.map((patient: any) => [patient.id, patient])), [patients]);
  const platformDepartmentOptions = Array.from(
    new Set(platformRows.map((row: any) => row.department_name || row.department_id).filter(Boolean)),
  );
  const filteredPlatformRows = platformRows.filter((row: any) => {
    if (platformDepartment === 'all') return true;
    return row.department_id === platformDepartment || row.department_name === platformDepartment;
  });
  const filteredAppointments = appointments.filter((appointment: any) => {
    const patient = patientMap.get(appointment.patientId);
    const text = [
      appointment.patient,
      patient?.mobile,
      appointment.departmentId,
      appointment.doctor,
      appointment.status,
      appointment.consultationStatus,
    ]
      .join(' ')
      .toLowerCase();
    return (
      (!query || text.includes(query.toLowerCase())) &&
      (!filterDate || String(appointment.appointmentDate || appointment.date || '').startsWith(filterDate) || String(appointment.time || '').startsWith(filterDate)) &&
      (!departmentId || appointment.departmentId === departmentId)
    );
  });
  const listRecords = isSuperAdmin ? filteredPlatformRows : filteredAppointments;
  const totalPages = Math.max(1, Math.ceil(listRecords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = listRecords.slice((safePage - 1) * pageSize, safePage * pageSize);

  const mockDoctors = practitionersByDepartment(practitioners, departmentId);
  const doctors = apiSession ? liveDoctors : mockDoctors;
  const doctor = doctors.find((item: any) => item.id === doctorId) || doctors[0] || mockDoctors[0];
  const patientMatches = apiSession
    ? liveMatches
    : searchPatients(patients, patientSearch).map((patient: any) => ({
        id: patient.id,
        full_name: patient.name,
        mobile: patient.mobile,
        guardian_name: patient.guardian,
        guardian_mobile: patient.guardianMobile,
        area: patient.area,
        age_years: patient.age,
        gender: patient.gender,
      }));

  useEffect(() => setPage(1), [query, filterDate, departmentId, appointments.length]);
  useEffect(() => setPage(1), [platformTenantId, platformDepartment, platformRows.length]);
  useEffect(() => {
    let alive = true;
    async function loadPlatformGrid() {
      if (!apiSession || !isSuperAdmin) return;
      try {
        const params = new URLSearchParams({limit: '500'});
        if (query) params.set('q', query);
        if (filterDate) params.set('appointment_date', filterDate);
        if (platformTenantId) params.set('tenant_id', platformTenantId);
        const [tenantRows, appointmentRows] = await Promise.all([
          apiFetch('/tenants', apiSession),
          apiFetch(`/appointments/platform/all?${params.toString()}`, apiSession),
        ]);
        if (!alive) return;
        setPlatformTenants(tenantRows);
        setPlatformRows(appointmentRows);
      } catch (err: any) {
        if (alive) setMessage(err.message || 'Could not load all-tenant appointments.');
      }
    }
    loadPlatformGrid();
    return () => {
      alive = false;
    };
  }, [apiSession?.token, apiSession?.tenantId, isSuperAdmin, query, filterDate, platformTenantId, listRefreshKey]);
  useEffect(() => {
    setSelectedSlot(null);
  }, [departmentId, doctorId, appointmentDate, slotGroup, slotIntervalsEnabled]);

  useEffect(() => {
    let alive = true;
    async function loadSlotSettings() {
      if (!apiSession || !branchId) {
        setSlotIntervalsEnabled(false);
        setSlotIntervalMinutes(5);
        return;
      }
      try {
        const [enabled, minutes] = await Promise.all([
          apiFetch(`/settings/resolve?module=appointments&key=appointment.slot_intervals_enabled&branch_id=${encodeURIComponent(branchId)}`, apiSession),
          apiFetch(`/settings/resolve?module=appointments&key=appointment.slot_interval_minutes&branch_id=${encodeURIComponent(branchId)}`, apiSession),
        ]);
        if (!alive) return;
        setSlotIntervalsEnabled(Boolean(enabled.value));
        setSlotIntervalMinutes(Number(minutes.value || 5));
      } catch {
        if (!alive) return;
        setSlotIntervalsEnabled(false);
        setSlotIntervalMinutes(5);
      }
    }
    loadSlotSettings();
    return () => {
      alive = false;
    };
  }, [apiSession?.token, apiSession?.tenantId, branchId]);

  useEffect(() => {
    let alive = true;
    async function runSearch() {
      if (!apiSession || patientSearch.trim().length < 2) {
        setLiveMatches([]);
        return;
      }
      try {
        const params = new URLSearchParams({q: patientSearch.trim(), limit: '10'});
        const rows = await apiFetch(`/patients?${params.toString()}`, apiSession);
        if (alive) setLiveMatches(rows);
      } catch (err: any) {
        if (alive) setMessage(err.message || 'Could not search patients.');
      }
    }
    runSearch();
    return () => {
      alive = false;
    };
  }, [apiSession?.token, apiSession?.tenantId, patientSearch]);

  useEffect(() => {
    let alive = true;
    async function loadDoctors() {
      if (!apiSession) {
        setDoctorId(mockDoctors[0]?.id || '');
        return;
      }
      try {
        const rows = await apiFetch(
          `/practitioners?branch_id=${encodeURIComponent(branchId)}&department_id=${encodeURIComponent(departmentId)}`,
          apiSession,
        );
        if (!alive) return;
        setLiveDoctors(rows);
        setDoctorId((current) => (rows.some((row: any) => row.id === current) ? current : rows[0]?.id || ''));
      } catch (err: any) {
        if (alive) {
          setLiveDoctors([]);
          setDoctorId('');
          setMessage(err.message || 'Could not load doctors for this department.');
        }
      }
    }
    loadDoctors();
    return () => {
      alive = false;
    };
  }, [apiSession?.token, apiSession?.tenantId, branchId, departmentId, mockDoctors.length]);

  useEffect(() => {
    let alive = true;
    async function loadSlots() {
      if (!apiSession || !doctorId || bookingStep !== 'appointment') {
        setCalendar(null);
        return;
      }
      try {
        const params = new URLSearchParams({
          branch_id: branchId,
          department_id: departmentId,
          start_date: appointmentDate,
          end_date: appointmentDate,
        });
        const data = await apiFetch(`/practitioners/${doctorId}/calendar?${params.toString()}`, apiSession);
        if (alive) setCalendar(data);
      } catch (err: any) {
        if (alive) {
          setCalendar(null);
          setMessage(err.message || 'Could not load available slots.');
        }
      }
    }
    loadSlots();
    return () => {
      alive = false;
    };
  }, [apiSession?.token, apiSession?.tenantId, branchId, departmentId, doctorId, appointmentDate, bookingStep]);

  function openBooking() {
    setMode('book');
    setBookingStep('search');
    setSelectedPatient(null);
    setBooked(null);
    setMessage('');
    setAppointmentType('op');
    setEmergencyReason('');
  }

  async function refreshAppointmentList() {
    if (!apiSession) return;
    if (isSuperAdmin) {
      setListRefreshKey((current) => current + 1);
      return;
    }
    await loadLiveData(apiSession);
  }

  async function closeBooking() {
    setMode('list');
    setBookingStep('search');
    setSelectedPatient(null);
    setBooked(null);
    setSelectedSlot(null);
    setMessage('');
    await refreshAppointmentList();
  }

  async function savePatient(form: HTMLFormElement) {
    const fd = new FormData(form);
    setBusy(true);
    setMessage('');
    try {
      if (apiSession) {
        const duplicateRows = await apiFetch('/patients/duplicates', apiSession, {
          method: 'POST',
          body: JSON.stringify({
            branch_id: branchId,
            full_name: String(fd.get('name') || ''),
            date_of_birth: fd.get('dateOfBirth') || null,
            gender: String(fd.get('gender') || 'unknown'),
            mobile: String(fd.get('mobile') || '') || null,
            guardian_name: String(fd.get('guardian') || '') || null,
            guardian_mobile: String(fd.get('guardianMobile') || '') || null,
            area: String(fd.get('area') || '') || null,
          }),
        });
        if (duplicateRows.length > 0) {
          setLiveMatches(duplicateRows);
          setBookingStep('search');
          setMessage('Possible duplicate patient found. Please select the existing patient or verify before creating a new record.');
          return;
        }
        const saved = await apiFetch('/patients', apiSession, {
          method: 'POST',
          body: JSON.stringify({
            branch_id: branchId,
            full_name: String(fd.get('name') || ''),
            date_of_birth: fd.get('dateOfBirth') || null,
            gender: String(fd.get('gender') || 'unknown'),
            mobile: String(fd.get('mobile') || '') || null,
            guardian_name: String(fd.get('guardian') || '') || null,
            guardian_mobile: String(fd.get('guardianMobile') || '') || null,
            area: String(fd.get('area') || '') || null,
          }),
        });
        const allergies = String(fd.get('allergies') || '').trim();
        if (allergies) {
          await apiFetch(`/patients/${saved.id}/alerts`, apiSession, {
            method: 'POST',
            body: JSON.stringify({
              alert_type: 'allergy',
              title: 'Allergies',
              description: allergies,
              severity: 'high',
              created_by_user_id: apiSession.user?.id || null,
            }),
          });
        }
        await loadLiveData(apiSession);
        setSelectedPatient({
          id: saved.id,
          full_name: saved.full_name,
          mobile: saved.mobile,
          guardian_name: saved.guardian_name,
          guardian_mobile: saved.guardian_mobile,
          area: saved.area,
          gender: saved.gender,
        });
      } else {
        const patient = {
          id: generatePatientId(patients.length),
          name: fd.get('name'),
          age: 0,
          gender: fd.get('gender'),
          mobile: fd.get('mobile'),
          guardian: fd.get('guardian'),
          guardianMobile: fd.get('guardianMobile'),
          area: fd.get('area'),
          blood: '',
          allergies: fd.get('allergies') || '',
          medicalHistory: '',
          status: 'Active',
          patientType: 'OP',
        };
        setPatients([...patients, patient]);
        setSelectedPatient({id: patient.id, full_name: patient.name, mobile: patient.mobile});
      }
      setBookingStep('appointment');
    } catch (err: any) {
      setMessage(err.message || 'Could not save patient.');
    } finally {
      setBusy(false);
    }
  }

  async function bookAppointment() {
    if (!selectedPatient) return;
    if (appointmentType !== 'emergency' && !selectedTimingSlot) {
      setMessage('Select an available timing slot.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      if (apiSession) {
        const result = await apiFetch('/appointments', apiSession, {
          method: 'POST',
          body: JSON.stringify({
            branch_id: branchId,
            patient_id: selectedPatient.id,
            department_id: departmentId,
            practitioner_id: doctorId,
            appointment_type: appointmentType,
            appointment_date: appointmentType === 'emergency' ? appointmentDate : selectedTimingSlot.appointment_date,
            appointment_time: appointmentType === 'emergency' ? null : selectedTimingSlot.start_time,
            reason: appointmentType === 'follow_up' || appointmentType === 'doctor_review'
              ? 'Doctor review appointment booked from MedizinHub HMS'
              : appointmentType === 'fitness_certificate'
                ? 'Fitness certificate consultation booked from MedizinHub HMS'
                : slotIntervalsEnabled ? 'OP appointment booked from MedizinHub HMS' : `OP appointment booked for ${selectedTimingSlot.label || 'consultation timing'} from MedizinHub HMS`,
            visit_purpose: appointmentType === 'fitness_certificate' ? 'fitness_certificate' : appointmentType === 'doctor_review' || appointmentType === 'follow_up' ? 'doctor_review' : 'consultation',
            is_billable: isBillable,
            billing_note: billingNote || null,
            emergency_reason: appointmentType === 'emergency' ? emergencyReason || 'Emergency override from reception' : null,
            created_by_user_id: apiSession.user?.id || null,
          }),
        });
        await loadLiveData(apiSession);
        if (isSuperAdmin) setListRefreshKey((current) => current + 1);
        setBooked(result);
      } else {
        const dayCount = appointments.filter((item: any) => item.appointmentDate === appointmentDate && item.branchId === branchId).length;
        const token = generateToken(departmentId, 'Normal', dayCount);
        const appointment = {
          id: `A${appointments.length + 1}`,
          clinicId: clinic.id,
          branchId,
          token,
          tokenType: 'Normal',
          priority: appointmentType === 'emergency' ? 1 : 2,
          patientId: selectedPatient.id,
          patient: selectedPatient.full_name,
          departmentId,
          doctorId: doctor?.id,
          doctor: doctor?.name,
          appointmentDate,
          time: appointmentType === 'emergency' ? 'Emergency' : slotIntervalsEnabled ? selectedTimingSlot?.start_time || appointmentDate : selectedTimingSlot?.label || appointmentDate,
          status: 'scheduled',
          queueStatus: 'waiting',
          visitType: appointmentType === 'follow_up' || appointmentType === 'doctor_review' ? 'Doctor Review' : appointmentType === 'fitness_certificate' ? 'Fitness Certificate' : appointmentType === 'emergency' ? 'Emergency' : 'OP',
        };
        setAppointments([...appointments, appointment]);
        setBooked({appointment, queue_entry: {token_number: token}});
      }
      setBookingStep('success');
    } catch (err: any) {
      setMessage(err.message || 'Could not book appointment.');
    } finally {
      setBusy(false);
    }
  }

  const day = calendar?.days?.[0];
  const allDaySlots = day?.slots || [];
  const consultationSessions = sessionOptionsFromSlots(allDaySlots, appointmentDate);
  const timingOptions = apiSession && !slotIntervalsEnabled && consultationSessions.length ? consultationSessions : slotGroups;
  const selectedGroup = timingOptions.find((group: any) => group.id === slotGroup) || timingOptions[0] || slotGroups[0];
  const slots = allDaySlots.filter((slot: any) => {
    const start = String(slot.start_time || '').slice(0, 5);
    return start >= selectedGroup.start && start < selectedGroup.end;
  });
  const mockSlots = ['10:00', '10:30', '11:00', '11:30', '12:00', '18:00', '18:30', '19:00', '19:30', '20:00']
    .filter((time) => time >= selectedGroup.start && time < selectedGroup.end)
    .map((time) => ({appointment_date: appointmentDate, start_time: time, end_time: time, available: true, status: 'available'}));
  const sessionChoices = (apiSession && consultationSessions.length ? consultationSessions : slotGroups).map((session: any) => ({
    ...session,
    appointment_date: appointmentDate,
    start_time: session.start,
    end_time: session.end,
    available: session.available !== false,
    status: session.available === false ? 'unavailable' : 'available',
  }));
  const visibleSlots = slotIntervalsEnabled ? (apiSession ? slots : mockSlots) : sessionChoices;
  const selectedSessionSlot = sessionChoices.find((slot: any) => slot.id === selectedGroup.id) || sessionChoices[0] || null;
  const selectedTimingSlot = slotIntervalsEnabled ? selectedSlot : selectedSessionSlot;

  if (mode === 'book') {
    return (
      <div className="space-y-5">
        <Card>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-lg font-bold">Book OP Appointment</h3>
              <p className="text-sm text-slate-500">Search patient, register if needed, then select department, doctor, date, and timing slot.</p>
            </div>
            <button type="button" onClick={closeBooking} className="rounded-2xl border px-4 py-3 text-sm font-bold">
              Close
            </button>
          </div>
          {message && <div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
        </Card>

        {bookingStep === 'search' && (
          <Card>
            <h4 className="font-bold">Search Patient / Mobile</h4>
            <div className="mt-4 flex gap-2">
              <Input value={patientSearch} onChange={(e: any) => setPatientSearch(e.target.value)} placeholder="Enter patient name or mobile" />
              <Search className="mt-3 text-slate-400" size={18} />
            </div>
            <div className="mt-4 space-y-3">
              {patientSearch && patientMatches.length === 0 && (
                <div className="flex flex-col justify-between gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-700 sm:flex-row sm:items-center">
                  <span>No patient found. Create a new patient record.</span>
                  <Button onClick={() => setBookingStep('newPatient')}>New Patient</Button>
                </div>
              )}
              {patientMatches.map((patient: any) => (
                <div key={patient.id} className="grid gap-3 rounded-2xl border p-4 text-sm md:grid-cols-[1.2fr_.8fr_.9fr_.9fr_auto] md:items-center">
                  <b>{patient.full_name}</b>
                  <span>{patient.mobile || 'No mobile'}</span>
                  <span>{patient.gender || '-'}</span>
                  <span>{patient.area || patient.guardian_mobile || '-'}</span>
                  <Button
                    onClick={() => {
                      setSelectedPatient(patient);
                      setBookingStep('appointment');
                    }}
                  >
                    Select
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {bookingStep === 'newPatient' && (
          <Card>
            <div className="flex justify-between gap-3">
              <h4 className="font-bold">New Patient</h4>
              <button type="button" onClick={() => setBookingStep('search')} className="rounded-xl border p-2" title="Cancel">
                <X size={16} />
              </button>
            </div>
            <form
              onSubmit={(e: any) => {
                e.preventDefault();
                savePatient(e.currentTarget);
              }}
              className="mt-4 grid gap-3 md:grid-cols-3"
            >
              <Field label="Name"><Input name="name" required /></Field>
              <Field label="Date of Birth"><Input name="dateOfBirth" type="date" /></Field>
              <Field label="Gender">
                <Select name="gender" defaultValue="unknown">
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Transgender</option>
                  <option value="unknown">Unknown</option>
                </Select>
              </Field>
              <Field label="Mobile optional"><Input name="mobile" /></Field>
              <Field label="Guardian"><Input name="guardian" /></Field>
              <Field label="Guardian Mobile"><Input name="guardianMobile" /></Field>
              <Field label="Area"><Input name="area" /></Field>
              <div className="md:col-span-2"><Field label="Allergies"><Input name="allergies" /></Field></div>
              <div className="flex flex-wrap gap-2 md:col-span-3">
                <Button disabled={busy}>{busy ? 'Saving...' : 'Save Patient'}</Button>
                <button type="button" onClick={() => setBookingStep('search')} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button>
              </div>
            </form>
          </Card>
        )}

        {bookingStep === 'appointment' && selectedPatient && (
          <Card>
            <h4 className="font-bold">Appointment Details</h4>
            <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm">
              <b>{selectedPatient.full_name}</b>
              <p className="text-slate-500">{selectedPatient.mobile || 'No mobile'} · {selectedPatient.area || selectedPatient.guardian_mobile || '-'}</p>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <Field label="Department">
                <Select value={departmentId} onChange={(e: any) => setDepartmentId(e.target.value)}>
                  {allowedDepartments.map((department: any) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </Select>
              </Field>
              <Field label="Doctor">
                <Select value={doctorId} onChange={(e: any) => setDoctorId(e.target.value)} disabled={apiSession && doctors.length === 0}>
                  {doctors.map((item: any) => <option key={item.id} value={item.id}>{item.full_name || item.name}</option>)}
                </Select>
              </Field>
              <Field label="Visit Type">
                <Select value={appointmentType} onChange={(e: any) => setAppointmentType(e.target.value)}>
                  <option value="op">OP</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="doctor_review">Doctor Review</option>
                  <option value="fitness_certificate">Fitness Certificate</option>
                  <option value="emergency">Emergency</option>
                </Select>
              </Field>
              <Field label="Appointment Date"><Input type="date" value={appointmentDate} onChange={(e: any) => setAppointmentDate(e.target.value)} /></Field>
              <Field label="Timing Slots">
                <Select value={slotGroup} onChange={(e: any) => setSlotGroup(e.target.value)}>
                  {timingOptions.map((group: any) => <option key={group.id} value={group.id}>{group.label}</option>)}
                </Select>
              </Field>
            </div>
            {appointmentType === 'emergency' && (
              <div className="mt-4 rounded-2xl bg-red-50 p-4">
                <Field label="Emergency Reason"><Input value={emergencyReason} onChange={(e: any) => setEmergencyReason(e.target.value)} placeholder="Severe pain, trauma, breathlessness" /></Field>
                <p className="mt-2 text-xs font-semibold text-red-700">Emergency bookings skip normal slot availability and are audited as emergency overrides.</p>
              </div>
            )}
            {(appointmentType === 'follow_up' || appointmentType === 'doctor_review' || appointmentType === 'fitness_certificate') && (
              <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2">
                <Field label="Billing">
                  <Select value={isBillable ? 'paid' : 'free'} onChange={(e: any) => setIsBillable(e.target.value === 'paid')}>
                    <option value="paid">Chargeable</option>
                    <option value="free">Free Review</option>
                  </Select>
                </Field>
                <Field label="Billing Note"><Input value={billingNote} onChange={(e: any) => setBillingNote(e.target.value)} placeholder="Within free review period, certificate request, etc." /></Field>
              </div>
            )}
            {appointmentType !== 'emergency' && slotIntervalsEnabled && <div className="mt-4">
              <div className="mb-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                Detailed interval slot mode is enabled{slotIntervalMinutes ? ` (${slotIntervalMinutes} minute intervals configured)` : ''}.
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {visibleSlots.length === 0 && <div className="col-span-full rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">No consultation timing available for this doctor/date.</div>}
              {visibleSlots.map((slot: any) => (
                <button
                  key={`${slot.appointment_date}-${slot.id || slot.start_time}`}
                  type="button"
                  disabled={!slot.available || busy}
                  onClick={() => setSelectedSlot(slot)}
                  className={`rounded-2xl border p-4 text-left text-sm font-bold disabled:cursor-not-allowed ${
                    (selectedSlot?.id || selectedSlot?.start_time) === (slot.id || slot.start_time)
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : slot.available
                        ? 'bg-white hover:border-slate-900'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {slotIntervalsEnabled ? String(slot.start_time).slice(0, 5) : slot.label}
                  <p className="mt-1 text-xs font-medium opacity-70">{slotIntervalsEnabled ? slot.status : 'Consultation timing'}</p>
                </button>
              ))}
              </div>
            </div>}
            {appointmentType !== 'emergency' && !slotIntervalsEnabled && !selectedTimingSlot && (
              <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-700">
                No consultation timing available for this doctor/date.
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={bookAppointment} disabled={busy || (appointmentType !== 'emergency' && !selectedTimingSlot)}>{busy ? 'Booking...' : 'Save & Generate Token'}</Button>
              <button type="button" onClick={() => setBookingStep('search')} className="rounded-2xl border px-4 py-3 text-sm font-bold">Cancel</button>
            </div>
          </Card>
        )}

        {bookingStep === 'success' && booked && (
          <Card>
            <h4 className="font-bold">Appointment Booked</h4>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <Info label="Patient" value={selectedPatient?.full_name || booked.appointment?.patient || '-'} />
              <Info label="Token" value={booked.queue_entry?.token_number || booked.queue_entry?.token || booked.appointment?.token || '-'} />
              <Info label="Date" value={booked.appointment?.appointment_date || appointmentDate} />
              <Info label="Time" value={booked.appointment?.appointment_time || selectedTimingSlot?.label || selectedTimingSlot?.start_time || '-'} />
            </div>
            <div className="mt-4 rounded-2xl border bg-white p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Token Slip</p>
              <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
                <b>{selectedPatient?.full_name || booked.appointment?.patient || '-'}</b>
                <span>Token: {booked.queue_entry?.token_number || booked.queue_entry?.token || booked.appointment?.token || '-'}</span>
                <span>{appointmentType.replaceAll('_',' ').toUpperCase()} · {isBillable ? 'Chargeable' : 'Free Review'}</span>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => window.print()} className="rounded-2xl border px-4 py-3 text-sm font-bold">Print Token</button>
              <Button onClick={closeBooking}>Close</Button>
            </div>
          </Card>
        )}
      </div>
    );
  }

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-lg font-bold">Appointments</h3>
          <p className="text-sm text-slate-500">{isSuperAdmin ? 'Combined all-tenant appointment grid for MedizinHub HMS primary tenant.' : 'Row based OP appointment view with patient, mobile, department, doctor, date, and consultation status.'}</p>
        </div>
        <Button onClick={openBooking} className="flex items-center gap-2"><CalendarPlus size={16} /> New Appointment</Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {isSuperAdmin && (
          <Field label="Clinic / Tenant">
            <Select value={platformTenantId} onChange={(e: any) => setPlatformTenantId(e.target.value)}>
              <option value="">All tenants</option>
              {platformTenants.filter((tenant: any) => !tenant.is_primary).map((tenant: any) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Patient name / mobile"><Input value={query} onChange={(e: any) => setQuery(e.target.value)} placeholder="Search patient or mobile" /></Field>
        <Field label="Select date"><Input type="date" value={filterDate} onChange={(e: any) => setFilterDate(e.target.value)} /></Field>
        <Field label="Department">
          {isSuperAdmin ? (
            <Select value={platformDepartment} onChange={(e: any) => setPlatformDepartment(e.target.value)}>
              <option value="all">All departments</option>
              {platformDepartmentOptions.map((department: string) => <option key={department} value={department}>{department}</option>)}
            </Select>
          ) : (
            <Select value={departmentId} onChange={(e: any) => setDepartmentId(e.target.value)}>
              {allowedDepartments.map((department: any) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className={`hidden gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 xl:grid ${isSuperAdmin ? 'grid-cols-[1fr_1fr_.8fr_.9fr_1fr_.85fr_.85fr]' : 'grid-cols-[1.1fr_.8fr_.9fr_1fr_.9fr_.9fr]'}`}>
          {isSuperAdmin && <span>Tenant</span>}<span>Patient</span><span>Mobile</span><span>Department</span><span>Doctor</span><span>Appointment Date</span><span>Consultation Status</span>
        </div>
        <div className="divide-y divide-slate-200">
          {rows.length === 0 && <div className="p-4 text-sm text-slate-500">No appointments found.</div>}
          {rows.map((appointment: any) => {
            if (isSuperAdmin) {
              return (
                <div key={appointment.id} className="grid gap-3 px-4 py-4 text-sm xl:grid-cols-[1fr_1fr_.8fr_.9fr_1fr_.85fr_.85fr] xl:items-center">
                  <div><b>{appointment.tenant_name}</b><p className="text-xs text-slate-500">{appointment.branch_name}</p></div>
                  <div><b>{appointment.patient_name}</b><p className="text-xs text-slate-500">{appointment.token_number || appointment.id}</p></div>
                  <span>{appointment.patient_mobile || '-'}</span>
                  <span>{appointment.department_name || '-'}</span>
                  <span>{appointment.practitioner_name || '-'}</span>
                  <span>{appointment.appointment_date}{appointment.appointment_time ? ` ${String(appointment.appointment_time).slice(0, 5)}` : ''}</span>
                  <Badge tone={appointment.consultation_status === 'signed' ? 'green' : appointment.status === 'cancelled' ? 'red' : 'slate'}>{appointment.consultation_status || appointment.status || '-'}</Badge>
                </div>
              );
            }
            const patient = patientMap.get(appointment.patientId);
            return (
              <div key={appointment.id} className="grid gap-3 px-4 py-4 text-sm xl:grid-cols-[1.1fr_.8fr_.9fr_1fr_.9fr_.9fr] xl:items-center">
                <div><b>{appointment.patient}</b><p className="text-xs text-slate-500">{appointment.token || appointment.id}</p></div>
                <span>{patient?.mobile || '-'}</span>
                <span>{allowedDepartments.find((d: any) => d.id === appointment.departmentId)?.name || appointment.departmentId || '-'}</span>
                <span>{appointment.doctor || appointment.doctorId || '-'}</span>
                <span>{appointment.appointmentDate || appointment.time || '-'}</span>
                <Badge tone={appointment.consultationStatus === 'signed' ? 'green' : appointment.status === 'cancelled' ? 'red' : 'slate'}>{appointment.consultationStatus || appointment.status || '-'}</Badge>
              </div>
            );
          })}
        </div>
      </div>
      <Pagination page={safePage} totalPages={totalPages} total={listRecords.length} onPage={setPage} />
    </Card>
  );
}

function Info({label, value}: {label: string; value: any}) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 font-bold">{value}</p></div>;
}

function sessionOptionsFromSlots(slots: any[], appointmentDate: string) {
  const bySchedule = new Map<string, any[]>();
  for (const slot of slots || []) {
    const key = String(slot.schedule_id || `${slot.start_time}-${slot.end_time}`);
    bySchedule.set(key, [...(bySchedule.get(key) || []), slot]);
  }
  return Array.from(bySchedule.entries()).map(([scheduleId, rows]) => {
    const sorted = [...rows].sort((a: any, b: any) => String(a.start_time).localeCompare(String(b.start_time)));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const start = String(first?.start_time || '').slice(0, 5);
    const end = String(last?.end_time || last?.start_time || '').slice(0, 5);
    const period = start < '13:00' ? 'Morning' : start < '18:00' ? 'Afternoon' : 'Evening';
    return {
      id: scheduleId,
      label: `${period} ${start} - ${end}`,
      start,
      end,
      appointment_date: appointmentDate,
      available: sorted.some((slot: any) => slot.available),
    };
  }).sort((a, b) => a.start.localeCompare(b.start));
}

function Pagination({page, totalPages, total, onPage}: any) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return <div className="mt-4 flex flex-col justify-between gap-3 text-sm text-slate-500 sm:flex-row sm:items-center"><span>Showing {start}-{end} of {total}</span><div className="flex gap-2"><button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300">Previous</button><span className="rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-700">Page {page} / {totalPages}</span><button type="button" onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300">Next</button></div></div>;
}
