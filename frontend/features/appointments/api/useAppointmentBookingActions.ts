"use client";

import type { MutableRefObject } from "react";
import { apiFetch, type ApiSession } from "@/lib/api";
import { generatePatientId, generateToken } from "@/lib/hmsLogic";

interface IntakeVitals {
  intakeBp: string;
  intakePulse: string;
  intakeSpo2: string;
  intakeTemp: string;
  intakeHeight: string;
  intakeWeight: string;
}

// Temp/Height/Weight are captured as separate inputs for a cleaner form, but
// merged into the same free-text intake_vitals field the backend already
// stores (consistent with how BP/Pulse are already recorded there).
// Keys here must match the aliases the consultation page's vitals grid
// looks up (BP/Pulse/Spo2/Temp/Height/Weight) so everything filled in at
// booking actually shows up pre-filled on the consultation page.
function combinedIntakeVitals(vitals: IntakeVitals) {
  return [
    vitals.intakeBp.trim() && `BP=${vitals.intakeBp.trim()}`,
    vitals.intakePulse.trim() && `Pulse=${vitals.intakePulse.trim()}`,
    vitals.intakeSpo2.trim() && `Spo2=${vitals.intakeSpo2.trim()}`,
    vitals.intakeTemp.trim() && `Temp=${vitals.intakeTemp.trim()}`,
    vitals.intakeHeight.trim() && `Height=${vitals.intakeHeight.trim()}`,
    vitals.intakeWeight.trim() && `Weight=${vitals.intakeWeight.trim()}`,
  ]
    .filter(Boolean)
    .join(", ");
}

interface UseAppointmentBookingActionsArgs {
  apiSession: ApiSession | null;
  isSuperAdmin: boolean;
  clinic: any;
  branchId: string;
  departmentId: string;
  doctorId: string;
  doctor: any;
  patients: any[];
  setPatients: (value: any[]) => void;
  appointments: any[];
  setAppointments: (value: any[]) => void;
  selectedPatient: any;
  setSelectedPatient: (value: any) => void;
  appointmentType:
    | "op"
    | "follow_up"
    | "doctor_review"
    | "fitness_certificate"
    | "emergency";
  appointmentDate: string;
  acquisitionSource: string;
  referrerPatientId: string;
  referrerName: string;
  isBillable: boolean;
  customFee: string;
  billingNote: string;
  emergencyReason: string;
  intakeComplaints: string;
  vitals: IntakeVitals;
  supportsCustomFee: boolean;
  loadLiveData: (session: ApiSession) => Promise<void>;
  setListRefreshKey: (updater: (current: number) => number) => void;
  setMessage: (message: string) => void;
  setBusy: (busy: boolean) => void;
  setBooked: (value: any) => void;
  setBookingStep: (step: "appointment" | "newPatient" | "success") => void;
  setPatientSearch: (value: string) => void;
  setPatientLookupOpen: (value: boolean) => void;
  setLiveMatches: (value: any[]) => void;
  bookingInFlightRef: MutableRefObject<boolean>;
}

