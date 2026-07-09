import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import {
  Card,
  Select,
  Input,
  Field,
  Button,
  Badge,
  SearchableSelect,
} from "../common/ui";
import { ActivityLog } from "../common/ActivityLog";
import { FormField, SearchableSelectField } from "../FormElements";
import { displayDateTime } from "@/utils/helper";
import { displayPatientGender } from "@/utils/patient/helpers";
import {
  SearchPicker,
  medicineFrequencyOptions,
  medicineDurationOptions,
  medicineInstructionOptions,
} from "../clinicalRows";
import PrescriptionDocument, {
  type PrescriptionReferral,
} from "./PrescriptionDocument";

const vitalFields = [
  {
    key: "BP",
    label: "BP",
    placeholder: "120/80 mmHg",
    aliases: ["bp", "blood pressure"],
  },
  {
    key: "Pulse",
    label: "Pulse / PR",
    placeholder: "78 bpm",
    aliases: ["pulse", "pr"],
  },
  { key: "Spo2", label: "SpO2", placeholder: "98%", aliases: ["spo2", "spo₂"] },
  {
    key: "Temp",
    label: "Temp",
    placeholder: "98.6F",
    aliases: ["temp", "temperature"],
  },
  { key: "Height", label: "Height", placeholder: "170cm", aliases: ["height"] },
  { key: "Weight", label: "Weight", placeholder: "65kg", aliases: ["weight"] },
];

function parseVitalText(value: string) {
  const rows = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [name, ...rest] = item.split("=");
      return {
        name: String(name || "").trim(),
        value: rest.join("=").trim(),
      };
    })
    .filter((row) => row.name);
  return rows;
}

function readVitalValue(vitals: string, aliases: string[]) {
  const rows = parseVitalText(vitals);
  const lowered = aliases.map((alias) => alias.toLowerCase());
  return (
    rows.find((row) => lowered.includes(row.name.toLowerCase()))?.value || ""
  );
}

function updateVitalValue(
  vitals: string,
  key: string,
  aliases: string[],
  value: string,
) {
  const lowered = aliases.map((alias) => alias.toLowerCase());
  const rows = parseVitalText(vitals).filter(
    (row) => !lowered.includes(row.name.toLowerCase()),
  );
  if (value.trim()) rows.push({ name: key, value: value.trim() });
  return rows.map((row) => `${row.name}=${row.value}`).join(", ");
}

