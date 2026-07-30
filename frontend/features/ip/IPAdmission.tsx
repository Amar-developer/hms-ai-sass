"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  RefreshButton,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { uploadAssetUrl } from "@/lib/api";
import { readNotificationTarget } from "@/lib/notificationTarget";
import { ActivityLog } from "@/app/components/common/ActivityLog";
import { admissionLabel, chargeableDays, isClosedAdmission } from "./helpers";
import { IPCareWorkspace } from "./components/IPCareWorkspace";
import { Pagination } from "@/app/components/common/Pagination";
import { Info } from "@/app/components/common/Info";
import { AdmissionFields } from "./components/AdmissionFields";
import { displayDate, inr, patientName, today } from "@/utils/helper";
import { IPHeader } from "./components/IPHeader";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import {
  useIPAdmissionActions,
  useIPAdmissionData,
  useIPAdmissionWork,
  useIpAdmissionsQuery,
} from "./api";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";



type IPView = "list" | "convert" | "direct" | "detail";

export function IPAdmission({
  branchId,
  departmentId,
  appointments = [],
  apiSession,
}: any) {
  const {
    ipAdmissions,
    refetch: refetchAdmissions,
    setLocal: setIpAdmissions,
  } = useIpAdmissionsQuery(apiSession);
  const { patients, patientMap } = usePatientReferencesQuery(
    apiSession,
    ipAdmissions.map((row: any) => row.patient_id || row.patientId),
  );
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [latestConsultation, setLatestConsultation] = useState<any>(null);
  const [latestConsent, setLatestConsent] = useState<any>(null);
  const [latestDischarge, setLatestDischarge] = useState<any>(null);
  const [admissionDate, setAdmissionDate] = useState(today());
  const [expectedDischargeDate, setExpectedDischargeDate] = useState(today());
  const [view, setView] = useState<IPView>("list");
  const [admissionPage, setAdmissionPage] = useState(1);
  const [admissionFilter, setAdmissionFilter] = useState<
    "active" | "completed" | "all"
  >("active");

  const { ipRooms, medicineCatalog, labCatalog } = useIPAdmissionData({
    apiSession,
    branchId,
    admissionDate,
    expectedDischargeDate,
  });
  const opCandidates = appointments.filter(
    (a: any) =>
      (!departmentId ||
        a.departmentId === departmentId ||
        a.department_id === departmentId) &&
      ([
          "consultation_completed",
          "checked_in",
          "waiting",
          "called",
          "in_consultation",
        ].includes(a.status) ||
        a.consultationStatus === "signed"),
  );
  const departmentAdmissions = ipAdmissions.filter(
    (row: any) =>
      !departmentId ||
      row.department_id === departmentId ||
      row.departmentId === departmentId,
  );
  const pageSize = 10;
  const activeAdmissions = departmentAdmissions.filter(
    (row: any) => !isClosedAdmission(row),
  );
  const completedAdmissions = departmentAdmissions.filter((row: any) =>
    isClosedAdmission(row),
  );
  const visibleAdmissions =
    admissionFilter === "completed"
      ? completedAdmissions
      : admissionFilter === "all"
        ? departmentAdmissions
        : activeAdmissions;
  const selectedAdmission =
    departmentAdmissions.find((row: any) => row.id === selectedId) ||
    visibleAdmissions[0] ||
    activeAdmissions[0] ||
    departmentAdmissions[0] ||
    ipAdmissions[0];
  const selectedRoom = ipRooms.find(
    (room: any) => room.id === selectedAdmission?.room_id,
  );
  const selectedDischargeDate =
    latestDischarge?.discharge_date ||
    selectedAdmission?.expected_discharge_date ||
    today();
  const autoRoomCharge =
    selectedAdmission?.room_id && selectedRoom
      ? {
          description: `${selectedRoom.ward_name} ${selectedRoom.room_number} Bed ${selectedRoom.bed_number}`,
          quantity: chargeableDays(
            selectedAdmission.admission_date,
            selectedDischargeDate,
          ),
          unit_amount: Number(selectedRoom.daily_rate || 0),
        }
      : null;
  const autoRoomTotal = autoRoomCharge
    ? autoRoomCharge.quantity * autoRoomCharge.unit_amount
    : 0;

  const {
    treatments,
    charges,
    billingItems,
    ipDocuments,
    medicationOrders,
    medicationAdministrations,
    ipInvoice,
    setIpInvoice,
    admissionWorkLoading,
    admissionWorkError,
    loadAdmissionWork,
  } = useIPAdmissionWork({ apiSession, admissionId: selectedAdmission?.id });

  const legacyChargeTotal = charges.reduce(
    (sum, row) => sum + Number(row.total_amount || 0),
    0,
  );
  const eventBillingTotal = billingItems
    .filter((row: any) => row.status === "billable")
    .reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const runningBillTotal =
    legacyChargeTotal + eventBillingTotal + autoRoomTotal;
  const totalAdmissionPages = Math.max(
    1,
    Math.ceil(visibleAdmissions.length / pageSize),
  );
  const safeAdmissionPage = Math.min(admissionPage, totalAdmissionPages);
  const admissionRows = visibleAdmissions.slice(
    (safeAdmissionPage - 1) * pageSize,
    safeAdmissionPage * pageSize,
  );

  const {
    refresh,
    submitAdmission,
    postWork,
    signConsentEntry,
    finalizeDischargeEntry,
    createMedicationOrder,
    administerMedication,
    generateInvoice,
  } = useIPAdmissionActions({
    apiSession,
    branchId,
    departmentId,
    patients,
    ipAdmissions,
    setIpAdmissions,
    selectedAdmission,
    setSelectedId,
    setView,
    setBusy,
    setError,
    setMessage,
    loadAdmissionWork,
    refetchAdmissions,
    setLatestConsultation,
    setLatestConsent,
    setLatestDischarge,
    setIpInvoice,
  });

  useEffect(() => {
    if (!selectedId && (activeAdmissions[0] || ipAdmissions[0]))
      setSelectedId((activeAdmissions[0] || ipAdmissions[0]).id);
  }, [activeAdmissions.length, ipAdmissions, selectedId]);
  useEffect(() => {
    const target = readNotificationTarget("ip_admission");
    if (
      !target ||
      !departmentAdmissions.some((row: any) => row.id === target.resourceId)
    )
      return;
    setAdmissionFilter("all");
    setSelectedId(target.resourceId);
    setView("detail");
  }, [apiSession?.tenantId, departmentId, departmentAdmissions.length]);
  useEffect(() => {
    setAdmissionPage(1);
  }, [admissionFilter]);
  useEffect(() => {
    if (admissionPage > totalAdmissionPages)
      setAdmissionPage(totalAdmissionPages);
  }, [admissionPage, totalAdmissionPages]);
  useEffect(() => {
    if (admissionWorkError) setError(admissionWorkError);
  }, [admissionWorkError]);

  if (view === "convert") {
    return (
      <div className="space-y-6">
        <IPHeader view={view} setView={setView} />
        <StatusToast
          message={message}
          tone="success"
          onClose={() => setMessage("")}
        />
        <StatusToast
          message={error}
          onClose={() => setError("")}
        />
        <Card>
          <div className="flex flex-col gap-2">
            <h4 className="text-xl font-bold">Convert OP to IP</h4>
            <p className="text-sm text-slate-500">
              Use this when an OP patient requires admission after doctor
              consultation or clinical review.
            </p>
          </div>
          <form
            onSubmit={(e) => submitAdmission(e, true)}
            className="mt-5 grid gap-4"
          >
            <FormField label="OP Appointment">
              <Select
                name="source_appointment_id"
                required
                className="min-h-[52px]"
              >
                <option value="">Select appointment</option>
                {opCandidates.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.patient} · {a.appointmentDate} · {a.doctor}
                  </option>
                ))}
              </Select>
            </FormField>
            {opCandidates.length === 0 && (
              <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-700">
                No eligible OP appointments are currently loaded for conversion.
              </div>
            )}
            <AdmissionFields
              apiSession={apiSession}
              patients={patients}
              departmentId={departmentId}
              rooms={ipRooms}
              admissionDate={admissionDate}
              setAdmissionDate={setAdmissionDate}
              expectedDischargeDate={expectedDischargeDate}
              setExpectedDischargeDate={setExpectedDischargeDate}
              hidePatient
            />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setView("list")}
                className="rounded-2xl border px-5 py-3 text-sm font-bold"
              >
                Cancel
              </button>
              <Button disabled={busy === "admission"}>
                <ButtonLoader loading={busy === "admission"}>
                  {busy === "admission" ? "Creating..." : "Create IP Admission"}
                </ButtonLoader>
              </Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  if (view === "direct") {
    return (
      <div className="space-y-6">
        <IPHeader view={view} setView={setView} />
        <StatusToast
          message={message}
          tone="success"
          onClose={() => setMessage("")}
        />
        <StatusToast
          message={error}
          onClose={() => setError("")}
        />
        <Card>
          <div className="flex flex-col gap-2">
            <h4 className="text-xl font-bold">Direct IP Admission</h4>
            <p className="text-sm text-slate-500">
              Use this for direct admission, emergency admission, or referred IP
              cases without an OP appointment.
            </p>
          </div>
          <form
            onSubmit={(e) => submitAdmission(e, false)}
            className="mt-5 grid gap-4"
          >
            <AdmissionFields
              apiSession={apiSession}
              patients={patients}
              departmentId={departmentId}
              rooms={ipRooms}
              admissionDate={admissionDate}
              setAdmissionDate={setAdmissionDate}
              expectedDischargeDate={expectedDischargeDate}
              setExpectedDischargeDate={setExpectedDischargeDate}
            />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setView("list")}
                className="rounded-2xl border px-5 py-3 text-sm font-bold"
              >
                Cancel
              </button>
              <Button disabled={busy === "admission"}>
                <ButtonLoader loading={busy === "admission"}>
                  {busy === "admission" ? "Admitting..." : "Admit Patient"}
                </ButtonLoader>
              </Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <IPHeader view={view} setView={setView} />
      <StatusToast
        message={message}
        tone="success"
        onClose={() => setMessage("")}
      />
      <StatusToast message={error} onClose={() => setError("")} />

      <div className="grid gap-6">
        <Card>
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <div>
              <h4 className="card-title font-bold">IP Admissions</h4>
              <p className="table-data text-slate-500">
                Select active or completed admissions to view the full IP
                workflow below.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RefreshButton onRefresh={refresh} />
              <Badge tone="blue" className="normal-badge">{activeAdmissions.length} active</Badge>
              <Badge tone="green" className="normal-badge">{completedAdmissions.length} completed</Badge>
            </div>
          </div>
          <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-1 sm:grid-cols-3">
            {[
              ["active", "Active", activeAdmissions.length],
              ["completed", "Completed", completedAdmissions.length],
              ["all", "All", ipAdmissions.length],
            ].map(([key, label, count]: any) => (
              <button
                key={key}
                type="button"
                onClick={() => setAdmissionFilter(key)}
                className={`rounded-lg px-3 py-2 text-sm font-bold transition ${admissionFilter === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"}`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {visibleAdmissions.length === 0 && (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                No {admissionFilter === "all" ? "IP" : admissionFilter}{" "}
                admissions.
              </p>
            )}
            {admissionRows.map((row: any) => {
              const p =
                patientMap.get(row.patient_id) || patientMap.get(row.patientId);
              const closed = isClosedAdmission(row);
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(row.id);
                    setView("detail");
                  }}
                  className={`min-h-32 rounded-2xl p-4 text-left transition ${selectedAdmission?.id === row.id ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-900 hover:bg-slate-100"}`}
                >
                  <div className="line-clamp-2 font-bold">
                    {row.patient_name ||
                      patientName(p) ||
                      row.patient ||
                      row.patient_id}
                  </div>
                  <div
                    className={`mt-1 line-clamp-2 text-sm ${selectedAdmission?.id === row.id ? "text-slate-300" : "text-slate-500"}`}
                  >
                    {admissionLabel(row)}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold uppercase ${selectedAdmission?.id === row.id ? "bg-white/10 text-white" : closed ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}
                    >
                      {row.status}
                    </span>
                    <span
                      className={`text-xs font-bold ${selectedAdmission?.id === row.id ? "text-slate-300" : "text-slate-500"}`}
                    >
                      {closed ? "Completed details" : "Active details"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <Pagination
            page={safeAdmissionPage}
            totalPages={totalAdmissionPages}
            total={visibleAdmissions.length}
            pageSize={pageSize}
            onPage={setAdmissionPage}
          />
        </Card>

        <Card>
          <h4 className="text-lg font-bold">IP Workflow</h4>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Info
              title="Admission"
              value={
                selectedAdmission
                  ? admissionLabel(selectedAdmission)
                  : "No admission selected"
              }
            />
            <Info title="Treatments" value={treatments.length} />
            <Info title="Running Bill" value={inr(runningBillTotal)} />
          </div>
          {selectedAdmission && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Info
                title="Patient"
                value={
                  selectedAdmission.patient_name ||
                  patientName(
                    patientMap.get(selectedAdmission.patient_id) ||
                      patientMap.get(selectedAdmission.patientId),
                  )
                }
              />
              <Info
                title="Status"
                value={String(selectedAdmission.status || "-").toUpperCase()}
              />
              <Info
                title="Admission Date"
                value={displayDate(selectedAdmission.admission_date)}
              />
              <Info
                title="Planned Discharge"
                value={displayDate(selectedAdmission.expected_discharge_date)}
              />
              <Info
                title="Aadhaar"
                value={selectedAdmission.aadhaar_number || "Not captured"}
              />
              <Info title="Payable Amount" value={inr(runningBillTotal)} />
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase text-slate-500">
                  Admission File
                </div>
                {selectedAdmission.admission_document_url ? (
                  <a
                    href={uploadAssetUrl(selectedAdmission.admission_document_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex break-all text-sm font-bold text-blue-700 underline"
                  >
                    {selectedAdmission.admission_document_name ||
                      "View uploaded file"}
                  </a>
                ) : (
                  <div className="mt-1 text-sm font-bold text-slate-500">
                    Not uploaded
                  </div>
                )}
              </div>
            </div>
          )}
          {selectedAdmission && (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Info title="Room Amount" value={inr(autoRoomTotal)} />
              <Info title="Billable Items" value={inr(eventBillingTotal)} />
              <Info title="Legacy Charges" value={inr(legacyChargeTotal)} />
            </div>
          )}
          <p className="mt-4 text-sm text-slate-500">
            Select an IP admission from the left to manage treatment,
            consultation, consent, discharge, and billing.
          </p>
        </Card>
      </div>

      {selectedAdmission && (
        <IPCareWorkspace
          admission={selectedAdmission}
          treatments={treatments}
          charges={charges}
          billingItems={billingItems}
          ipDocuments={ipDocuments}
          medicationOrders={medicationOrders}
          medicationAdministrations={medicationAdministrations}
          medicineCatalog={medicineCatalog}
          labCatalog={labCatalog}
          autoRoomCharge={autoRoomCharge}
          autoRoomTotal={autoRoomTotal}
          runningBillTotal={runningBillTotal}
          ipInvoice={ipInvoice}
          loading={admissionWorkLoading}
          apiSession={apiSession}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          setMessage={setMessage}
          loadAdmissionWork={loadAdmissionWork}
          refresh={refresh}
          generateInvoice={generateInvoice}
          postWork={postWork}
          latestConsent={latestConsent}
          latestDischarge={latestDischarge}
          signConsentEntry={signConsentEntry}
          finalizeDischargeEntry={finalizeDischargeEntry}
        />
      )}
      {selectedAdmission && (
        <ActivityLog
          resourceType="ip_admission"
          resourceId={selectedAdmission?.id}
          apiSession={apiSession}
        />
      )}
    </div>
  );
}
