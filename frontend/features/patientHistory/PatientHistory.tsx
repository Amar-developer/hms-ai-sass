"use client";

import { useEffect, useState } from "react";
import {
  ClipboardList,
  FlaskConical,
  HomeIcon,
  Pill,
  Search,
  Stethoscope,
  X,
} from "lucide-react";
import { Badge, Card, Input, StatusToast } from "@/app/components/common/ui";
import { DataTable } from "@/app/components/common/DataTable";
import { capitalizeFirst } from "@/utils/helper";
import type { Column } from "@/utils/types";
import type { ApiSession } from "@/lib/api";
import type { AppNavigationTarget } from "@/lib/navigationTarget";
import {
  deriveClinicalRows,
  derivePatientBillingMembership,
  displayPatientGender,
  fmtDate,
  patientDisplayMobile,
} from "@/features/patients/helpers";
import { usePatientSearch } from "@/features/patients/components/PatientSearchSelect";
import {
  usePatientDetailData,
  usePatientDiagnoses,
  usePatientVitals,
} from "@/features/patients/api";
import { canReadPatientLinkedModule } from "@/features/patients/patientModuleAccess";
import { saveNotificationTarget } from "@/lib/notificationTarget";
import {
  PatientHealthTimeline,
  PatientOverviewDashboard,
} from "@/features/patients/components/workspace/PatientOverviewDashboard";
import {
  getConsultationColumns,
  getLabOrderColumns,
  getMedicineColumns,
} from "@/features/patients/Column";
import { FormField } from "@/app/components/FormElements";

// Every history table below is capped at this height (~5 rows) and scrolls
// internally; "Load more" then reveals additional rows in batches without
// growing the table's footprint.
const TABLE_MAX_HEIGHT = "260px";
const INITIAL_ROWS = 5;
const LOAD_MORE_STEP = 10;

function LoadMoreButton({
  total,
  visibleCount,
  onLoadMore,
}: {
  total: number;
  visibleCount: number;
  onLoadMore: () => void;
}) {
  if (total <= visibleCount) return null;
  const remaining = total - visibleCount;
  return (
    <div className="mt-2 flex justify-center">
      <button
        type="button"
        onClick={onLoadMore}
        className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-black text-slate-700 hover:border-slate-900 hover:bg-white"
      >
        Load more ({remaining} remaining)
      </button>
    </div>
  );
}

function diagnosisColumns(): Column<any>[] {
  return [
    {
      key:"s.no",
      header:"S.No",
      width:"80px",
      render: (_,index) =><p className="text-center"> {index + 1}</p>
    },
    {
      key: "consultation_date",
      header: "Date",
      width: "140px",
      render: (row: any) => fmtDate(row.consultation_date),
    },
    {
      key: "diagnosis",
      header: "Diagnosis",
      render: (row: any) => (
        <span className="font-bold text-slate-900">{row.diagnosis}</span>
      ),
    },
    {
      key: "diagnosis_type",
      header: "Type",
      width: "140px",
      render: (row: any) =>
        String(row.diagnosis_type || "primary").replaceAll("_", " "),
    },
    {
      key: "notes",
      header: "Notes",
      render: (row: any) => row.notes || "-",
    },
  ];
}

/**
 * Search a patient and see their whole history — overview, lab & services,
 * medicines, and diagnoses — on one page. No tabs: this is where those
 * sections live now instead of the main Patient workspace's tabs.
 */