export function ConsultationWorkspace(props: any) {
  const {
    selected,
    patient,
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
    branchId,
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
    addendums,
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
  const [medicineDraftName, setMedicineDraftName] = useState("");
  const [labDraftName, setLabDraftName] = useState("");
  const [availableMedicineCatalog, setAvailableMedicineCatalog] =
    useState<any[]>(medicineCatalog);
  const [medicineCatalogLoading, setMedicineCatalogLoading] = useState(false);
  const [medicineCatalogError, setMedicineCatalogError] = useState("");
  const [availableLabCatalog, setAvailableLabCatalog] = useState<any[]>(
    Array.isArray(labCatalog) ? labCatalog : [],
  );
  const [externalLabLoading, setExternalLabLoading] = useState(false);
  const [externalLabError, setExternalLabError] = useState("");
  const [popularMedicines, setPopularMedicines] = useState<any[]>([]);
  const [popularLabTests, setPopularLabTests] = useState<any[]>([]);
  const [showPrescriptionPrint, setShowPrescriptionPrint] = useState(false);
  // The `patient` prop can arrive without `patient_number` (e.g. it hasn't
  // finished loading in the parent yet). Fetch it directly so the printed
  // Patient ID always matches the same patient_number shown on invoices,
  // instead of falling back to nothing or the internal record id.
  const [patientNumberFallback, setPatientNumberFallback] = useState("");
  useEffect(() => {
    setPatientNumberFallback("");
    if (!apiSession || !patient?.id || patient?.patient_number) return;
    let alive = true;
    apiFetch(`/patients/${patient.id}`, apiSession)
      .then((detail: any) => {
        if (alive) setPatientNumberFallback(detail?.patient_number || "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [patient?.id, patient?.patient_number, apiSession?.tenantId]);
  const selectedReferralDoctor = practitioners?.find(
    (p: any) => String(p.id) === String(referDoctorId),
  );

  const prescriptionReferrals: PrescriptionReferral[] = [
    ...referralItems
      .filter((item: any) => item.type === "lab")
      .map((item: any) => ({
        label: "Lab Test / Service",
        value: [item.name, item.priority, item.instructions]
          .map((part: any) => String(part || "").trim())
          .filter(Boolean)
          .join(" | "),
      })),
    ...(scanNeeded && scanTests
      ? [{ label: "Scan / Diagnostic", value: scanTests }]
      : []),
    ...(referDoctor && selectedReferralDoctor
      ? [
          {
            label: "Doctor Referral",
            value: `${selectedReferralDoctor.name}${selectedReferralDoctor.specialty ? ` - ${selectedReferralDoctor.specialty}` : ""}`,
          },
        ]
      : []),
    ...(admissionNeeded
      ? [{ label: "IP Admission", value: "Recommended" }]
      : []),
  ];

  // Renders PrescriptionDocument into the #prescription-print-root portal
  // (see app/layout.tsx) and calls window.print() directly on the current
  // page — no new tab/window, so there's nothing for a popup blocker to
  // intercept, and the print stylesheet already hides the rest of the app.
  // Clinic letterhead content is static (PrescriptionDocument's default), not
  // fetched per print.
  function handlePrintPrescription() {
    setShowPrescriptionPrint(true);
  }

  useEffect(() => {
    if (!showPrescriptionPrint) return;
    const timer = window.setTimeout(() => window.print(), 80);
    const handleAfterPrint = () => setShowPrescriptionPrint(false);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [showPrescriptionPrint]);
  // A signed consultation is a locked clinical record — only the addendum may
  // change. This flag locks every editable field below.
  const statusKey = (value: any) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replaceAll(" ", "_");
  const signed = statusKey(selected?.consultationStatus) === "signed";
  const selectedStatus = statusKey(selected?.status);
  const selectedQueueStatus = statusKey(
    selected?.queueStatus || selected?.queue_status,
  );
  const completeStatuses = [
    "consultation_completed",
    "consultation_done",
    "completed",
    "done",
    "seen",
    "billed",
  ];
  const cancelledStatuses = ["cancelled", "canceled", "no_show"];
  const queueActionsLocked =
    !selected ||
    signed ||
    completeStatuses.includes(selectedStatus) ||
    completeStatuses.includes(selectedQueueStatus) ||
    cancelledStatuses.includes(selectedStatus) ||
    cancelledStatuses.includes(selectedQueueStatus);
  const queueActionDisabled = Boolean(busy || queueActionsLocked);
  const activeMedicineCatalog = availableMedicineCatalog;
  const medicineOptions = activeMedicineCatalog.map((medicine: any) => ({
    value: medicine.id || medicine.slug || medicine.name,
    label: medicine.item_name || medicine.name,
    item: medicine,
  }));
  const selectedMedicine = activeMedicineCatalog.find(
    (medicine: any) =>
      (medicine.id || medicine.slug || medicine.name) === selectedMedicineId,
  );
  const activeLabCatalog = availableLabCatalog;
  const labOptions = activeLabCatalog.map((test: any) => ({
    value: test.id || test.slug || test.name,
    label: test.item_name || test.name,
    item: test,
  }));
  const selectedLabTest = activeLabCatalog.find(
    (test: any) => (test.id || test.slug || test.name) === selectedLabTestId,
  );
  useEffect(() => {
    setAvailableMedicineCatalog(
      Array.isArray(medicineCatalog) ? medicineCatalog : [],
    );
  }, [medicineCatalog]);
  useEffect(() => {
    setAvailableLabCatalog(Array.isArray(labCatalog) ? labCatalog : []);
  }, [labCatalog]);
  useEffect(() => {
    if (!apiSession?.tenantId) {
      setAvailableMedicineCatalog([]);
      return;
    }
    let alive = true;
    const search = medicineDraftName.trim();
    const timer = window.setTimeout(
      async () => {
        setMedicineCatalogLoading(true);
        setMedicineCatalogError("");
        try {
          const params = new URLSearchParams();
          if (search) params.set("search", search);
          const rows = await apiFetch(
            `/pharmacy/catalog/available-medicines${params.toString() ? `?${params}` : ""}`,
            apiSession,
          );
          if (alive)
            setAvailableMedicineCatalog(Array.isArray(rows) ? rows : []);
        } catch (err: any) {
          if (alive) {
            setAvailableMedicineCatalog([]);
            setMedicineCatalogError(
              err?.message || "Could not load medicine catalog.",
            );
          }
        } finally {
          if (alive) setMedicineCatalogLoading(false);
        }
      },
      search ? 250 : 0,
    );
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [apiSession, apiSession?.tenantId, medicineDraftName]);
  useEffect(() => {
    if (!apiSession?.tenantId) {
      setAvailableLabCatalog([]);
      return;
    }
    let alive = true;
    const search = labDraftName.trim();
    const timer = window.setTimeout(
      async () => {
        setExternalLabLoading(true);
        setExternalLabError("");
        try {
          const params = new URLSearchParams();
          if (branchId) params.set("branch_id", branchId);
          if (search) params.set("search", search);
          const rows = await apiFetch(
            `/lab/catalog/available-tests${params.toString() ? `?${params}` : ""}`,
            apiSession,
          );
          if (alive) setAvailableLabCatalog(Array.isArray(rows) ? rows : []);
        } catch (err: any) {
          if (alive) {
            setAvailableLabCatalog([]);
            setExternalLabError(
              err?.message || "Could not load the available lab tests.",
            );
          }
        } finally {
          if (alive) setExternalLabLoading(false);
        }
      },
      search ? 250 : 0,
    );
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [apiSession, apiSession?.tenantId, branchId, labDraftName]);
  useEffect(() => {
    if (!apiSession?.tenantId) {
      setPopularMedicines([]);
      setPopularLabTests([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const [meds, labs] = await Promise.all([
          apiFetch("/pharmacy/catalog/popular-medicines", apiSession).catch(
            () => [],
          ),
          apiFetch("/lab/catalog/popular-tests", apiSession).catch(() => []),
        ]);
        if (!alive) return;
        setPopularMedicines(Array.isArray(meds) ? meds : []);
        setPopularLabTests(Array.isArray(labs) ? labs : []);
      } catch {
        if (alive) {
          setPopularMedicines([]);
          setPopularLabTests([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [apiSession, apiSession?.tenantId]);
  // Suggestion tags prefer the most-used items from prescription/referral
  // history; fall back to the catalog when there is no history yet.
  const medicineSuggestions = popularMedicines.length
    ? popularMedicines
    : activeMedicineCatalog.slice(0, 8);
  const labSuggestions = popularLabTests.length
    ? popularLabTests
    : activeLabCatalog.slice(0, 8);
  function addDraftMedicine() {
    const name =
      selectedMedicine?.item_name ||
      selectedMedicine?.name ||
      medicineDraftName;
    if (!String(name || "").trim()) return;
    addMedicineFromText(
      name,
      selectedMedicine ? { item: selectedMedicine } : undefined,
    );
    setMedicineDraftName("");
  }
  function addDraftLabTest() {
    const name =
      selectedLabTest?.item_name || selectedLabTest?.name || labDraftName;
    if (!String(name || "").trim()) return;
    addLabFromText(
      name,
      selectedLabTest ? { item: selectedLabTest } : undefined,
    );
    setLabDraftName("");
  }
  return (
    <>
      <Card>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h3 className="card-title font-bold">Consultation Workspace</h3>
            <p className="card-desc text-slate-500">
              Structured vitals, complaints, diagnosis, prescription, follow-up
              and addendums.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 md:flex-wrap lg:flex-nowrap">
            <button
              onClick={() => setActive?.("doctor")}
              className="close-button font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={() => selected && callPatient(selected)}
              disabled={queueActionDisabled}
              className="close-button font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Call
            </button>
            <button
              onClick={skipPatient}
              disabled={queueActionDisabled}
              className="close-button font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Not Present
            </button>
            <button
              onClick={() => requeuePatient("after2")}
              disabled={queueActionDisabled}
              className="close-button font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Requeue
            </button>
            <button
              onClick={cancelAppointment}
              disabled={queueActionDisabled}
              className="close-button font-bold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel Appointment
            </button>
          </div>
        </div>
        {!selected ? (
          <div className="mt-5 rounded-lg bg-amber-50 p-4 card-desc text-amber-700">
            No appointment selected.
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <button
                type="button"
                onClick={() => openPatientDetails?.()}
                className="rounded-lg bg-slate-50 p-4 text-left transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              >
                <p className="text-xs text-slate-500">Patient</p>
                <p className="font-bold">
                  {patient?.name || selected?.patient || "-"}
                </p>
              </button>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Age / Gender</p>
                <p className="font-bold">
                  {patient?.age_years ?? patient?.age ?? "-"} /{" "}
                  {displayPatientGender(patient?.gender)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Visit Type</p>
                <p className="font-bold capitalize">
                  {(selected?.visitType || "OP").toLowerCase()}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selected?.isBillable === false
                    ? "Free"
                    : selected?.customFeeAmount != null
                      ? `Charge ₹${Number(selected.customFeeAmount).toLocaleString("en-IN")}`
                      : "As per fee rule"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openPatientDetails?.()}
                className="rounded-lg bg-slate-50 p-4 text-left transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              >
                <p className="text-xs text-slate-500">More</p>
                <p className="font-bold text-slate-900 underline underline-offset-2">
                  Patient Details →
                </p>
              </button>
            </div>
            <fieldset
              disabled={signed}
              className={`m-0 min-w-0 space-y-5 border-0 p-0 ${signed ? "opacity-75" : ""}`}
            >
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
                      className="rounded-lg border px-3 py-2 text-xs font-bold"
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-3">
                <FormField label="Treatment Type">
                  <SearchableSelect
                    // label="Treatment Type"
                    searchable={false}
                    value={treatmentType}
                    onChange={setTreatmentType}
                    options={[
                      {
                        value: "general_consultation",
                        label: "General Consultation",
                      },
                      { value: "doctor_review", label: "Doctor Review" },
                      {
                        value: "fitness_certificate",
                        label: "Fitness Certificate",
                      },
                      {
                        value: "pediatric_consultation",
                        label: "Pediatric Consultation",
                      },
                      {
                        value: "diabetology_consultation",
                        label: "Diabetology Consultation",
                      },
                      { value: "procedure_review", label: "Procedure Review" },
                      { value: "follow_up", label: "Follow-up" },
                    ]}
                  />
                </FormField>
                <FormField label="Follow-up Advice">
                  <Input
                    value={remarks}
                    onChange={(e: any) => setRemarks(e.target.value)}
                    placeholder="Review after 3 days"
                  />
                </FormField>
                <FormField label="Complaints">
                  <Input
                    value={complaints}
                    onChange={(e: any) => setComplaints(e.target.value)}
                    placeholder="Fever | 2 days | medium"
                  />
                </FormField>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="mb-3 flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                  <p className="text-xs font-bold uppercase text-slate-700">
                    Vital Signs
                  </p>
                  <p className="text-xs font-semibold text-slate-400">
                    Saved with this consultation and printed on prescription.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {vitalFields.map((field) => (
                    <FormField key={field.key} label={field.label}>
                      <Input
                        value={readVitalValue(vitals, field.aliases)}
                        onChange={(e: any) =>
                          setVitals(
                            updateVitalValue(
                              vitals,
                              field.key,
                              field.aliases,
                              e.target.value,
                            ),
                          )
                        }
                        placeholder={field.placeholder}
                      />
                    </FormField>
                  ))}
                </div>
              </div>
              <FormField label="Doctor Notes">
                <textarea
                  value={notes}
                  onChange={(e: any) => setNotes(e.target.value)}
                  className="min-h-28 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none"
                  placeholder="Clinical notes, advice..."
                />
              </FormField>

              {/* Medicine */}
              <div className="rounded-lg bg-slate-50 p-4">
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
                        setMedicineDraftName(
                          medicine?.item_name || medicine?.name || "",
                        );
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
                          medicine?.item_name,
                          medicine?.strength,
                          medicine?.generic_name,
                          medicine?.brand_name,
                          medicine?.category,
                          medicine?.slug,
                        ]
                          .filter(Boolean)
                          .join(" ")
                      }
                      loading={medicineCatalogLoading}
                    />
                    {!medicineCatalogLoading && medicineCatalogError && (
                      <p className="mt-1 text-xs font-semibold text-red-500">
                        {medicineCatalogError}
                      </p>
                    )}
                  </Field>
                  <FormField label="Dosage">
                    <Input
                      value={medicineDosage}
                      onChange={(e: any) => setMedicineDosage(e.target.value)}
                      placeholder="500mg"
                    />
                  </FormField>
                  <FormField label="Frequency">
                    <SearchableSelect
                      value={medicineFrequency}
                      onChange={(value: string) => setMedicineFrequency(value)}
                      options={[
                        ...new Set([
                          medicineFrequency,
                          ...medicineFrequencyOptions,
                        ]),
                      ]
                        .filter(Boolean)
                        .map((value: string) => ({
                          value,
                          label: value,
                        }))}
                      placeholder="Select frequency"
                      searchable
                    />
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
                    <SearchableSelect
                      value={medicineInstructions}
                      onChange={(value: string) =>
                        setMedicineInstructions(value)
                      }
                      options={[
                        ...new Set([
                          medicineInstructions,
                          ...medicineInstructionOptions,
                        ]),
                      ]
                        .filter(Boolean)
                        .map((value: string) => ({
                          value,
                          label: value,
                        }))}
                      placeholder="Select instruction"
                      searchable
                    />
                  </FormField>
                  <Button
                    type="button"
                    className="save-button md:w-[50%] lg:w-full"
                    onClick={addDraftMedicine}
                  >
                    Add
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {medicineSuggestions.map((medicine: any) => (
                    <button
                      key={medicine.id || medicine.slug || medicine.name}
                      type="button"
                      onClick={() => {
                        // Fill the search field only — the doctor reviews/edits
                        // dosage, frequency, duration and instructions before
                        // clicking Add, instead of a suggestion silently adding
                        // a row with whatever defaults were left in the form.
                        setSelectedMedicineId(medicine.id || "");
                        setMedicineDraftName(
                          medicine.item_name || medicine.name || "",
                        );
                        if (medicine.strength)
                          setMedicineDosage(medicine.strength);
                      }}
                      className="rounded-lg border bg-white px-3 py-2 text-xs font-bold"
                    >
                      {medicine.item_name || medicine.name}
                    </button>
                  ))}
                </div>
                <div className="mt-4">
                  <FormField label="Prescription Medicine Rows">
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                      {medicineItems.length === 0 ? (
                        <p className="px-3 py-2 text-xs font-semibold text-slate-400">
                          No medicines added yet.
                        </p>
                      ) : (
                        medicineItems.map((medicine: any, index: number) => (
                          <div
                            key={`${medicine.name || "medicine"}-${index}`}
                            className="flex items-center justify-between gap-2 px-3 py-2"
                          >
                            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
                              {[
                                medicine.name,
                                medicine.dosage,
                                medicine.frequency,
                                medicine.duration,
                                medicine.instructions,
                              ]
                                .map((part: any) => String(part || "").trim())
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                            {!signed && (
                              <button
                                type="button"
                                onClick={() => removeMedicineItem(index)}
                                className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-red-500 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </FormField>
                </div>
              </div>
              {/* Lab Service */}
              <div className="grid gap-3">
                <div className="rounded-lg bg-slate-50 p-4">
                  <div className="mt-3 grid gap-2 md:grid-cols-[2fr_1fr_1.5fr_auto] md:items-end">
                    <FormField label="Lab & Service">
                      <SearchPicker
                        value={selectedLabTestId}
                        inputValue={labDraftName}
                        onInputValueChange={(text: string) => {
                          setLabDraftName(text);
                          if (!text) setSelectedLabTestId("");
                        }}
                        onChange={(id: string, test: any) => {
                          setSelectedLabTestId(id);
                          setLabDraftName(test?.item_name || test?.name || "");
                        }}
                        options={labOptions}
                        placeholder="Type lab test name"
                        onUseTyped={(text: string) => {
                          setSelectedLabTestId("");
                          setLabDraftName(text);
                        }}
                        getSearchText={(test: any) =>
                          [
                            test?.item_name,
                            test?.name,
                            test?.sample_type,
                            test?.category,
                            test?.code,
                            test?.slug,
                          ]
                            .filter(Boolean)
                            .join(" ")
                        }
                        loading={externalLabLoading}
                      />
                      {!externalLabLoading && externalLabError && (
                        <p className="mt-1 text-xs font-semibold text-red-500">
                          {externalLabError}
                        </p>
                      )}
                    </FormField>
                    <FormField label="Lab Priority">
                      <SearchableSelect
                        value={labPriority}
                        onChange={(value: string) => setLabPriority(value)}
                        options={[
                          { value: "routine", label: "Routine" },
                          { value: "urgent", label: "Urgent" },
                          { value: "stat", label: "STAT" },
                        ]}
                        placeholder="Select priority"
                        searchable={false} // optional: cleaner UX for small lists
                      />
                    </FormField>
                    <FormField label="Instructions">
                      <Input
                        value={labInstructions}
                        onChange={(e: any) =>
                          setLabInstructions(e.target.value)
                        }
                        placeholder="Instructions"
                      />
                    </FormField>
                    <Button
                      type="button"
                      className="save-button"
                      onClick={addDraftLabTest}
                    >
                      Add Lab Test
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {labSuggestions.map((l: any) => (
                      <button
                        key={l.id || l.slug || l.name}
                        type="button"
                        onClick={() => {
                          // Fill the search field only — the doctor picks
                          // priority (routine/urgent/STAT) and instructions
                          // before clicking Add Lab Test.
                          setSelectedLabTestId(l.id || "");
                          setLabDraftName(l.item_name || l.name || "");
                        }}
                        className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700"
                      >
                        {l.item_name || l.name}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4">
                    <Field label="Prescried Lab / Service">
                      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                        {referralItems.filter((item: any) => item.type === "lab")
                          .length === 0 ? (
                          <p className="px-3 py-2 text-xs font-semibold text-slate-400">
                            No lab tests added yet.
                          </p>
                        ) : (
                          referralItems
                            .map((item: any, index: number) => ({
                              item,
                              index,
                            }))
                            .filter(({ item }: any) => item.type === "lab")
                            .map(({ item, index }: any) => (
                              <div
                                key={`${item.name || "lab"}-${index}`}
                                className="flex items-center justify-between gap-2 px-3 py-2"
                              >
                                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
                                  {[item.name, item.priority, item.instructions]
                                    .map((part: any) =>
                                      String(part || "").trim(),
                                    )
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                                {!signed && (
                                  <button
                                    type="button"
                                    onClick={() => removeReferralItem(index)}
                                    className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-red-500 hover:bg-red-50"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            ))
                        )}
                      </div>
                    </Field>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 p-4">
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
                        <Badge key={s.id}>{s.name}moses</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-4">
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
                          onChange={(e: any) =>
                            setReferDoctorId(e.target.value)
                          }
                        >
                          {practitioners
                            .filter(
                              (p: any) =>
                                p.role === "Doctor" && p.id !== doctor.id,
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
                  <div className="rounded-lg bg-slate-50 p-4">
                    <label className="flex items-center gap-3 font-bold">
                      <input
                        type="checkbox"
                        checked={admissionNeeded}
                        onChange={(e: any) =>
                          setAdmissionNeeded(e.target.checked)
                        }
                      />
                      <span>Refer for IP Admission</span>
                    </label>
                  </div>
                </div>
              </div>
            </fieldset>
            {selected?.consultationStatus === "signed" && (
              <div className="rounded-lg bg-emerald-50 p-4">
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
                  <Badge tone="green" className="normal-badge">
                    Ready for billing
                  </Badge>
                </div>
                <FormField label="Signed Record Addendum">
                  <textarea
                    value={addendumNote}
                    onChange={(e: any) => setAddendumNote(e.target.value)}
                    className="min-h-20 w-full rounded-lg border border-emerald-100 px-4 py-3 text-sm outline-none"
                    placeholder="Add clarification without changing signed record"
                  />
                </FormField>
                <Button
                  onClick={saveAddendum}
                  disabled={busy || !addendumNote.trim()}
                >
                  Save Addendum
                </Button>
                {addendums?.length ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-bold uppercase text-emerald-900">
                      Saved addendums
                    </p>
                    {addendums.map((addendum: any) => (
                      <div
                        key={
                          addendum.id || addendum.created_at || addendum.note
                        }
                        className="rounded-lg border border-emerald-100 bg-white p-3 text-sm"
                      >
                        <p className="whitespace-pre-wrap text-slate-700">
                          {addendum.note}
                        </p>
                        <p className="mt-2 text-xs font-semibold text-slate-400">
                          {displayDateTime(addendum.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
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
                  className="bg-emerald-700 text-xs lg:text-sm py-2 px-2 lg:py-3 lg:px-4"
                >
                  Complete
                </Button>
              )}
              <Button
                type="button"
                onClick={handlePrintPrescription}
                className="text-xs lg:text-sm py-2 px-2 lg:py-3 lg:px-4"
              >
                Print Prescription
              </Button>
              <button
                onClick={() => requeuePatient("end")}
                disabled={queueActionDisabled}
                className="rounded-lg border px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Requeue to End
              </button>
              <button
                onClick={callNextInWorkspace}
                className="rounded-lg border px-4 py-3 text-sm font-bold"
              >
                Call Next Patient
              </button>
            </div>
            <ActivityLog
              resourceType="consultation"
              resourceId={selected?.consultationId}
              apiSession={apiSession}
            />
          </div>
        )}
      </Card>
      {showPrescriptionPrint &&
        typeof document !== "undefined" &&
        document.getElementById("prescription-print-root") &&
        createPortal(
          <PrescriptionDocument
            doctor={{
              name: doctor?.name,
              registrationNumber: doctor?.registrationNumber,
              specialty: doctor?.specialty,
              signatureUrl: doctor?.signatureUrl,
            }}
            patientName={patient?.name || selected?.patient || ""}
            patientId={patient?.patient_number || patientNumberFallback}
            vitals={vitals}
            notes={notes}
            medicines={medicineItems.map((item: any) => ({
              name: item.name,
              dosage: item.dosage,
              frequency: item.frequency,
              duration: item.duration,
              instructions: item.instructions,
            }))}
            referrals={prescriptionReferrals}
          />,
          document.getElementById("prescription-print-root") as HTMLElement,
        )}
    </>
  );
}
