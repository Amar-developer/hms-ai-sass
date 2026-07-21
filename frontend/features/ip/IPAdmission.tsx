"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  RefreshButton,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { apiFetch, apiUpload, uploadAssetUrl } from "@/lib/api";
import { readNotificationTarget } from "@/lib/notificationTarget";
import { ActivityLog } from "@/app/components/common/ActivityLog";
import { admissionLabel, chargeableDays, defaultRooms, isClosedAdmission } from "./helpers";
import { IPCareWorkspace } from "./components/IPCareWorkspace";
import { Pagination } from "@/app/components/common/Pagination";
import { Info } from "@/app/components/common/Info";
import { AdmissionFields } from "./components/AdmissionFields";
import { displayDate, inr, patientName, today } from "@/utils/helper";
import { IPHeader } from "./components/IPHeader";



type IPView = "list" | "convert" | "direct" | "detail";

export function IPAdmission({
  branchId,
  departmentId,
  patients,
  appointments = [],
  ipAdmissions,
  setIpAdmissions,
  apiSession,
  loadLiveData,
}: any) {
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [treatments, setTreatments] = useState<any[]>([]);
  const [charges, setCharges] = useState<any[]>([]);
  const [billingItems, setBillingItems] = useState<any[]>([]);
  const [ipDocuments, setIpDocuments] = useState<any[]>([]);
  const [medicationOrders, setMedicationOrders] = useState<any[]>([]);
  const [medicationAdministrations, setMedicationAdministrations] = useState<
    any[]
  >([]);
  const [medicineCatalog, setMedicineCatalog] = useState<any[]>([]);
  const [labCatalog, setLabCatalog] = useState<any[]>([]);
  const [latestConsultation, setLatestConsultation] = useState<any>(null);
  const [latestConsent, setLatestConsent] = useState<any>(null);
  const [latestDischarge, setLatestDischarge] = useState<any>(null);
  const [ipRooms, setIpRooms] = useState<any[]>([]);
  const [roomSeedAttempted, setRoomSeedAttempted] = useState(false);
  const [ipInvoice, setIpInvoice] = useState<any>(null);
  const [admissionDate, setAdmissionDate] = useState(today());
  const [expectedDischargeDate, setExpectedDischargeDate] = useState(today());
  const [view, setView] = useState<IPView>("list");
  const [admissionPage, setAdmissionPage] = useState(1);
  const [admissionFilter, setAdmissionFilter] = useState<
    "active" | "completed" | "all"
  >("active");

  const patientMap = useMemo(
    () => new Map(patients.map((p: any) => [p.id, p])),
    [patients],
  );
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
    if (selectedAdmission?.id) loadAdmissionWork(selectedAdmission.id);
  }, [selectedAdmission?.id]);
  useEffect(() => {
    loadRooms();
  }, [
    apiSession?.tenantId,
    branchId,
    admissionDate,
    expectedDischargeDate,
  ]);
  useEffect(() => {
    loadCatalogs();
  }, [apiSession?.tenantId, branchId]);

  async function refresh() {
    if (apiSession && loadLiveData) await loadLiveData(apiSession);
  }

  async function uploadIpDocuments(
    admissionId: string,
    documentType: string,
    files: any[],
  ) {
    const selectedFiles = files.filter((file: any) => file?.name);
    if (!selectedFiles.length || !apiSession) return;
    const upload = new FormData();
    upload.append("document_type", documentType);
    selectedFiles.forEach((file: any) => upload.append("files", file));
    await apiUpload(
      `/ip/admissions/${admissionId}/documents`,
      apiSession,
      upload,
    );
  }

  async function loadAdmissionWork(admissionId: string) {
    if (!apiSession) return;
    setError("");
    try {
      const [
        treatmentRows,
        chargeRows,
        billingRows,
        documentRows,
        medOrderRows,
        medAdministrationRows,
        invoiceResult,
      ] = await Promise.all([
        apiFetch(`/ip/admissions/${admissionId}/treatments`, apiSession),
        apiFetch(`/ip/admissions/${admissionId}/charges`, apiSession),
        apiFetch(`/ip/admissions/${admissionId}/billing-items`, apiSession),
        apiFetch(`/ip/admissions/${admissionId}/documents`, apiSession).catch(
          () => [],
        ),
        apiFetch(`/ip/admissions/${admissionId}/medication-orders`, apiSession),
        apiFetch(
          `/ip/admissions/${admissionId}/medication-administrations`,
          apiSession,
        ),
        apiFetch(`/ip/admissions/${admissionId}/invoice`, apiSession).catch(
          () => null,
        ),
      ]);
      setTreatments(treatmentRows);
      setCharges(chargeRows);
      setBillingItems(billingRows);
      setIpDocuments(documentRows);
      setMedicationOrders(medOrderRows);
      setMedicationAdministrations(medAdministrationRows);
      setIpInvoice(invoiceResult);
    } catch (err: any) {
      setError(err.message || "Unable to load IP admission details.");
    }
  }

  async function loadRooms() {
    if (!apiSession || !branchId) return;
    try {
      const params = new URLSearchParams({
        branch_id: branchId,
        available_from: admissionDate,
        available_to: expectedDischargeDate || admissionDate,
        include_occupied: "true",
      });
      const rows = await apiFetch(`/ip/rooms?${params.toString()}`, apiSession);
      if (rows.length === 0 && !roomSeedAttempted) {
        setRoomSeedAttempted(true);
        await Promise.all(
          defaultRooms(branchId).map((room) =>
            apiFetch("/ip/rooms", apiSession, {
              method: "POST",
              body: JSON.stringify(room),
            }).catch(() => null),
          ),
        );
        const seededRows = await apiFetch(
          `/ip/rooms?${params.toString()}`,
          apiSession,
        );
        setIpRooms(seededRows);
        return;
      }
      setIpRooms(rows);
    } catch {
      setIpRooms([]);
    }
  }

  async function loadCatalogs() {
    if (!apiSession) return;
    try {
      const [medicines, tests] = await Promise.all([
        apiFetch("/pharmacy/medicines", apiSession).catch(() => []),
        apiFetch("/lab/catalog/tests", apiSession).catch(() => []),
      ]);
      setMedicineCatalog(medicines);
      setLabCatalog(tests);
    } catch {
      setMedicineCatalog([]);
      setLabCatalog([]);
    }
  }

  async function submitAdmission(e: any, fromAppointment = false) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(e.currentTarget);
    const sourceAppointmentId = String(fd.get("source_appointment_id") || "");
    const patientId = String(fd.get("patient_id") || "");
    if (!fromAppointment && !patientId) {
      setError("Select a patient.");
      return;
    }
    const payload = {
      branch_id: branchId,
      patient_id: patientId,
      source_appointment_id: sourceAppointmentId || undefined,
      department_id:
        String(fd.get("department_id") || departmentId || "") || undefined,
      admitting_practitioner_id:
        String(fd.get("practitioner_id") || "") || undefined,
      room_id: String(fd.get("room_id") || "") || undefined,
      ward: String(fd.get("ward") || "General Ward"),
      room: String(fd.get("room") || "") || undefined,
      bed: String(fd.get("bed") || ""),
      admission_date: String(fd.get("admission_date") || today()),
      expected_discharge_date:
        String(fd.get("expected_discharge_date") || "") || undefined,
      aadhaar_number:
        String(fd.get("aadhaar_number") || "").replace(/\D/g, "") || undefined,
      reason: String(fd.get("reason") || "") || undefined,
      provisional_diagnosis:
        String(fd.get("provisional_diagnosis") || "") || undefined,
    };
    setBusy("admission");
    setError("");
    setMessage("");
    try {
      if (apiSession) {
        const path =
          fromAppointment && sourceAppointmentId
            ? `/ip/admissions/from-appointment/${sourceAppointmentId}`
            : "/ip/admissions";
        const row = await apiFetch(path, apiSession, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const documentFile = fd.get("admission_document") as File | null;
        if (documentFile?.size) {
          const upload = new FormData();
          upload.append("file", documentFile);
          await apiUpload(
            `/ip/admissions/${row.id}/document`,
            apiSession,
            upload,
          );
        }
        await refresh();
        setSelectedId(row.id);
        setView("detail");
        setMessage("IP admission created successfully.");
      } else {
        const p = patients.find((row: any) => row.id === patientId);
        const row = {
          ...payload,
          id: `IP-${1001 + ipAdmissions.length}`,
          admission_number: `IP-${1001 + ipAdmissions.length}`,
          patient_id: patientId,
          status: "admitted",
          patient: patientName(p),
        };
        setIpAdmissions([row, ...ipAdmissions]);
        setSelectedId(row.id);
        setView("detail");
      }
      form.reset();
    } catch (err: any) {
      setError(err.message || "Unable to create IP admission.");
    } finally {
      setBusy("");
    }
  }

  async function postWork(
    e: any,
    type: "treatment" | "consultation" | "consent" | "discharge" | "charge",
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!selectedAdmission) return;
    const fd = new FormData(form);
    const bodies: any = {
      treatment: {
        treatment_date: String(fd.get("treatment_date") || today()),
        practitioner_id: String(fd.get("practitioner_id") || "") || undefined,
        treatment_type: String(fd.get("treatment_type") || "ward_round"),
        notes: String(fd.get("notes") || ""),
        medication_summary:
          String(fd.get("medication_summary") || "") || undefined,
        orders: String(fd.get("orders") || "") || undefined,
      },
      consultation: {
        practitioner_id: String(fd.get("practitioner_id") || "") || undefined,
        consultation_date: String(fd.get("consultation_date") || today()),
        consultation_type: String(fd.get("consultation_type") || "ward_round"),
        fee_amount: Number(fd.get("fee_amount") || 0),
        vitals_json: JSON.stringify({
          bp: String(fd.get("bp") || ""),
          pulse: String(fd.get("pulse") || ""),
          temperature: String(fd.get("temperature") || ""),
        }),
        complaints: String(fd.get("complaints") || "") || undefined,
        diagnosis: String(fd.get("diagnosis") || "") || undefined,
        notes: String(fd.get("notes") || "") || undefined,
        prescription_text:
          String(fd.get("prescription_text") || "") || undefined,
      },
      consent: {
        consent_type: String(fd.get("consent_type") || "general_admission"),
        title: String(fd.get("title") || "General IP Admission Consent"),
        content:
          String(fd.get("content") || "") ||
          "Patient/guardian consent received for in-patient admission and treatment.",
        patient_or_guardian_name:
          String(fd.get("patient_or_guardian_name") || "") || undefined,
        relationship: String(fd.get("relationship") || "") || undefined,
      },
      discharge: {
        discharge_date: String(fd.get("discharge_date") || today()),
        final_diagnosis: String(fd.get("final_diagnosis") || ""),
        course_in_hospital:
          String(fd.get("course_in_hospital") || "") || undefined,
        procedures: String(fd.get("procedures") || "") || undefined,
        medications: String(fd.get("medications") || "") || undefined,
        follow_up_advice: String(fd.get("follow_up_advice") || "") || undefined,
        condition_at_discharge:
          String(fd.get("condition_at_discharge") || "") || undefined,
      },
      charge: {
        charge_type: String(fd.get("charge_type") || "room"),
        description: String(fd.get("description") || ""),
        quantity: Number(fd.get("quantity") || 1),
        unit_amount: Number(fd.get("unit_amount") || 0),
      },
    };
    const paths: any = {
      treatment: `/ip/admissions/${selectedAdmission.id}/treatments`,
      consultation: `/ip/admissions/${selectedAdmission.id}/consultations`,
      consent: `/ip/admissions/${selectedAdmission.id}/consents`,
      discharge: `/ip/admissions/${selectedAdmission.id}/discharge-summary`,
      charge: `/ip/admissions/${selectedAdmission.id}/charges`,
    };
    setBusy(type);
    setError("");
    setMessage("");
    try {
      if (!apiSession)
        throw new Error("Backend login is required for IP workflow actions.");
      const row = await apiFetch(paths[type], apiSession, {
        method: "POST",
        body: JSON.stringify(bodies[type]),
      });
      if (type === "consent" || type === "discharge") {
        await uploadIpDocuments(
          selectedAdmission.id,
          type,
          fd.getAll("documents"),
        );
      }
      if (type === "consultation") setLatestConsultation(row);
      if (type === "consent") setLatestConsent(row);
      if (type === "discharge") setLatestDischarge(row);
      await loadAdmissionWork(selectedAdmission.id);
      await refresh();
      setMessage(`${type.replace("_", " ")} saved successfully.`);
      form.reset();
    } catch (err: any) {
      setError(err.message || `Unable to save ${type}.`);
    } finally {
      setBusy("");
    }
  }

  async function sign(path: string, label: string, setter: (row: any) => void) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      const row = await apiFetch(path, apiSession, { method: "POST" });
      setter(row);
      setMessage(`${label} completed.`);
      if (selectedAdmission?.id) await loadAdmissionWork(selectedAdmission.id);
      await refresh();
    } catch (err: any) {
      setError(err.message || `Unable to complete ${label}.`);
    } finally {
      setBusy("");
    }
  }

  async function createMedicationOrder(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!selectedAdmission) return;
    const fd = new FormData(form);
    const payload = {
      medicine_name: String(fd.get("medicine_name") || ""),
      dosage: String(fd.get("dosage") || "") || undefined,
      frequency: String(fd.get("frequency") || "") || undefined,
      route: String(fd.get("route") || "") || undefined,
      start_date: String(fd.get("start_date") || today()),
      end_date: String(fd.get("end_date") || "") || undefined,
      unit_amount: Number(fd.get("unit_amount") || 0),
    };
    setBusy("medication order");
    setError("");
    setMessage("");
    try {
      if (!apiSession)
        throw new Error("Backend login is required for medication orders.");
      await apiFetch(
        `/ip/admissions/${selectedAdmission.id}/medication-orders`,
        apiSession,
        { method: "POST", body: JSON.stringify(payload) },
      );
      await loadAdmissionWork(selectedAdmission.id);
      setMessage("Medication order saved.");
      form.reset();
    } catch (err: any) {
      setError(err.message || "Unable to save medication order.");
    } finally {
      setBusy("");
    }
  }

  async function administerMedication(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!selectedAdmission) return;
    const fd = new FormData(form);
    const orderId = String(fd.get("medication_order_id") || "");
    const payload = {
      administered_at: String(fd.get("administered_at") || "") || undefined,
      quantity: Number(fd.get("quantity") || 1),
      status: String(fd.get("status") || "given"),
      notes: String(fd.get("notes") || "") || undefined,
    };
    setBusy("medication administration");
    setError("");
    setMessage("");
    try {
      if (!apiSession)
        throw new Error(
          "Backend login is required for medication administration.",
        );
      await apiFetch(
        `/ip/admissions/${selectedAdmission.id}/medication-orders/${orderId}/administrations`,
        apiSession,
        { method: "POST", body: JSON.stringify(payload) },
      );
      await loadAdmissionWork(selectedAdmission.id);
      setMessage("Medicine administration recorded.");
      form.reset();
    } catch (err: any) {
      setError(err.message || "Unable to record medicine administration.");
    } finally {
      setBusy("");
    }
  }

  async function generateInvoice() {
    if (!selectedAdmission || !apiSession) return;
    setBusy("invoice");
    setError("");
    setMessage("");
    try {
      const detail = await apiFetch(
        `/ip/admissions/${selectedAdmission.id}/invoice`,
        apiSession,
        { method: "POST" },
      );
      setIpInvoice(detail);
      setMessage(
        `IP invoice ${detail.invoice.invoice_number} generated for ${inr(detail.invoice.total_amount)}.`,
      );
      await refresh();
      await loadAdmissionWork(selectedAdmission.id);
    } catch (err: any) {
      setError(err.message || "Unable to generate IP invoice.");
    } finally {
      setBusy("");
    }
  }
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
                Create IP Admission
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
              <Button disabled={busy === "admission"}>Admit Patient</Button>
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
                    {patientName(p) || row.patient || row.patient_id}
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
                value={patientName(
                  patientMap.get(selectedAdmission.patient_id) ||
                    patientMap.get(selectedAdmission.patientId),
                )}
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
          setLatestConsent={setLatestConsent}
          setLatestDischarge={setLatestDischarge}
          sign={sign}
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