export function PatientHistory({
  apiSession,
  enabledModules,
  setActive,
}: {
  apiSession: ApiSession | null;
  enabledModules?: string[];
  setActive?: (page: AppNavigationTarget) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [lookupOpen, setLookupOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [consultationLimit, setConsultationLimit] = useState(INITIAL_ROWS);
  const [labLimit, setLabLimit] = useState(INITIAL_ROWS);
  const [medicineLimit, setMedicineLimit] = useState(INITIAL_ROWS);
  const [homeCareLimit, setHomeCareLimit] = useState(INITIAL_ROWS);
  const [diagnosisLimit, setDiagnosisLimit] = useState(INITIAL_ROWS);

  useEffect(() => {
    setConsultationLimit(INITIAL_ROWS);
    setLabLimit(INITIAL_ROWS);
    setMedicineLimit(INITIAL_ROWS);
    setHomeCareLimit(INITIAL_ROWS);
    setDiagnosisLimit(INITIAL_ROWS);
  }, [selectedId]);

  const { patients: searchResults, loading: searchLoading } = usePatientSearch({
    apiSession,
    query,
  });

  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const userPermissions = apiSession?.user?.permissions || [];
  const hasPermission = (...keys: string[]) =>
    Boolean(
      isSuperAdmin ||
      userPermissions.includes("*") ||
      keys.some((key) => userPermissions.includes(key)),
    );
  const canReadIp = canReadPatientLinkedModule(
    apiSession,
    enabledModules,
    "ip",
  );
  const canReadPhysiotherapy = canReadPatientLinkedModule(
    apiSession,
    enabledModules,
    "physiotherapy",
  );
  const canReadHomeCare = canReadPatientLinkedModule(
    apiSession,
    enabledModules,
    "home_care",
  );
  const canReadIntelligence = Boolean(
    (!enabledModules || enabledModules.includes("patient_intelligence")) &&
    hasPermission(
      "patient_intelligence.read",
      "patient_intelligence.manage",
      "patient_intelligence.rules.manage",
    ),
  );

  const {
    selectedDetail,
    summary,
    consultations,
    labOrders,
    homeCareBookings,
    pharmacyIssues,
    membershipPlans,
    membershipEnrollments,
    patientInvoices,
    patientIntelligence,
    loadPatientDetail,
  } = usePatientDetailData({
    canReadPhysiotherapy,
    canReadIp,
    canReadHomeCare,
    canReadIntelligence,
    setBusy,
    setMessage,
    initialId: selectedId,
  });

  const { vitals, vitalsLoading, savingVital, createVital, bmiReadings } =
    usePatientVitals({ apiSession, patientId: selectedId });
  const { diagnoses, diagnosesLoading } = usePatientDiagnoses({
    apiSession,
    patientId: selectedId,
  });

  const { labServiceRows, labRows, homeCareRows, medicineRows } =
    deriveClinicalRows({
      labOrders,
      homeCareBookings,
      pharmacyIssues,
    });

  const visibleConsultations = consultations.slice(0, consultationLimit);
  const visibleLabRows = labRows.slice(0, labLimit);
  const visibleMedicineRows = medicineRows.slice(0, medicineLimit);
  const visibleHomeCareRows = homeCareRows.slice(0, homeCareLimit);
  const visibleDiagnoses = diagnoses.slice(0, diagnosisLimit);
  const {
    visibleMembership,
    freeConsultationsAllocated,
    freeConsultationsUsed,
    freeLabUsed,
    freeLabAllocated,
    freeMedicineUsed,
    freeMedicineAllocated,
    totalBilled,
    totalDue,
  } = derivePatientBillingMembership({
    membershipEnrollments,
    membershipPlans,
    patientInvoices,
  });

  function selectPatient(id: string) {
    if (!id || !apiSession) return;
    setSelectedId(id);
    setMessage("");
    loadPatientDetail(apiSession, id);
  }

  function choosePatient(patient: any) {
    selectPatient(patient.id);
    setQuery(
      capitalizeFirst(patient.full_name) || patient.patient_number || "",
    );
    setLookupOpen(false);
  }

  function clearSelection() {
    setSelectedId("");
    setQuery("");
  }

  function openConsultation(c: any) {
    if (!c?.appointment_id) return;
    setActive?.({ id: "opd", appointmentId: c.appointment_id });
  }

  function openInvoice(invoice: any) {
    if (!invoice?.id || typeof window === "undefined") return;
    window.sessionStorage.setItem("medizinhub.billingInvoiceId", invoice.id);
    setActive?.("billing");
  }

  // The lab order / pharmacy issue row we already have here is the same
  // shape the Lab/Pharmacy modules load themselves, so we hand it straight
  // to their detail modal via sessionStorage instead of asking them to
  // re-look-up the record by id (which could miss it if it's outside their
  // currently loaded page/filter).
  function openLabOrder(bundle: any) {
    if (!bundle?.row?.id || typeof window === "undefined") return;
    window.sessionStorage.setItem(
      "medizinhub.labOrderPreview",
      JSON.stringify(bundle.row),
    );
    setActive?.("lab");
  }

  function openPharmacyIssue(bundle: any) {
    if (!bundle?.row?.id || typeof window === "undefined") return;
    window.sessionStorage.setItem(
      "medizinhub.pharmacyIssuePreview",
      JSON.stringify(bundle.row),
    );
    setActive?.("pharmacy");
  }

  function openHomeCareBooking(bundle: any) {
    if (!bundle?.row?.id) return;
    saveNotificationTarget({
      resource_type: "home_care_booking",
      resource_id: bundle.row.id,
    });
    setActive?.("home_care");
  }

  const consultationColumns = getConsultationColumns({
    onOpen: openConsultation,
  });
  const labOrderColumns = getLabOrderColumns({
    onOpen: openLabOrder,
  });
  const homeCareColumns = getLabOrderColumns({
    onOpen: openHomeCareBooking,
    showSource: false,
  });
  const medicineColumns = getMedicineColumns({
    onOpen: openPharmacyIssue,
  });

  if (!apiSession)
    return (
      <Card>
        <h3 className="text-lg font-bold">Patient History</h3>
        <p className="mt-2 text-sm text-slate-500">
          Backend login is required to view patient history.
        </p>
      </Card>
    );

  const hasSelection = Boolean(selectedId && selectedDetail);

  return (
    <div className="space-y-4">
      <Card className="p-3 bg-white">
        <div className="mb-1">
          <h2 className="text-base font-black tracking-tight text-slate-950">
            Patient History
          </h2>
          <p className="text-xs font-medium text-slate-500">
            Search a patient to see their overview, lab &amp; services,
            medicines, and diagnosis history in one place.
          </p>
        </div>
        <StatusToast message={message} onClose={() => setMessage("")} />
        <div className="relative mt-3 w-1/2">
          <FormField label="Search Patients">
            <div className="relative">
              <Input
                autoFocus
                value={query}
                onFocus={() => setLookupOpen(true)}
                onChange={(event: any) => {
                  setQuery(event.target.value);
                  setLookupOpen(true);
                }}
                onKeyDown={(event: any) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setLookupOpen(false);
                  }
                  if (
                    event.key === "Enter" &&
                    lookupOpen &&
                    searchResults.length > 0
                  ) {
                    event.preventDefault();
                    choosePatient(searchResults[0]);
                  }
                }}
                placeholder="Search patient by name, ID, or mobile"
                autoComplete="off"
                className="search-input"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => clearSelection()}
                  className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="Clear patient search"
                >
                  <X size={16} />
                </button>
              )}
              {lookupOpen && query.trim() && (
                <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                  {query.trim().length < 2 && (
                    <p className="px-3 py-3 text-xs text-slate-500">
                      Enter at least 2 characters to search.
                    </p>
                  )}
                  {query.trim().length >= 2 && (busy || searchLoading) && (
                    <p className="px-3 py-3 text-xs text-slate-500">
                      Searching...
                    </p>
                  )}
                  {query.trim().length >= 2 &&
                    !(busy || searchLoading) &&
                    searchResults.map((patient: any) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => choosePatient(patient)}
                        className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left hover:bg-slate-50"
                      >
                        <span>
                          <b className="block text-xs text-slate-900">
                            {capitalizeFirst(patient.full_name)}
                          </b>
                          <span className="text-xs text-slate-500">
                            {patient.patient_number
                              ? `${patient.patient_number} · `
                              : ""}
                            {patientDisplayMobile(patient) || "No mobile"} ·{" "}
                            {displayPatientGender(patient.gender)} /{" "}
                            {patient.age_years ?? "-"}
                          </span>
                        </span>
                        <Badge
                          tone={patient.status === "active" ? "green" : "red"}
                          className="normal-label"
                        >
                          {patient.status}
                        </Badge>
                      </button>
                    ))}
                  {query.trim().length >= 2 &&
                    !(busy || searchLoading) &&
                    searchResults.length === 0 && (
                      <p className="px-3 py-3 text-xs text-slate-500">
                        No patients match your search.
                      </p>
                    )}
                </div>
              )}
            </div>
          </FormField>
        </div>
      </Card>

      {hasSelection && (
        <>
          <Card className="flex bg-white flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-950">
                {capitalizeFirst(selectedDetail.full_name)}
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {selectedDetail.patient_number} ·{" "}
                {patientDisplayMobile(selectedDetail) || "No mobile"}
              </p>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="close-button font-bold"
            >
              Clear Selection
            </button>
          </Card>

          <PatientOverviewDashboard
            summary={summary}
            vitals={vitals}
            bmiReadings={bmiReadings}
            vitalsLoading={vitalsLoading}
            createVital={createVital}
            savingVital={savingVital}
            consultations={consultations}
            labServiceRows={labServiceRows}
            medicineRows={medicineRows}
            patientInvoices={patientInvoices}
            totalBilled={totalBilled}
            totalDue={totalDue}
            visibleMembership={visibleMembership}
            freeConsultationsUsed={freeConsultationsUsed}
            freeConsultationsAllocated={freeConsultationsAllocated}
            freeLabUsed={freeLabUsed}
            freeLabAllocated={freeLabAllocated}
            freeMedicineUsed={freeMedicineUsed}
            freeMedicineAllocated={freeMedicineAllocated}
            patientIntelligence={patientIntelligence}
            onOpenConsultation={openConsultation}
            onOpenInvoice={openInvoice}
            showTimeline={false}
          />

          <Card className="p-4 bg-white">
            <div className="flex justify-between">
              <h3 className="mb-3 text-sm font-black text-slate-900">
                Consultations
              </h3>
              <span className="px-2 py-1 rounded-lg mb-2 border border-2  ">
                {visibleConsultations.length}
              </span>
            </div>
            <DataTable
              columns={consultationColumns}
              data={visibleConsultations}
              onRowClick={openConsultation}
              emptyMessage="No consultations found."
              emptyDescription="Consultation visits for this patient will show up here."
              emptyIcon={ClipboardList}
              minBodyHeight={`${consultations.length > 0 ? "" : "220px"}`}
              maxBodyHeight={TABLE_MAX_HEIGHT}
            />
            <LoadMoreButton
              total={consultations.length}
              visibleCount={consultationLimit}
              onLoadMore={() =>
                setConsultationLimit((count) => count + LOAD_MORE_STEP)
              }
            />
          </Card>

          <Card className="p-4 bg-white">
            <div className="flex justify-between">
              <h3 className="mb-3 text-sm font-black text-slate-900">
                Lab &amp; Services
              </h3>
              <span className="px-2 py-1 rounded-lg mb-2 border border-2  ">
                {visibleLabRows.length}
              </span>
            </div>

            <DataTable
              columns={labOrderColumns}
              data={visibleLabRows}
              onRowClick={openLabOrder}
              emptyMessage="No lab or service orders found."
              emptyDescription="Diagnostic tests and services ordered for this patient will show up here."
              emptyIcon={FlaskConical}
              minBodyHeight={`${labRows.length > 0 ? "" : "220px"}`}
              maxBodyHeight={TABLE_MAX_HEIGHT}
            />
            <LoadMoreButton
              total={labRows.length}
              visibleCount={labLimit}
              onLoadMore={() => setLabLimit((count) => count + LOAD_MORE_STEP)}
            />
          </Card>

          <Card className="p-4 bg-white">
            <h3 className="mb-3 text-sm font-black text-slate-900">
              Medicines
            </h3>
            <DataTable
              columns={medicineColumns}
              data={visibleMedicineRows}
              onRowClick={openPharmacyIssue}
              emptyMessage="No pharmacy issues found."
              emptyDescription="Medicines dispensed to this patient will show up here."
              emptyIcon={Pill}
              minBodyHeight={`${medicineRows.length > 0 ? "" : "220px"}`}
              maxBodyHeight={TABLE_MAX_HEIGHT}
            />
            <LoadMoreButton
              total={medicineRows.length}
              visibleCount={medicineLimit}
              onLoadMore={() =>
                setMedicineLimit((count) => count + LOAD_MORE_STEP)
              }
            />
          </Card>

          {canReadHomeCare && (
            <Card className="p-4 bg-white">
              <h3 className="mb-3 text-sm font-black text-slate-900">
                Home Care
              </h3>
              <DataTable
                columns={homeCareColumns}
                data={visibleHomeCareRows}
                onRowClick={openHomeCareBooking}
                emptyMessage="No home care visits found."
                emptyDescription="Home care bookings and visit logs for this patient will show up here."
                emptyIcon={HomeIcon}
                minBodyHeight={`${homeCareRows.length > 0 ? "" : "220px"}`}
                maxBodyHeight={TABLE_MAX_HEIGHT}
              />
              <LoadMoreButton
                total={homeCareRows.length}
                visibleCount={homeCareLimit}
                onLoadMore={() =>
                  setHomeCareLimit((count) => count + LOAD_MORE_STEP)
                }
              />
            </Card>
          )}

          <Card className="p-4 bg-white">
            <h3 className="mb-3 text-sm font-black text-slate-900">
              Diagnosis
            </h3>
            <DataTable
              columns={diagnosisColumns()}
              data={visibleDiagnoses}
              loading={diagnosesLoading}
              emptyMessage="No diagnoses recorded."
              emptyDescription="Diagnoses added during this patient's consultations will show up here."
              emptyIcon={Stethoscope}
              minBodyHeight={`${diagnoses.length > 0 ? "" : "220px"}`}
              maxBodyHeight={TABLE_MAX_HEIGHT}
            />
            <LoadMoreButton
              total={diagnoses.length}
              visibleCount={diagnosisLimit}
              onLoadMore={() =>
                setDiagnosisLimit((count) => count + LOAD_MORE_STEP)
              }
            />
          </Card>

          <PatientHealthTimeline
            consultations={consultations}
            labServiceRows={labServiceRows}
            medicineRows={medicineRows}
            patientInvoices={patientInvoices}
          />
        </>
      )}
    </div>
  );
}

export default PatientHistory;
