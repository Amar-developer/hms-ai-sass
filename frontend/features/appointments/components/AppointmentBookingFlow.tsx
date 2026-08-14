import { Search, X } from "lucide-react";
import {
  Button,
  Card,
  Input,
  SearchableSelect,
  StatusToast,
} from "@/app/components/common/ui";
import { ActivityLog } from "@/app/components/common/ActivityLog";
import {
  FormField,
  SelectField,
  TextareaField,
  TextField,
} from "@/app/components/FormElements";
import { PatientForm } from "@/features/patients/forms/PatientForms";
import { Info } from "@/app/components/common/Info";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { SourceReferralFields } from "@/app/components/common/SourceReferralFields";
import { formatDisplayTime } from "../helpers";
import { visit_type_options } from "../constants";
import { PatientIntakeSummary } from "./PatientIntakeSummary";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";

function IntakeSuggestionChip({
  value,
  currentValue,
  onApply,
}: {
  value?: string;
  currentValue: string;
  onApply: () => void;
}) {
  if (!value || value === currentValue) return null;
  return (
    <button
      type="button"
      onClick={onApply}
      className="mt-1 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100"
    >
      Use previous: {value}
    </button>
  );
}

export function AppointmentBookingFlow(props: any) {
  const {
    message,
    setMessage,
    closeBooking,
    bookingStep,
    setBookingStep,
    selectedPatient,
    setSelectedPatient,
    patientSearch,
    setPatientSearch,
    patientLookupOpen,
    setPatientLookupOpen,
    patientMatches,
    patientSearchLoading,
    patientSearchFailed,
    busy,
    clinic,
    branchId,
    savePatient,
    departmentId,
    setDepartmentId,
    departmentOptions,
    doctorId,
    setDoctorId,
    apiSession,
    doctors,
    selectedDepartmentName,
    appointmentType,
    setAppointmentType,
    appointmentDate,
    setAppointmentDate,
    patients,
    acquisitionSource,
    setAcquisitionSource,
    referrerName,
    referrerPatientId,
    setReferrerName,
    setReferrerPatientId,
    isBillable,
    setIsBillable,
    supportsCustomFee,
    customFee,
    setCustomFee,
    selectedFeeAmount,
    doctor,
    doctorAvailabilityMessage,
    hasAvailableDoctor,
    emergencyReason,
    setEmergencyReason,
    billingNote,
    setBillingNote,
    intakeBp,
    setIntakeBp,
    intakePulse,
    setIntakePulse,
    intakeSpo2,
    setIntakeSpo2,
    intakeTemp,
    setIntakeTemp,
    intakeHeight,
    setIntakeHeight,
    intakeWeight,
    setIntakeWeight,
    previousIntake,
    intakeComplaints,
    setIntakeComplaints,
    bookAppointment,
    booked,
    printTokenSlip,
    openBookedAppointment,
  } = props;

  return (
    <div className="space-y-4">
      {bookingStep !== "success" && (
        <Card className="p-4">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="card-title font-bold">New OP Appointment</h3>
              <p className="card-desc text-slate-500">
                Select a patient and enter the four required visit details.
              </p>
            </div>
            <button
              type="button"
              onClick={closeBooking}
              className="secondary-action h-9 text-xs"
            >
              Cancel
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200 text-[10px] font-bold uppercase tracking-wide">
            <span className="bg-brand px-3 py-2 text-center text-brand-fg">1 · Patient</span>
            <span className={`px-3 py-2 text-center ${selectedPatient ? "bg-emerald-50 text-emerald-800" : "bg-white text-slate-400"}`}>2 · Visit Details</span>
            <span className="bg-white px-3 py-2 text-center text-slate-400">3 · Token</span>
          </div>
          <StatusToast message={message} onClose={() => setMessage("")} />
          <div className="mt-4">
            <div className="w-full">
              <span className="mb-1 block text-sm font-bold uppercase tracking-wide text-slate-500 lg:text-xs">
                Patient
              </span>
              {selectedPatient ? (
                <div className="flex flex-col justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:flex-row sm:items-center">
                  <div>
                    <b className="text-xs text-slate-900">
                      {selectedPatient.full_name}
                    </b>
                    <p className="text-xs text-slate-500">
                      {selectedPatient.patient_number
                        ? `${selectedPatient.patient_number} · `
                        : ""}
                      {selectedPatient.mobile || "No mobile"} ·{" "}
                      {selectedPatient.area || "-"}
                    </p>
                    <PatientFlagBadges
                      patient={selectedPatient}
                      className="mt-1"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null);
                      setPatientSearch("");
                      setBookingStep("appointment");
                      setPatientLookupOpen(true);
                    }}
                    className="secondary-action h-9 text-xs"
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
                    autoFocus
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

                      if (
                        event.key === "Enter" &&
                        patientLookupOpen &&
                        patientMatches.length > 0
                      ) {
                        event.preventDefault();

                        const patient = patientMatches[0];

                        setSelectedPatient(patient);
                        setPatientSearch("");
                        setPatientLookupOpen(false);
                        setBookingStep("appointment");
                        setMessage("");
                      }
                    }}
                    placeholder="Search patient name, mobile, or patient ID"
                    autoComplete="off"
                    className="rounded-lg py-3 pl-10 pr-10 text-xs"
                  />
                  {patientSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setPatientSearch("");
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
                        patientSearchLoading && (
                          <p className="px-3 py-3 text-xs text-slate-500">
                            Searching...
                          </p>
                        )}
                      {patientSearch.trim().length >= 2 &&
                        !patientSearchLoading &&
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
                              <PatientFlagBadges
                                patient={patient}
                                className="mt-1"
                              />
                            </span>
                            <span className="text-xs font-bold text-blue-600">
                              Select
                            </span>
                          </button>
                        ))}
                      {patientSearch.trim().length >= 2 &&
                        !patientSearchLoading &&
                        patientMatches.length === 0 && (
                          <p className="px-3 py-2 table-data text-slate-500">
                            {patientSearchFailed
                              ? "Patient search failed. Try again."
                              : "No active patient found."}
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
              className="mt-4 space-y-4"
              onSubmit={(event: any) => {
                event.preventDefault();
                bookAppointment();
              }}
            >
              <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="mb-3">
                  <h4 className="text-sm font-black text-slate-950">Visit Details</h4>
                  <p className="text-xs text-slate-500">Choose the department, doctor, visit type, date, and source.</p>
                </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <FormField label="Department" required>
                  <SearchableSelect
                    required
                    value={departmentId}
                    onChange={setDepartmentId}
                    searchable={departmentOptions.length > 8}
                    placeholder="Select department"
                    options={departmentOptions.map((department: any) => ({
                      value: department.id,
                      label: department.name,
                    }))}
                  />
                </FormField>
                <FormField label="Doctor" required>
                  <SearchableSelect
                    required
                    value={doctorId}
                    onChange={setDoctorId}
                    disabled={apiSession && doctors.length === 0}
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
                </FormField>
                <FormField label="Visit Type" required>
                  <SearchableSelect
                    required
                    value={appointmentType}
                    onChange={setAppointmentType}
                    searchable={false}
                    options={visit_type_options}
                  />
                </FormField>
                <FormField label="Appointment Date" required>
                  <Input
                    required
                    type="date"
                    value={appointmentDate}
                    onChange={(e: any) => setAppointmentDate(e.target.value)}
                  />
                </FormField>
                <SourceReferralFields
                  apiSession={apiSession}
                  patients={patients}
                  source={acquisitionSource}
                  onSourceChange={setAcquisitionSource}
                  referrerName={referrerName}
                  referrerPatientId={referrerPatientId}
                  onReferrerChange={(name: string, patientId: string) => {
                    setReferrerName(name);
                    setReferrerPatientId(patientId);
                  }}
                />
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
              </section>
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
                    <FormField label="Consultation Price (₹)">
                      <Input
                        type="number"
                        min={0}
                        value={customFee}
                        onChange={(e: any) => setCustomFee(e.target.value)}
                        placeholder="Set price for this visit"
                      />
                    </FormField>
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
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                  Consultation time will be auto-assigned from the doctor's
                  schedule when you save.
                </div>
              )}
              <details className="group rounded-xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="block text-xs font-bold text-slate-800">
                      Optional intake details
                    </span>
                    <span className="mt-0.5 block text-[10px] text-slate-500">
                      Vitals and complaints can be added now or during consultation.
                    </span>
                  </span>
                  <span className="text-xs font-bold text-emerald-700 group-open:hidden">
                    Add details
                  </span>
                  <span className="hidden text-xs font-bold text-emerald-700 group-open:inline">
                    Hide
                  </span>
                </summary>
                <div className="grid gap-3 border-t border-slate-200 bg-slate-50/50 p-4 md:grid-cols-3">
                  <div className="md:col-span-3">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-700">Vital Signs</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">Optional measurements can be captured now and reused in consultation.</p>
                  </div>
                  <FormField label="BP">
                    <Input
                      value={intakeBp}
                      onChange={(e: any) => setIntakeBp(e.target.value)}
                      placeholder="120/80 mmHg"
                    />
                    <IntakeSuggestionChip
                      value={previousIntake?.bp}
                      currentValue={intakeBp}
                      onApply={() => setIntakeBp(previousIntake!.bp)}
                    />
                  </FormField>

                  <FormField label="Pulse / PR">
                    <Input
                      value={intakePulse}
                      onChange={(e: any) => setIntakePulse(e.target.value)}
                      placeholder="78 bpm"
                    />
                    <IntakeSuggestionChip
                      value={previousIntake?.pulse}
                      currentValue={intakePulse}
                      onApply={() => setIntakePulse(previousIntake!.pulse)}
                    />
                  </FormField>

                  <FormField label="SpO2">
                    <Input
                      value={intakeSpo2}
                      onChange={(e: any) => setIntakeSpo2(e.target.value)}
                      placeholder="98%"
                    />
                    <IntakeSuggestionChip
                      value={previousIntake?.spo2}
                      currentValue={intakeSpo2}
                      onApply={() => setIntakeSpo2(previousIntake!.spo2)}
                    />
                  </FormField>

                  <FormField label="Temp">
                    <Input
                      value={intakeTemp}
                      onChange={(e: any) => setIntakeTemp(e.target.value)}
                      placeholder="98.6°F"
                    />
                    <IntakeSuggestionChip
                      value={previousIntake?.temp}
                      currentValue={intakeTemp}
                      onApply={() => setIntakeTemp(previousIntake!.temp)}
                    />
                  </FormField>

                  <FormField label="Height">
                    <Input
                      value={intakeHeight}
                      onChange={(e: any) => setIntakeHeight(e.target.value)}
                      placeholder="170cm"
                    />
                    <IntakeSuggestionChip
                      value={previousIntake?.height}
                      currentValue={intakeHeight}
                      onApply={() => setIntakeHeight(previousIntake!.height)}
                    />
                  </FormField>

                  <FormField label="Weight">
                    <Input
                      value={intakeWeight}
                      onChange={(e: any) => setIntakeWeight(e.target.value)}
                      placeholder="65kg"
                    />
                    <IntakeSuggestionChip
                      value={previousIntake?.weight}
                      currentValue={intakeWeight}
                      onApply={() => setIntakeWeight(previousIntake!.weight)}
                    />
                  </FormField>

                  {/* Auto-calculated BMI – only shown when height & weight are available */}
                  {(() => {
                    const heightNum = parseFloat(
                      String(intakeHeight).replace(/[^\d.]/g, ""),
                    );
                    const weightNum = parseFloat(
                      String(intakeWeight).replace(/[^\d.]/g, ""),
                    );

                    // Assume height in cm if > 3, otherwise metres
                    const heightM =
                      heightNum > 3
                        ? heightNum / 100
                        : heightNum > 0
                          ? heightNum
                          : 0;

                    if (!heightM || !weightNum || weightNum <= 0) return null;

                    const bmi = weightNum / (heightM * heightM);
                    if (!Number.isFinite(bmi) || bmi <= 0) return null;

                    return (
                      <FormField label="BMI">
                        <Input value={bmi.toFixed(1)} readOnly disabled />
                      </FormField>
                    );
                  })()}

                  <div className="md:col-span-3">
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
                    {previousIntake?.complaints &&
                      previousIntake.complaints !== intakeComplaints && (
                        <button
                          type="button"
                          onClick={() =>
                            setIntakeComplaints(previousIntake!.complaints)
                          }
                          className="mt-1 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100"
                        >
                          Use previous complaints
                        </button>
                      )}
                  </div>
                </div>
              </details>
              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                <Button
                  disabled={busy || !hasAvailableDoctor}
                  className="h-10 px-5 py-0 text-xs"
                >
                  <ButtonLoader loading={busy}>
                    {busy ? "Booking..." : "Save & Generate Token"}
                  </ButtonLoader>
                </Button>
                <button
                  type="button"
                  onClick={closeBooking}
                  className="secondary-action h-10 text-xs"
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
                selectedPatient?.full_name || booked.appointment?.patient || "-"
              }
            />
            <Info
              label="Visit ID"
              value={
                booked.appointment?.appointment_number ||
                booked.appointment?.appointmentNumber ||
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

          {/* Token Slip */}
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
                Visit ID:{" "}
                {booked.appointment?.appointment_number ||
                  booked.appointment?.appointmentNumber ||
                  "-"}
              </span>
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

          {/* Optional Intake Summary */}
          {(intakeHeight ||
            intakeBp ||
            intakeWeight ||
            intakeComplaints ||
            intakeSpo2 ||
            intakePulse ||
            intakeTemp) && (
            <PatientIntakeSummary
              bp={intakeBp}
              pulse={intakePulse}
              spo2={intakeSpo2}
              temp={intakeTemp}
              height={intakeHeight}
              weight={intakeWeight}
              complaints={intakeComplaints}
            />
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={printTokenSlip}
              className="close-button font-bold"
            >
              Print Token
            </button>
            <Button onClick={closeBooking}>Close</Button>
            <Button onClick={openBookedAppointment} className="save-button">
              Continue to Consultation
            </Button>
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
