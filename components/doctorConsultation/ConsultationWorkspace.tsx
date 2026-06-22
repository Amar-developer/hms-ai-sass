import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Card, Select, Input, Field, Button, Badge} from "../common/ui";
import { FormField } from "../FormElements";
import {
  SearchPicker,
  TagEntryBox,
  medicineFrequencyOptions,
  medicineDurationOptions,
  medicineInstructionOptions,
} from "../clinicalRows";

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
  const [medicineTagText, setMedicineTagText] = useState("");
  const [labTagText, setLabTagText] = useState("");
  const [medicineDraftName, setMedicineDraftName] = useState("");
  const [labDraftName, setLabDraftName] = useState("");
  const [availableMedicineCatalog, setAvailableMedicineCatalog] =
    useState<any[]>(medicineCatalog);
  const [medicineCatalogLoading, setMedicineCatalogLoading] = useState(false);
  const [medicineCatalogError, setMedicineCatalogError] = useState("");
  const [externalLabCatalog, setExternalLabCatalog] = useState<any[]>([]);
  const [externalLabLoading, setExternalLabLoading] = useState(false);
  const [externalLabError, setExternalLabError] = useState("");
  const [popularMedicines, setPopularMedicines] = useState<any[]>([]);
  const [popularLabTests, setPopularLabTests] = useState<any[]>([]);
  // A signed consultation is a locked clinical record — only the addendum may
  // change. This flag locks every editable field below.
  const signed = selected?.consultationStatus === "signed";
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
  const activeLabCatalog = externalLabCatalog;
  const labOptions = activeLabCatalog.map((test: any) => ({
    value: test.id || test.slug || test.name,
    label: test.item_name || test.name,
    item: test,
  }));
  const selectedLabTest = activeLabCatalog.find(
    (test: any) => test.id === selectedLabTestId,
  );
  useEffect(() => {
    setAvailableMedicineCatalog(
      Array.isArray(medicineCatalog) ? medicineCatalog : [],
    );
  }, [medicineCatalog]);
  useEffect(() => {
    if (!apiSession?.token) {
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
  }, [apiSession?.token, apiSession?.tenantId, medicineDraftName]);
  useEffect(() => {
    if (!apiSession?.token) {
      setExternalLabCatalog([]);
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
          if (search) params.set("search", search);
          const rows = await apiFetch(
            `/lab/catalog/available-tests${params.toString() ? `?${params}` : ""}`,
            apiSession,
          );
          if (alive) setExternalLabCatalog(Array.isArray(rows) ? rows : []);
        } catch (err: any) {
          if (alive) {
            setExternalLabCatalog([]);
            setExternalLabError(
              err?.message || "Could not load ERPNext lab tests.",
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
  }, [apiSession?.token, apiSession?.tenantId, labDraftName]);
  useEffect(() => {
    if (!apiSession?.token) {
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
  }, [apiSession?.token, apiSession?.tenantId]);
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
    <Card>
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h3 className="card-title font-bold">
            Consultation Workspace
          </h3>
          <p className="card-desc text-slate-500">
            Structured vitals, complaints, diagnosis, prescription,
            follow-up and addendums.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:flex-nowrap">
          <button
            onClick={() => setActive?.("doctor")}
            className="close-button font-bold"
          >
           Back
          </button>
          <button
            onClick={() => selected && callPatient(selected)}
            className="close-button font-bold"
          >
            Call
          </button>
          <button
            onClick={skipPatient}
            className="close-button font-bold"
          >
            Not Present
          </button>
          <button
            onClick={() => requeuePatient("after2")}
            className="close-button font-bold"
          >
            Requeue
          </button>
          <button
            onClick={cancelAppointment}
            className="close-button font-bold text-red-600"
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
                {patient?.gender ?? "-"}
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
            <FormField label="Vitals">
              <Input
                value={vitals}
                onChange={(e: any) => setVitals(e.target.value)}
                placeholder="BP=120/80 mmHg, Pulse=78 bpm"
              />
            </FormField>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Complaints Rows">
              <textarea
                value={complaints}
                onChange={(e: any) => setComplaints(e.target.value)}
                className="min-h-20 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none"
                placeholder="Fever | 2 days | medium"
              />
            </FormField>
            <FormField label="Doctor Notes">
              <textarea
                value={notes}
                onChange={(e: any) => setNotes(e.target.value)}
                className="min-h-20 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none"
                placeholder="Clinical notes, advice..."
              />
            </FormField>
          </div>
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
              {medicineSuggestions.map((medicine: any) => (
                <button
                  key={medicine.id || medicine.slug || medicine.name}
                  type="button"
                  onClick={() =>
                    addMedicineFromText(medicine.item_name || medicine.name, {
                      item: medicine,
                    })
                  }
                  className="rounded-lg border bg-white px-3 py-2 text-xs font-bold"
                >
                  {medicine.item_name || medicine.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3">
            <div className="rounded-lg bg-slate-50 p-4">
              <Field label="Lab Tests">
                <TagEntryBox
                  tags={referralItems.filter(
                    (item: any) => item.type === "lab",
                  )}
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
              <div className="mt-3 grid gap-2 md:grid-cols-[2fr_1fr_1.5fr_auto] md:items-end">
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
              <div className="mt-2 flex flex-wrap gap-1">
                {labSuggestions.map((l: any) => (
                  <button
                    key={l.id || l.slug || l.name}
                    type="button"
                    onClick={() =>
                      addLabFromText(l.item_name || l.name, { item: l })
                    }
                    className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700"
                  >
                    {l.item_name || l.name}
                  </button>
                ))}
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
              <div className="rounded-lg bg-slate-50 p-4">
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
                <Badge tone="green" className="normal-badge">Ready for billing</Badge>
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
            <button
              onClick={() => requeuePatient("end")}
              className="rounded-lg border px-4 py-3 text-sm font-bold"
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
        </div>
      )}
    </Card>
  );
}
