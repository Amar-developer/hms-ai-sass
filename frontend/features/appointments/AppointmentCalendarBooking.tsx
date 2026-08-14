"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { searchPatients } from "@/lib/hmsLogic";
import { usePatientSearch } from "@/features/patients/components/PatientSearchSelect";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";
import { publicDisplayValue, uniqueDepartmentRows } from "@/lib/options";
import { displayDate, today } from "@/utils/helper";
import { useAppointmentBookingData } from "./api/useAppointmentBookingData";
import { useAppointmentBookingActions } from "./api/useAppointmentBookingActions";
import { useAppointmentMentionResolver } from "./api/useAppointmentMentionResolver";
import { useAppointmentReschedule } from "./api/useAppointmentReschedule";
import { canCopyDatabaseIds } from "@/app/components/common/CopyIdButton";
import { BookingStep, type Props } from "./types";
import {
  appointmentStatusInfo,
  formatDisplayTime,
  parseIntakeVitalsText,
} from "./helpers";
import { getAppointmentColumns, getPlatformColumns } from "./columns";
import { AppointmentBookingFlow } from "./components/AppointmentBookingFlow";
import { AppointmentList } from "./components/AppointmentList";

const pageSize = 8;

export function AppointmentCalendarBooking(props: Props) {
  const {
    clinic,
    branchId,
    departmentId,
    setDepartmentId,
    allowedDepartments,
    appointments,
    setAppointments,
    apiSession,
    loadLiveData,
    numberingRules,
    setActive,
    isInitialLoading,
    mode = "list",
    routeBase = "/appointments",
    onOpenAppointment,
  } = props;
  const router = useRouter();
  // Only the top-level mode is a route (/appointments vs /appointments/new).
  // The wizard's internal steps stay client state: "newPatient" is an inline
  // sub-form and "success" is a post-submit confirmation, so a direct link
  // to either without the in-progress form data would render a broken screen.
  const setMode = (next: "list" | "book") =>
    router.push(
      next === "book"
        ? `${routeBase}/new`
        : routeBase === "/appointments"
          ? routeBase
          : `${routeBase}/appointments`,
    );
  const [offlinePatients, setOfflinePatients] = useState<any[]>([]);
  const { patients: referencedPatients, patientMap } =
    usePatientReferencesQuery(
      apiSession,
      appointments.map((a: any) => a.patientId || a.patient_id),
    );
  const patients = apiSession ? referencedPatients : offlinePatients;
  const setPatients = setOfflinePatients;
  const [query, setQuery] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [page, setPage] = useState(1);
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<any[]>([]);
  const [patientLookupOpen, setPatientLookupOpen] = useState(false);
  const [bookingStep, setBookingStep] = useState<BookingStep>("appointment");
  const [appointmentDate, setAppointmentDate] = useState(today());
  const [acquisitionSource, setAcquisitionSource] = useState("direct");
  const [referrerPatientId, setReferrerPatientId] = useState("");
  const [referrerName, setReferrerName] = useState("");
  const [appointmentType, setAppointmentType] = useState<
    "op" | "follow_up" | "doctor_review" | "fitness_certificate" | "emergency"
  >("op");
  const [isBillable, setIsBillable] = useState(true);
  const [billingNote, setBillingNote] = useState("");
  const [customFee, setCustomFee] = useState("");
  const [emergencyReason, setEmergencyReason] = useState("");
  const [intakeComplaints, setIntakeComplaints] = useState("");
  const [intakeBp, setIntakeBp] = useState("");
  const [intakePulse, setIntakePulse] = useState("");
  const [intakeSpo2, setIntakeSpo2] = useState("");
  const [intakeTemp, setIntakeTemp] = useState("");
  const [intakeHeight, setIntakeHeight] = useState("");
  const [intakeWeight, setIntakeWeight] = useState("");
  const [previousIntake, setPreviousIntake] = useState<Record<
    string,
    string
  > | null>(null);
  const [booked, setBooked] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const bookingInFlightRef = useRef(false);
  const [message, setMessage] = useState("");
  const [platformTenantId, setPlatformTenantId] = useState("");
  const [platformDepartment, setPlatformDepartment] = useState("all");
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
  const appointmentPermissions = apiSession?.user?.permissions || [];
  const canRescheduleAppointments = Boolean(
    apiSession?.user?.is_super_admin ||
    appointmentPermissions.includes("*") ||
    appointmentPermissions.includes("appointments.manage") ||
    appointmentPermissions.includes("appointments.edit"),
  );

  useAppointmentMentionResolver({
    apiSession,
    patients,
    setBooked,
    setSelectedPatient,
    setMode,
    setBookingStep,
    setQuery,
    setPage,
  });

  const departmentOptions = useMemo(
    () => uniqueDepartmentRows(allowedDepartments, departmentId),
    [allowedDepartments, departmentId],
  );
  const selectedDepartmentName =
    departmentOptions.find((department: any) => department.id === departmentId)
      ?.name || "selected department";

  const {
    liveDoctors,
    doctorFeeRules,
    doctorId,
    setDoctorId,
    platformTenants,
    platformRows,
    platformLoading,
  } = useAppointmentBookingData({
    apiSession,
    isSuperAdmin,
    branchId,
    departmentId,
    appointmentDate,
    selectedDepartmentName,
    query,
    filterDate,
    platformTenantId,
    setPlatformTenantId,
    listRefreshKey,
    setMessage,
  });
  const {
    patients: liveMatches,
    loading: patientSearchLoading,
    failed: patientSearchFailed,
  } = usePatientSearch({
    apiSession,
    query: patientSearch,
    initialPatients: patients,
  });

  const platformDepartmentOptions = Array.from(
    new Set(
      platformRows
        .map((row: any) => row.department_name || row.department_id)
        .filter(Boolean),
    ),
  );
  const filteredPlatformRows = platformRows.filter((row: any) => {
    if (platformDepartment === "all") return true;
    return (
      row.department_id === platformDepartment ||
      row.department_name === platformDepartment
    );
  });
  const filteredAppointments = appointments.filter((appointment: any) => {
    const patient = patientMap.get(
      appointment.patientId || appointment.patient_id,
    );
    const text = [
      appointment.id,
      appointment.patient,
      appointment.patient_name,
      appointment.patient_number,
      appointment.patient_mobile,
      appointment.mobile,
      appointment.token_number,
      patient?.id,
      patient?.name,
      patient?.full_name,
      patient?.patient_number,
      patient?.mobile,
      patient?.alternate_mobile,
      patient?.area,
      patient?.address,
      appointment.departmentId,
      appointment.department_id,
      appointment.department_name,
      appointment.doctor,
      appointment.practitioner_name,
      appointment.status,
      appointment.acquisitionSource,
      appointment.referrerName,
      appointment.consultationStatus,
      appointment.consultation_status,
    ]
      .join(" ")
      .toLowerCase();
    return (
      (!query || text.includes(query.toLowerCase())) &&
      (!filterDate ||
        String(
          appointment.appointmentDate || appointment.date || "",
        ).startsWith(filterDate) ||
        String(appointment.time || "").startsWith(filterDate)) &&
      (filterDepartment === "all" ||
        appointment.departmentId === filterDepartment) &&
      (filterStatus === "all" ||
        appointmentStatusInfo(appointment).key === filterStatus)
    );
  });
  // Most recently modified first; falls back to created_at for rows never updated.
  const byModifiedFirst = (a: any, b: any) =>
    new Date(b.updated_at || b.created_at || 0).getTime() -
    new Date(a.updated_at || a.created_at || 0).getTime();
  const sortedAppointments = [...filteredAppointments].sort(byModifiedFirst);
  const sortedPlatformRows = [...filteredPlatformRows].sort(byModifiedFirst);
  const listRecords = isSuperAdmin ? sortedPlatformRows : sortedAppointments;
  const totalPages = Math.max(1, Math.ceil(listRecords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = listRecords.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const rowsLoading = isSuperAdmin
    ? platformLoading
    : Boolean(isInitialLoading);

  function openConsultation(appointment: any) {
    if (!appointment?.id || isSuperAdmin) return;
    // Align the shared department context with this appointment so the
    // consultation page keeps the selection (a department mismatch makes the
    // workspace drop it and show "No appointment selected").
    const appointmentDepartmentId =
      appointment.departmentId || appointment.department_id;
    if (appointmentDepartmentId && appointmentDepartmentId !== departmentId)
      setDepartmentId(appointmentDepartmentId);
    if (onOpenAppointment) {
      onOpenAppointment(appointment.id);
      return;
    }
    sessionStorage.setItem(
      "medizinhub.consultationAppointmentId",
      appointment.id,
    );
    const doctorId = appointment.doctorId || appointment.practitioner_id;
    if (doctorId)
      sessionStorage.setItem("medizinhub.consultationDoctorId", doctorId);
    setActive?.("consultation");
  }

  function openPatient(appointment: any) {
    const patientId = appointment?.patientId || appointment?.patient_id;
    if (!patientId || isSuperAdmin) return;
    sessionStorage.setItem("medizinhub.patientId", patientId);
    setActive?.("patients");
  }

  const doctors = liveDoctors;
  const doctor = doctors.find((item: any) => item.id === doctorId);
  const hasAvailableDoctor =
    appointmentType === "emergency" || doctors.length > 0;
  const doctorAvailabilityMessage = hasAvailableDoctor
    ? ""
    : `No doctor is available for ${selectedDepartmentName} on ${displayDate(appointmentDate)}. Check doctor mapping and scheduling timings.`;
  const selectedFeeRule = useMemo(() => {
    const candidates = doctorFeeRules.filter((rule: any) => {
      if (!rule.is_active) return false;
      if (rule.appointment_type !== appointmentType) return false;
      if (rule.branch_id && rule.branch_id !== branchId) return false;
      if (rule.department_id && rule.department_id !== departmentId)
        return false;
      if (rule.practitioner_id && rule.practitioner_id !== doctorId)
        return false;
      return true;
    });
    return candidates.sort((a: any, b: any) => {
      const score = (rule: any) =>
        Number(Boolean(rule.practitioner_id)) * 4 +
        Number(Boolean(rule.department_id)) * 2 +
        Number(Boolean(rule.branch_id));
      return score(b) - score(a);
    })[0];
  }, [doctorFeeRules, appointmentType, branchId, departmentId, doctorId]);
  const selectedFeeAmount = selectedFeeRule?.fee_amount;
  // Non-OP visit types take a custom price set here instead of a fixed fee rule.
  const supportsCustomFee =
    appointmentType === "follow_up" ||
    appointmentType === "doctor_review" ||
    appointmentType === "fitness_certificate";
  const patientMatches = (
    apiSession
      ? [...duplicateMatches, ...liveMatches].filter(
          (patient, index, rows) =>
            rows.findIndex((row) => row.id === patient.id) === index,
        )
      : searchPatients(patients, patientSearch).map((patient: any) => ({
          id: patient.id,
          full_name: patient.name,
          mobile: patient.mobile,
          alternate_mobile: patient.alternateMobile,
          area: patient.area,
          age_years: patient.age,
          gender: patient.gender,
          status: patient.status,
        }))
  ).filter(
    (patient: any) =>
      !patient.status || String(patient.status).toLowerCase() === "active",
  );

  useEffect(
    () => setPage(1),
    [query, filterDate, filterDepartment, filterStatus, appointments.length],
  );
  useEffect(
    () => setPage(1),
    [platformTenantId, platformDepartment, platformRows.length],
  );

  // Surface the patient's most recent recorded vitals/complaints as
  // click-to-fill suggestions (never auto-filled into the inputs) so
  // front-desk staff can reuse them without accidentally recording stale
  // vitals as the new visit's readings.
  useEffect(() => {
    if (!selectedPatient?.id) {
      setPreviousIntake(null);
      return;
    }
    const previous = appointments
      .filter(
        (appointment: any) =>
          (appointment.patientId || appointment.patient_id) ===
            selectedPatient.id &&
          (appointment.intakeVitals || appointment.intakeComplaints),
      )
      .sort((a: any, b: any) => {
        const aKey = `${a.appointmentDate || ""} ${a.appointmentTime || a.appointment_time || ""}`;
        const bKey = `${b.appointmentDate || ""} ${b.appointmentTime || b.appointment_time || ""}`;
        return bKey.localeCompare(aKey);
      })[0];
    if (!previous) {
      setPreviousIntake(null);
      return;
    }
    const byName = parseIntakeVitalsText(previous.intakeVitals || "");
    setPreviousIntake({
      bp: byName.bp || "",
      pulse: byName.pulse || "",
      spo2: byName.spo2 || "",
      temp: byName.temp || "",
      height: byName.height || "",
      weight: byName.weight || "",
      complaints: previous.intakeComplaints || "",
    });
  }, [selectedPatient?.id]);

  function openBooking() {
    setMode("book");
    setBookingStep("appointment");
    setSelectedPatient(null);
    setPatientSearch("");
    setDuplicateMatches([]);
    setPatientLookupOpen(false);
    setBooked(null);
    setMessage("");
    setAppointmentType("op");
    setAcquisitionSource("direct");
    setReferrerPatientId("");
    setReferrerName("");
    setCustomFee("");
    setEmergencyReason("");
    setIntakeComplaints("");
    setIntakeBp("");
    setIntakePulse("");
    setIntakeSpo2("");
    setIntakeTemp("");
    setIntakeHeight("");
    setIntakeWeight("");
    setPreviousIntake(null);
  }

  // Opens the token slip as its own printable page (app/appointments/token),
  // matching the invoice receipt flow instead of printing the whole booking
  // screen. Unlike invoices, the token number and denormalized doctor/
  // department names aren't re-fetchable from GET /appointments/:id, so the
  // slip data is handed off via sessionStorage rather than re-queried there.
  function openTokenPrintWindow(
    appointmentId: string,
    payload: Record<string, unknown>,
  ) {
    sessionStorage.setItem(
      `medizinhub.tokenPrint.${appointmentId}`,
      JSON.stringify(payload),
    );
    window.open(`/appointments/token?id=${appointmentId}`, "_blank");
  }

  function printTokenSlip() {
    const appointmentId = booked?.appointment?.id;
    if (!appointmentId) return;
    openTokenPrintWindow(appointmentId, {
      patientName:
        selectedPatient?.full_name || booked?.appointment?.patient || "-",
      patientNumber: selectedPatient?.patient_number || "",
      patientId: selectedPatient?.id || booked?.appointment?.patient_id || "",
      age: selectedPatient?.age_years ?? selectedPatient?.age ?? null,
      gender: selectedPatient?.gender || "",
      mobile: selectedPatient?.mobile || "",
      tokenNumber:
        booked?.queue_entry?.token_number ||
        booked?.queue_entry?.token ||
        booked?.appointment?.token ||
        "-",
      appointmentNumber:
        booked?.appointment?.appointment_number ||
        booked?.appointment?.appointmentNumber ||
        "",
      appointmentDate:
        booked?.appointment?.appointment_date ||
        booked?.appointment?.appointmentDate ||
        appointmentDate,
      appointmentTime:
        booked?.appointment?.appointment_time ||
        booked?.appointment?.appointmentTime
          ? formatDisplayTime(
              booked.appointment.appointment_time ||
                booked.appointment.appointmentTime,
            )
          : "",
      department: selectedDepartmentName,
      doctor: doctor?.full_name || doctor?.name || "",
      visitLabel: appointmentType.replaceAll("_", " ").toUpperCase(),
      billingStatus: isBillable ? "Chargeable" : "Free Review",
      intakeBp,
      intakePulse,
      intakeSpo2,
      intakeTemp,
      intakeHeight,
      intakeWeight,
      intakeComplaints,
    });
  }

  // Same slip, sourced from an already-booked row in the appointments list
  // (its "..." row action) instead of the fresh booking-success state above.
  function printTokenSlipForRow(appointment: any) {
    if (!appointment?.id) return;
    const patient = patientMap.get(appointment.patientId);
    const byName = parseIntakeVitalsText(appointment.intakeVitals || "");
    const appointmentTime =
      appointment.appointmentTime || appointment.appointment_time;
    openTokenPrintWindow(appointment.id, {
      patientName: appointment.patient || patient?.name || "-",
      patientNumber: patient?.patientNumber || "",
      patientId: appointment.patientId || "",
      age: patient?.age ?? null,
      gender: patient?.gender || "",
      mobile: patient?.mobile || appointment.patientMobile || "",
      tokenNumber: appointment.token || "-",
      appointmentNumber:
        appointment.appointmentNumber || appointment.appointment_number || "",
      appointmentDate: appointment.appointmentDate || "",
      appointmentTime: appointmentTime
        ? formatDisplayTime(appointmentTime)
        : "",
      department:
        departmentOptions.find((d: any) => d.id === appointment.departmentId)
          ?.name || publicDisplayValue(appointment.departmentId),
      doctor: appointment.doctor || "",
      visitLabel: String(appointment.appointmentType || "op")
        .replaceAll("_", " ")
        .toUpperCase(),
      billingStatus: appointment.isBillable ? "Chargeable" : "Free Review",
      intakeBp: byName.bp || "",
      intakePulse: byName.pulse || "",
      intakeSpo2: byName.spo2 || "",
      intakeTemp: byName.temp || "",
      intakeHeight: byName.height || "",
      intakeWeight: byName.weight || "",
      intakeComplaints: appointment.intakeComplaints || "",
    });
  }

  const { refreshAppointmentList, savePatient, bookAppointment } =
    useAppointmentBookingActions({
      apiSession,
      isSuperAdmin,
      clinic,
      branchId,
      departmentId,
      doctorId,
      doctor,
      patients,
      setPatients,
      appointments,
      setAppointments,
      selectedPatient,
      setSelectedPatient,
      appointmentType,
      appointmentDate,
      acquisitionSource,
      referrerPatientId,
      referrerName,
      isBillable,
      customFee,
      billingNote,
      emergencyReason,
      intakeComplaints,
      vitals: {
        intakeBp,
        intakePulse,
        intakeSpo2,
        intakeTemp,
        intakeHeight,
        intakeWeight,
      },
      supportsCustomFee,
      loadLiveData,
      setListRefreshKey,
      setMessage,
      setBusy,
      setBooked,
      setBookingStep,
      setPatientSearch,
      setPatientLookupOpen,
      setLiveMatches: setDuplicateMatches,
      bookingInFlightRef,
    });

  async function closeBooking() {
    setMode("list");
    setBookingStep("appointment");
    setSelectedPatient(null);
    setPatientSearch("");
    setDuplicateMatches([]);
    setPatientLookupOpen(false);
    setBooked(null);
    setMessage("");
    await refreshAppointmentList();
  }

  const {
    rescheduleAppointment,
    setRescheduleAppointment,
    rescheduleDate,
    setRescheduleDate,
    rescheduleBusy,
    openReschedule,
    saveReschedule,
  } = useAppointmentReschedule({
    apiSession,
    refreshAppointmentList,
    setMessage,
    onRescheduled: onOpenAppointment,
  });

  const normalizedDepartmentOptions = departmentOptions.map((d: any) => ({
    value: d.id,
    label: d.name,
  }));
  const normalizedPlatformDepartmentOptions = platformDepartmentOptions.map(
    (d: string) => ({
      value: d,
      label: d,
    }),
  );
  if (mode === "book") {
    return (
      <AppointmentBookingFlow
        message={message}
        setMessage={setMessage}
        closeBooking={closeBooking}
        bookingStep={bookingStep}
        setBookingStep={setBookingStep}
        selectedPatient={selectedPatient}
        setSelectedPatient={setSelectedPatient}
        patientSearch={patientSearch}
        setPatientSearch={setPatientSearch}
        patientLookupOpen={patientLookupOpen}
        setPatientLookupOpen={setPatientLookupOpen}
        patientMatches={patientMatches}
        patientSearchLoading={patientSearchLoading}
        patientSearchFailed={patientSearchFailed}
        busy={busy}
        clinic={clinic}
        branchId={branchId}
        savePatient={savePatient}
        departmentId={departmentId}
        setDepartmentId={setDepartmentId}
        departmentOptions={departmentOptions}
        doctorId={doctorId}
        setDoctorId={setDoctorId}
        apiSession={apiSession}
        doctors={doctors}
        selectedDepartmentName={selectedDepartmentName}
        appointmentType={appointmentType}
        setAppointmentType={setAppointmentType}
        appointmentDate={appointmentDate}
        setAppointmentDate={setAppointmentDate}
        patients={patients}
        acquisitionSource={acquisitionSource}
        setAcquisitionSource={setAcquisitionSource}
        referrerName={referrerName}
        referrerPatientId={referrerPatientId}
        setReferrerName={setReferrerName}
        setReferrerPatientId={setReferrerPatientId}
        isBillable={isBillable}
        setIsBillable={setIsBillable}
        supportsCustomFee={supportsCustomFee}
        customFee={customFee}
        setCustomFee={setCustomFee}
        selectedFeeAmount={selectedFeeAmount}
        doctor={doctor}
        doctorAvailabilityMessage={doctorAvailabilityMessage}
        hasAvailableDoctor={hasAvailableDoctor}
        emergencyReason={emergencyReason}
        setEmergencyReason={setEmergencyReason}
        billingNote={billingNote}
        setBillingNote={setBillingNote}
        intakeBp={intakeBp}
        setIntakeBp={setIntakeBp}
        intakePulse={intakePulse}
        setIntakePulse={setIntakePulse}
        intakeSpo2={intakeSpo2}
        setIntakeSpo2={setIntakeSpo2}
        intakeTemp={intakeTemp}
        setIntakeTemp={setIntakeTemp}
        intakeHeight={intakeHeight}
        setIntakeHeight={setIntakeHeight}
        intakeWeight={intakeWeight}
        setIntakeWeight={setIntakeWeight}
        previousIntake={previousIntake}
        intakeComplaints={intakeComplaints}
        setIntakeComplaints={setIntakeComplaints}
        bookAppointment={bookAppointment}
        booked={booked}
        printTokenSlip={printTokenSlip}
        openBookedAppointment={() => {
          const appointmentId = booked?.appointment?.id;
          if (!appointmentId) return;
          if (onOpenAppointment) onOpenAppointment(appointmentId);
          else openConsultation(booked.appointment);
        }}
      />
    );
  }

  const appointmentColumns = getAppointmentColumns({
    canCopyIds,
    patientMap,
    departmentOptions,
    canRescheduleAppointments,
    numberingRules,
    openReschedule,
    openPatient,
    printTokenSlipForRow,
  });
  const platformColumns = getPlatformColumns({ canCopyIds });

  return (
    <AppointmentList
      message={message}
      setMessage={setMessage}
      isSuperAdmin={isSuperAdmin}
      rescheduleAppointment={rescheduleAppointment}
      setRescheduleAppointment={setRescheduleAppointment}
      rescheduleDate={rescheduleDate}
      setRescheduleDate={setRescheduleDate}
      rescheduleBusy={rescheduleBusy}
      saveReschedule={saveReschedule}
      openBooking={openBooking}
      showBookingAction={routeBase === "/appointments"}
      platformTenantId={platformTenantId}
      setPlatformTenantId={setPlatformTenantId}
      platformTenants={platformTenants}
      query={query}
      setQuery={setQuery}
      filterDate={filterDate}
      setFilterDate={setFilterDate}
      platformDepartment={platformDepartment}
      setPlatformDepartment={setPlatformDepartment}
      normalizedPlatformDepartmentOptions={normalizedPlatformDepartmentOptions}
      filterDepartment={filterDepartment}
      setFilterDepartment={setFilterDepartment}
      normalizedDepartmentOptions={normalizedDepartmentOptions}
      filterStatus={filterStatus}
      setFilterStatus={setFilterStatus}
      columns={isSuperAdmin ? platformColumns : appointmentColumns}
      rows={rows}
      rowsLoading={rowsLoading}
      onRowClick={isSuperAdmin ? undefined : openConsultation}
      safePage={safePage}
      totalPages={totalPages}
      total={listRecords.length}
      setPage={setPage}
    />
  );
}
