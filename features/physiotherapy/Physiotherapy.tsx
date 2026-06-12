"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Input, RefreshButton, Select, StatusToast } from "@/components/common/ui";
import { FormField, NumberField } from "@/components/FormElements";
import {
  UPLOADS_BASE,
  apiFetch,
  apiUpload,
  generatePhysiotherapyInvoice,
  getPhysiotherapyInvoice,
} from "@/lib/api";
import { displayDate } from "@/utils/helper";

type View = "list" | "op" | "ip" | "detail";
const modalities = [
  ["ift", "IFT / Interferential Therapy"],
  ["ultrasound", "Ultrasound Therapy"],
  ["tens", "TENS Pain Relief"],
  ["laser", "Laser Therapy"],
  ["swd", "Shortwave Diathermy"],
  ["cpm", "CPM Joint Rehabilitation"],
  ["muscle_stimulator", "Muscle Stimulator / EMS"],
  ["exercise", "Therapeutic Exercise"],
];

function today() {
  return new Date().toISOString().slice(0, 10);
}
function patientName(p: any) {
  return p?.name || p?.full_name || p?.patient_name || "Patient";
}
function patientLabel(p: any) {
  const detail = p?.patientNumber || p?.patient_number || p?.mobile || "";
  return detail ? `${patientName(p)} · ${detail}` : patientName(p);
}
function appointmentPatientId(row: any) {
  return row?.patientId || row?.patient_id || "";
}
function appointmentLabel(row: any) {
  if (!row?.id) return "No linked appointment";
  return [
    row.patient,
    row.appointmentDate || row.appointment_date || row.date,
    row.doctor,
  ]
    .filter(Boolean)
    .join(" · ");
}
function inr(value: any) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}
function consentFiles(row: any) {
  try {
    const parsed = JSON.parse(row?.consent_files_json || "[]");
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return row?.consent_form_url
    ? [{ url: row.consent_form_url, name: row.consent_form_name || "Consent Form" }]
    : [];
}

export function Physiotherapy({
  branchId,
  departmentId,
  patients,
  appointments = [],
  ipAdmissions = [],
  apiSession,
  loadLiveData,
}: any) {
  const [view, setView] = useState<View>("list");
  const [cases, setCases] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [practitioners, setPractitioners] = useState<any[]>([]);
  const [feeRules, setFeeRules] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);
  const [selectedId, setSelectedId] = useState("");
  const [sessionPhysiotherapistId, setSessionPhysiotherapistId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [invoiceDiscount, setInvoiceDiscount] = useState("0");
  const patientMap = useMemo(
    () => new Map(patients.map((p: any) => [p.id, p])),
    [patients],
  );
  const selected = cases.find((row) => row.id === selectedId) || cases[0];
  const physiotherapists = useMemo(
    () =>
      practitioners.filter(
        (row: any) => row.practitioner_type === "physiotherapist",
      ),
    [practitioners],
  );
  const selectedSessionFee = activePhysiotherapyFeeRule(
    feeRules,
    sessionPhysiotherapistId || selected?.physiotherapist_id,
    branchId,
  );
  const opAppointments = appointments.filter(
    (row: any) => row.patientId || row.patient_id,
  );

  useEffect(() => {
    loadPhysio();
  }, [apiSession?.token, apiSession?.tenantId]);
  useEffect(() => {
    if (selected?.id) {
      loadSessions(selected.id);
      loadInvoice(selected.id);
    }
  }, [selected?.id]);
  useEffect(() => {
    if (!selectedId && cases[0]?.id) setSelectedId(cases[0].id);
  }, [cases, selectedId]);
  useEffect(() => {
    setSessionPhysiotherapistId(selected?.physiotherapist_id || "");
  }, [selected?.id, selected?.physiotherapist_id]);

  async function loadPhysio() {
    if (!apiSession) return;
    setError("");
    try {
      const [caseRows, equipmentRows, practitionerRows, feeRuleRows] =
        await Promise.all([
        apiFetch("/physiotherapy/cases", apiSession),
        apiFetch("/physiotherapy/equipment", apiSession),
        apiFetch("/practitioners", apiSession).catch(() => []),
        apiFetch("/billing/doctor-fee-rules", apiSession).catch(() => []),
      ]);
      setCases(caseRows);
      setEquipment(equipmentRows);
      setPractitioners(practitionerRows);
      setFeeRules(feeRuleRows);
    } catch (err: any) {
      setError(err.message || "Unable to load physiotherapy module.");
    }
  }

  async function loadSessions(caseId: string) {
    if (!apiSession) return;
    try {
      setSessions(
        await apiFetch(`/physiotherapy/cases/${caseId}/sessions`, apiSession),
      );
    } catch (err: any) {
      setError(err.message || "Unable to load physiotherapy sessions.");
    }
  }

  async function loadInvoice(caseId: string) {
    if (!apiSession) return;
    setInvoiceDetail(null);
    try {
      const detail = await getPhysiotherapyInvoice(apiSession, caseId);
      setInvoiceDetail(detail);
    } catch {}
  }

  async function refresh() {
    await loadPhysio();
    if (apiSession && loadLiveData) await loadLiveData(apiSession);
  }

  async function submitCase(e: any, careContext: "op" | "ip") {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const appointmentId = String(fd.get("source_appointment_id") || "");
    const admissionId = String(fd.get("ip_admission_id") || "");
    const appointment = appointments.find(
      (row: any) => row.id === appointmentId,
    );
    const admission = ipAdmissions.find((row: any) => row.id === admissionId);
    const patientId = String(
      fd.get("patient_id") ||
        appointment?.patientId ||
        appointment?.patient_id ||
        admission?.patient_id ||
        admission?.patientId ||
        "",
    );
    const payload = {
      branch_id: branchId,
      patient_id: patientId,
      source_appointment_id: appointmentId || undefined,
      ip_admission_id: admissionId || undefined,
      department_id: departmentId || undefined,
      physiotherapist_id: String(fd.get("physiotherapist_id") || "") || undefined,
      care_context: careContext,
      assessment_date: String(fd.get("assessment_date") || today()),
      body_region: String(fd.get("body_region") || "") || undefined,
      condition: String(fd.get("condition") || "") || undefined,
      pain_score:
        fd.get("pain_score") === "" ? undefined : Number(fd.get("pain_score")),
      range_of_motion: String(fd.get("range_of_motion") || "") || undefined,
      muscle_strength: String(fd.get("muscle_strength") || "") || undefined,
      treatment_goal: String(fd.get("treatment_goal") || "") || undefined,
      planned_sessions: Number(fd.get("planned_sessions") || 1),
      frequency: String(fd.get("frequency") || "") || undefined,
    };
    setBusy("case");
    setError("");
    setMessage("");
    try {
      const row = await apiFetch("/physiotherapy/cases", apiSession, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refresh();
      setSelectedId(row.id);
      setView("detail");
      setMessage("Physiotherapy case created successfully.");
      form.reset();
    } catch (err: any) {
      setError(err.message || "Unable to create physiotherapy case.");
    } finally {
      setBusy("");
    }
  }

  async function submitEquipment(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      branch_id:
        String(fd.get("branch_scope") || "branch") === "branch"
          ? branchId
          : undefined,
      name: String(fd.get("name") || ""),
      modality_type: String(fd.get("modality_type") || "ift"),
      manufacturer: String(fd.get("manufacturer") || "") || undefined,
      model_number: String(fd.get("model_number") || "") || undefined,
      serial_number: String(fd.get("serial_number") || "") || undefined,
      is_portable: String(fd.get("is_portable") || "false") === "true",
    };
    setBusy("equipment");
    setError("");
    setMessage("");
    try {
      await apiFetch("/physiotherapy/equipment", apiSession, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await refresh();
      setMessage("Physiotherapy equipment saved.");
      form.reset();
    } catch (err: any) {
      setError(err.message || "Unable to save equipment.");
    } finally {
      setBusy("");
    }
  }

  async function submitSession(e: any) {
    e.preventDefault();
    if (!selected) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      session_date: String(fd.get("session_date") || today()),
      equipment_id: String(fd.get("equipment_id") || "") || undefined,
      modality_type: String(fd.get("modality_type") || "exercise"),
      physiotherapist_id:
        String(fd.get("physiotherapist_id") || "") ||
        selected.physiotherapist_id ||
        undefined,
      treatment_area: String(fd.get("treatment_area") || "") || undefined,
      intensity: String(fd.get("intensity") || "") || undefined,
      duration_minutes: Number(fd.get("duration_minutes") || 15),
      pre_pain_score:
        fd.get("pre_pain_score") === ""
          ? undefined
          : Number(fd.get("pre_pain_score")),
      post_pain_score:
        fd.get("post_pain_score") === ""
          ? undefined
          : Number(fd.get("post_pain_score")),
      exercises: String(fd.get("exercises") || "") || undefined,
      home_program: String(fd.get("home_program") || "") || undefined,
      notes: String(fd.get("notes") || "") || undefined,
      charge_amount: Number(fd.get("charge_amount") || 0),
    };
    setBusy("session");
    setError("");
    setMessage("");
    try {
      await apiFetch(
        `/physiotherapy/cases/${selected.id}/sessions`,
        apiSession,
        { method: "POST", body: JSON.stringify(payload) },
      );
      await loadSessions(selected.id);
      await loadInvoice(selected.id);
      setMessage("Physiotherapy session saved.");
      form.reset();
    } catch (err: any) {
      setError(err.message || "Unable to save physiotherapy session.");
    } finally {
      setBusy("");
    }
  }

  async function submitConsent(e: any) {
    e.preventDefault();
    if (!selected) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const files = Array.from(fd.getAll("consent_files")).filter((file: any) => file?.size) as File[];
    if (files.length === 0) { setError("Please select at least one file to upload."); return; }
    const upload = new FormData();
    files.forEach((file) => upload.append("files", file));
    const notes = fd.get("consent_notes") as string | null;
    if (notes) upload.append("notes", notes);
    setBusy("consent");
    setError("");
    setMessage("");
    try {
      const updated = await apiUpload(`/physiotherapy/cases/${selected.id}/consent`, apiSession, upload);
      setCases((prev: any[]) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setMessage("Consent files uploaded successfully.");
      form.reset();
    } catch (err: any) {
      setError(err.message || "Unable to upload consent form.");
    } finally {
      setBusy("");
    }
  }

  async function generateInvoice() {
    if (!selected) return;
    setBusy("invoice");
    setError("");
    setMessage("");
    try {
      const detail = await generatePhysiotherapyInvoice(
        apiSession,
        selected.id,
        {
          discount_amount: Number(invoiceDiscount || 0),
          created_by_user_id: apiSession.user?.id,
        },
      );
      setInvoiceDetail(detail);
      setMessage(
        `Physiotherapy invoice ${detail.invoice.invoice_number} generated for ${inr(detail.invoice.total_amount)}. Collect payment from Invoices.`,
      );
      await refresh();
    } catch (err: any) {
      setError(err.message || "Unable to generate physiotherapy invoice.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <Header view={view} setView={setView} />
      <StatusToast message={message} tone="success" onClose={() => setMessage("")} />
      <StatusToast message={error} tone="error" onClose={() => setError("")} />

      {view === "op" && (
        <CaseForm
          title="OP Physiotherapy Case"
          subtitle="Assessment, pain mapping, electrotherapy plan, and rehab exercise plan for outpatients."
          patients={patients}
          appointments={opAppointments}
          physiotherapists={physiotherapists}
          onSubmit={(e: any) => submitCase(e, "op")}
          busy={busy === "case"}
          onCancel={() => setView("list")}
        />
      )}
      {view === "ip" && (
        <IPCaseForm
          admissions={ipAdmissions}
          patientMap={patientMap}
          physiotherapists={physiotherapists}
          onSubmit={(e: any) => submitCase(e, "ip")}
          busy={busy === "case"}
          onCancel={() => setView("list")}
        />
      )}
      {(view === "list" || view === "detail") && (
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-bold">Physiotherapy Cases</h4>
              <div className="flex items-center gap-2">
                <RefreshButton onRefresh={loadPhysio} />
                <Badge tone="blue">{cases.length} active</Badge>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <button
                type="button"
                onClick={() => setView("op")}
                className="rounded-2xl bg-slate-900 p-4 text-left text-white"
              >
                <b>New OP Physio</b>
                <p className="mt-1 text-sm text-slate-300">
                  Pain, sports injury, arthritis, outpatient rehab.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setView("ip")}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left"
              >
                <b>New IP Bedside Physio</b>
                <p className="mt-1 text-sm text-slate-500">
                  Post-surgery, bedridden, acute rehab.
                </p>
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              {cases.length === 0 && (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                  No physiotherapy cases yet.
                </p>
              )}
              {cases.map((row: any) => {
                const patient = patientMap.get(row.patient_id);
                const active = selected?.id === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(row.id);
                      setView("detail");
                    }}
                    className={`rounded-2xl p-4 text-left ${active ? "bg-slate-900 text-white" : "bg-slate-50"}`}
                  >
                    <b>{patientName(patient)}</b>
                    <p
                      className={`text-sm ${active ? "text-slate-300" : "text-slate-500"}`}
                    >
                      {row.case_number} · {row.care_context?.toUpperCase()} ·{" "}
                      {row.body_region || "Assessment"}
                    </p>
                <p className="mt-2 text-xs font-bold uppercase">
                  {row.status}
                    </p>
                  </button>
                );
              })}
            </div>
          </Card>
          <Card>
            <h4 className="text-lg font-bold">Case Summary</h4>
            {selected ? (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Info
                    title="Patient"
                    value={patientName(patientMap.get(selected.patient_id))}
                  />
                  <Info title="Pain Score" value={selected.pain_score ?? "-"} />
                  <Info
                    title="Plan"
                    value={`${selected.planned_sessions} sessions`}
                  />
                  <Info title="Status" value={selected.status} />
                </div>
                <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  {selected.treatment_goal || "No treatment goal recorded."}
                </p>
                <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-bold uppercase text-slate-500">Consent Files</p>
                  {consentFiles(selected).length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {consentFiles(selected).map((file:any,index:number)=>(
                        <a
                          key={`${file.url}-${index}`}
                          href={`${UPLOADS_BASE}${file.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block break-all text-sm font-semibold text-blue-700 underline"
                        >
                          {file.name || `Consent file ${index + 1}`}
                        </a>
                      ))}
                      {selected.consent_submitted_at && (
                        <p className="text-xs text-slate-500">
                          Submitted: {displayDate(selected.consent_submitted_at)}
                        </p>
                      )}
                      {selected.consent_notes && (
                        <p className="text-xs text-slate-600">{selected.consent_notes}</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500">No consent files uploaded yet.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                Select a case to manage sessions and billing.
              </p>
            )}
          </Card>
        </div>
      )}

      {selected && view === "detail" && (
        <Card>
          <h4 className="text-lg font-bold">Upload Consent Forms</h4>
          <p className="text-sm text-slate-500">Patient-signed consent files (PDF or image, max 10 MB each).</p>
          <form onSubmit={submitConsent} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Consent Files">
                <input
                  name="consent_files"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  multiple
                  required
                  className="block w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-bold"
                />
              </FormField>
              <FormField label="Notes (optional)">
                <input
                  name="consent_notes"
                  placeholder="Consent obtained by, date, remarks"
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </FormField>
            </div>
            <Button disabled={busy === "consent"}>{busy === "consent" ? "Uploading..." : "Upload Consent Files"}</Button>
          </form>
        </Card>
      )}

      {selected && view === "detail" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <h4 className="text-lg font-bold">Record Therapy Session</h4>
            <form onSubmit={submitSession} className="mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Date">
                  <Input
                    name="session_date"
                    type="date"
                    defaultValue={today()}
                  />
                </FormField>
                <FormField label="Modality">
                  <Select name="modality_type">
                    {modalities.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <FormField label="Physiotherapist">
                <SearchSelect
                  name="physiotherapist_id"
                  value={sessionPhysiotherapistId}
                  onChange={setSessionPhysiotherapistId}
                  options={physiotherapists.map((row: any) => ({
                    value: row.id,
                    label: formatPhysiotherapistName(row),
                    item: row,
                  }))}
                  placeholder="Type physiotherapist name"
                  getSearchText={(row: any) =>
                    [
                      formatPhysiotherapistName(row),
                      row?.primary_specialty,
                      row?.registration_number,
                      row?.id,
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                />
              </FormField>
              <FormField label="Equipment">
                <Select name="equipment_id">
                  <option value="">Manual / No equipment</option>
                  {equipment.map((row: any) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {row.modality_type}
                    </option>
                  ))}
                </Select>
              </FormField>
              <div className="grid gap-3 md:grid-cols-3">
                <FormField label="Treatment Area">
                  <Input
                    name="treatment_area"
                    defaultValue={selected.body_region || ""}
                  />
                </FormField>
                <FormField label="Intensity">
                  <Input name="intensity" placeholder="Low / 1 MHz / 20 mA" />
                </FormField>
                <FormField label="Duration Minutes">
                  <Input
                    name="duration_minutes"
                    type="number"
                    min="1"
                    defaultValue="20"
                  />
                </FormField>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <FormField label="Pre Pain">
                  <Input name="pre_pain_score" type="number" min="0" max="10" />
                </FormField>
                <FormField label="Post Pain">
                  <Input
                    name="post_pain_score"
                    type="number"
                    min="0"
                    max="10"
                  />
                </FormField>
                <FormField label="Charge">
                  <Input
                    key={selectedSessionFee?.id || sessionPhysiotherapistId || "charge"}
                    name="charge_amount"
                    type="number"
                    min="0"
                    defaultValue={selectedSessionFee?.fee_amount ?? 0}
                  />
                </FormField>
              </div>
              <FormField label="Exercises">
                <Input
                  name="exercises"
                  placeholder="ROM, strengthening, gait training, resistance band"
                />
              </FormField>
              <FormField label="Home Program">
                <Input
                  name="home_program"
                  placeholder="Home exercise and device usage advice"
                />
              </FormField>
              <FormField label="Notes">
                <Input
                  name="notes"
                  placeholder="Response, tolerance, precautions"
                />
              </FormField>
              <Button disabled={busy === "session"}>Save Session</Button>
            </form>
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-bold">Progress and Billing</h4>
              <Badge tone="green">{sessions.length} sessions</Badge>
            </div>
            <div className="mt-4 grid gap-3">
              {sessions.map((row: any) => (
                <div
                  key={row.id}
                  className="rounded-2xl bg-slate-50 p-4 text-sm"
                >
                  <b>
                    Session {row.session_number} · {row.modality_type}
                  </b>
                  <p className="text-slate-500">
                    {displayDate(row.session_date)} · {row.duration_minutes} mins · Pain{" "}
                    {row.pre_pain_score ?? "-"} to {row.post_pain_score ?? "-"}
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    {formatPhysiotherapistName(
                      physiotherapists.find(
                        (therapist: any) =>
                          therapist.id ===
                          (row.physiotherapist_id || selected.physiotherapist_id),
                      ),
                    )}
                  </p>
                  <p className="mt-1 font-bold">{inr(row.charge_amount)}</p>
                </div>
              ))}
              {sessions.length === 0 && (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                  No sessions recorded yet.
                </p>
              )}
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Info
                  title="Billable"
                  value={inr(
                    sessions.reduce(
                      (sum: number, row: any) =>
                        sum + Number(row.charge_amount || 0),
                      0,
                    ),
                  )}
                />
                <Info
                  title="Invoiced"
                  value={
                    invoiceDetail?.invoice?.invoice_number || "Not generated"
                  }
                />
                <Info
                  title="Balance"
                  value={inr(invoiceDetail?.invoice?.balance_amount || 0)}
                />
              </div>
              {!invoiceDetail ? (
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <NumberField
                    label="Discount"
                    value={invoiceDiscount}
                    onChange={setInvoiceDiscount}
                    min={0}
                  />
                  <Button
                    type="button"
                    onClick={generateInvoice}
                    disabled={
                      !sessions.some(
                        (row: any) => Number(row.charge_amount) > 0,
                      ) || busy === "invoice"
                    }
                  >
                    {busy === "invoice" ? "Generating..." : "Generate Invoice"}
                  </Button>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <Info
                      title="Subtotal"
                      value={inr(invoiceDetail.invoice.subtotal_amount)}
                    />
                    <Info
                      title="Discount"
                      value={inr(invoiceDetail.invoice.discount_amount)}
                    />
                    <Info
                      title="Tax"
                      value={inr(invoiceDetail.invoice.tax_amount)}
                    />
                    <Info
                      title="Total"
                      value={inr(invoiceDetail.invoice.total_amount)}
                    />
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={invoiceDetail.invoice.balance_amount > 0 ? "amber" : "green"}>
                        {invoiceDetail.invoice.balance_amount > 0 ? "Payment pending" : "Paid"}
                      </Badge>
                      <Badge tone="blue">{invoiceDetail.invoice.status}</Badge>
                    </div>
                    <p className="mt-2 text-slate-600">
                      Payment and receipt are handled from the Invoices module.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Header({ view, setView }: any) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h3 className="text-2xl font-bold">Physiotherapy</h3>
        <p className="text-sm text-slate-500">
          OP/IP assessment, electrotherapy, rehab sessions, equipment usage,
          progress, and billing.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Tab
          active={view === "list" || view === "detail"}
          onClick={() => setView("list")}
        >
          Cases
        </Tab>
        <Tab active={view === "op"} onClick={() => setView("op")}>
          OP Case
        </Tab>
        <Tab active={view === "ip"} onClick={() => setView("ip")}>
          IP Case
        </Tab>
      </div>
    </div>
  );
}
function Tab({ active, onClick, children }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-3 text-sm font-bold ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
    >
      {children}
    </button>
  );
}
function Info({ title, value }: any) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase text-slate-500">{title}</p>
      <p className="mt-1 break-words text-lg font-bold">{value}</p>
    </div>
  );
}

function formatPhysiotherapistName(row: any) {
  const name = row?.full_name || row?.name || "";
  if (!name) return "No physiotherapist selected";
  const withoutSuffix = name.replace(/,\s*PT$/i, "");
  return `${withoutSuffix}, PT`;
}

function SearchSelect({
  name,
  value,
  onChange,
  options,
  placeholder,
  required,
  getLabel,
  getSearchText,
}: any) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((row: any) => row.value === value);
  const search = query.trim().toLowerCase();
  const rows = options.filter((row: any) => {
    if (!search) return true;
    const text = getSearchText ? getSearchText(row.item) : row.label;
    return String(text || row.label).toLowerCase().includes(search);
  });

  return (
    <div className="relative">
      {name && <input type="hidden" name={name} value={value || ""} />}
      <Input
        value={open ? query : selected?.label || ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(event: any) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event: any) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        required={required && !value}
      />
      {open && (
        <div className="absolute z-40 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
          {rows.length === 0 && (
            <div className="px-3 py-3 text-sm text-slate-500">
              No matching records.
            </div>
          )}
          {rows.map((row: any) => (
            <button
              key={row.value || "empty"}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(row.value, row.item);
                setQuery("");
                setOpen(false);
              }}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                row.value === value
                  ? "bg-slate-900 text-white hover:bg-slate-900"
                  : ""
              }`}
            >
              {getLabel ? getLabel(row.item, row.value === value) : row.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function activePhysiotherapyFeeRule(
  feeRules: any[],
  physiotherapistId: string | undefined,
  branchId: string | undefined,
) {
  if (!physiotherapistId) return null;
  return (
    [...(feeRules || [])]
      .filter(
        (rule: any) =>
          rule.is_active &&
          rule.practitioner_id === physiotherapistId &&
          rule.appointment_type === "op" &&
          rule.treatment_type === "physiotherapy_session" &&
          (!rule.branch_id || !branchId || rule.branch_id === branchId),
      )
      .sort(
        (a: any, b: any) =>
          Number(Boolean(b.branch_id)) - Number(Boolean(a.branch_id)) ||
          new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime(),
      )[0] || null
  );
}

function CaseFields() {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <FormField label="Body Region">
          <Input
            name="body_region"
            placeholder="Knee, shoulder, lumbar spine"
          />
        </FormField>
        <FormField label="Pain Score">
          <Input name="pain_score" type="number" min="0" max="10" />
        </FormField>
        <FormField label="Assessment Date">
          <Input name="assessment_date" type="date" defaultValue={today()} />
        </FormField>
      </div>
      <FormField label="Condition">
        <Input
          name="condition"
          placeholder="Chronic pain, post-surgery, sports injury, arthritis"
        />
      </FormField>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Range Of Motion">
          <Input name="range_of_motion" />
        </FormField>
        <FormField label="Muscle Strength">
          <Input name="muscle_strength" />
        </FormField>
      </div>
      <FormField label="Treatment Goal">
        <Input
          name="treatment_goal"
          placeholder="Pain relief, mobility, strengthening, joint rehabilitation"
        />
      </FormField>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Planned Sessions">
          <Input
            name="planned_sessions"
            type="number"
            min="1"
            defaultValue="6"
          />
        </FormField>
        <FormField label="Frequency">
          <Input name="frequency" placeholder="Daily / 3 days per week" />
        </FormField>
      </div>
    </>
  );
}

function CaseForm({
  title,
  subtitle,
  patients,
  appointments,
  physiotherapists,
  onSubmit,
  busy,
  onCancel,
}: any) {
  const [patientId, setPatientId] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [physiotherapistId, setPhysiotherapistId] = useState("");
  const patientOptions = patients.map((p: any) => ({
    value: p.id,
    label: patientLabel(p),
    item: p,
  }));
  const appointmentOptions = [
    { value: "", label: "No linked appointment", item: null },
    ...appointments.map((a: any) => ({
      value: a.id,
      label: appointmentLabel(a),
      item: a,
    })),
  ];
  const physiotherapistOptions = physiotherapists.map((row: any) => ({
    value: row.id,
    label: formatPhysiotherapistName(row),
    item: row,
  }));

  return (
    <Card>
      <div>
        <h4 className="text-xl font-bold">{title}</h4>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4">
        <FormField label="Patient">
          <SearchSelect
            name="patient_id"
            value={patientId}
            onChange={setPatientId}
            options={patientOptions}
            placeholder="Type patient name, mobile, or number"
            required
            getSearchText={(p: any) =>
              [
                patientName(p),
                p?.mobile,
                p?.patientNumber,
                p?.patient_number,
                p?.id,
              ]
                .filter(Boolean)
                .join(" ")
            }
          />
        </FormField>
        <FormField label="Linked OP Appointment">
          <SearchSelect
            name="source_appointment_id"
            value={appointmentId}
            onChange={(nextAppointmentId: string, appointment: any) => {
              setAppointmentId(nextAppointmentId);
              const nextPatientId = appointmentPatientId(appointment);
              if (nextPatientId) setPatientId(nextPatientId);
            }}
            options={appointmentOptions}
            placeholder="Type patient, date, or doctor"
            getSearchText={(a: any) =>
              a
                ? [
                    a.patient,
                    a.appointmentDate,
                    a.appointment_date,
                    a.date,
                    a.doctor,
                    appointmentPatientId(a),
                    a.id,
                  ]
                    .filter(Boolean)
                    .join(" ")
                : "No linked appointment"
            }
          />
        </FormField>
        <FormField label="Physiotherapist">
          <SearchSelect
            name="physiotherapist_id"
            value={physiotherapistId}
            onChange={setPhysiotherapistId}
            options={physiotherapistOptions}
            placeholder="Type physiotherapist name"
            required
            getSearchText={(row: any) =>
              [
                formatPhysiotherapistName(row),
                row?.primary_specialty,
                row?.registration_number,
                row?.id,
              ]
                .filter(Boolean)
                .join(" ")
            }
          />
        </FormField>
        <CaseFields />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border px-5 py-3 text-sm font-bold"
          >
            Cancel
          </button>
          <Button disabled={busy}>Create OP Physio Case</Button>
        </div>
      </form>
    </Card>
  );
}

function IPCaseForm({
  admissions,
  patientMap,
  physiotherapists,
  onSubmit,
  busy,
  onCancel,
}: any) {
  const [admissionId, setAdmissionId] = useState("");
  const [physiotherapistId, setPhysiotherapistId] = useState("");
  const admissionOptions = admissions.map((row: any) => {
    const patient = patientMap.get(row.patient_id || row.patientId);
    return {
      value: row.id,
      label: `${patientName(patient)} · ${row.admission_number || row.id} · Bed ${row.bed || "-"}`,
      item: row,
    };
  });
  const physiotherapistOptions = physiotherapists.map((row: any) => ({
    value: row.id,
    label: formatPhysiotherapistName(row),
    item: row,
  }));

  return (
    <Card>
      <div>
        <h4 className="text-xl font-bold">IP Bedside Physiotherapy Case</h4>
        <p className="text-sm text-slate-500">
          Use this for post-surgical rehab, bedridden patients, acute injury
          management, CPM, gait training, tilt table, and EMS workflows.
        </p>
      </div>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4">
        <FormField label="IP Admission">
          <SearchSelect
            name="ip_admission_id"
            value={admissionId}
            onChange={setAdmissionId}
            options={admissionOptions}
            placeholder="Type patient, admission, or bed"
            required
            getSearchText={(row: any) => {
              const patient = patientMap.get(row?.patient_id || row?.patientId);
              return [
                patientName(patient),
                row?.admission_number,
                row?.bed,
                row?.id,
              ]
                .filter(Boolean)
                .join(" ");
            }}
          />
        </FormField>
        <FormField label="Physiotherapist">
          <SearchSelect
            name="physiotherapist_id"
            value={physiotherapistId}
            onChange={setPhysiotherapistId}
            options={physiotherapistOptions}
            placeholder="Type physiotherapist name"
            required
            getSearchText={(row: any) =>
              [
                formatPhysiotherapistName(row),
                row?.primary_specialty,
                row?.registration_number,
                row?.id,
              ]
                .filter(Boolean)
                .join(" ")
            }
          />
        </FormField>
        {admissions.length === 0 && (
          <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-700">
            No IP admissions are loaded. Create or convert an IP admission
            first.
          </div>
        )}
        <CaseFields />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border px-5 py-3 text-sm font-bold"
          >
            Cancel
          </button>
          <Button disabled={busy}>Create IP Physio Case</Button>
        </div>
      </form>
    </Card>
  );
}

function EquipmentPage({ equipment, onSubmit, busy }: any) {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <Card>
        <h4 className="text-lg font-bold">Add Equipment</h4>
        <form onSubmit={onSubmit} className="mt-4 grid gap-3">
          <FormField label="Name">
            <Input name="name" placeholder="HMS Indotherm 500W" required />
          </FormField>
          <FormField label="Modality">
            <Select name="modality_type">
              {modalities.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Manufacturer">
              <Input name="manufacturer" placeholder="HMS" />
            </FormField>
            <FormField label="Model">
              <Input name="model_number" placeholder="DIGISTIM 202" />
            </FormField>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Serial Number">
              <Input name="serial_number" />
            </FormField>
            <FormField label="Portable">
              <Select name="is_portable">
                <option value="false">No</option>
                <option value="true">Yes</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Scope">
            <Select name="branch_scope">
              <option value="branch">Current Branch</option>
              <option value="tenant">All Branches</option>
            </Select>
          </FormField>
          <Button disabled={busy}>Save Equipment</Button>
        </form>
      </Card>
      <Card>
        <h4 className="text-lg font-bold">Equipment Catalog</h4>
        <div className="mt-4 grid gap-3">
          {equipment.length === 0 && (
            <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              No equipment saved yet.
            </p>
          )}
          {equipment.map((row: any) => (
            <div key={row.id} className="rounded-2xl bg-slate-50 p-4">
              <b>{row.name}</b>
              <p className="text-sm text-slate-500">
                {row.modality_type} · {row.is_portable ? "Portable" : "Fixed"} ·{" "}
                {row.model_number || "No model"}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
