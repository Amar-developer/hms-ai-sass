import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import {
  Card,
  Select,
  Input,
  Button,
  Badge,
  SearchableSelect,
} from "@/app/components/common/ui";
import { ActivityLog } from "@/app/components/common/ActivityLog";
import { FormField } from "@/app/components/FormElements";
import { displayDateTime } from "@/utils/helper";
import { displayPatientGender } from "@/features/patients/helpers";
import {
  SearchPicker,
  medicineFrequencyOptions,
  medicineDurationOptions,
  medicineInstructionOptions,
} from "@/app/components/clinicalRows";
import PrescriptionDocument, {
  type PrescriptionReferral,
} from "./PrescriptionDocument";
import { exportPrescriptionPdf } from "../exportPrescriptionPdf";
import {
  COMPLAINT_SUGGESTIONS,
  treatment_type_options,
  vitalFields,
} from "../constants";
import { useConsultationWorkspaceData } from "../api";

function safeFilename(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
    validationAttempted,
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
  const [medicineAddAttempted, setMedicineAddAttempted] = useState(false);
  const [labAddAttempted, setLabAddAttempted] = useState(false);
  const [showPrescriptionPrint, setShowPrescriptionPrint] = useState(false);
  const [isExportingPrescription, setIsExportingPrescription] = useState(false);
  // The `patient` prop can arrive without `patient_number` (e.g. it hasn't
  // finished loading in the parent yet). The workspace data hook fetches it
  // directly so the printed Patient ID always matches the same
  // patient_number shown on invoices, instead of falling back to nothing or
  // the internal record id.
  const {
    availableMedicineCatalog,
    medicineCatalogLoading,
    medicineCatalogError,
    availableLabCatalog,
    externalLabLoading,
    externalLabError,
    popularMedicines,
    popularLabTests,
    patientNumberFallback,
  } = useConsultationWorkspaceData({
    apiSession,
    patient,
    branchId,
    medicineCatalog,
    labCatalog,
    medicineSearch: medicineDraftName,
    labSearch: labDraftName,
  });
  console.log(availableMedicineCatalog,'availableCatalog')
  useEffect(() => {
    setMedicineAddAttempted(false);
    setLabAddAttempted(false);
  }, [selected?.id]);
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
  // (see app/layout.tsx), then captures it to a PDF via exportPrescriptionPdf
  // and downloads it directly — same approach as the invoice receipt page,
  // so there's no browser print dialog and no print header/footer. Clinic
  // letterhead content is static (PrescriptionDocument's default), not
  // fetched per print.
  function handlePrintPrescription() {
    setShowPrescriptionPrint(true);
  }

  useEffect(() => {
    if (!showPrescriptionPrint) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const root = document.getElementById("prescription-print-root");
      if (!root) {
        if (!cancelled) setShowPrescriptionPrint(false);
        return;
      }
      setIsExportingPrescription(true);
      try {
        await document.fonts?.ready;
        await Promise.all(
          Array.from(document.images).map((img) =>
            img.complete
              ? Promise.resolve()
              : img.decode().catch(() => undefined),
          ),
        );
        if (cancelled) return;
        const filename =
          [
            safeFilename(patient?.name || selected?.patient),
            safeFilename(patient?.patient_number || patientNumberFallback),
          ]
            .filter(Boolean)
            .join("-") || "prescription";
        await exportPrescriptionPdf(root, filename);
      } finally {
        if (!cancelled) {
          setIsExportingPrescription(false);
          setShowPrescriptionPrint(false);
        }
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
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
    const dosage = medicineDosage || selectedMedicine?.strength || "";
    setMedicineAddAttempted(true);
    if (
      !String(name || "").trim() ||
      !String(dosage).trim() ||
      !String(medicineFrequency || "").trim()
    )
      return;
    addMedicineFromText(
      name,
      selectedMedicine ? { item: selectedMedicine } : undefined,
    );
    setMedicineAddAttempted(false);
    setMedicineDraftName("");
  }
  function addDraftLabTest() {
    const name =
      selectedLabTest?.item_name || selectedLabTest?.name || labDraftName;
    setLabAddAttempted(true);
    if (!String(name || "").trim() || !String(labPriority || "").trim()) return;
    addLabFromText(
      name,
      selectedLabTest ? { item: selectedLabTest } : undefined,
    );
    setLabAddAttempted(false);
    setLabDraftName("");
  }
  const treatmentTypeError =
    validationAttempted && !String(treatmentType || "").trim()
      ? "Treatment type is required."
      : undefined;
  const complaintsError =
    validationAttempted && !String(complaints || "").trim()
      ? "At least one complaint is required."
      : undefined;
  const diagnosisError =
    validationAttempted && !String(diagnosisRows || "").trim()
      ? "At least one diagnosis is required."
      : undefined;
  const doctorNotesError =
    validationAttempted && !String(notes || "").trim()
      ? "Doctor notes are required."
      : undefined;
  const medicineName =
    selectedMedicine?.item_name || selectedMedicine?.name || medicineDraftName;
  const medicineNameError =
    medicineAddAttempted && !String(medicineName || "").trim()
      ? "Medicine name is required."
      : undefined;
  const medicineDosageError =
    medicineAddAttempted &&
    !String(medicineDosage || selectedMedicine?.strength || "").trim()
      ? "Dosage is required."
      : undefined;
  const medicineFrequencyError =
    medicineAddAttempted && !String(medicineFrequency || "").trim()
      ? "Frequency is required."
      : undefined;
  const incompleteMedicineNames = medicineItems
    .filter(
      (medicine: any) =>
        !String(medicine.dosage || "").trim() ||
        !String(medicine.frequency || "").trim(),
    )
    .map((medicine: any) => medicine.name)
    .filter(Boolean);
  const medicineRowsError =
    validationAttempted && incompleteMedicineNames.length
      ? `${incompleteMedicineNames.join(", ")} requires dosage and frequency.`
      : undefined;
  const labName =
    selectedLabTest?.item_name || selectedLabTest?.name || labDraftName;
  const labNameError =
    labAddAttempted && !String(labName || "").trim()
      ? "Lab or service name is required."
      : undefined;
  const labPriorityError =
    labAddAttempted && !String(labPriority || "").trim()
      ? "Priority is required."
      : undefined;
  const scanError =
    validationAttempted && scanNeeded && !String(scanTests || "").trim()
      ? "Scan or diagnostic name is required."
      : undefined;
  const referralDoctorError =
    validationAttempted && referDoctor && !referDoctorId
      ? "Recommended doctor is required."
      : undefined;
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
            <p className="mt-1 text-xs font-semibold text-slate-500">
              <span className="text-red-500">*</span> Required to complete the
              consultation.
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
              <div className="grid gap-3 md:grid-cols-2">
                <FormField
                  label="Treatment Type"
                  required
                  error={treatmentTypeError}
                  className={
                    treatmentTypeError ? "[&_button]:border-red-400" : ""
                  }
                >
                  <SearchableSelect
                    // label="Treatment Type"
                    searchable={false}
                    value={treatmentType}
                    onChange={setTreatmentType}
                    options={treatment_type_options}
                    required
                  />
                </FormField>
                <FormField label="Follow-up Advice">
                  <Input
                    value={remarks}
                    onChange={(e: any) => setRemarks(e.target.value)}
                    placeholder="Review after 3 days"
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
              <div className="grid gap-3 md:grid-cols-2">
                <FormField
                  label="Complaints Rows"
                  required
                  error={complaintsError}
                >
                  <textarea
                    required
                    aria-invalid={Boolean(complaintsError) || undefined}
                    value={complaints}
                    onChange={(e: any) => setComplaints(e.target.value)}
                    className={`min-h-20 w-full rounded-lg border px-4 py-3 text-sm outline-none ${
                      complaintsError
                        ? "border-red-400 focus:border-red-500"
                        : "border-slate-200 focus:border-slate-500"
                    }`}
                    placeholder="Fever | 2 days | medium"
                  />

                  {/* Suggestions – show at least 5 */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {COMPLAINT_SUGGESTIONS.slice(0, 8).map((suggestion) => {
                      const alreadyAdded = complaints
                        .split("\n")
                        .map((line) => line.trim())
                        .includes(suggestion);

                      return (
                        <button
                          key={suggestion}
                          type="button"
                          disabled={alreadyAdded}
                          onClick={() => {
                            setComplaints((prev: string) =>
                              prev.trim()
                                ? `${prev.trim()}\n${suggestion}`
                                : suggestion,
                            );
                          }}
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                            alreadyAdded
                              ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                              : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                          }`}
                        >
                          {suggestion}
                        </button>
                      );
                    })}
                  </div>
                </FormField>
                <FormField label="Diagnosis" required error={diagnosisError}>
                  <textarea
                    required
                    aria-invalid={Boolean(diagnosisError) || undefined}
                    value={diagnosisRows}
                    onChange={(e: any) => setDiagnosisRows(e.target.value)}
                    className={`min-h-20 w-full rounded-lg border px-4 py-3 text-sm outline-none ${
                      diagnosisError
                        ? "border-red-400 focus:border-red-500"
                        : "border-slate-200 focus:border-slate-500"
                    }`}
                    placeholder="Viral fever | primary | optional notes"
                  />
                </FormField>
              </div>
              <FormField label="Doctor Notes" required error={doctorNotesError}>
                <textarea
                  required
                  aria-invalid={Boolean(doctorNotesError) || undefined}
                  value={notes}
                  onChange={(e: any) => setNotes(e.target.value)}
                  className={`min-h-20 w-full rounded-lg border px-4 py-3 text-sm outline-none ${
                    doctorNotesError
                      ? "border-red-400 focus:border-red-500"
                      : "border-slate-200 focus:border-slate-500"
                  }`}
                  placeholder="Clinical notes, advice..."
                />
              </FormField>

              {/* Medicine */}
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="grid gap-3 lg:grid-cols-[1.35fr_.8fr_.7fr_.7fr_.9fr_auto] lg:items-start">
                  <FormField
                    label="Medicine"
                    required
                    error={medicineNameError}
                    hint="Required only when adding a medicine."
                    className={
                      medicineNameError ? "[&_input]:border-red-400" : ""
                    }
                  >
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
                  </FormField>
                  <FormField
                    label="Dosage"
                    required
                    error={medicineDosageError}
                    className={
                      medicineDosageError ? "[&_input]:border-red-400" : ""
                    }
                  >
                    <Input
                      required
                      aria-invalid={Boolean(medicineDosageError) || undefined}
                      value={medicineDosage}
                      onChange={(e: any) => setMedicineDosage(e.target.value)}
                      placeholder="500mg"
                    />
                  </FormField>
                  <FormField
                    label="Frequency"
                    required
                    error={medicineFrequencyError}
                    className={
                      medicineFrequencyError ? "[&_button]:border-red-400" : ""
                    }
                  >
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
                      required
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
                    className="save-button md:w-[50%] lg:mt-[23px] lg:w-full"
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
                  <FormField
                    label="Prescription Medicine Rows"
                    error={medicineRowsError}
                  >
                    <div className="scrollbar-hidden max-h-[292px] overflow-auto rounded-lg border border-slate-200 bg-white">
                      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase text-slate-600">
                          <tr>
                            <th className="px-3 py-2.5">Medicine</th>
                            <th className="px-3 py-2.5">Dosage</th>
                            <th className="px-3 py-2.5">Frequency</th>
                            <th className="px-3 py-2.5">Duration</th>
                            <th className="px-3 py-2.5">Instructions</th>
                            <th className="px-3 py-2.5 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {medicineItems.length ? (
                            medicineItems.map(
                              (medicine: any, index: number) => (
                                <tr
                                  key={`${medicine.name}-${index}`}
                                  className="h-[51px]"
                                >
                                  <td className="px-3 py-2.5 font-semibold text-slate-900">
                                    {medicine.name || "-"}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {medicine.dosage || "-"}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {medicine.frequency || "-"}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {medicine.duration || "-"}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {medicine.instructions || "-"}
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => removeMedicineItem(index)}
                                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50"
                                    >
                                      Remove
                                    </button>
                                  </td>
                                </tr>
                              ),
                            )
                          ) : (
                            <tr>
                              <td
                                colSpan={6}
                                className="px-3 py-5 text-center text-slate-500"
                              >
                                No medicines added yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </FormField>
                </div>
              </div>
              {/* Lab Service */}
              <div className="grid gap-3">
                <div className="rounded-lg bg-slate-50 p-4">
                  <div className="mt-3 grid gap-2 md:grid-cols-[2fr_1fr_1.5fr_auto] md:items-start">
                    <FormField
                      label="Lab/Service"
                      required
                      error={labNameError}
                      hint="Required only when adding a lab or service."
                      className={labNameError ? "[&_input]:border-red-400" : ""}
                    >
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
                    <FormField
                      label="Priority"
                      required
                      error={labPriorityError}
                      className={
                        labPriorityError ? "[&_button]:border-red-400" : ""
                      }
                    >
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
                        required
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
                      className="save-button md:mt-[23px]"
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
                    <FormField label="Lab & Service">
                      <div className="scrollbar-hidden max-h-[292px] overflow-auto rounded-lg border border-slate-200 bg-white">
                        <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                          <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase text-slate-600">
                            <tr>
                              <th className="px-3 py-2.5">Lab / Service</th>
                              <th className="px-3 py-2.5">Priority</th>
                              <th className="px-3 py-2.5">Instructions</th>
                              <th className="px-3 py-2.5 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {referralItems.some(
                              (item: any) => item.type === "lab",
                            ) ? (
                              referralItems.map((item: any, index: number) =>
                                item.type === "lab" ? (
                                  <tr
                                    key={`${item.name}-${index}`}
                                    className="h-[51px]"
                                  >
                                    <td className="px-3 py-2.5 font-semibold text-slate-900">
                                      {item.name || "-"}
                                    </td>
                                    <td className="px-3 py-2.5 capitalize">
                                      {item.priority || "routine"}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      {item.instructions || "-"}
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeReferralItem(index)
                                        }
                                        className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50"
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                ) : null,
                              )
                            ) : (
                              <tr>
                                <td
                                  colSpan={4}
                                  className="px-3 py-5 text-center text-slate-500"
                                >
                                  No lab tests added yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </FormField>
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
                      <FormField
                        label="Scan / Diagnostic"
                        required
                        error={scanError}
                        className={scanError ? "[&_input]:border-red-400" : ""}
                      >
                        <Input
                          required
                          aria-invalid={Boolean(scanError) || undefined}
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
                      <SearchableSelect
                        required
                        name="referDoctorId"
                        value={referDoctorId}
                        onChange={(value) => setReferDoctorId(value)}
                        searchable={false}
                        options={[
                          { value: "", label: "Select doctor" },
                          ...practitioners
                            .filter(
                              (p: any) =>
                                p.role === "Doctor" && p.id !== doctor.id,
                            )
                            .map((p: any) => ({
                              value: p.id,
                              label: `${p.name} - ${p.specialty}`,
                            })),
                        ]}
                        aria-invalid={Boolean(referralDoctorError) || undefined}
                      />
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
                      Completed consultation
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
                <FormField
                  label="Completed Record Addendum"
                  required
                  hint="Required before saving an addendum."
                >
                  <textarea
                    required
                    value={addendumNote}
                    onChange={(e: any) => setAddendumNote(e.target.value)}
                    className="min-h-20 w-full rounded-lg border border-emerald-100 px-4 py-3 text-sm outline-none"
                    placeholder="Add clarification without changing completed record"
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
                type="button"
                onClick={apiSession ? saveBackendDraft : markDone}
                disabled={busy || selected?.consultationStatus === "signed"}
              >
                <ButtonLoader loading={busy}>
                  {apiSession
                    ? busy
                      ? "Saving..."
                      : "Save Draft"
                    : "Mark Consultation Done"}
                </ButtonLoader>
              </Button>
              {apiSession && (
                <Button
                  type="button"
                  onClick={signBackendConsultation}
                  disabled={busy || selected?.consultationStatus === "signed"}
                  className="bg-emerald-700 text-xs lg:text-sm py-2 px-2 lg:py-3 lg:px-4"
                >
                  <ButtonLoader loading={busy}>
                    {busy ? "Signing..." : "Complete"}
                  </ButtonLoader>
                </Button>
              )}
              <Button
                type="button"
                onClick={handlePrintPrescription}
                disabled={isExportingPrescription}
                className="text-xs lg:text-sm py-2 px-2 lg:py-3 lg:px-4"
              >
                {isExportingPrescription ? "Generating…" : "Print Prescription"}
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
            {selected?.consultationId && (
              <ActivityLog
                resourceType="consultation"
                resourceId={selected.consultationId}
                apiSession={apiSession}
              />
            )}
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
