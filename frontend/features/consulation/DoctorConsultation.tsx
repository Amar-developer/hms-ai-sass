"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  UsersRound,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  SearchableSelect,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { readNotificationTarget } from "@/lib/notificationTarget";
import { calculateConsultationCharge, sortQueue } from "@/lib/hmsLogic";
import { humanizeOptionLabel } from "@/lib/options";
import {
  displayDate,
  displayDate as formatDisplayDate,
  localDateKey,
  today,
} from "@/utils/helper";
import { ConsultationWorkspace } from "./components/ConsultationWorkspace";
import { ScheduleList } from "./components/ScheduleList";
import { DoctorMetric } from "./components/DoctorMetric";
import {
  asArray,
  appointmentDateKey,
  displayTime,
  isCancelledAppointment,
  isCompletedAppointment,
  isQueueActionLocked,
  isWaitingAppointment,
  labTestNames,
  statusKey,
} from "./helpers";
import { appendLine, splitRows } from "@/utils/helper";
import {
  useConsultationData,
  useConsultationActions,
  fetchConsultationDetail,
  fetchPatientDetail,
} from "./api";
import { usePractitionersQuery } from "@/features/doctors/api/usePractitionersQuery";
import { useAppointmentsQuery } from "@/features/appointments/api/useAppointmentsQuery";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";

