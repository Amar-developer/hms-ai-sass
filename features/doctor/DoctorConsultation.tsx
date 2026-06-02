"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  UserRoundCheck,
  UsersRound,
  Video,
} from "lucide-react";
import { Badge, Button, Card, Field, Input, Select, StatusToast } from "@/components/ui";
import { FormField } from "@/components/FormElements";
import {
  SearchPicker,
  TagEntryBox,
  medicineDurationOptions,
  medicineFrequencyOptions,
  medicineInstructionOptions,
} from "@/components/clinicalRows";
import { apiFetch } from "@/lib/api";
import { calculateConsultationCharge, sortQueue } from "@/lib/hmsLogic";
import { humanizeOptionLabel } from "@/lib/options";

function displayTime(value: any) {
  const raw = String(value || "").slice(0, 5);
  const [hourText, minuteText = "00"] = raw.split(":");
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return raw || "-";
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minuteText.padStart(2, "0")} ${period}`;
}

function displayDate(value: any) {
  if (!value) return "Today";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function toneForQueue(status: string) {
  if (["Emergency Queue", "emergency"].includes(status)) return "red";
  if (["Called", "in_consultation"].includes(status)) return "blue";
  if (["Completed", "Done"].includes(status)) return "green";
  return "amber";
}

function statusKey(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
}

function appointmentDateKey(row: any) {
  return String(row.appointmentDate || row.appointment_date || "").slice(0, 10);
}

function isWaitingAppointment(row: any) {
  const status = statusKey(row.status);
  const queue = statusKey(row.queueStatus || row.queue_status);
  return (
    [
      "scheduled",
      "confirmed",
      "checked_in",
      "waiting",
      "called",
      "patient_not_available",
      "requeued",
      "in_consultation",
      "in_queue",
      "emergency_queue",
    ].includes(status) ||
    [
      "scheduled",
      "confirmed",
      "checked_in",
      "waiting",
      "called",
      "patient_not_available",
      "requeued",
      "in_consultation",
      "in_queue",
      "emergency_queue",
    ].includes(queue)
  );
}

function isCompletedAppointment(row: any) {
  const status = statusKey(row.status);
  const queue = statusKey(row.queueStatus || row.queue_status);
  const consultation = statusKey(
    row.consultationStatus || row.consultation_status,
  );
  return (
    [
      "consultation_completed",
      "billed",
      "consultation_done",
      "seen",
      "completed",
      "done",
    ].includes(status) ||
    [
      "consultation_completed",
      "billed",
      "consultation_done",
      "seen",
      "completed",
      "done",
    ].includes(queue) ||
    consultation === "signed"
  );
}

function isCancelledAppointment(row: any) {
  const status = statusKey(row.status);
  const queue = statusKey(row.queueStatus || row.queue_status);
  return (
    ["cancelled", "canceled", "no_show"].includes(status) ||
    ["cancelled", "canceled", "no_show"].includes(queue)
  );
}

function asArray(value: any) {
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
}

export function DoctorConsultation({
  clinic,
  branch,
  branchId,
  departmentId,
  allowedDepartments = [],
  patients,
  scopedAppointments,
  appointments,
  setAppointments,
  apiSession,
  loadLiveData,
  livePractitioners = [],
  doctorScope = null,
  view = "dashboard",
  setActive,
}: any) {
  const isDoctorUser = Boolean(
    apiSession?.user?.user_type === "doctor" ||
    apiSession?.user?.roles?.includes("doctor"),
  );
  const [scopedPractitioners, setScopedPractitioners] = useState<any[]>([]);
  const practitionerSource = scopedPractitioners.length
    ? scopedPractitioners
    : livePractitioners;
  const departmentNameById = new Map(
    (allowedDepartments || []).map((department: any) => [
      department.id,
      department.name,
    ]),
  );
  const allDoctorList: any[] = Object.values(
    [
      ...practitionerSource.map((practitioner: any) => ({
        doctorId: practitioner.id,
        doctor: practitioner.full_name || practitioner.name,
        departmentName:
          practitioner.primary_specialty ||
          departmentNameById.get((practitioner.department_ids || [])[0]) ||
          "",
        departmentId: (practitioner.department_ids || [])[0] || departmentId,
        departmentIds: practitioner.department_ids || [],
        branchIds: practitioner.branch_ids || [],
      })),
      ...scopedAppointments,
    ].reduce((acc: any, appointment: any) => {
      const id = appointment.doctorId || appointment.practitioner_id;
      if (!id) return acc;
      const existing = acc[id] || {};
      acc[id] = {
        id,
        name:
          appointment.doctor ||
          appointment.practitioner_name ||
          existing.name ||
          id,
        specialty:
          appointment.departmentName ||
          existing.specialty ||
          appointment.departmentId ||
          "",
        departmentIds: Array.from(
          new Set(
            [
              ...asArray(existing.departmentIds),
              ...asArray(appointment.departmentIds),
              appointment.departmentId,
            ].filter(Boolean),
          ),
        ),
        branchIds: Array.from(
          new Set(
            [...asArray(existing.branchIds), appointment.branchId].filter(
              Boolean,
            ),
          ),
        ),
      };
      return acc;
    }, {}),
  );
  const doctorList = allDoctorList.filter((doctor: any) => {
    if (doctorScope?.practitionerId)
      return doctor.id === doctorScope.practitionerId;
    const branchIds = asArray(doctor.branchIds);
    const departmentIds = asArray(doctor.departmentIds);
    return (
      (!branchId || branchIds.length === 0 || branchIds.includes(branchId)) &&
      (!departmentId ||
        departmentIds.length === 0 ||
        departmentIds.includes(departmentId))
    );
  });
  const practitioners = doctorList.map((doctor: any) => ({
    ...doctor,
    role: "Doctor",
  }));
  const [medicineCatalog, setMedicineCatalog] = useState<any[]>([]);
  const [labCatalog, setLabCatalog] = useState<any[]>([]);
  const scanCatalog: any[] = [];
  const [doctorId, setDoctorId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : sessionStorage.getItem("medizinhub.consultationDoctorId") || "",
  );
  const [selectedAppointmentId, setSelectedAppointmentId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : sessionStorage.getItem("medizinhub.consultationAppointmentId") || "",
  );
  const [tick, setTick] = useState(0);
  const [feeType, setFeeType] = useState("OP");
  const [treatmentType, setTreatmentType] = useState("general_consultation");
  const [ipBaseAmount, setIpBaseAmount] = useState(10000);
  const [extraFee, setExtraFee] = useState(0);
  const [notes, setNotes] = useState("");
  const [remarks, setRemarks] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [prescription, setPrescription] = useState("");
  const [vitals, setVitals] = useState("");
  const [complaints, setComplaints] = useState("");
  const [diagnosisRows, setDiagnosisRows] = useState("");
  const [medicineItems, setMedicineItems] = useState<any[]>([]);
  const [referralItems, setReferralItems] = useState<any[]>([]);
  const medicineRows = medicineItems
    .map((m: any) =>
      [m.name, m.dosage, m.frequency, m.duration, m.instructions]
        .map((s: any) => String(s || "").trim())
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n");
  const referralRows = referralItems
    .map((r: any) =>
      [r.type, r.name, r.priority, r.instructions]
        .map((s: any) => String(s || "").trim())
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n");
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [medicineDosage, setMedicineDosage] = useState("");
  const [medicineFrequency, setMedicineFrequency] = useState("1-0-1");
  const [medicineDuration, setMedicineDuration] = useState("3 days");
  const [medicineInstructions, setMedicineInstructions] =
    useState("After food");
  const [selectedLabTestId, setSelectedLabTestId] = useState("");
  const [labPriority, setLabPriority] = useState("routine");
  const [labInstructions, setLabInstructions] = useState("");
  const [templates, setTemplates] = useState<any[]>([]);
  const [addendumNote, setAddendumNote] = useState("");
  const [medicineAmount, setMedicineAmount] = useState(250);
  const [labNeeded, setLabNeeded] = useState(false);
  const [admissionNeeded, setAdmissionNeeded] = useState(false);
  const [labTests, setLabTests] = useState("");
  const [scanNeeded, setScanNeeded] = useState(false);
  const [scanTests, setScanTests] = useState("");
  const [referDoctor, setReferDoctor] = useState(false);
  const [referDoctorId, setReferDoctorId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const [dashboardFilter, setDashboardFilter] = useState<
    "booked" | "waiting" | "completed" | "seen"
  >("booked");
  const [selectedPatientDetail, setSelectedPatientDetail] = useState<any>(null);
  useEffect(() => {
    if (!apiSession?.token) return;
    if (doctorScope?.practitionerId) {
      setScopedPractitioners([]);
      return;
    }
    const params = new URLSearchParams();
    if (branchId) params.set("branch_id", branchId);
    if (departmentId) params.set("department_id", departmentId);
    apiFetch(
      `/practitioners${params.toString() ? `?${params}` : ""}`,
      apiSession,
    )
      .then((rows: any) =>
        setScopedPractitioners(Array.isArray(rows) ? rows : []),
      )
      .catch(() => setScopedPractitioners([]));
  }, [
    apiSession?.token,
    apiSession?.tenantId,
    branchId,
    departmentId,
    doctorScope?.practitionerId,
  ]);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 5000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const scopedDoctorId = doctorScope?.practitionerId || "";
    const selectedAppointment = scopedAppointments.find(
      (appointment: any) => appointment.id === selectedAppointmentId,
    );
    const selectedAppointmentDoctorId =
      selectedAppointment?.doctorId ||
      selectedAppointment?.practitioner_id ||
      "";
    const selectedAppointmentDepartmentId =
      selectedAppointment?.departmentId ||
      selectedAppointment?.department_id ||
      "";
    const selectedAppointmentDoctorAvailable = doctorList.some(
      (doctor: any) => doctor.id === selectedAppointmentDoctorId,
    );
    const selectedAppointmentFits = Boolean(
      selectedAppointment &&
      selectedAppointmentDoctorId &&
      selectedAppointmentDoctorAvailable &&
      (doctorScope?.practitionerId ||
        !departmentId ||
        !selectedAppointmentDepartmentId ||
        selectedAppointmentDepartmentId === departmentId),
    );
    const nextDoctorId =
      scopedDoctorId ||
      (selectedAppointmentFits ? selectedAppointmentDoctorId : "") ||
      doctorList.find((doctor: any) => doctor.id === doctorId)?.id ||
      doctorList[0]?.id ||
      "";
    if (nextDoctorId !== doctorId) {
      const keepSelection = Boolean(
        selectedAppointment &&
        (doctorScope?.practitionerId ||
          !departmentId ||
          !selectedAppointmentDepartmentId ||
          selectedAppointmentDepartmentId === departmentId) &&
        selectedAppointmentDoctorId === nextDoctorId,
      );
      setDoctorId(nextDoctorId);
      if (nextDoctorId) {
        sessionStorage.setItem("medizinhub.consultationDoctorId", nextDoctorId);
      }
      if (selectedAppointment && !keepSelection) setSelectedAppointmentId("");
    }
  }, [
    doctorId,
    doctorScope?.practitionerId,
    departmentId,
    branchId,
    doctorList.length,
    selectedAppointmentId,
    scopedAppointments.length,
  ]);
  const doctor: any = doctorList.find((p: any) => p.id === doctorId) ||
    doctorList[0] || { id: "", name: "No practitioner", specialty: "" };
  const feeSetting = null;
  const consultationCharge = calculateConsultationCharge(
    feeSetting,
    feeType,
    ipBaseAmount,
  );
  const doctorQueue = sortQueue(
    scopedAppointments.filter((a: any) => {
      if (doctorScope?.practitionerId)
        return (
          a.doctorId === doctorScope.practitionerId ||
          a.practitioner_id === doctorScope.practitionerId
        );
      if (departmentId && a.departmentId !== departmentId) return false;
      if (doctor.id)
        return a.doctorId === doctor.id || a.practitioner_id === doctor.id;
      return true;
    }),
  );
  const selectedDateQueue = doctorQueue.filter(
    (a: any) => appointmentDateKey(a) === selectedDate,
  );
  const activeQueue = selectedDateQueue.filter(
    (a: any) => !isCompletedAppointment(a) && !isCancelledAppointment(a),
  );
  const current =
    activeQueue.find((a: any) => statusKey(a.queueStatus) === "called") ||
    activeQueue.find(
      (a: any) => statusKey(a.queueStatus) === "emergency_queue",
    ) ||
    activeQueue.find(
      (a: any) =>
        statusKey(a.queueStatus) === "waiting" ||
        statusKey(a.queueStatus) === "in_queue",
    ) ||
    activeQueue.find((a: any) => statusKey(a.queueStatus) === "requeued") ||
    activeQueue[0];
  const selected =
    doctorQueue.find((a: any) => a.id === selectedAppointmentId) || current;
  useEffect(() => {
    if (selected?.treatmentType) setTreatmentType(selected.treatmentType);
    else if (
      selected?.visitPurpose === "fitness_certificate" ||
      selected?.visitType === "FITNESS CERTIFICATE"
    )
      setTreatmentType("fitness_certificate");
    else if (
      selected?.visitPurpose === "doctor_review" ||
      selected?.visitType === "DOCTOR REVIEW"
    )
      setTreatmentType("doctor_review");
    else setTreatmentType("general_consultation");
    setVitals(selected?.intakeVitals || "");
    setComplaints(selected?.intakeComplaints || "");
    setDiagnosisRows("");
    setMedicineItems([]);
    setReferralItems([]);
    setNotes("");
    setRemarks("");
    setDiagnosis("");
    setPrescription("");
    setLabNeeded(false);
    setLabTests("");
    setScanNeeded(false);
    setScanTests("");
  }, [selected?.id]);
  async function resolveSelectedConsultationId() {
    if (!apiSession || !selected?.id) return "";
    if (selected.consultationId) return selected.consultationId;
    const rows = await apiFetch(
      `/consultations?appointment_id=${encodeURIComponent(selected.id)}`,
      apiSession,
    );
    return rows?.[0]?.id || "";
  }

  useEffect(() => {
    if (!selected?.id || !apiSession) return;
    let alive = true;
    async function loadConsultationData() {
      try {
        const consultationId = await resolveSelectedConsultationId();
        if (!consultationId) return;
        const detail = await apiFetch(
          `/consultations/${consultationId}`,
          apiSession,
        );
        if (!alive) return;
        const c = detail.consultation;
        if (c.treatment_type) setTreatmentType(c.treatment_type);
        setNotes(c.clinical_notes || "");
        setRemarks(c.follow_up_advice || "");
        setDiagnosis(c.diagnosis || "");
        if (detail.vitals?.length) {
          setVitals(
            detail.vitals
              .map(
                (v: any) => `${v.name}=${v.value}${v.unit ? " " + v.unit : ""}`,
              )
              .join(", "),
          );
        }
        if (detail.complaints?.length) {
          setComplaints(
            detail.complaints
              .map((r: any) =>
                [r.complaint, r.duration, r.severity]
                  .filter(Boolean)
                  .join(" | "),
              )
              .join("\n"),
          );
        }
        if (detail.diagnoses?.length) {
          setDiagnosisRows(
            detail.diagnoses
              .map((r: any) =>
                [r.diagnosis, r.diagnosis_type, r.notes]
                  .filter(Boolean)
                  .join(" | "),
              )
              .join("\n"),
          );
        }
        if (detail.medicines?.length) {
          setMedicineItems(
            detail.medicines.map((r: any) => ({
              name: r.medicine_name || "",
              dosage: r.dosage || "",
              frequency: r.frequency || "",
              duration: r.duration || "",
              instructions: r.instructions || "",
            })),
          );
        } else if (c.prescription_text) {
          setMedicineItems(
            String(c.prescription_text || "")
              .split(/\n|,\s+(?=[A-Za-z])/)
              .map((l: string) => l.trim())
              .filter(Boolean)
              .map((line: string) => {
                const [
                  name = "",
                  dosage = "",
                  frequency = "",
                  duration = "",
                  instructions = "",
                ] = line.split(/\s*\|\s*/);
                return { name, dosage, frequency, duration, instructions };
              }),
          );
        }
        if (detail.referrals?.length) {
          setReferralItems(
            detail.referrals.map((r: any) => ({
              type: r.referral_type || "lab",
              name: r.item_name || "",
              priority: r.priority || "routine",
              instructions: r.instructions || "",
            })),
          );
          const labRefs = detail.referrals.filter(
            (r: any) => r.referral_type === "lab",
          );
          if (labRefs.length) {
            setLabNeeded(true);
            setLabTests(labRefs.map((r: any) => r.item_name).join(", "));
          }
          const scanRefs = detail.referrals.filter(
            (r: any) => r.referral_type === "scan",
          );
          if (scanRefs.length) {
            setScanNeeded(true);
            setScanTests(scanRefs.map((r: any) => r.item_name).join(", "));
          }
        } else {
          if (c.lab_referral_text) {
            setLabNeeded(true);
            setLabTests(c.lab_referral_text);
          }
          if (c.scan_referral_text) {
            setScanNeeded(true);
            setScanTests(c.scan_referral_text);
          }
        }
      } catch {
        // silently ignore — form stays blank, user can re-enter
      }
    }
    loadConsultationData();
    return () => {
      alive = false;
    };
  }, [selected?.id, selected?.consultationId, apiSession?.token]);
  const selectedPatientId =
    selected?.patientId ||
    selected?.patient_id ||
    selected?.patientID ||
    selected?.patient?.id ||
    "";
  const localPatient = patients.find((p: any) => p.id === selectedPatientId);
  const patient =
    localPatient ||
    (selectedPatientDetail?.id === selectedPatientId
      ? selectedPatientDetail
      : null) ||
    (selectedPatientId
      ? {
          id: selectedPatientId,
          full_name: selected?.patient_name || selected?.patient || "",
          name: selected?.patient_name || selected?.patient || "",
        }
      : null);
  useEffect(() => {
    let alive = true;
    async function loadSelectedPatient() {
      if (!apiSession || !selectedPatientId || localPatient) {
        if (!selectedPatientId && alive) setSelectedPatientDetail(null);
        return;
      }
      try {
        const detail = await apiFetch(
          `/patients/${selectedPatientId}`,
          apiSession,
        );
        if (alive) setSelectedPatientDetail(detail);
      } catch {
        if (alive) setSelectedPatientDetail(null);
      }
    }
    loadSelectedPatient();
    return () => {
      alive = false;
    };
  }, [selectedPatientId, Boolean(localPatient), apiSession?.token]);
  const completedToday = selectedDateQueue.filter(
    isCompletedAppointment,
  ).length;
  const waitingToday = selectedDateQueue.filter(
    (a: any) =>
      isWaitingAppointment(a) &&
      !isCompletedAppointment(a) &&
      !isCancelledAppointment(a),
  ).length;
  const finalFee =
    Number(consultationCharge || selected?.fee || 0) + Number(extraFee || 0);
  const emergencyToday = selectedDateQueue.filter(
    (a: any) =>
      !isCompletedAppointment(a) &&
      !isCancelledAppointment(a) &&
      (a.tokenType === "Emergency" ||
        statusKey(a.queueStatus) === "emergency_queue" ||
        String(a.visitType || "").toLowerCase() === "emergency"),
  ).length;
  const uniquePatientCount = new Set(
    selectedDateQueue
      .filter(isCompletedAppointment)
      .map((a: any) => a.patientId || a.patient_id)
      .filter(Boolean),
  ).size;
  const appointmentDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    const count = doctorQueue.filter(
      (a: any) =>
        String(a.appointmentDate || a.appointment_date || "").slice(0, 10) ===
          iso &&
        !isCompletedAppointment(a) &&
        !isCancelledAppointment(a),
    ).length;
    return {
      iso,
      day: date.getDate(),
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      count,
    };
  });
  const scheduleRows = activeQueue
    .filter((a: any) => {
      if (dashboardFilter === "waiting")
        return (
          isWaitingAppointment(a) &&
          !isCompletedAppointment(a) &&
          !isCancelledAppointment(a)
        );
      return true;
    })
    .slice(0, 8);
  const appointmentListLabel =
    dashboardFilter === "waiting" ? "waiting" : "active";
  const selectedPatientHistory = selected
    ? appointments
        .filter((item: any) => {
          const itemPatientId = item.patientId || item.patient_id;
          const selectedDoctorId =
            selected.doctorId || selected.practitioner_id || doctorId;
          const itemDoctorId = item.doctorId || item.practitioner_id;
          const selectedDateKey = appointmentDateKey(selected);
          const itemDateKey = appointmentDateKey(item);
          return (
            itemPatientId &&
            itemPatientId === selectedPatientId &&
            item.id !== selected.id &&
            itemDoctorId &&
            selectedDoctorId &&
            itemDoctorId === selectedDoctorId &&
            isCompletedAppointment(item) &&
            (!selectedDateKey || !itemDateKey || itemDateKey < selectedDateKey)
          );
        })
        .slice(0, 5)
    : [];
  useEffect(() => {
    let alive = true;
    async function loadTemplates() {
      if (!apiSession) return;
      try {
        const rows = await apiFetch(
          `/consultations/by-department/${encodeURIComponent(departmentId)}/clinical-templates`,
          apiSession,
        );
        if (alive) setTemplates(rows);
      } catch {
        if (alive) setTemplates([]);
      }
    }
    loadTemplates();
    return () => {
      alive = false;
    };
  }, [apiSession?.token, apiSession?.tenantId, departmentId]);
  useEffect(() => {
    let alive = true;
    async function loadCatalogs() {
      if (!apiSession) return;
      try {
        const [medicines, tests] = await Promise.all([
          apiFetch("/pharmacy/medicines", apiSession).catch(() => []),
          apiFetch("/lab/catalog/tests", apiSession).catch(() => []),
        ]);
        if (alive) {
          setMedicineCatalog(medicines);
          setLabCatalog(tests);
          setSelectedMedicineId((value) => value || medicines[0]?.id || "");
          setSelectedLabTestId((value) => value || tests[0]?.id || "");
        }
      } catch {
        if (alive) {
          setMedicineCatalog([]);
          setLabCatalog([]);
        }
      }
    }
    loadCatalogs();
    return () => {
      alive = false;
    };
  }, [apiSession?.token, apiSession?.tenantId, branchId]);
  function updateAppt(id: string, patch: any) {
    setAppointments(
      appointments.map((a: any) => (a.id === id ? { ...a, ...patch } : a)),
    );
  }
  function splitRows(value: string) {
    return value
      .split("\n")
      .map((line: string) => line.trim())
      .filter(Boolean);
  }
  function appendLine(value: string, line: string) {
    return [...splitRows(value), line].join("\n");
  }
  function labTestNames(value: string) {
    return value
      .split(/,|\n/)
      .map((item: string) => item.trim())
      .filter(Boolean);
  }
  function labReferralSummary() {
    const labNames = structuredPayload()
      .referrals.filter((row: any) => row.referral_type === "lab")
      .map((row: any) => row.item_name);
    const manual = labNeeded ? labTestNames(labTests) : [];
    return Array.from(new Set([...labNames, ...manual])).join(", ");
  }
  function addMedicineRow(name: string, dosage = "") {
    const medicineName = String(name || "").trim();
    if (!medicineName) return;
    const row = {
      name: medicineName,
      dosage: dosage || medicineDosage,
      frequency: medicineFrequency,
      duration: medicineDuration,
      instructions: medicineInstructions,
    };
    setMedicineItems((items: any[]) => [...items, row]);
    const line = [
      row.name,
      row.dosage,
      row.frequency,
      row.duration,
      row.instructions,
    ]
      .map((part: any) => String(part || "").trim())
      .join(" | ");
    setPrescription((value: any) => appendLine(value, line));
    setSelectedMedicineId("");
    setMedicineDosage("");
  }
  function addMedicineSuggestion() {
    const med = medicineCatalog.find(
      (row: any) => row.id === selectedMedicineId,
    );
    if (med) addMedicineRow(med.name, medicineDosage || med.strength || "");
  }
  function addMedicineFromText(value: string, option?: any) {
    const med =
      option?.item ||
      medicineCatalog.find((row: any) => row.id === option?.value);
    addMedicineRow(med?.name || value, medicineDosage || med?.strength || "");
  }
  function addLabRow(name: string) {
    const testName = String(name || "").trim();
    if (!testName) return;
    setReferralItems((items: any[]) => {
      const exists = items.some(
        (item: any) =>
          item.type === "lab" &&
          String(item.name || "").toLowerCase() === testName.toLowerCase() &&
          String(item.priority || "") === String(labPriority || ""),
      );
      if (exists) return items;
      return [
        ...items,
        {
          type: "lab",
          name: testName,
          priority: labPriority,
          instructions: labInstructions,
        },
      ];
    });
    setLabNeeded(true);
    setLabTests((value: string) =>
      Array.from(new Set([...labTestNames(value), testName])).join(", "),
    );
    setSelectedLabTestId("");
    setLabInstructions("");
  }
  function addLabSuggestion() {
    const test = labCatalog.find((row: any) => row.id === selectedLabTestId);
    if (test) addLabRow(test.name);
  }
  function addLabFromText(value: string, option?: any) {
    const test =
      option?.item || labCatalog.find((row: any) => row.id === option?.value);
    addLabRow(test?.name || value);
  }
  function removeMedicineItem(index: number) {
    setMedicineItems((items: any[]) =>
      items.filter((_: any, i: number) => i !== index),
    );
  }
  function removeReferralItem(index: number) {
    setReferralItems((items: any[]) => {
      const removed = items[index];
      if (removed?.type === "lab") {
        setLabTests((value: string) =>
          labTestNames(value)
            .filter(
              (name: string) =>
                name.toLowerCase() !==
                String(removed.name || "")
                  .trim()
                  .toLowerCase(),
            )
            .join(", "),
        );
      }
      return items.filter((_: any, i: number) => i !== index);
    });
  }
  function structuredPayload() {
    return {
      vitals: vitals
        .split(",")
        .map((item: string) => item.trim())
        .filter(Boolean)
        .map((item: string) => {
          const [name, rest = ""] = item.split("=");
          const parts = rest.trim().split(" ");
          return {
            name: name.trim(),
            value: parts[0] || rest.trim(),
            unit: parts.slice(1).join(" ") || null,
          };
        })
        .filter((row: any) => row.name && row.value),
      complaints: splitRows(complaints)
        .map((line: string) => {
          const [complaint, duration, severity] = line
            .split("|")
            .map((part: string) => part.trim());
          return {
            complaint,
            duration: duration || null,
            severity: severity || null,
          };
        })
        .filter((row: any) => row.complaint),
      diagnoses: splitRows(diagnosisRows)
        .map((line: string) => {
          const [dx, type, dxNotes] = line
            .split("|")
            .map((part: string) => part.trim());
          return {
            diagnosis: dx,
            diagnosis_type: type || "primary",
            notes: dxNotes || null,
          };
        })
        .filter((row: any) => row.diagnosis),
      medicines: splitRows(medicineRows)
        .map((line: string) => {
          const [medicine_name, dosage, frequency, duration, instructions] =
            line.split("|").map((part: string) => part.trim());
          return {
            medicine_name,
            dosage: dosage || null,
            frequency: frequency || null,
            duration: duration || null,
            instructions: instructions || null,
          };
        })
        .filter((row: any) => row.medicine_name),
      referrals: splitRows(referralRows)
        .map((line: string) => {
          const [referral_type, item_name, priority, instructions] = line
            .split("|")
            .map((part: string) => part.trim());
          return {
            referral_type: referral_type || "lab",
            item_name,
            priority: priority || "routine",
            instructions: instructions || null,
          };
        })
        .filter((row: any) => row.item_name),
    };
  }
  async function callPatient(a: any) {
    if (apiSession && a.queueEntryId) {
      setBusy(true);
      setMessage("");
      try {
        await apiFetch(`/queue/${a.queueEntryId}/call`, apiSession, {
          method: "POST",
          body: JSON.stringify({ reason: "Called from doctor dashboard" }),
        });
        await loadLiveData(apiSession);
        setSelectedAppointmentId(a.id);
        setMessage("Token called in backend.");
      } catch (err: any) {
        setMessage(err.message || "Could not call patient.");
      } finally {
        setBusy(false);
      }
      return;
    }
    updateAppt(a.id, { queueStatus: "Called", status: "In Consultation" });
    setSelectedAppointmentId(a.id);
  }
  function callNext() {
    if (current) callPatient(current);
  }
  function openConsultation(id: string) {
    setSelectedAppointmentId(id);
    sessionStorage.setItem("medizinhub.consultationAppointmentId", id);
    const appointment = appointments.find((row: any) => row.id === id);
    const appointmentDoctorId =
      appointment?.doctorId || appointment?.practitioner_id || "";
    if (appointmentDoctorId) {
      setDoctorId(appointmentDoctorId);
      sessionStorage.setItem(
        "medizinhub.consultationDoctorId",
        appointmentDoctorId,
      );
    }
    setActive?.("consultation");
  }
  function openPatientDetails(patientId?: string) {
    const id =
      patientId || patient?.id || selected?.patientId || selected?.patient_id;
    if (!id) return;
    sessionStorage.setItem("medizinhub.patientId", id);
    setActive?.("patients");
  }
  function callNextInWorkspace() {
    const next = activeQueue.find((a: any) => a.id !== selected?.id) || current;
    if (!next) return;
    callPatient(next);
    openConsultation(next.id);
  }
  async function skipPatient() {
    if (!selected) return;
    if (apiSession && selected.queueEntryId) {
      setBusy(true);
      setMessage("");
      try {
        await apiFetch(
          `/queue/${selected.queueEntryId}/mark-not-available`,
          apiSession,
          {
            method: "POST",
            body: JSON.stringify({
              reason: "Patient not present from doctor dashboard",
            }),
          },
        );
        await loadLiveData(apiSession);
        setMessage("Patient marked not available.");
      } catch (err: any) {
        setMessage(err.message || "Could not update token.");
      } finally {
        setBusy(false);
      }
      return;
    }
    updateAppt(selected.id, {
      status: "Patient Not Available",
      queueStatus: "Not Available",
      skippedCount: (selected.skippedCount || 0) + 1,
    });
  }
  async function requeuePatient(mode: "after2" | "end") {
    if (!selected) return;
    if (apiSession && selected.queueEntryId) {
      setBusy(true);
      setMessage("");
      try {
        await apiFetch(`/queue/${selected.queueEntryId}/requeue`, apiSession, {
          method: "POST",
          body: JSON.stringify({
            reason: "Requeued from doctor dashboard",
            place_at_end: mode === "end",
          }),
        });
        await loadLiveData(apiSession);
        setMessage("Token requeued.");
      } catch (err: any) {
        setMessage(err.message || "Could not requeue token.");
      } finally {
        setBusy(false);
      }
      return;
    }
    updateAppt(selected.id, {
      status: "Scheduled",
      queueStatus: "Requeued",
      priority: mode === "after2" ? 2.5 : 5,
      requeueMode: mode,
    });
  }
  async function cancelAppointment() {
    if (!selected) return;
    if (apiSession && selected.queueEntryId) {
      setBusy(true);
      setMessage("");
      try {
        await apiFetch(`/queue/${selected.queueEntryId}/cancel`, apiSession, {
          method: "POST",
          body: JSON.stringify({ reason: "Cancelled from doctor dashboard" }),
        });
        await loadLiveData(apiSession);
        setSelectedAppointmentId("");
        setMessage("Appointment cancelled.");
      } catch (err: any) {
        setMessage(err.message || "Could not cancel appointment.");
      } finally {
        setBusy(false);
      }
      return;
    }
    updateAppt(selected.id, { status: "Cancelled", queueStatus: "Cancelled" });
  }
  function markDone() {
    if (!selected) return;
    const referralDoctor: any = referDoctor
      ? doctorList.find((p: any) => p.id === referDoctorId)
      : null;
    updateAppt(selected.id, {
      status: "Consultation Done",
      queueStatus: "Completed",
      doctorNotes: notes,
      patientRemarks: remarks,
      diagnosis,
      prescription,
      medicineAmount: Number(medicineAmount || 0),
      labNeeded,
      labTests,
      labAmount: labNeeded ? labTests.split(",").length * 350 : 0,
      scanNeeded,
      scanTests,
      scanAmount: scanNeeded ? scanTests.split(",").length * 900 : 0,
      referDoctor,
      referDoctorId: referralDoctor?.id,
      referDoctorName: referralDoctor?.name,
      feeType,
      consultationCharge,
      ipBaseAmount,
      extraFee: Number(extraFee || 0),
      finalFee,
    });
    setNotes("");
    setRemarks("");
    setDiagnosis("");
    setExtraFee(0);
    setLabNeeded(false);
    setScanNeeded(false);
    setReferDoctor(false);
  }
  async function ensureBackendConsultation() {
    if (!apiSession || !selected)
      throw new Error("Backend login and appointment selection are required.");
    if (
      selected.queueEntryId &&
      statusKey(selected.queueStatus) !== "in_consultation" &&
      statusKey(selected.status) !== "in_consultation"
    ) {
      try {
        await apiFetch(
          `/queue/${selected.queueEntryId}/start-consultation`,
          apiSession,
          {
            method: "POST",
            body: JSON.stringify({ reason: "Started from doctor dashboard" }),
          },
        );
      } catch (err: any) {
        if (!String(err.message || "").includes("already")) throw err;
      }
    }
    if (selected.consultationId) return selected.consultationId;
    const created = await apiFetch("/consultations", apiSession, {
      method: "POST",
      body: JSON.stringify({
        appointment_id: selected.id,
        treatment_type: treatmentType,
        created_by_user_id: apiSession.user?.id,
        ...structuredPayload(),
      }),
    });
    await loadLiveData(apiSession);
    return created.id;
  }
  async function saveBackendDraft() {
    setBusy(true);
    setMessage("");
    try {
      const consultationId = await ensureBackendConsultation();
      const labText = labReferralSummary();
      await apiFetch(`/consultations/${consultationId}`, apiSession, {
        method: "PATCH",
        body: JSON.stringify({
          treatment_type: treatmentType,
          diagnosis,
          clinical_notes: notes,
          prescription_text: medicineRows || prescription,
          lab_referral_text: labText || null,
          scan_referral_text: scanNeeded ? scanTests : null,
          follow_up_advice: remarks,
          patient_remarks: remarks,
          ...structuredPayload(),
        }),
      });
      await loadLiveData(apiSession);
      setMessage("Consultation draft saved to backend.");
    } catch (err: any) {
      setMessage(err.message || "Could not save consultation.");
    } finally {
      setBusy(false);
    }
  }
  async function signBackendConsultation() {
    setBusy(true);
    setMessage("");
    try {
      const consultationId = await ensureBackendConsultation();
      const labText = labReferralSummary();
      await apiFetch(`/consultations/${consultationId}`, apiSession, {
        method: "PATCH",
        body: JSON.stringify({
          treatment_type: treatmentType,
          diagnosis,
          clinical_notes: notes,
          prescription_text: medicineRows || prescription,
          lab_referral_text: labText || null,
          scan_referral_text: scanNeeded ? scanTests : null,
          follow_up_advice: remarks,
          patient_remarks: remarks,
          ...structuredPayload(),
        }),
      });
      await apiFetch(`/consultations/${consultationId}/sign`, apiSession, {
        method: "POST",
        body: JSON.stringify({ signed_by_user_id: apiSession.user?.id }),
      });
      await loadLiveData(apiSession);
      setMessage("Consultation signed and locked in backend.");
    } catch (err: any) {
      setMessage(err.message || "Could not sign consultation.");
    } finally {
      setBusy(false);
    }
  }
  async function saveAddendum() {
    if (!apiSession || !selected?.consultationId || !addendumNote.trim())
      return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(
        `/consultations/${selected.consultationId}/addendums`,
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            note: addendumNote,
            created_by_user_id: apiSession.user?.id,
          }),
        },
      );
      setAddendumNote("");
      setMessage("Addendum saved to signed consultation.");
    } catch (err: any) {
      setMessage(err.message || "Could not save addendum.");
    } finally {
      setBusy(false);
    }
  }
  if (view === "workspace")
    return (
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">Patient Queue</h3>
              <p className="text-sm text-slate-500">
                Select any waiting patient for consultation.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={doctorId}
                onChange={(e: any) => {
                  setDoctorId(e.target.value);
                  setSelectedAppointmentId("");
                }}
                disabled={isDoctorUser}
              >
                {doctorList.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name} - {d.specialty}
                  </option>
                ))}
              </Select>
              <Badge tone="blue">{branch.name}</Badge>
            </div>
          </div>
          <StatusToast message={message} onClose={() => setMessage("")} />
          <div className="scrollbar-hidden mt-4 overflow-x-auto">
            <div className="flex gap-3 pb-1">
              {doctorQueue
                .filter(
                  (a: any) =>
                    !isCompletedAppointment(a) && !isCancelledAppointment(a),
                )
                .map((a: any) => (
                  <button
                    key={a.id}
                    onClick={() => openConsultation(a.id)}
                    className={`w-44 shrink-0 rounded-2xl border p-4 text-left transition ${
                      selected?.id === a.id
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 bg-white hover:border-slate-400"
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap gap-1">
                      <Badge
                        tone={a.tokenType === "Emergency" ? "red" : "amber"}
                      >
                        {humanizeOptionLabel(a.tokenType)}
                      </Badge>
                      {a.consultationStatus && (
                        <Badge
                          tone={
                            a.consultationStatus === "signed" ? "green" : "blue"
                          }
                        >
                          {humanizeOptionLabel(a.consultationStatus)}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-sm font-bold text-slate-900">
                      {a.token} · {a.patient}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {displayTime(a.time || a.appointment_time)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {humanizeOptionLabel(a.queueStatus)}
                    </p>
                  </button>
                ))}
              {doctorQueue.filter(
                (a: any) =>
                  !isCompletedAppointment(a) && !isCancelledAppointment(a),
              ).length === 0 && (
                <p className="py-4 text-sm text-slate-500">
                  No waiting patients in the queue.
                </p>
              )}
            </div>
          </div>
        </Card>
        <ConsultationWorkspace
          selected={selected}
          patient={patient}
          selectedPatientHistory={selectedPatientHistory}
          templates={templates}
          setComplaints={setComplaints}
          complaints={complaints}
          setDiagnosisRows={setDiagnosisRows}
          diagnosisRows={diagnosisRows}
          treatmentType={treatmentType}
          setTreatmentType={setTreatmentType}
          remarks={remarks}
          setRemarks={setRemarks}
          vitals={vitals}
          setVitals={setVitals}
          notes={notes}
          setNotes={setNotes}
          medicineRows={medicineRows}
          medicineItems={medicineItems}
          removeMedicineItem={removeMedicineItem}
          medicineCatalog={medicineCatalog}
          selectedMedicineId={selectedMedicineId}
          setSelectedMedicineId={setSelectedMedicineId}
          medicineDosage={medicineDosage}
          setMedicineDosage={setMedicineDosage}
          medicineFrequency={medicineFrequency}
          setMedicineFrequency={setMedicineFrequency}
          medicineDuration={medicineDuration}
          setMedicineDuration={setMedicineDuration}
          medicineInstructions={medicineInstructions}
          setMedicineInstructions={setMedicineInstructions}
          addMedicineSuggestion={addMedicineSuggestion}
          addMedicineFromText={addMedicineFromText}
          referralRows={referralRows}
          referralItems={referralItems}
          removeReferralItem={removeReferralItem}
          labNeeded={labNeeded}
          setLabNeeded={setLabNeeded}
          admissionNeeded={admissionNeeded}
          setAdmissionNeeded={setAdmissionNeeded}
          labTests={labTests}
          setLabTests={setLabTests}
          labCatalog={labCatalog}
          selectedLabTestId={selectedLabTestId}
          setSelectedLabTestId={setSelectedLabTestId}
          labPriority={labPriority}
          setLabPriority={setLabPriority}
          labInstructions={labInstructions}
          setLabInstructions={setLabInstructions}
          addLabSuggestion={addLabSuggestion}
          addLabFromText={addLabFromText}
          scanNeeded={scanNeeded}
          setScanNeeded={setScanNeeded}
          scanTests={scanTests}
          setScanTests={setScanTests}
          scanCatalog={scanCatalog}
          referDoctor={referDoctor}
          setReferDoctor={setReferDoctor}
          referDoctorId={referDoctorId}
          setReferDoctorId={setReferDoctorId}
          practitioners={practitioners}
          doctor={doctor}
          addendumNote={addendumNote}
          setAddendumNote={setAddendumNote}
          saveAddendum={saveAddendum}
          busy={busy}
          apiSession={apiSession}
          saveBackendDraft={saveBackendDraft}
          markDone={markDone}
          signBackendConsultation={signBackendConsultation}
          requeuePatient={requeuePatient}
          callPatient={callPatient}
          skipPatient={skipPatient}
          cancelAppointment={cancelAppointment}
          openPatientDetails={openPatientDetails}
          callNextInWorkspace={callNextInWorkspace}
          setActive={setActive}
        />
      </div>
    );
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DoctorMetric
          icon={CalendarClock}
          title="Today Booked"
          value={activeQueue.length}
          caption={doctor.name}
          active={dashboardFilter === "booked"}
          onClick={() => setDashboardFilter("booked")}
        />
        <DoctorMetric
          icon={Clock3}
          title="Waiting"
          value={waitingToday}
          caption="Live token queue"
          tone="amber"
          active={dashboardFilter === "waiting"}
          onClick={() => setDashboardFilter("waiting")}
        />
        <DoctorMetric
          icon={CheckCircle2}
          title="Completed"
          value={completedToday}
          caption="Consultation done"
          tone="green"
          active={dashboardFilter === "completed"}
          onClick={() => setDashboardFilter("completed")}
        />
        <DoctorMetric
          icon={UsersRound}
          title="Patients Seen"
          value={uniquePatientCount}
          caption={`${emergencyToday} emergency priority`}
          tone="blue"
          active={dashboardFilter === "seen"}
          onClick={() => setDashboardFilter("seen")}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <Card>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <h3 className="text-lg font-bold">Upcoming Appointments</h3>
              <p className="text-sm text-slate-500">
                Doctor schedule, queue status, visit purpose, and consultation
                mode.
              </p>
            </div>
            <Badge tone="blue">Refresh #{tick}</Badge>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-7">
            {appointmentDays.map((day: any) => (
              <button
                key={day.iso}
                type="button"
                onClick={() => {
                  setSelectedDate(day.iso);
                  setSelectedAppointmentId("");
                }}
                className={`rounded-2xl border p-3 text-center transition ${selectedDate === day.iso ? "border-slate-900 bg-slate-900 text-white" : day.count ? "border-slate-300 bg-slate-50 text-slate-950 hover:border-slate-500" : "border-slate-200 bg-white text-slate-950 hover:border-slate-300"}`}
              >
                <p className="text-xs font-bold uppercase opacity-70">
                  {day.label}
                </p>
                <p className="text-xl font-black">{day.day}</p>
                <div className="mx-auto mt-2 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                <p className="mt-1 text-[11px] font-bold opacity-70">
                  {day.count} booked
                </p>
              </button>
            ))}
          </div>
          <ScheduleList
            rows={scheduleRows}
            selectedId={selected?.id}
            onSelect={setSelectedAppointmentId}
            onConsult={openConsultation}
          />
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">Today's Booked Appointments</h3>
              <p className="text-sm text-slate-500">
                {displayDate(selectedDate)} · {appointmentListLabel}
              </p>
            </div>
            <Badge tone="blue">{branch.name}</Badge>
          </div>
          <StatusToast message={message} onClose={() => setMessage("")} />
          <div className="mt-4 grid gap-3">
            <FormField label="Doctor">
              <Select
                value={doctorId}
                onChange={(e: any) => {
                  setDoctorId(e.target.value);
                  setSelectedAppointmentId("");
                }}
                disabled={isDoctorUser}
              >
                {doctorList.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name} - {d.specialty}
                  </option>
                ))}
              </Select>
            </FormField>
            <Button onClick={callNext} disabled={!current || busy}>
              Call Next Patient
            </Button>
          </div>
          <div className="mt-5 space-y-3">
            {scheduleRows.map((a: any) => (
              <div
                key={a.id}
                className={`rounded-2xl border p-4 ${selected?.id === a.id ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedAppointmentId(a.id)}
                    className="min-w-0 text-left"
                  >
                    <b>
                      {a.token} · {a.patient}
                    </b>
                    <p className="text-xs text-slate-500">
                      {displayTime(a.time || a.appointment_time)} ·{" "}
                      {humanizeOptionLabel(a.status)} ·{" "}
                      {humanizeOptionLabel(a.queueStatus)}
                    </p>
                  </button>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <Badge tone={a.tokenType === "Emergency" ? "red" : "amber"}>
                      {humanizeOptionLabel(a.tokenType)}
                    </Badge>
                    {a.consultationStatus && (
                      <Badge
                        tone={
                          a.consultationStatus === "signed" ? "green" : "blue"
                        }
                      >
                        {humanizeOptionLabel(a.consultationStatus)}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAppointmentId(a.id)}
                    className="rounded-xl border px-3 py-2 text-xs font-bold"
                  >
                    Select
                  </button>
                  <button
                    type="button"
                    onClick={() => openConsultation(a.id)}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"
                  >
                    Consultation
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <h3 className="text-lg font-bold">Doctor Revenue Tracking Logic</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <div className="rounded-2xl bg-slate-50 p-4">
            <b>Consultation</b>
            <p className="text-sm text-slate-500">OP/IP/Online/Home Visit</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <b>Lab Referral</b>
            <p className="text-sm text-slate-500">Lab tests written</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <b>Scan Referral</b>
            <p className="text-sm text-slate-500">Diagnostics referred</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <b>Pharmacy</b>
            <p className="text-sm text-slate-500">Medicine value referred</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <b>Reports</b>
            <p className="text-sm text-slate-500">Admin revenue analytics</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function DoctorMetric({
  icon: Icon,
  title,
  value,
  caption,
  tone = "slate",
  active = false,
  onClick,
}: any) {
  const toneClass: any = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-700",
    green: "bg-emerald-100 text-emerald-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[118px] rounded-3xl border bg-white p-5 text-left shadow-sm transition ${active ? "border-slate-900 ring-2 ring-slate-900/10" : "border-slate-200 hover:border-slate-400"}`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${toneClass[tone] || toneClass.slate}`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-600">{title}</p>
          <p className="mt-1 text-3xl font-black text-slate-950">{value}</p>
          <p className="truncate text-xs font-semibold text-slate-500">
            {caption}
          </p>
        </div>
      </div>
    </button>
  );
}

function ScheduleList({ rows, selectedId, onSelect, onConsult }: any) {
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-lg font-bold">Schedule List</h4>
        <Badge>{rows.length} rows</Badge>
      </div>
      <div className="overflow-hidden rounded-3xl border border-slate-200">
        <div className="hidden grid-cols-[1.2fr_1.2fr_1fr_0.7fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 md:grid">
          <span>Patient</span>
          <span>Date & Time</span>
          <span>Visit</span>
          <span>Mode</span>
        </div>
        {rows.length === 0 && (
          <div className="p-5 text-sm text-slate-500">
            No appointment scheduled for the selected doctor.
          </div>
        )}
        {rows.map((row: any) => (
          <div
            key={row.id}
            className={`grid gap-2 border-t border-slate-100 px-4 py-4 transition hover:bg-slate-50 md:grid-cols-[1.2fr_1.2fr_1fr_0.7fr] ${selectedId === row.id ? "bg-slate-50" : ""}`}
          >
            <div>
              <p className="font-bold text-slate-950">{row.patient}</p>
              <p className="text-xs text-slate-500">{row.token || row.id}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">
                {displayDate(row.appointmentDate || row.appointment_date)}
              </p>
              <p className="text-xs text-slate-500">
                {displayTime(row.time || row.appointment_time)}
              </p>
            </div>
            <div>
              <Badge
                tone={
                  row.tokenType === "Emergency"
                    ? "red"
                    : toneForQueue(row.queueStatus)
                }
              >
                {humanizeOptionLabel(row.visitType || row.tokenType || "OP")}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-slate-600">
              {String(row.visitType || "")
                .toLowerCase()
                .includes("online") ? (
                <Video className="h-5 w-5 text-blue-600" />
              ) : (
                <UserRoundCheck className="h-5 w-5 text-emerald-600" />
              )}
              <span className="text-xs font-bold">
                {String(row.visitType || "OP")
                  .toLowerCase()
                  .includes("online")
                  ? "Online"
                  : "Clinic"}
              </span>
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                className="rounded-xl border px-3 py-2 text-xs font-bold"
              >
                Select
              </button>
              <button
                type="button"
                onClick={() => onConsult(row.id)}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"
              >
                Consultation
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PatientHistoryPanel({ history, onOpenPatient }: any) {
  return (
    <div className="rounded-3xl bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="font-bold">Existing Treatment History</h4>
          <p className="text-sm text-slate-500">
            Previous visits visible for clinical reference.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenPatient?.()}
            className="rounded-xl border bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50"
          >
            Patient Details
          </button>
          <Badge>{history.length} records</Badge>
        </div>
      </div>
      {history.length === 0 && (
        <div className="mt-3 rounded-2xl bg-white p-4 text-sm text-slate-500">
          No previous consultation history found for this patient.
        </div>
      )}
      {history.length > 0 && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {history.map((item: any) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenPatient?.(item.patientId || item.patient_id)}
              className="rounded-2xl bg-white p-4 text-left transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">
                    {displayDate(item.appointmentDate || item.appointment_date)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.doctor || item.practitioner_name || "Doctor"} ·{" "}
                    {item.departmentName || item.departmentId || "Medical Department"}
                  </p>
                </div>
                <Badge
                  tone={
                    item.consultationStatus === "signed" ? "green" : "slate"
                  }
                >
                  {humanizeOptionLabel(
                    item.consultationStatus || item.status || "Visit",
                  )}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-slate-700">
                {item.diagnosis ||
                  item.doctorNotes ||
                  item.patientRemarks ||
                  item.visitPurpose ||
                  "No clinical summary saved for this visit."}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ConsultationWorkspace(props: any) {
  const {
    selected,
    patient,
    selectedPatientHistory,
    templates,
    setComplaints,
    complaints,
    setDiagnosisRows,
    diagnosisRows,
    treatmentType,
    setTreatmentType,
    remarks,
    setRemarks,
    vitals,
    setVitals,
    notes,
    setNotes,
    medicineRows,
    medicineItems,
    removeMedicineItem,
    medicineCatalog,
    selectedMedicineId,
    setSelectedMedicineId,
    medicineDosage,
    setMedicineDosage,
    medicineFrequency,
    setMedicineFrequency,
    medicineDuration,
    setMedicineDuration,
    medicineInstructions,
    setMedicineInstructions,
    addMedicineSuggestion,
    addMedicineFromText,
    referralRows,
    referralItems,
    removeReferralItem,
    labNeeded,
    setLabNeeded,
    admissionNeeded,
    setAdmissionNeeded,
    labTests,
    setLabTests,
    labCatalog,
    selectedLabTestId,
    setSelectedLabTestId,
    labPriority,
    setLabPriority,
    labInstructions,
    setLabInstructions,
    addLabSuggestion,
    addLabFromText,
    scanNeeded,
    setScanNeeded,
    scanTests,
    setScanTests,
    scanCatalog,
    referDoctor,
    setReferDoctor,
    referDoctorId,
    setReferDoctorId,
    practitioners,
    doctor,
    addendumNote,
    setAddendumNote,
    saveAddendum,
    busy,
    apiSession,
    saveBackendDraft,
    markDone,
    signBackendConsultation,
    requeuePatient,
    callPatient,
    skipPatient,
    cancelAppointment,
    openPatientDetails,
    callNextInWorkspace,
    setActive,
  } = props;
  const medicineOptions = medicineCatalog.map((medicine: any) => ({
    value: medicine.id,
    label: medicine.name,
    item: medicine,
  }));
  const labOptions = labCatalog.map((test: any) => ({
    value: test.id,
    label: test.name,
    item: test,
  }));
  const [medicineTagText, setMedicineTagText] = useState("");
  const [labTagText, setLabTagText] = useState("");
  const [medicineDraftName, setMedicineDraftName] = useState("");
  const [labDraftName, setLabDraftName] = useState("");
  const selectedMedicine = medicineCatalog.find(
    (medicine: any) => medicine.id === selectedMedicineId,
  );
  const selectedLabTest = labCatalog.find(
    (test: any) => test.id === selectedLabTestId,
  );
  function addDraftMedicine() {
    const name = selectedMedicine?.name || medicineDraftName;
    if (!String(name || "").trim()) return;
    addMedicineFromText(name, selectedMedicine ? { item: selectedMedicine } : undefined);
    setMedicineDraftName("");
  }
  function addDraftLabTest() {
    const name = selectedLabTest?.name || labDraftName;
    if (!String(name || "").trim()) return;
    addLabFromText(name, selectedLabTest ? { item: selectedLabTest } : undefined);
    setLabDraftName("");
  }
  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h3 className="text-lg font-bold">Consultation Workspace</h3>
          <p className="text-sm text-slate-500">
            Structured vitals, complaints, diagnosis, prescription, referrals,
            follow-up and addendums.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActive?.("doctor")}
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            ← Dashboard
          </button>
          <button
            onClick={() => selected && callPatient(selected)}
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            Call
          </button>
          <button
            onClick={skipPatient}
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            Not Present
          </button>
          <button
            onClick={() => requeuePatient("after2")}
            className="rounded-2xl border px-4 py-3 text-sm font-bold"
          >
            Requeue
          </button>
          <button
            onClick={cancelAppointment}
            className="rounded-2xl border px-4 py-3 text-sm font-bold text-red-600"
          >
            Cancel
          </button>
        </div>
      </div>
      {!selected ? (
        <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
          No appointment selected.
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={() => openPatientDetails?.()}
              className="rounded-2xl bg-slate-50 p-4 text-left transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <p className="text-xs text-slate-500">Patient</p>
              <p className="font-bold">
                {patient?.name || selected?.patient || "-"}
              </p>
            </button>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Age / Gender</p>
              <p className="font-bold">
                {patient?.age_years ?? patient?.age ?? "-"} /{" "}
                {patient?.gender ?? "-"}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Allergies</p>
              <p className="font-bold">{patient?.allergies || "None"}</p>
            </div>
          </div>
          <PatientHistoryPanel
            history={selectedPatientHistory}
            onOpenPatient={openPatientDetails}
          />
          {templates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {templates.map((template: any) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    setComplaints(
                      (template.content?.complaints || []).join("\n") ||
                        complaints,
                    );
                    setDiagnosisRows(
                      (template.content?.diagnoses || [])
                        .map((x: string) => `${x} | primary`)
                        .join("\n") || diagnosisRows,
                    );
                  }}
                  className="rounded-xl border px-3 py-2 text-xs font-bold"
                >
                  {template.name}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Treatment Type">
              <Select
                value={treatmentType}
                onChange={(e: any) => setTreatmentType(e.target.value)}
              >
                <option value="general_consultation">
                  General Consultation
                </option>
                <option value="doctor_review">Doctor Review</option>
                <option value="fitness_certificate">Fitness Certificate</option>
                <option value="pediatric_consultation">
                  Pediatric Consultation
                </option>
                <option value="diabetology_consultation">
                  Diabetology Consultation
                </option>
                <option value="procedure_review">Procedure Review</option>
                <option value="follow_up">Follow-up</option>
              </Select>
            </FormField>
            <FormField label="Follow-up Advice">
              <Input
                value={remarks}
                onChange={(e: any) => setRemarks(e.target.value)}
                placeholder="Review after 3 days"
              />
            </FormField>
          </div>
          <FormField label="Vitals">
            <Input
              value={vitals}
              onChange={(e: any) => setVitals(e.target.value)}
              placeholder="BP=120/80 mmHg, Pulse=78 bpm"
            />
          </FormField>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Complaints Rows">
              <textarea
                value={complaints}
                onChange={(e: any) => setComplaints(e.target.value)}
                className="min-h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                placeholder="Fever | 2 days | medium"
              />
            </FormField>
            <FormField label="Diagnosis Rows">
              <textarea
                value={diagnosisRows}
                onChange={(e: any) => setDiagnosisRows(e.target.value)}
                className="min-h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                placeholder="Viral fever | primary | notes"
              />
            </FormField>
          </div>
          <FormField label="Doctor Notes">
            <textarea
              value={notes}
              onChange={(e: any) => setNotes(e.target.value)}
              className="min-h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
              placeholder="Clinical notes, advice..."
            />
          </FormField>
          <FormField label="Prescription Medicine Rows">
            <TagEntryBox
              tags={medicineItems}
              value={medicineTagText}
              onChange={setMedicineTagText}
              onSubmit={addMedicineFromText}
              onRemove={removeMedicineItem}
              hideInput
              emptyText="No medicines added yet."
              getLabel={(m: any) =>
                [m.name, m.dosage, m.frequency, m.duration, m.instructions]
                  .map((part: any) => String(part || "").trim())
                  .filter(Boolean)
                  .join(" · ")
              }
            />
          </FormField>
          <div className="rounded-3xl bg-slate-50 p-4">
            <div className="grid gap-3 lg:grid-cols-[1.35fr_.8fr_.7fr_.7fr_.9fr_auto] lg:items-end">
              <Field label="Medicine">
                <SearchPicker
                  value={selectedMedicineId}
                  inputValue={medicineDraftName}
                  onInputValueChange={(text: string) => {
                    setMedicineDraftName(text);
                    if (!text) setSelectedMedicineId("");
                  }}
                  onChange={(medicineId: string, medicine: any) => {
                    setSelectedMedicineId(medicineId);
                    setMedicineDraftName(medicine?.name || "");
                  }}
                  options={medicineOptions}
                  placeholder="Type medicine name"
                  onUseTyped={(text: string) => {
                    setSelectedMedicineId("");
                    setMedicineDraftName(text);
                  }}
                  getSearchText={(medicine: any) =>
                    [
                      medicine?.name,
                      medicine?.strength,
                      medicine?.generic_name,
                      medicine?.brand_name,
                      medicine?.category,
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                />
              </Field>
              <FormField label="Dosage">
                <Input
                  value={medicineDosage}
                  onChange={(e: any) => setMedicineDosage(e.target.value)}
                  placeholder="500mg"
                />
              </FormField>
              <FormField label="Frequency">
                <Select
                  value={medicineFrequency}
                  onChange={(e: any) => setMedicineFrequency(e.target.value)}
                >
                  {[
                    ...new Set([
                      medicineFrequency,
                      ...medicineFrequencyOptions,
                    ]),
                  ]
                    .filter(Boolean)
                  .map((value: string) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                </Select>
              </FormField>
              <FormField label="Duration">
                <Input
                  list="medicine-duration-options"
                  value={medicineDuration}
                  onChange={(e: any) => setMedicineDuration(e.target.value)}
                  placeholder="3 days"
                />
                <datalist id="medicine-duration-options">
                  {medicineDurationOptions.map((value: string) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </FormField>
              <FormField label="Instructions">
                <Select
                  value={medicineInstructions}
                  onChange={(e: any) => setMedicineInstructions(e.target.value)}
                >
                  {[
                    ...new Set([
                      medicineInstructions,
                      ...medicineInstructionOptions,
                    ]),
                  ]
                    .filter(Boolean)
                    .map((value: string) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                  ))}
                </Select>
              </FormField>
              <Button type="button" onClick={addDraftMedicine}>
                Add
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {medicineCatalog.slice(0, 8).map((medicine: any) => (
                <button
                  key={medicine.id}
                  type="button"
                  onClick={() =>
                    addMedicineFromText(medicine.name, { item: medicine })
                  }
                  className="rounded-xl border bg-white px-3 py-2 text-xs font-bold"
                >
                  {medicine.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3">
            <div className="rounded-3xl bg-slate-50 p-4">
              <Field label="Lab Tests">
                <TagEntryBox
                  tags={referralItems.filter((item: any) => item.type === "lab")}
                  value={labTagText}
                  onChange={setLabTagText}
                  onSubmit={addLabFromText}
                  onRemove={(labIndex: number) => {
                    const indexes = referralItems
                      .map((item: any, index: number) =>
                        item.type === "lab" ? index : -1,
                      )
                      .filter((index: number) => index >= 0);
                    removeReferralItem(indexes[labIndex]);
                  }}
                  hideInput
                  emptyText="No lab tests added yet."
                  getLabel={(r: any) =>
                    [r.name, r.priority, r.instructions]
                      .map((part: any) => String(part || "").trim())
                      .filter(Boolean)
                      .join(" · ")
                  }
                />
              </Field>
              <div className="mt-3 grid gap-2">
                <FormField label="Available Lab Test">
                  <SearchPicker
                    value={selectedLabTestId}
                    inputValue={labDraftName}
                    onInputValueChange={(text: string) => {
                      setLabDraftName(text);
                      if (!text) setSelectedLabTestId("");
                    }}
                    onChange={(id: string, test: any) => {
                      setSelectedLabTestId(id);
                      setLabDraftName(test?.name || "");
                    }}
                    options={labOptions}
                    placeholder="Type lab test name"
                    onUseTyped={(text: string) => {
                      setSelectedLabTestId("");
                      setLabDraftName(text);
                    }}
                    getSearchText={(test: any) =>
                      [
                        test?.name,
                        test?.sample_type,
                        test?.category,
                        test?.code,
                      ]
                        .filter(Boolean)
                        .join(" ")
                    }
                  />
                </FormField>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    value={labPriority}
                    onChange={(e: any) => setLabPriority(e.target.value)}
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">STAT</option>
                  </Select>
                  <Input
                    value={labInstructions}
                    onChange={(e: any) => setLabInstructions(e.target.value)}
                    placeholder="Instructions"
                  />
                  <Button type="button" onClick={addDraftLabTest}>
                    Add Lab Test
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {labCatalog.slice(0, 8).map((l: any) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => addLabFromText(l.name, { item: l })}
                    className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700"
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-3xl bg-slate-50 p-4">
                <label className="flex items-center gap-3 font-bold">
                  <input
                    type="checkbox"
                    checked={scanNeeded}
                    onChange={(e: any) => setScanNeeded(e.target.checked)}
                  />{" "}
                  Scan referral
                </label>
                {scanNeeded && (
                  <FormField label="Scan / Diagnostic">
                    <Input
                      value={scanTests}
                      onChange={(e: any) => setScanTests(e.target.value)}
                      placeholder="X-Ray, ECG, Ultrasound"
                    />
                  </FormField>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {scanCatalog.map((s: any) => (
                    <Badge key={s.id}>{s.name}</Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <label className="flex items-center gap-3 font-bold">
                  <input
                    type="checkbox"
                    checked={referDoctor}
                    onChange={(e: any) => setReferDoctor(e.target.checked)}
                  />{" "}
                  Refer another doctor
                </label>
                {referDoctor && (
                  <FormField label="Recommended Doctor">
                    <Select
                      value={referDoctorId}
                      onChange={(e: any) => setReferDoctorId(e.target.value)}
                    >
                      {practitioners
                        .filter(
                          (p: any) => p.role === "Doctor" && p.id !== doctor.id,
                        )
                        .map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name} - {p.specialty}
                          </option>
                        ))}
                    </Select>
                  </FormField>
                )}
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <label className="flex items-center gap-3 font-bold">
                  <input
                    type="checkbox"
                    value={admissionNeeded}
                    onChange={(e: any) => setAdmissionNeeded(e.target.checked)}
                  />
                  <span>Refer for IP Admission</span>
                </label>
              </div>
            </div>
          </div>
          {selected?.consultationStatus === "signed" && (
            <div className="rounded-3xl bg-emerald-50 p-4">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="font-bold text-emerald-900">
                    Signed consultation
                  </p>
                  <p className="text-sm text-emerald-700">
                    Billing can generate the consultation invoice from the
                    Invoices page.
                  </p>
                </div>
                <Badge tone="green">Ready for billing</Badge>
              </div>
              <FormField label="Signed Record Addendum">
                <textarea
                  value={addendumNote}
                  onChange={(e: any) => setAddendumNote(e.target.value)}
                  className="min-h-20 w-full rounded-2xl border border-emerald-100 px-4 py-3 text-sm outline-none"
                  placeholder="Add clarification without changing signed record"
                />
              </FormField>
              <Button
                onClick={saveAddendum}
                disabled={busy || !addendumNote.trim()}
              >
                Save Addendum
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={apiSession ? saveBackendDraft : markDone}
              disabled={busy || selected?.consultationStatus === "signed"}
            >
              {apiSession ? "Save Draft" : "Mark Consultation Done"}
            </Button>
            {apiSession && (
              <Button
                onClick={signBackendConsultation}
                disabled={busy || selected?.consultationStatus === "signed"}
                className="bg-emerald-700"
              >
                Sign & Lock
              </Button>
            )}
            <button
              onClick={() => requeuePatient("end")}
              className="rounded-2xl border px-4 py-3 text-sm font-bold"
            >
              Requeue to End
            </button>
            <button
              onClick={callNextInWorkspace}
              className="rounded-2xl border px-4 py-3 text-sm font-bold"
            >
              Call Next Patient
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
