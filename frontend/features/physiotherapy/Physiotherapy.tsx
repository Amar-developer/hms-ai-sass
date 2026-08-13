"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, RefreshButton, Select, StatusToast } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { uploadAssetUrl } from "@/lib/api";
import { displayDate,patientName,today,inr } from "@/utils/helper";
import { activePhysiotherapyFeeRule,consentFiles,formatPhysiotherapistName } from "./helpers";
import { Header } from "./components/Header";
import { SearchSelect } from "./components/SearchSelect";
import { modalities } from "./constants";
import { CaseForm,IPCaseForm } from "@/features/physiotherapy/forms/PhysiotherapyForms";
import { Info } from "@/app/components/common/Info";
import { ActivityLog } from "@/app/components/common/ActivityLog";
import { readNotificationTarget } from "@/lib/notificationTarget";
import { Skeleton } from "@/app/components/common/loader/Skeleton";
import { useIpAdmissionsQuery } from "@/features/ip/api";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";
import { PatientFlagBadges } from "@/features/patients/components/PatientFlagBadges";
import {
  usePhysiotherapyActions,
  usePhysiotherapyCaseDetail,
  usePhysiotherapyData,
} from "./api";

type View = "list" | "op" | "ip" | "detail";

export function Physiotherapy({
  branchId,
  departmentId,
  appointments = [],
  apiSession,
  loadLiveData,
  view = "list",
  selectedId = "",
}: any) {
  const router = useRouter();
  const { ipAdmissions } = useIpAdmissionsQuery(apiSession);
  function navigate(nextView: View, id = "") {
    const path =
      nextView === "op"
        ? "/physiotherapy/op"
        : nextView === "ip"
          ? "/physiotherapy/ip"
          : nextView === "detail" && id
            ? `/physiotherapy/${id}`
            : "/physiotherapy";
    router.push(path);
  }
  const {
    cases,
    setCases,
    equipment,
    practitioners,
    feeRules,
    loading,
    dataError,
    loadPhysio,
  } = usePhysiotherapyData({ apiSession });
  const [sessionPhysiotherapistId, setSessionPhysiotherapistId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { patients, patientMap } = usePatientReferencesQuery(
    apiSession,
    cases.map((row: any) => row.patient_id),
  );
  const departmentCases = cases.filter(
    (row: any) =>
      !departmentId ||
      row.department_id === departmentId ||
      row.departmentId === departmentId,
  );
  const selected =
    departmentCases.find((row) => row.id === selectedId) ||
    departmentCases[0] ||
    cases[0];
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
    (row: any) =>
      (row.patientId || row.patient_id) &&
      (!departmentId ||
        row.departmentId === departmentId ||
        row.department_id === departmentId),
  );

  const {
    sessions,
    invoiceDetail,
    setInvoiceDetail,
    sessionsError,
    loadSessions,
    loadInvoice,
  } = usePhysiotherapyCaseDetail({ apiSession, caseId: selected?.id });

  const {
    refresh,
    submitCase,
    submitEquipment,
    submitSession,
    submitConsent,
    generateInvoice,
  } = usePhysiotherapyActions({
    apiSession,
    branchId,
    departmentId,
    appointments,
    ipAdmissions,
    selected,
    navigateToCase: (id: string) => navigate("detail", id),
    setBusy,
    setError,
    setMessage,
    setCases,
    setInvoiceDetail,
    loadPhysio,
    loadLiveData,
    loadSessions,
    loadInvoice,
  });

  useEffect(() => {
    if (view !== "list") return;
    const target = readNotificationTarget("physiotherapy_case");
    if (!target || !cases.some((row: any) => row.id === target.resourceId))
      return;
    navigate("detail", target.resourceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.tenantId, cases.length, view]);
  useEffect(() => {
    setSessionPhysiotherapistId(selected?.physiotherapist_id || "");
  }, [selected?.id, selected?.physiotherapist_id]);
  useEffect(() => {
    if (dataError) setError(dataError);
  }, [dataError]);
  useEffect(() => {
    if (sessionsError) setError(sessionsError);
  }, [sessionsError]);

  return (
    <div className="space-y-6">
      <Header view={view} setView={navigate} />
      <StatusToast message={message} tone="success" onClose={() => setMessage("")} />
      <StatusToast message={error} onClose={() => setError("")} />

      {view === "op" && (
        <CaseForm
          apiSession={apiSession}
          title="OP Physiotherapy Case"
          subtitle="Assessment, pain mapping, electrotherapy plan, and rehab exercise plan for outpatients."
          patients={patients}
          appointments={opAppointments}
          physiotherapists={physiotherapists}
          onSubmit={(e: any) => submitCase(e, "op")}
          busy={busy === "case"}
          onCancel={() => navigate("list")}
        />
      )}
      {view === "ip" && (
        <IPCaseForm
          admissions={ipAdmissions}
          patientMap={patientMap}
          physiotherapists={physiotherapists}
          onSubmit={(e: any) => submitCase(e, "ip")}
          busy={busy === "case"}
          onCancel={() => navigate("list")}
        />
      )}
      {(view === "list" || view === "detail") && (
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h4 className="card-title font-bold">Physiotherapy Cases</h4>
              <div className="flex items-center gap-2">
                <RefreshButton onRefresh={loadPhysio} />
                <Badge tone="blue" className="normal-badge">{departmentCases.length} active</Badge>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <button
                type="button"
                onClick={() => navigate("op")}
                className="rounded-lg bg-brand p-4 text-left text-brand-fg transition hover:bg-brand-hover"
              >
                <b className="table-data">New OP Physio</b>
                <p className="mt-1 table-data text-emerald-100">
                  Pain, sports injury, arthritis, outpatient rehab.
                </p>
              </button>
              <button
                type="button"
                onClick={() => navigate("ip")}
                className="rounded-lg border border-slate-200 bg-white p-4 text-left"
              >
                <b>New IP Bedside Physio</b>
                <p className="mt-1 text-sm text-slate-500">
                  Post-surgery, bedridden, acute rehab.
                </p>
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              {loading && (
                <>
                  <Skeleton className="h-[74px] w-full rounded-lg" />
                  <Skeleton className="h-[74px] w-full rounded-lg" />
                  <Skeleton className="h-[74px] w-full rounded-lg" />
                </>
              )}
              {!loading && departmentCases.length === 0 && (
                <p className="rounded-lg bg-slate-50 p-4 table-data text-slate-500">
                  No physiotherapy cases yet.
                </p>
              )}
              {!loading && departmentCases.map((row: any) => {
                const patient = patientMap.get(row.patient_id);
                const active = selected?.id === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => navigate("detail", row.id)}
                    className={`rounded-lg p-4 text-left ${active ? "bg-slate-900 text-white" : "bg-slate-50"}`}
                  >
                    <b>{row.patient_name || patientName(patient)}</b>
                    <PatientFlagBadges
                      patient={patient}
                      className="mt-1"
                      inverse={active}
                    />
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
                    value={
                      selected.patient_name ||
                      patientName(patientMap.get(selected.patient_id))
                    }
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
                          href={uploadAssetUrl(file.url)}
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
                <FormField label="Date" required>
                  <Input
                    name="session_date"
                    type="date"
                    defaultValue={today()}
                    required
                  />
                </FormField>
                <FormField label="Modality" required>
                  <Select name="modality_type" required>
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
                <FormField label="Treatment Area" required>
                  <Input
                    name="treatment_area"
                    defaultValue={selected.body_region || ""}
                    required
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
                <div className="mt-4 flex justify-end">
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
      {selected && view === "detail" && (
        <ActivityLog
          resourceType="physiotherapy_case"
          resourceId={selected?.id}
          apiSession={apiSession}
        />
      )}
    </div>
  );
}
