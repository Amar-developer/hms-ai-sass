"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardPlus, Pencil, Plus, Trash2 } from "lucide-react";

import { FormField } from "@/app/components/FormElements";
import {
  Button,
  Card,
  Input,
  SearchableSelect,
  StatusToast,
} from "@/app/components/common/ui";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import {
  SearchPicker,
  medicineDurationOptions,
  medicineFrequencyOptions,
  medicineInstructionOptions,
} from "@/app/components/clinicalRows";
import { usePractitionersQuery } from "@/features/doctors/api/usePractitionersQuery";
import { useConsultationWorkspaceData } from "@/features/consulation/api";
import {
  createClinicalTemplate,
  deleteClinicalTemplate,
  listClinicalTemplates,
  updateClinicalTemplate,
} from "@/features/consulation/api/consulation.api";

type MedicineRow = {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
};

type LabRow = { name: string; priority: string; instructions: string };

const EMPTY_CATALOG: any[] = [];

const blankMedicine = (): MedicineRow => ({
  name: "",
  dosage: "",
  frequency: "1-0-1",
  duration: "3 days",
  instructions: "After food",
});

const blankLab = (): LabRow => ({
  name: "",
  priority: "routine",
  instructions: "",
});

export function ClinicalTemplateManager({
  apiSession,
  branchId,
  departmentId,
  allowedDepartments = [],
  medicineCatalog = EMPTY_CATALOG,
  labCatalog = EMPTY_CATALOG,
}: any) {
  const { livePractitioners } = usePractitionersQuery(apiSession);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [name, setName] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [complaints, setComplaints] = useState("");
  const [diagnoses, setDiagnoses] = useState("");
  const [notes, setNotes] = useState("");
  const [medicines, setMedicines] = useState<MedicineRow[]>([]);
  const [labs, setLabs] = useState<LabRow[]>([]);
  const [medicineDraft, setMedicineDraft] = useState(blankMedicine);
  const [labDraft, setLabDraft] = useState(blankLab);
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [selectedLabId, setSelectedLabId] = useState("");

  const {
    availableMedicineCatalog,
    medicineCatalogLoading,
    medicineCatalogError,
    availableLabCatalog,
    externalLabLoading,
    externalLabError,
  } = useConsultationWorkspaceData({
    apiSession,
    patient: null,
    branchId,
    medicineCatalog,
    labCatalog,
    medicineSearch: medicineDraft.name,
    labSearch: labDraft.name,
  });
  const medicineOptions =
    medicineDraft.name.trim().length >= 2
      ? availableMedicineCatalog.map((medicine: any) => ({
          value: medicine.id || medicine.slug || medicine.name,
          label: medicine.item_name || medicine.name,
          item: medicine,
        }))
      : [];
  const labOptions =
    labDraft.name.trim().length >= 2
      ? availableLabCatalog.map((test: any) => ({
          value: test.id || test.slug || test.name,
          label: test.item_name || test.name,
          item: test,
        }))
      : [];

  const department = allowedDepartments.find(
    (row: any) => String(row.id) === String(departmentId),
  );
  const doctors = useMemo(
    () =>
      (livePractitioners || []).filter((doctor: any) => {
        const departmentIds = doctor.department_ids || [];
        return !departmentId || departmentIds.includes(departmentId);
      }),
    [livePractitioners, departmentId],
  );

  useEffect(() => {
    if (!apiSession || !departmentId) {
      setRows([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    listClinicalTemplates(apiSession, departmentId)
      .then((result: any) => {
        if (active) setRows(Array.isArray(result) ? result : []);
      })
      .catch((error: any) => {
        if (active) setMessage(error?.message || "Could not load templates.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiSession, departmentId]);

  function addMedicine() {
    if (!medicineDraft.name.trim()) return;
    setMedicines((current) => [...current, { ...medicineDraft }]);
    setMedicineDraft(blankMedicine());
    setSelectedMedicineId("");
  }

  function addLab() {
    if (!labDraft.name.trim()) return;
    setLabs((current) => [...current, { ...labDraft }]);
    setLabDraft(blankLab());
    setSelectedLabId("");
  }

  function resetForm() {
    setName("");
    setDoctorId("");
    setComplaints("");
    setDiagnoses("");
    setNotes("");
    setMedicines([]);
    setLabs([]);
    setMedicineDraft(blankMedicine());
    setLabDraft(blankLab());
    setSelectedMedicineId("");
    setSelectedLabId("");
    setEditingId("");
  }

  function editTemplate(template: any) {
    const content = template.content || {};
    setEditingId(template.id);
    setName(template.name || "");
    setDoctorId(content.doctor_id || "");
    setComplaints((content.complaints || []).join("\n"));
    setDiagnoses((content.diagnoses || []).join("\n"));
    setNotes(content.doctor_notes || "");
    setMedicines(Array.isArray(content.medicines) ? content.medicines : []);
    setLabs(Array.isArray(content.labs) ? content.labs : []);
    setMedicineDraft(blankMedicine());
    setLabDraft(blankLab());
    setSelectedMedicineId("");
    setSelectedLabId("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveTemplate(event: React.FormEvent) {
    event.preventDefault();
    if (!apiSession || !departmentId || !name.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const payload = {
        department_id: departmentId,
        name: name.trim(),
        template_type: "consultation",
        content: {
          doctor_id: doctorId || null,
          complaints: complaints
            .split("\n")
            .map((row) => row.trim())
            .filter(Boolean),
          diagnoses: diagnoses
            .split("\n")
            .map((row) => row.trim())
            .filter(Boolean),
          doctor_notes: notes.trim(),
          medicines,
          labs,
        },
      };
      const saved = editingId
        ? await updateClinicalTemplate(apiSession, editingId, payload)
        : await createClinicalTemplate(apiSession, payload);
      setRows((current) =>
        (editingId
          ? current.map((row) => (row.id === saved.id ? saved : row))
          : [...current, saved]
        ).sort((a, b) => a.name.localeCompare(b.name)),
      );
      const wasEditing = Boolean(editingId);
      resetForm();
      setShowForm(false);
      setMessage(
        `Template ${saved.name} ${wasEditing ? "updated" : "created"}.`,
      );
    } catch (error: any) {
      setMessage(
        error?.message ||
          `Could not ${editingId ? "update" : "create"} template.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!apiSession || !deleteTarget?.id) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteClinicalTemplate(apiSession, deleteTarget.id);
      setRows((current) => current.filter((row) => row.id !== deleteTarget.id));
      if (editingId === deleteTarget.id) {
        resetForm();
        setShowForm(false);
      }
      setMessage(`Template ${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
    } catch (error: any) {
      setMessage(error?.message || "Could not delete template.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-3 bg-white ">
      <div className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="card-title font-bold">Consultation Templates</h3>
          <p className="card-desc text-slate-500">
            Reusable clinical plans for{" "}
            {department?.name || "the selected department"}.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            if (showForm) resetForm();
            setShowForm((value) => !value);
          }}
          className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap bg-brand px-4 py-0 text-xs hover:bg-brand-hover"
        >
          <Plus className="h-4 w-4" />
          {showForm ? "Close Form" : "New Template"}
        </Button>
      </div>

      <StatusToast message={message} onClose={() => setMessage("")} />

      {showForm && (
        <form
          onSubmit={saveTemplate}
          className="mt-4 space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/30 p-4"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Template Name" required>
              <Input
                required
                value={name}
                onChange={(event: any) => setName(event.target.value)}
                placeholder="Example: Fever care"
                className='search-input'
              />
            </FormField>
            <FormField label="Doctor">
              <SearchableSelect
                value={doctorId}
                onChange={setDoctorId}
                options={[
                  { value: "", label: "All doctors in department" },
                  ...doctors.map((doctor: any) => ({
                    value: doctor.id,
                    label: doctor.full_name || doctor.name,
                  })),
                ]}
                searchable={doctors.length > 8}
              />
            </FormField>
            <FormField label="Complaints">
              <textarea
                value={complaints}
                onChange={(event) => setComplaints(event.target.value)}
                className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                placeholder="One complaint per line"
              />
            </FormField>
            <FormField label="Diagnosis">
              <textarea
                value={diagnoses}
                onChange={(event) => setDiagnoses(event.target.value)}
                className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                placeholder="One diagnosis per line"
              />
            </FormField>
          </div>
          <FormField label="Doctor Notes">
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              placeholder="Default clinical notes or advice"
            />
          </FormField>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-3 text-sm font-black text-slate-900">Medicines</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[1.4fr_.7fr_.7fr_.7fr_1fr_auto]">
              <div>
                <SearchPicker
                  value={selectedMedicineId}
                  inputValue={medicineDraft.name}
                  onInputValueChange={(value: string) => {
                    setMedicineDraft((current) => ({
                      ...current,
                      name: value,
                    }));
                    if (!value) setSelectedMedicineId("");
                  }}
                  onChange={(value: string, medicine: any) => {
                    setSelectedMedicineId(value);
                    setMedicineDraft((current) => ({
                      ...current,
                      name: medicine?.item_name || medicine?.name || "",
                      dosage: current.dosage || medicine?.strength || "",
                    }));
                  }}
                  onUseTyped={(value: string) => {
                    setSelectedMedicineId("");
                    setMedicineDraft((current) => ({
                      ...current,
                      name: value,
                    }));
                  }}
                  options={medicineOptions}
                  placeholder="Type medicine name"
                  loading={medicineCatalogLoading}
                  getSearchText={(medicine: any) =>
                    [
                      medicine?.name,
                      medicine?.item_name,
                      medicine?.strength,
                      medicine?.generic_name,
                      medicine?.brand_name,
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                />
                {medicineCatalogError && (
                  <p className="mt-1 text-xs text-red-500">
                    {medicineCatalogError}
                  </p>
                )}
              </div>
              <Input
                value={medicineDraft.dosage}
                onChange={(event: any) =>
                  setMedicineDraft((current) => ({
                    ...current,
                    dosage: event.target.value,
                  }))
                }
                placeholder="Dosage"
               className="search-input"
              />
              <SearchableSelect
                value={medicineDraft.frequency}
                onChange={(value) =>
                  setMedicineDraft((current) => ({
                    ...current,
                    frequency: value,
                  }))
                }
                options={medicineFrequencyOptions.map((value) => ({
                  value,
                  label: value,
                }))}
                searchable
                className=""
              />
              <Input
                list="template-medicine-duration-options"
                value={medicineDraft.duration}
                onChange={(event: any) =>
                  setMedicineDraft((current) => ({
                    ...current,
                    duration: event.target.value,
                  }))
                }
                placeholder="Duration"
                className='search-input'
              />
              <datalist id="template-medicine-duration-options">
                {medicineDurationOptions.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
              <SearchableSelect
                value={medicineDraft.instructions}
                onChange={(value) =>
                  setMedicineDraft((current) => ({
                    ...current,
                    instructions: value,
                  }))
                }
                options={medicineInstructionOptions.map((value) => ({
                  value,
                  label: value,
                }))}
                searchable
              />
              <button
                type="button"
                onClick={addMedicine}
                className="h-9 whitespace-nowrap rounded-lg bg-brand px-4 text-xs font-bold text-brand-fg hover:bg-brand-hover"
              >
                Add Medicine
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {medicines.map((medicine, index) => (
                <div
                  key={`${medicine.name}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                >
                  <span>
                    <strong>{medicine.name}</strong> · {medicine.dosage} ·{" "}
                    {medicine.frequency} · {medicine.duration} ·{" "}
                    {medicine.instructions}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setMedicines((current) =>
                        current.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                    aria-label="Remove"
                    title="Remove"
                    className="grid h-7 w-7 place-items-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-3 text-sm font-black text-slate-900">
              Lab Tests &amp; Services
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[1.6fr_.7fr_auto]">
              <div>
                <SearchPicker
                  value={selectedLabId}
                  inputValue={labDraft.name}
                  onInputValueChange={(value: string) => {
                    setLabDraft((current) => ({ ...current, name: value }));
                    if (!value) setSelectedLabId("");
                  }}
                  onChange={(value: string, test: any) => {
                    setSelectedLabId(value);
                    setLabDraft((current) => ({
                      ...current,
                      name: test?.item_name || test?.name || "",
                    }));
                  }}
                  onUseTyped={(value: string) => {
                    setSelectedLabId("");
                    setLabDraft((current) => ({ ...current, name: value }));
                  }}
                  options={labOptions}
                  placeholder="Type lab or service name"
                  loading={externalLabLoading}
                  getSearchText={(test: any) =>
                    [
                      test?.item_name,
                      test?.name,
                      test?.sample_type,
                      test?.category,
                      test?.code,
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                />
                {externalLabError && (
                  <p className="mt-1 text-xs text-red-500">
                    {externalLabError}
                  </p>
                )}
              </div>
              <SearchableSelect
                value={labDraft.priority}
                onChange={(value) =>
                  setLabDraft((current) => ({ ...current, priority: value }))
                }
                options={[
                  { value: "routine", label: "Routine" },
                  { value: "urgent", label: "Urgent" },
                  { value: "stat", label: "STAT" },
                ]}
                searchable={false}
              />
              <button
                type="button"
                onClick={addLab}
                className="h-9 whitespace-nowrap rounded-lg bg-brand px-4 text-xs font-bold text-brand-fg hover:bg-brand-hover"
              >
                Add Lab
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {labs.map((lab, index) => (
                <div
                  key={`${lab.name}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                >
                  <span>
                    <strong>{lab.name}</strong> · {lab.priority}{" "}
                    {lab.instructions ? `· ${lab.instructions}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setLabs((current) =>
                        current.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                    aria-label="Remove"
                    title="Remove"
                    className="grid h-7 w-7 place-items-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            disabled={busy || !name.trim()}
            className="inline-flex h-10 items-center justify-center bg-brand px-5 py-0 text-xs hover:bg-brand-hover"
          >
            <ButtonLoader loading={busy}>
              {busy
                ? "Saving…"
                : editingId
                  ? "Update Template"
                  : "Create Template"}
            </ButtonLoader>
          </Button>
        </form>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse rounded-xl border border-slate-200 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="h-4 w-2/3 rounded bg-slate-200" />
                <div className="flex shrink-0 gap-1">
                  <div className="h-8 w-8 rounded-lg bg-slate-100" />
                  <div className="h-8 w-8 rounded-lg bg-slate-100" />
                </div>
              </div>
              <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
              <div className="mt-4 flex gap-2">
                <div className="h-3 w-16 rounded bg-slate-100" />
                <div className="h-3 w-16 rounded bg-slate-100" />
                <div className="h-3 w-16 rounded bg-slate-100" />
              </div>
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="col-span-full grid min-h-40 place-items-center rounded-xl border border-dashed border-slate-200 text-center">
            <div>
              <ClipboardPlus className="mx-auto h-6 w-6 text-emerald-700" />
              <p className="mt-2 text-sm font-bold">No templates created</p>
              <p className="text-xs text-slate-500">
                Create a fever, cold, follow-up, or other clinical plan.
              </p>
            </div>
          </div>
        ) : (
          rows.map((template) => {
            const content = template.content || {};
            const doctor = doctors.find(
              (row: any) => String(row.id) === String(content.doctor_id),
            );
            return (
              <article
                key={template.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-sm font-black text-slate-950">
                    {template.name}
                  </h4>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => editTemplate(template)}
                      aria-label={`Edit ${template.name}`}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-brand"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(template)}
                      aria-label={`Delete ${template.name}`}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {doctor?.full_name ||
                    doctor?.name ||
                    "All department doctors"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600">
                  <span>{content.complaints?.length || 0} complaints</span>
                  <span>·</span>
                  <span>{content.medicines?.length || 0} medicines</span>
                  <span>·</span>
                  <span>{content.labs?.length || 0} labs</span>
                </div>
              </article>
            );
          })
        )}
      </div>
      {deleteTarget && (
        <ConfirmModal
          title="Delete Consultation Template"
          message={`Delete ${deleteTarget.name}? It will no longer be available during consultation.`}
          confirmLabel="Delete Template"
          busy={busy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </Card>
  );
}