export function useAppointmentBookingActions({
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
  vitals,
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
}: UseAppointmentBookingActionsArgs) {
  async function refreshAppointmentList() {
    if (!apiSession) return;
    if (isSuperAdmin) {
      setListRefreshKey((current) => current + 1);
      return;
    }
    await loadLiveData(apiSession);
  }

  async function savePatient(data: any) {
    setBusy(true);
    setMessage("");
    try {
      const patientBranchId = data.branchId || branchId;
      if (apiSession) {
        const duplicateRows = await apiFetch(
          "/patients/duplicates",
          apiSession,
          {
            method: "POST",
            body: JSON.stringify({
              branch_id: patientBranchId,
              full_name: data.fullName,
              date_of_birth: data.dateOfBirth || null,
              gender: data.gender || "unknown",
              mobile: data.mobile || null,
              guardian_name: data.guardianName || null,
              guardian_mobile: data.guardianMobile || null,
              area: data.area || null,
            }),
          },
        );
        const highConfidenceDuplicates = duplicateRows.filter(
          (row: any) => row.confidence === "high",
        );
        if (highConfidenceDuplicates.length > 0) {
          setLiveMatches(highConfidenceDuplicates);
          setPatientSearch(data.fullName || data.mobile || "");
          setPatientLookupOpen(true);
          setBookingStep("appointment");
          setMessage(
            "Possible duplicate patient found. Please select the existing patient or verify before creating a new record.",
          );
          return;
        }
        const saved = await apiFetch("/patients", apiSession, {
          method: "POST",
          body: JSON.stringify({
            branch_id: patientBranchId,
            full_name: data.fullName,
            date_of_birth: data.dateOfBirth || null,
            gender: data.gender || "unknown",
            mobile: data.mobile || null,
            alternate_mobile: data.alternateMobile || null,
            email: data.email || null,
            guardian_name: data.guardianName || null,
            guardian_mobile: data.guardianMobile || null,
            area: data.area || null,
            address: data.address || null,
            blood_group: data.bloodGroup || null,
          }),
        });
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
          name: data.fullName,
          age: data.ageYears ? Number(data.ageYears) : 0,
          gender: data.gender,
          mobile: data.mobile,
          guardian: data.guardianName,
          guardianMobile: data.guardianMobile,
          area: data.area,
          blood: data.bloodGroup || "",
          email: data.email,
          alternateMobile: data.alternateMobile,
          address: data.address,
          allergies: "",
          medicalHistory: "",
          status: "Active",
          patientType: "OP",
        };
        setPatients([...patients, patient]);
        setSelectedPatient({
          id: patient.id,
          full_name: patient.name,
          mobile: patient.mobile,
        });
      }
      setPatientSearch("");
      setPatientLookupOpen(false);
      setBookingStep("appointment");
    } catch (err: any) {
      setMessage(err.message || "Could not save patient.");
    } finally {
      setBusy(false);
    }
  }

  async function bookAppointment() {
    if (bookingInFlightRef.current) return;
    if (!selectedPatient) return;
    if (!branchId || !departmentId || !appointmentDate) {
      setMessage("Branch, department, and appointment date are required.");
      return;
    }
    if (!doctorId) {
      setMessage(
        "Select a doctor before booking. If the dropdown is empty, map a doctor to this tenant, branch, and department.",
      );
      return;
    }
    if (acquisitionSource === "referral" && !referrerName.trim()) {
      setMessage("Enter or select a referrer name.");
      return;
    }
    bookingInFlightRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (apiSession) {
        const result = await apiFetch("/appointments", apiSession, {
          method: "POST",
          body: JSON.stringify({
            branch_id: branchId,
            patient_id: selectedPatient.id,
            department_id: departmentId,
            practitioner_id: doctorId,
            appointment_type: appointmentType,
            appointment_date: appointmentDate,
            appointment_time: null,
            acquisition_source: acquisitionSource,
            referrer_patient_id: referrerPatientId || null,
            referrer_name:
              acquisitionSource === "referral" ? referrerName.trim() : null,
            reason:
              appointmentType === "follow_up" ||
              appointmentType === "doctor_review"
                ? "Doctor review appointment booked from MedizinHub HMS"
                : appointmentType === "fitness_certificate"
                  ? "Fitness certificate consultation booked from MedizinHub HMS"
                  : "OP appointment booked from MedizinHub HMS",
            visit_purpose:
              appointmentType === "fitness_certificate"
                ? "fitness_certificate"
                : appointmentType === "doctor_review" ||
                    appointmentType === "follow_up"
                  ? "doctor_review"
                  : "consultation",
            is_billable: isBillable,
            custom_fee_amount:
              supportsCustomFee && isBillable && customFee !== ""
                ? Number(customFee)
                : null,
            billing_note: billingNote || null,
            emergency_reason:
              appointmentType === "emergency"
                ? emergencyReason || "Emergency override from reception"
                : null,
            intake_vitals: combinedIntakeVitals(vitals) || null,
            intake_complaints: intakeComplaints.trim() || null,
            created_by_user_id: apiSession.user?.id || null,
          }),
        });
        await loadLiveData(apiSession);
        if (isSuperAdmin) setListRefreshKey((current) => current + 1);
        setBooked(result);
      } else {
        const dayCount = appointments.filter(
          (item: any) =>
            item.appointmentDate === appointmentDate &&
            item.branchId === branchId,
        ).length;
        const token = generateToken(departmentId, "Normal", dayCount);
        const appointment = {
          id: `A${appointments.length + 1}`,
          clinicId: clinic.id,
          branchId,
          token,
          tokenType: "Normal",
          priority: appointmentType === "emergency" ? 1 : 2,
          patientId: selectedPatient.id,
          patient: selectedPatient.full_name,
          departmentId,
          doctorId: doctor?.id,
          doctor: doctor?.name,
          appointmentDate,
          acquisitionSource,
          referrerPatientId:
            acquisitionSource === "referral" ? referrerPatientId : "",
          referrerName:
            acquisitionSource === "referral" ? referrerName.trim() : "",
          time: appointmentType === "emergency" ? "Emergency" : appointmentDate,
          status: "scheduled",
          queueStatus: "waiting",
          visitType:
            appointmentType === "follow_up" ||
            appointmentType === "doctor_review"
              ? "Doctor Review"
              : appointmentType === "fitness_certificate"
                ? "Fitness Certificate"
                : appointmentType === "emergency"
                  ? "Emergency"
                  : "OP",
        };
        setAppointments([...appointments, appointment]);
        setBooked({ appointment, queue_entry: { token_number: token } });
      }
      setBookingStep("success");
    } catch (err: any) {
      setMessage(err.message || "Could not book appointment.");
    } finally {
      bookingInFlightRef.current = false;
      setBusy(false);
    }
  }

  return {
    refreshAppointmentList,
    savePatient,
    bookAppointment,
  };
}