export function DoctorConsultation({
  clinic,
  branch,
  branchId,
  departmentId,
  allowedDepartments = [],
  patients,
  doctorScope = null,
  view = "dashboard",
  setActive,
  apiSession,
}: any) {
  const { livePractitioners } = usePractitionersQuery(apiSession);
  const {
    appointments,
    scopedAppointments,
    refetch: refetchAppointments,
    setLocal: setAppointments,
  } = useAppointmentsQuery(apiSession, { clinicId: clinic?.id, branchId, patients });
  const isDoctorUser = Boolean(
    apiSession?.user?.user_type === "doctor" ||
    apiSession?.user?.roles?.includes("doctor"),
  );
  const { scopedPractitioners, templates, medicineCatalog, labCatalog } =
    useConsultationData({
      apiSession,
      branchId,
      departmentId,
      doctorScopePractitionerId: doctorScope?.practitionerId,
    });
  // Keep the working doctor selector scoped, but retain the tenant-wide list
  // for cross-department referrals.
  const practitionerSource = [...livePractitioners, ...scopedPractitioners];
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
        registrationNumber: practitioner.registration_number || "",
        signatureUrl: practitioner.signature_url || "",
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
        registrationNumber:
          appointment.registrationNumber || existing.registrationNumber || "",
        signatureUrl: appointment.signatureUrl || existing.signatureUrl || "",
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
  const practitioners = allDoctorList.map((doctor: any) => ({
    ...doctor,
    role: "Doctor",
  }));
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
  const [addendumNote, setAddendumNote] = useState("");
  const [addendums, setAddendums] = useState<any[]>([]);
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
  const [consultationValidationAttempted, setConsultationValidationAttempted] =
    useState(false);
  const [selectedDate, setSelectedDate] = useState(() =>
    today(),
  );

  useEffect(() => {
    const target = readNotificationTarget("consultation");
    if (!target) return;
    const appointment = scopedAppointments.find(
      (row: any) =>
        (row.consultationId || row.consultation_id) === target.resourceId,
    );
    if (!appointment) return;
    const appointmentId = appointment.id;
    const practitionerId =
      appointment.doctorId || appointment.practitioner_id || "";
    setSelectedAppointmentId(appointmentId);
    sessionStorage.setItem(
      "medizinhub.consultationAppointmentId",
      appointmentId,
    );
    if (practitionerId) {
      setDoctorId(practitionerId);
      sessionStorage.setItem(
        "medizinhub.consultationDoctorId",
        practitionerId,
      );
    }
    const appointmentDate = appointmentDateKey(appointment);
    if (appointmentDate) setSelectedDate(appointmentDate);
  }, [apiSession?.tenantId, scopedAppointments.length]);

  const [dashboardFilter, setDashboardFilter] = useState<
    "booked" | "waiting" | "completed" | "seen"
  >("booked");
  const [selectedPatientDetail, setSelectedPatientDetail] = useState<any>(null);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 5000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const scopedDoctorId = doctorScope?.practitionerId || "";
    // Look up the explicitly-selected appointment in the full (unscoped)
    // list, not `scopedAppointments` — a row opened from Appointments/Queue
    // can belong to a branch other than the one currently active in the
    // shell, and `scopedAppointments` filters those out. Falling back to
    // `scopedAppointments` here would make this effect think the doctor/
    // department don't fit and clear the selection, showing "No appointment
    // selected" even though the appointment is valid.
    const selectedAppointment = appointments.find(
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
    // `doctorList` merges two independently-loading async sources
    // (livePractitioners + scopedPractitioners) and is empty for a beat on
    // every mount/refresh. Falling back to `doctorList[0]?.id` while it's
    // still empty resets `doctorId` to "" before the real list arrives —
    // and once it does, `doctorList.find(d => d.id === doctorId)` no longer
    // matches (doctorId is now ""), so it locks onto an arbitrary "first"
    // doctor instead of the one the session actually had selected. That
    // shows as the queue flashing real cards then collapsing to "No waiting
    // patients" once the wrong doctor gets picked. Only fall back to
    // "first in list" once the list has actually loaded; otherwise leave
    // `doctorId` untouched so the remembered selection survives the load.
    const nextDoctorId =
      scopedDoctorId ||
      (selectedAppointmentFits ? selectedAppointmentDoctorId : "") ||
      doctorList.find((doctor: any) => doctor.id === doctorId)?.id ||
      (doctorList.length ? doctorList[0]?.id : doctorId) ||
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
    appointments.length,
  ]);
  const doctor: any = doctorList.find((p: any) => p.id === doctorId) ||
    doctorList[0] || { id: "", name: "No practitioner", specialty: "" };
  const feeSetting = null;
  const consultationCharge = calculateConsultationCharge(
    feeSetting,
    feeType,
    ipBaseAmount,
  );
  // `scopedAppointments` is filtered to the shell's currently active branch,
  // but the branch context can be stale/unset relative to where appointments
  // actually live (e.g. right after login, or when it hasn't been synced
  // from another module). Rather than silently rendering an empty queue when
  // that happens, fall back to the full clinic-wide list — the same list the
  // Appointments module itself displays without any branch filtering.
  const queueBaseAppointments = scopedAppointments.length
    ? scopedAppointments
    : appointments;
  const doctorQueue = sortQueue(
    queueBaseAppointments.filter((a: any) => {
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
  function nextEligibleAppointment(excludeId?: string) {
    return activeQueue.find((appointment: any) => {
      if (appointment.id === excludeId) return false;
      return ["waiting", "in_queue", "emergency_queue", "requeued"].includes(
        statusKey(appointment.queueStatus || appointment.queue_status),
      );
    });
  }
  const selected =
    doctorQueue.find((a: any) => a.id === selectedAppointmentId) ||
    // Same branch-scoping gap as above: an appointment opened from another
    // module can be outside the current branch/doctor queue scope. Fall back
    // to the full appointment list so its details still render instead of
    // showing "No appointment selected".
    appointments.find((a: any) => a.id === selectedAppointmentId) ||
    current;
  useEffect(() => {
    setConsultationValidationAttempted(false);
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
    setAddendums([]);
    setLabNeeded(false);
    setLabTests("");
    setScanNeeded(false);
    setScanTests("");
    setReferDoctor(false);
    setReferDoctorId("");
    setAdmissionNeeded(false);
  }, [selected?.id]);
  useEffect(() => {
    if (!selected?.id || !apiSession) return;
    let alive = true;
    async function loadConsultationData() {
      try {
        const detail = await fetchConsultationDetail(
          apiSession,
          selected.id,
          selected.consultationId,
        );
        if (!detail) return;
        if (!alive) return;
        const c = detail.consultation;
        setAddendums(Array.isArray(detail.addendums) ? detail.addendums : []);
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
        } else if (c.diagnosis) {
          setDiagnosisRows(c.diagnosis);
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
      } catch {}
    }
    loadConsultationData();
    return () => {
      alive = false;
    };
  }, [selected?.id, selected?.consultationId, apiSession?.tenantId]);
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
        const detail = await fetchPatientDetail(apiSession, selectedPatientId);
        if (alive) setSelectedPatientDetail(detail);
      } catch {
        if (alive) setSelectedPatientDetail(null);
      }
    }
    loadSelectedPatient();
    return () => {
      alive = false;
    };
  }, [selectedPatientId, Boolean(localPatient), apiSession?.tenantId]);
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
    const iso = localDateKey(date);
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
    setSelectedMedicineId((value) => value || medicineCatalog[0]?.id || "");
  }, [medicineCatalog]);
  useEffect(() => {
    setSelectedLabTestId((value) => value || labCatalog[0]?.id || "");
  }, [labCatalog]);

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
    if (med)
      addMedicineRow(
        med.item_name || med.name,
        medicineDosage || med.strength || "",
      );
  }
  function addMedicineFromText(value: string, option?: any) {
    const med =
      option?.item ||
      medicineCatalog.find((row: any) => row.id === option?.value);
    addMedicineRow(
      med?.item_name || med?.name || value,
      medicineDosage || med?.strength || "",
    );
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
    addLabRow(test?.item_name || test?.name || value);
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
  function consultationDraftPayload() {
    const structured = structuredPayload();
    const complaintSummary =
      structured.complaints
        .map((row: any) => row.complaint)
        .filter(Boolean)
        .join(", ") || complaints.trim();
    const diagnosisSummary =
      structured.diagnoses
        .map((row: any) => row.diagnosis)
        .filter(Boolean)
        .join(", ") || diagnosis.trim();
    return {
      treatment_type: treatmentType,
      chief_complaint: complaintSummary || null,
      diagnosis: diagnosisSummary || null,
      clinical_notes: notes.trim() || null,
      ...structured,
    };
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

  const resetConsultation = () => {
    setConsultationValidationAttempted(false);
    setComplaints("");
    setDiagnosisRows("");
    setNotes("");
    setVitals("");
    setRemarks("");

    setMedicineItems([]);
    setReferralItems([]);

    setScanNeeded(false);
    setScanTests("");

    setReferDoctor(false);
    setReferDoctorId("");

    setAdmissionNeeded(false);
  };

  const {
    callPatient,
    callNext: callNextAction,
    callNextInWorkspace: callNextInWorkspaceAction,
    skipPatient,
    requeuePatient,
    cancelAppointment,
    markDone,
    saveBackendDraft,
    signBackendConsultation,
    saveAddendum,
  } = useConsultationActions({
    apiSession,
    selected,
    appointments,
    setAppointments,
    refetchAppointments,
    setBusy,
    setMessage,
    setSelectedAppointmentId,
    nextEligibleAppointment,
    resetConsultation,
    consultationDraftPayload,
    labReferralSummary,
    medicineRows,
    prescription,
    scanNeeded,
    scanTests,
    remarks,
    treatmentType,
    notes,
    referDoctor,
    referDoctorId,
    setConsultationValidationAttempted,
    addendumNote,
    setAddendumNote,
    setAddendums,
    markDoneFields: {
      diagnosis,
      medicineAmount,
      labNeeded,
      labTests,
      referDoctorId,
      doctorList,
      feeType,
      consultationCharge,
      ipBaseAmount,
      extraFee,
      finalFee,
    },
    resetAfterMarkDone: () => {
      setNotes("");
      setRemarks("");
      setDiagnosis("");
      setExtraFee(0);
      setLabNeeded(false);
      setScanNeeded(false);
      setReferDoctor(false);
    },
  });
  function callNext() {
    callNextAction(current);
  }
  function callNextInWorkspace() {
    const next = callNextInWorkspaceAction();
    if (next) openConsultation(next.id);
  }
  if (view === "workspace")
    return (
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="card-title font-bold">Patient Queue</h3>
              <p className="card-desc text-slate-500">
                Select any waiting patient for consultation.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <FormField label="Doctor">
                <SearchableSelect
                  value={doctorId}
                  onChange={(value) => {
                    setDoctorId(value);
                    setSelectedAppointmentId("");
                  }}
                  disabled={isDoctorUser}
                  searchable={doctorList.length > 8}
                  options={doctorList.map((d: any) => ({
                    value: d.id,
                    label: `${d.name} - ${d.specialty}`,
                  }))}
                />
              </FormField>

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
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openConsultation(a.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openConsultation(a.id);
                      }
                    }}
                    className={`w-36 shrink-0 cursor-pointer rounded-lg border p-2.5 text-left transition ${
                      selected?.id === a.id
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 bg-white hover:border-slate-400"
                    }`}
                  >
                    <div className="mb-2 flex justify-between  flex-wrap gap-1">
                      <Badge
                        tone={a.tokenType === "Emergency" ? "red" : "amber"}
                        className="table-status p-1.5 text-xs"
                      >
                        {humanizeOptionLabel(a.tokenType)}
                      </Badge>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelAppointment();
                        }}
                        className="border text-[11px] w-5 h-5 flex justify-center items-center hover:font-bold border-black/50 font-bold rounded-full"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      {a.consultationStatus && (
                        <Badge
                          // className="w-[500px]"
                          tone={
                            a.consultationStatus === "signed" ? "green" : "blue"
                          }
                          className="normal-badge"
                        >
                          {humanizeOptionLabel(a.consultationStatus)}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-sm font-bold text-slate-900">
                      {a.token} · {a.patient}
                    </p>
                    <PatientFlagBadges
                      patient={patients.find(
                        (patient: any) =>
                          String(patient.id) ===
                          String(a.patientId || a.patient_id),
                      )}
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {displayTime(a.time || a.appointment_time)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {humanizeOptionLabel(a.queueStatus)}
                    </p>
                  </div>
                ))}
              {doctorQueue.filter(
                (a: any) =>
                  !isCompletedAppointment(a) && !isCancelledAppointment(a),
              ).length === 0 && (
                <p className="py-4 card-desc text-slate-500">
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
          branchId={branchId}
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
          addendums={addendums}
          saveAddendum={saveAddendum}
          busy={busy}
          apiSession={apiSession}
          saveBackendDraft={saveBackendDraft}
          markDone={markDone}
          signBackendConsultation={signBackendConsultation}
          validationAttempted={consultationValidationAttempted}
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
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
              <h3 className="card-title font-bold">Upcoming Appointments</h3>
              <p className="card-desc text-slate-500">
                Doctor schedule, queue status, visit purpose, and consultation
                mode.
              </p>
            </div>
            <Badge tone="blue" className="normal-badge">
              Refresh #{tick}
            </Badge>
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
        </Card>

        {/* Today's booked appointments */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="card-title font-bold">
                Today's Booked Appointments
              </h3>
              <p className="card-desc text-slate-500">
                {displayDate(selectedDate)} · {appointmentListLabel}
              </p>
            </div>
            <Badge tone="blue" className="normal-badge text-center">
              {branch.name}
            </Badge>
          </div>
          <StatusToast message={message} onClose={() => setMessage("")} />
          <div className="mt-4 grid gap-3">
            <FormField label="Doctor">
              <SearchableSelect
                value={doctorId}
                onChange={(value) => {
                  setDoctorId(value);
                  setSelectedAppointmentId("");
                }}
                disabled={isDoctorUser}
                searchable={doctorList.length > 8}
                placeholder="Select doctor"
                options={doctorList.map((d: any) => ({
                  value: d.id,
                  label: d.name,
                  sublabel: d.specialty,
                }))}
              />
            </FormField>
            <div className="w-[20%] lg:w-full">
              <Button onClick={callNext} disabled={!current || busy}>
                Call Next Patient
              </Button>
            </div>
          </div>
        </Card>
      </div>
      <Card>
        <ScheduleList
          rows={scheduleRows}
          selectedId={selected?.id}
          onSelect={setSelectedAppointmentId}
          onConsult={openConsultation}
        />
      </Card>
    </div>
  );
}
