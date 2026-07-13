"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, Search, X } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  SearchableSelect,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { apiFetch, type ApiSession } from "@/lib/api";
import { ActivityLog } from "@/app/components/common/ActivityLog";
import {
  FormField,
  SelectField,
  TextareaField,
  TextField,
} from "@/app/components/FormElements";
import { searchPatients } from "@/lib/hmsLogic";
import {
  humanizeOptionLabel,
  publicDisplayValue,
  uniqueDepartmentRows,
} from "@/lib/options";
import { displayDate } from "@/utils/helper";
import { STATUS_FILTER_OPTIONS } from "@/utils/constants";
import { PatientForm } from "@/features/patients/forms/PatientForms";
import { Info } from "@/app/components/common/Info";
import { Pagination } from "@/app/components/common/Pagination";
import { useAppointmentBookingData } from "./api/useAppointmentBookingData";
import { useAppointmentBookingActions } from "./api/useAppointmentBookingActions";

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
  setActive?: (page: string) => void;
};

type BookingStep = "appointment" | "newPatient" | "success";

const pageSize = 8;
function formatDisplayTime(value: any) {
  const raw = String(value || "").slice(0, 5);
  const [hourText, minuteText = "00"] = raw.split(":");
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return raw || "-";
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minuteText.padStart(2, "0")} ${period}`;
}

// Normalizes an appointment (clinic or platform shape) into a display status
// used for the badge, the status filter, and list ordering. `order` controls
// sort position: active first, then cancelled, completed last.
function appointmentStatusInfo(appointment: any) {
  const consult = String(
    appointment.consultationStatus || appointment.consultation_status || "",
  ).toLowerCase();
  const status = String(appointment.status || "").toLowerCase();
  const queue = String(
    appointment.queueStatus || appointment.queue_status || "",
  ).toLowerCase();
  if (status === "cancelled" || status === "no_show" || queue === "cancelled")
    return {
      key: "cancelled",
      label: "Cancelled",
      tone: "red" as const,
      order: 1,
    };
  if (
    consult === "signed" ||
    status === "consultation_completed" ||
    status === "billed" ||
    queue === "completed" ||
    queue === "consultation_completed"
  )
    return {
      key: "completed",
      label: "Completed",
      tone: "green" as const,
      order: 2,
    };
  return {
    key: "active",
    label: humanizeOptionLabel(queue || consult || status) || "Waiting",
    tone: "slate" as const,
    order: 0,
  };
}

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
    setActive,
  } = props;
  const [mode, setMode] = useState<"list" | "book">("list");
  const [query, setQuery] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [page, setPage] = useState(1);
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [patientLookupOpen, setPatientLookupOpen] = useState(false);
  const [bookingStep, setBookingStep] = useState<BookingStep>("appointment");
  const [appointmentDate, setAppointmentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
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

  const patientMap = useMemo(
    () => new Map(patients.map((patient: any) => [patient.id, patient])),
    [patients],
  );
  const departmentOptions = useMemo(
    () => uniqueDepartmentRows(allowedDepartments, departmentId),
    [allowedDepartments, departmentId],
  );
  const selectedDepartmentName =
    departmentOptions.find((department: any) => department.id === departmentId)
      ?.name || "selected department";

  const {
    liveMatches,
    setLiveMatches,
    liveDoctors,
    doctorFeeRules,
    doctorId,
    setDoctorId,
    platformTenants,
    platformRows,
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
    patientSearch,
    setMessage,
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
      patient?.guardian_name,
      patient?.guardian,
      patient?.guardian_mobile,
      patient?.guardianMobile,
      patient?.area,
      patient?.address,
      appointment.departmentId,
      appointment.department_id,
      appointment.department_name,
      appointment.doctor,
      appointment.practitioner_name,
      appointment.status,
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
  // Active (waiting/requeued/etc.) first, completed last; stable within a group.
  const sortedAppointments = [...filteredAppointments].sort(
    (a: any, b: any) =>
      appointmentStatusInfo(a).order - appointmentStatusInfo(b).order,
  );
  const listRecords = isSuperAdmin ? filteredPlatformRows : sortedAppointments;
  const totalPages = Math.max(1, Math.ceil(listRecords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = listRecords.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  function openConsultation(appointment: any) {
    if (!appointment?.id || isSuperAdmin) return;
    sessionStorage.setItem(
      "medizinhub.consultationAppointmentId",
      appointment.id,
    );
    const doctorId = appointment.doctorId || appointment.practitioner_id;
    if (doctorId)
      sessionStorage.setItem("medizinhub.consultationDoctorId", doctorId);
    // Align the shared department context with this appointment so the
    // consultation page keeps the selection (a department mismatch makes the
    // workspace drop it and show "No appointment selected").
    const appointmentDepartmentId =
      appointment.departmentId || appointment.department_id;
    if (appointmentDepartmentId && appointmentDepartmentId !== departmentId)
      setDepartmentId(appointmentDepartmentId);
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

  function openBooking() {
    setMode("book");
    setBookingStep("appointment");
    setSelectedPatient(null);
    setPatientSearch("");
    setLiveMatches([]);
    setPatientLookupOpen(false);
    setBooked(null);
    setMessage("");
    setAppointmentType("op");
    setCustomFee("");
    setEmergencyReason("");
    setIntakeComplaints("");
    setIntakeBp("");
    setIntakePulse("");
    setIntakeSpo2("");
    setIntakeTemp("");
    setIntakeHeight("");
    setIntakeWeight("");
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
      setLiveMatches,
      bookingInFlightRef,
    });

  async function closeBooking() {
    setMode("list");
    setBookingStep("appointment");
    setSelectedPatient(null);
    setPatientSearch("");
    setLiveMatches([]);
    setPatientLookupOpen(false);
    setBooked(null);
    setMessage("");
    await refreshAppointmentList();
  }

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
      <div className="space-y-5">
        <Card>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="card-title font-bold">Book OP Appointment</h3>
              <p className="card-desc text-slate-500">
                Select or register the patient, then complete the appointment
                details on this page.
              </p>
            </div>
            <button
              type="button"
              onClick={closeBooking}
              className=" close-button font-bold"
            >
              Close
            </button>
          </div>
          <StatusToast message={message} onClose={() => setMessage("")} />
        </Card>

        {bookingStep !== "success" && (
          <Card>
            <h4 className="card-title font-bold">Appointment Details</h4>
            <div className="mt-4">
              <div className=" w-1/2">
                <span className="mb-1 block text-sm font-bold uppercase tracking-wide text-slate-500 lg:text-xs">
                  Patient
                </span>
                {selectedPatient ? (
                  <div className="flex flex-col justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center ">
                    <div>
                      <b className="text-xs text-slate-900">
                        {selectedPatient.full_name}
                      </b>
                      <p className="text-xs text-slate-500">
                        {selectedPatient.patient_number
                          ? `${selectedPatient.patient_number} · `
                          : ""}
                        {selectedPatient.mobile || "No mobile"} ·{" "}
                        {selectedPatient.area ||
                          selectedPatient.guardian_mobile ||
                          "-"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPatient(null);
                        setPatientSearch("");
                        setBookingStep("appointment");
                        setPatientLookupOpen(true);
                      }}
                      className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700"
                    >
                      Change Patient
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400"
                      size={17}
                    />
                    <Input
                      value={patientSearch}
                      onFocus={() => setPatientLookupOpen(true)}
                      onChange={(event: any) => {
                        setPatientSearch(event.target.value);
                        setPatientLookupOpen(true);
                        if (bookingStep === "newPatient")
                          setBookingStep("appointment");
                      }}
                      onKeyDown={(event: any) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setPatientLookupOpen(false);
                        }
                      }}
                      placeholder="Search patient name, mobile, or patient ID"
                      autoComplete="off"
                      className="rounded-lg py-3 pl-10 pr-10 text-xs "
                    />
                    {patientSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setPatientSearch("");
                          setLiveMatches([]);
                        }}
                        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                        aria-label="Clear patient search"
                      >
                        <X size={16} />
                      </button>
                    )}
                    {patientLookupOpen && patientSearch.trim() && (
                      <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                        {patientSearch.trim().length < 2 && (
                          <p className="px-3 py-3 text-xs text-slate-500">
                            Enter at least 2 characters to search.
                          </p>
                        )}
                        {patientSearch.trim().length >= 2 &&
                          patientMatches.map((patient: any) => (
                            <button
                              key={patient.id}
                              type="button"
                              onClick={() => {
                                setSelectedPatient(patient);
                                setPatientSearch("");
                                setPatientLookupOpen(false);
                                setBookingStep("appointment");
                                setMessage("");
                              }}
                              className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left hover:bg-slate-50"
                            >
                              <span>
                                <b className="block text-xs text-slate-900">
                                  {patient.full_name}
                                </b>
                                <span className="text-xs text-slate-500">
                                  {patient.patient_number
                                    ? `${patient.patient_number} · `
                                    : ""}
                                  {patient.mobile || "No mobile"}
                                  {patient.area ? ` · ${patient.area}` : ""}
                                </span>
                              </span>
                              <span className="text-xs font-bold text-blue-600">
                                Select
                              </span>
                            </button>
                          ))}
                        {patientSearch.trim().length >= 2 &&
                          patientMatches.length === 0 && (
                            <p className="px-3 py-2 table-data text-slate-500">
                              No active patient found.
                            </p>
                          )}
                        {patientSearch.trim().length >= 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPatientLookupOpen(false);
                              setBookingStep("newPatient");
                            }}
                            className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-3 text-left text-xs font-bold text-blue-700 hover:bg-blue-50"
                          >
                            <span className="text-lg leading-none">+</span>
                            Create a new Patient
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {bookingStep === "newPatient" && !selectedPatient && (
              <PatientForm
                busy={busy}
                branches={clinic?.branches || []}
                defaultBranchId={branchId}
                searchValue={patientSearch}
                onSubmit={savePatient}
                back={() => setBookingStep("appointment")}
              />
            )}

            {bookingStep === "appointment" && selectedPatient && (
              <form
                className="mt-5 border-t border-slate-100 pt-5"
                onSubmit={(event: any) => {
                  event.preventDefault();
                  bookAppointment();
                }}
              >
                <div className="grid gap-3 md:grid-cols-4">
                  <Field label="Department" required>
                    <SearchableSelect
                      required
                      value={departmentId}
                      onChange={setDepartmentId}
                      // className="select-filter"
                      searchable={departmentOptions.length > 8}
                      placeholder="Select department"
                      options={departmentOptions.map((department: any) => ({
                        value: department.id,
                        label: department.name,
                      }))}
                    />
                  </Field>
                  <Field label="Doctor" required>
                    <SearchableSelect
                      required
                      value={doctorId}
                      onChange={setDoctorId}
                      disabled={apiSession && doctors.length === 0}
                      // className="select-filter"
                      searchable={doctors.length > 8}
                      placeholder={
                        doctors.length === 0
                          ? "No doctor available"
                          : "Select doctor"
                      }
                      options={
                        doctors.length === 0
                          ? [{ value: "", label: "No doctor available" }]
                          : doctors.map((item: any) => ({
                              value: item.id,
                              label: item.full_name || item.name,
                              sublabel: selectedDepartmentName
                                ? selectedDepartmentName
                                : undefined,
                            }))
                      }
                    />
                  </Field>
                  <Field label="Visit Type" required>
                    <SearchableSelect
                      required
                      value={appointmentType}
                      onChange={() => {
                        setAppointmentType;
                      }}
                      // className="select-filter"
                      searchable={false}
                      options={[
                        { value: "op", label: "OP" },
                        { value: "follow_up", label: "Follow-up" },
                        { value: "doctor_review", label: "Doctor Review" },
                        {
                          value: "fitness_certificate",
                          label: "Fitness Certificate",
                        },
                        { value: "emergency", label: "Emergency" },
                      ]}
                    />
                  </Field>
                  <Field label="Appointment Date" required>
                    <Input
                      required
                      type="date"
                      value={appointmentDate}
                      onChange={(e: any) => setAppointmentDate(e.target.value)}
                      // className="date-filter"
                    />
                  </Field>
                  <div className="rounded-lg bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase text-slate-500">
                      Doctor Fee
                    </p>
                    <p className="mt-1 table-data font-black">
                      {!isBillable
                        ? "Free"
                        : supportsCustomFee
                          ? customFee
                            ? `₹${Number(customFee).toLocaleString("en-IN")}`
                            : "Set price below"
                          : selectedFeeAmount !== undefined
                            ? `₹${Number(selectedFeeAmount).toLocaleString("en-IN")}`
                            : "Not configured"}
                    </p>
                    <p className="mt-1 text-[10px] lg:text-slate-500">
                      {doctorId
                        ? doctor?.full_name || doctor?.name || "Selected doctor"
                        : "Select doctor"}
                    </p>
                  </div>
                </div>
                {doctorAvailabilityMessage && (
                  <div className="mt-4 rounded-lg bg-amber-50 p-4 table-data font-semibold text-amber-800">
                    {doctorAvailabilityMessage}
                  </div>
                )}
                {appointmentType === "emergency" && (
                  <div className="mt-4 rounded-2xl bg-red-50 p-4">
                    <TextField
                      label="Emergency Reason"
                      value={emergencyReason}
                      onChange={setEmergencyReason}
                      placeholder="Severe pain, trauma, breathlessness"
                      className="search"
                    />
                    <p className="mt-2 text-xs font-semibold text-red-700">
                      Emergency bookings skip normal slot availability and are
                      audited as emergency overrides.
                    </p>
                  </div>
                )}
                {(appointmentType === "follow_up" ||
                  appointmentType === "doctor_review" ||
                  appointmentType === "fitness_certificate") && (
                  <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2">
                    <SelectField
                      label="Billing"
                      value={isBillable ? "paid" : "free"}
                      onChange={(v) => setIsBillable(v === "paid")}
                      options={[
                        { value: "paid", label: "Chargeable" },
                        { value: "free", label: "Free Review" },
                      ]}
                    />
                    {isBillable && (
                      <Field label="Consultation Price (₹)">
                        <Input
                          type="number"
                          min={0}
                          value={customFee}
                          onChange={(e: any) => setCustomFee(e.target.value)}
                          placeholder="Set price for this visit"
                        />
                      </Field>
                    )}
                    <FormField label="Billing Note">
                      <Input
                        value={billingNote}
                        onChange={setBillingNote}
                        placeholder="Within free review period, certificate request, etc."
                      />
                    </FormField>
                  </div>
                )}
                {appointmentType !== "emergency" && (
                  <div className="mt-4 rounded-lg bg-blue-50 p-4 text-xs text-blue-800">
                    Consultation time will be auto-assigned from the doctor's
                    schedule when you save.
                  </div>
                )}
                <div className="mt-4 rounded-lg bg-slate-50 p-4">
                  <div className="flex items-baseline justify-between">
                    <h5 className="text-xs font-bold uppercase text-slate-700">
                      Intake (Optional)
                    </h5>
                    <span className="text-[10px] text-xs text-slate-500">
                      Pre-fills the doctor consultation page.
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <FormField label="BP">
                      <Input
                        value={intakeBp}
                        onChange={setIntakeBp}
                        placeholder="120/80 mmHg"
                      />
                    </FormField>
                    <FormField label="Pulse / PR">
                      <Input
                        value={intakePulse}
                        onChange={setIntakePulse}
                        placeholder="78 bpm"
                      />
                    </FormField>
                    <FormField label="SpO2">
                      <Input
                        value={intakeSpo2}
                        onChange={setIntakeSpo2}
                        placeholder="98%"
                      />
                    </FormField>
                    <FormField label="Temp">
                      <Input
                        value={intakeTemp}
                        onChange={setIntakeTemp}
                        placeholder="98.6°F"
                      />
                    </FormField>
                    <FormField label="Height">
                      <Input
                        value={intakeHeight}
                        onChange={setIntakeHeight}
                        placeholder="170cm"
                      />
                    </FormField>
                    <FormField label="Weight">
                      <Input
                        value={intakeWeight}
                        onChange={setIntakeWeight}
                        placeholder="65kg"
                      />
                    </FormField>
                    <TextareaField
                      label="Complaint Rows"
                      value={intakeComplaints}
                      onChange={setIntakeComplaints}
                      placeholder={
                        "Fever | 2 days | medium\nCough | 1 day | mild"
                      }
                      rows={3}
                      className="placeholder:text-xs px-2 py-2"
                    />
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    disabled={busy || !hasAvailableDoctor}
                    className="save-button"
                  >
                    {busy ? "Booking..." : "Save & Generate Token"}
                  </Button>
                  <button
                    type="button"
                    onClick={closeBooking}
                    className="close-button font-bold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </Card>
        )}

        {bookingStep === "success" && booked && (
          <Card>
            <h4 className="font-bold">Appointment Booked</h4>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <Info
                label="Patient"
                value={
                  selectedPatient?.full_name ||
                  booked.appointment?.patient ||
                  "-"
                }
              />
              <Info
                label="Token"
                value={
                  booked.queue_entry?.token_number ||
                  booked.queue_entry?.token ||
                  booked.appointment?.token ||
                  "-"
                }
              />
              <Info
                label="Date"
                value={booked.appointment?.appointment_date || appointmentDate}
              />
              <Info
                label="Time"
                value={
                  booked.appointment?.appointment_time
                    ? formatDisplayTime(booked.appointment.appointment_time)
                    : "-"
                }
              />
            </div>
            <div className="mt-4 rounded-2xl border bg-white p-4">
              <p className="text-xs font-bold uppercase text-slate-500">
                Token Slip
              </p>
              <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
                <b>
                  {selectedPatient?.full_name ||
                    booked.appointment?.patient ||
                    "-"}
                </b>
                <span>
                  Token:{" "}
                  {booked.queue_entry?.token_number ||
                    booked.queue_entry?.token ||
                    booked.appointment?.token ||
                    "-"}
                </span>
                <span>
                  {appointmentType.replaceAll("_", " ").toUpperCase()} ·{" "}
                  {isBillable ? "Chargeable" : "Free Review"}
                </span>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="close-button font-bold"
              >
                Print Token
              </button>
              <Button onClick={closeBooking}>Close</Button>
            </div>
            <ActivityLog
              resourceType="appointment"
              resourceId={booked.appointment?.id}
              apiSession={apiSession}
            />
          </Card>
        )}
      </div>
    );
  }

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="card-title font-bold">Appointments</h3>
          <p className="card-desc text-slate-500">
            {isSuperAdmin
              ? "Combined all-tenant appointment grid for MedizinHub HMS primary tenant."
              : "Row based OP appointment view with patient, mobile, medical department, doctor, date, and consultation status."}
          </p>
        </div>
        <Button
          onClick={openBooking}
          className="flex items-center justify-between rounded-lg gap-2 w-40 lg:w-44 text-xs  px-3 py-2 lg:px-4 lg:py-3"
        >
          <div className="flex justify-center">
            <CalendarPlus size={16} />
            <p className="pl-2">New Appointment </p>
          </div>
        </Button>
      </div>
      <div className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-4">
        {isSuperAdmin && (
          <SelectField
            label="Clinic / Tenant"
            value={platformTenantId}
            onChange={setPlatformTenantId}
            options={[
              { value: "", label: "All tenants" },
              ...platformTenants
                .filter((t: any) => !t.is_primary)
                .map((t: any) => ({ value: t.id, label: t.name })),
            ]}
          />
        )}
        <Field label="Patient name">
          <Input
            value={query}
            onChange={(e: any) => setQuery(e.target.value)}
            placeholder="Search patient or mobile"
          />
        </Field>
        <Field label="Select date">
          <Input
            type="date"
            value={filterDate}
            onChange={(e: any) => setFilterDate(e.target.value)}
          />
        </Field>
        <Field label="Department">
          {isSuperAdmin ? (
            <SearchableSelect
              value={platformDepartment}
              onChange={(val: string) => setPlatformDepartment(val)}
              options={normalizedPlatformDepartmentOptions}
              placeholder="All Departments"
              searchable={false}
            />
          ) : (
            <SearchableSelect
              value={filterDepartment}
              onChange={(val: string) => setFilterDepartment(val)}
              options={[
                { value: "all", label: "All Departments" },
                ...normalizedDepartmentOptions,
              ]}
              placeholder="All Departments"
              searchable={false}
            />
          )}
        </Field>
        {!isSuperAdmin && (
          <Field label="Status">
            <SearchableSelect
              value={filterStatus}
              onChange={(val: string) => setFilterStatus(val)}
              options={STATUS_FILTER_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              placeholder="Select status"
              searchable={false}
            />
          </Field>
        )}
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 overflow-x-auto">
        <div className="min-w-[1300px]">
          <div
            className={`hidden gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500 md:grid ${isSuperAdmin ? "grid-cols-[220px_70px_220px_140px_150px_180px_180px_120px]" : "grid-cols-[120px_70px_140px_140px_150px_180px_120px_280px]"}`}
          >
            {isSuperAdmin && <span>Tenant</span>}
            <span className="text-sm">Patient</span>
            <span className="text-sm">ID</span>
            <span className="text-sm">Mobile</span>
            <span className="text-sm">Department</span>
            <span className="text-sm">Doctor</span>
            <span className="text-sm lg:text-left ">Date</span>
            <span className=" text-sm text-center">Status</span>
            {!isSuperAdmin && (
              <span className=" text-sm md:text-center pr-4">Links</span>
            )}
          </div>
          <div className="divide-y divide-slate-200">
            {rows.length === 0 && (
              <div className="p-4 text-xs  text-slate-500">
                No appointments found.
              </div>
            )}
            {rows.map((appointment: any) => {
              if (isSuperAdmin) {
                return (
                  <div
                    key={appointment.id}
                    className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[220px_220px_140px_180px_180px_180px_120px] md:items-center"
                  >
                    <div>
                      <b className="table-data">{appointment.tenant_name}</b>
                      <p className="text-sm lg:text-xs text-slate-500">
                        {appointment.branch_name}
                      </p>
                    </div>
                    <div>
                      <b className="table-data">{appointment.patient_name}</b>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">
                        {appointment.token_number || appointment.id}
                      </p>
                    </div>
                    <span className="table-data">
                      {appointment.patient_mobile || "-"}
                    </span>
                    <span className="table-data">
                      {appointment.department_name || "-"}
                    </span>
                    <span className="table-data">
                      {appointment.practitioner_name || "-"}
                    </span>
                    <span className="table-data">
                      {displayDate(appointment.appointment_date)}
                      {appointment.appointment_time
                        ? ` ${formatDisplayTime(appointment.appointment_time)}`
                        : ""}
                    </span>
                    <Badge
                      tone={appointmentStatusInfo(appointment).tone}
                      className="table-status"
                    >
                      {appointmentStatusInfo(appointment).label}
                    </Badge>
                  </div>
                );
              }
              const patient = patientMap.get(appointment.patientId);
              return (
                <div
                  key={appointment.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openConsultation(appointment)}
                  onKeyDown={(event: any) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openConsultation(appointment);
                    }
                  }}
                  className="grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none md:grid-cols-[120px_70px_140px_140px_150px_180px_120px_280px] md:items-center"
                >
                  <div>
                    <p className="text-sm font-semibold  break-all">
                      {appointment.patient}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm  text-slate-500">
                      {appointment.token ||
                        publicDisplayValue(appointment.id, "-")}
                    </p>
                  </div>
                  <span className="text-sm ">{patient?.mobile || "-"}</span>
                  <span className="text-sm  ">
                    {departmentOptions.find(
                      (d: any) => d.id === appointment.departmentId,
                    )?.name || publicDisplayValue(appointment.departmentId)}
                  </span>
                  <span className="text-sm  ">
                    {appointment.doctor ||
                      publicDisplayValue(appointment.doctorId, "Doctor")}
                  </span>
                  <span className="text-sm  ">
                    {appointment.appointmentDate || "-"}
                    {appointment.appointmentTime || appointment.appointment_time
                      ? ` ${formatDisplayTime(
                          appointment.appointmentTime ||
                            appointment.appointment_time,
                        )}`
                      : ""}
                  </span>
                  <Badge
                    tone={appointmentStatusInfo(appointment).tone}
                    className="table-status text-sm "
                  >
                    {appointmentStatusInfo(appointment).label}
                  </Badge>
                  <div
                    className="flex flex-wrap lg:flex-nowrap items-center justify-center gap-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => openConsultation(appointment)}
                      className="whitespace-nowrap rounded-lg border px-1 py-1 lg:px-3 lg:py-2 text-xs  font-bold hover:bg-slate-50"
                    >
                      Consultation
                    </button>
                    <button
                      type="button"
                      onClick={() => openPatient(appointment)}
                      className="whitespace-nowrap rounded-lg border px-1 py-1 lg:px-3 lg:py-2 text-xs font-bold hover:bg-slate-50"
                    >
                      Patient Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={listRecords.length}
        onPage={setPage}
      />
    </Card>
  );
}
