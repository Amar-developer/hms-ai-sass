"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, PlusCircle, Users } from "lucide-react";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { Pagination } from "@/app/components/common/Pagination";
import { Card, RefreshButton, StatusToast } from "@/app/components/common/ui";
import { type ApiSession } from "@/lib/api";
import { readNotificationTarget } from "@/lib/notificationTarget";
import { newSegment, editSegment } from "@/lib/routeSlugs";
import { PatientForm } from "@/features/patients/forms/PatientForms";
import { PatientFlow } from "./PatientFlow";
import { PatientSectionId } from "./types";
import { PatientDetailSkeleton } from "./components/PatientDetailSkeleton";
import { mapPatient } from "@/lib/liveData";
import { canCopyDatabaseIds } from "@/app/components/common/CopyIdButton";
import { AdaptiveFilterTrigger } from "@/app/components/common/AdaptiveFilterTrigger";
import { AdaptiveSortTrigger } from "@/app/components/common/AdaptiveSortTrigger";
import { AdaptiveResultCount } from "@/app/components/common/AdaptiveResultCount";
import { BreadcrumbSlot, useShellChrome } from "@/features/shell/AppShell";
import { DataTable } from "@/app/components/common/DataTable";
import { canReadPatientLinkedModule } from "./patientModuleAccess";
import {
  usePatientListData,
  usePatientDetailData,
  usePatientActions,
  type PatientListFilters,
} from "./api";
import { getPatientColumns } from "./Column";
import { getPatientTableSchema, getPatientQueryFields } from "./filterSchema";
import { type QueryFilterRow } from "@/utils/queryFilter";
import type { SortState } from "@/utils/types";
import type { AppNavigationTarget } from "@/lib/navigationTarget";
import DataHeader from "@/app/components/common/DataHeader";

type PatientProps = {
  apiSession: ApiSession | null;
  branchId?: string;
  enabledModules?: string[];
  isInitialLoading?: boolean;
  loadLiveData?: (session: ApiSession) => void | Promise<unknown>;
  setActive?: (page: AppNavigationTarget) => void;
  setPatients?: (updater: (prev: any[]) => any[]) => void;
};

const pageSize = 10;
export function Patient({
  apiSession,
  branchId,
  enabledModules,
  isInitialLoading = false,
  loadLiveData,
  setActive,
  setPatients,
  view = "list",
  selectedId = "",
  section = "home",
}: PatientProps & {
  view?: string;
  selectedId?: string;
  section?: PatientSectionId;
}) {
  const router = useRouter();
  const { beginNavigation } = useShellChrome();
  const isSuperAdmin = Boolean(apiSession?.user?.is_super_admin);
  const canCopyIds = canCopyDatabaseIds(apiSession?.user);
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
  const canCreatePatient = hasPermission("patients.write", "patients.create");
  const canEditPatient = hasPermission("patients.edit");
  const canDeletePatient = hasPermission("patients.delete");
  const canReadIntelligence = Boolean(
    (!enabledModules || enabledModules.includes("patient_intelligence")) &&
    hasPermission(
      "patient_intelligence.read",
      "patient_intelligence.manage",
      "patient_intelligence.rules.manage",
    ),
  );
  const [tenantId, setTenantId] = useState(apiSession?.tenantId || "");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [gender, setGender] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const DEFAULT_SORT: SortState = { key: "updated_at", dir: "desc" };
  const [sort, setSort] = useState<SortState | null>(DEFAULT_SORT);
  const [queryFilters, setQueryFilters] = useState<QueryFilterRow[]>([]);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<any>(null);
  const scopedSession =
    apiSession && tenantId ? { ...apiSession, tenantId } : apiSession;

  const {
    tenants,
    branches,
    rows,
    totalRows,
    filterOptions,
    setRows,
    loadTenants,
    loadData,
  } = usePatientListData({
    apiSession,
    tenantId,
    setTenantId,
    setBusy,
    setMessage,
  });

  const {
    selectedDetail,
    setSelectedDetail,
    summary,
    consultations,
    labOrders,
    homeCareBookings,
    pharmacyIssues,
    physioCases,
    patientIpAdmissions,
    membershipPlans,
    membershipEnrollments,
    patientInvoices,
    patientCommunications,
    familyRelationships,
    patientIntelligence,
    setPatientIntelligence,
    patientIntelligenceError,
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

  const selected =
    selectedDetail || rows.find((row: any) => row.id === selectedId);

  const patientSchema = getPatientTableSchema({ isSuperAdmin, tenants });
  const patientQueryFields = getPatientQueryFields({
    rows,
    branches,
    filterOptions,
  });

  const filterValues = {
    tenant: tenantId,
    branch: branchFilter,
    status,
  };

  const handleFilterChange = (key: string, value: string) => {
    setPage(1);
    setMessage("");

    const overrides: Record<string, string> = {};

    switch (key) {
      case "tenant":
        setTenantId(value);
        refreshPatients(value, 1, overrides);
        return;

      case "branch":
        setBranchFilter(value);
        overrides.branchFilter = value; // ← force the new value
        break;

      case "status":
        setStatus(value);
        overrides.status = value; // ← force the new value
        break;
    }

    refreshPatients(tenantId, 1, overrides);
  };

  function resetPatientFilters() {
    setStatus("all");
    setGender("all");
    setBranchFilter("all");
    setFromDate("");
    setToDate("");
    setQueryFilters([]);
    setSort(DEFAULT_SORT);
    setPage(1);
    setMessage("");
    loadData(tenantId, 1, {
      query: "",
      status: "all",
      gender: "all",
      branchFilter: "all",
      fromDate: "",
      toDate: "",
      queryFilters: [],
      sort: DEFAULT_SORT,
    });
  }

  function syncSharedPatient(patient: any) {
    if (!setPatients || !patient?.id) return;
    const mapped = mapPatient(patient);
    setPatients((previous: any[]) =>
      previous.some((row: any) => row.id === mapped.id)
        ? previous.map((row: any) => (row.id === mapped.id ? mapped : row))
        : [mapped, ...previous],
    );
  }

  function refreshPatients(
    nextTenantId: string = tenantId,
    nextPage: number = page,
    overrides: Partial<PatientListFilters> = {},
  ) {
    return loadData(nextTenantId, nextPage, {
      query,
      status,
      gender,
      branchFilter,
      fromDate,
      toDate,
      queryFilters,
      sort,
      ...overrides,
    });
  }

  function handleQueryFiltersChange(nextFilters: QueryFilterRow[]) {
    setQueryFilters(nextFilters);
    setPage(1);
    setMessage("");
    loadData(tenantId, 1, {
      query,
      status,
      gender,
      branchFilter,
      fromDate,
      toDate,
      queryFilters: nextFilters,
      sort,
    });
  }

  function handleSortChange(nextSort: SortState | null) {
    setSort(nextSort);
    setPage(1);
    setMessage("");
    loadData(tenantId, 1, {
      query,
      status,
      gender,
      branchFilter,
      fromDate,
      toDate,
      queryFilters,
      sort: nextSort,
    });
  }

  useEffect(() => {
    if (apiSession) {
      loadTenants();
    }
  }, [apiSession?.email]);
  useEffect(() => {
    if (apiSession && tenantId) {
      setPage(1);
      refreshPatients(tenantId, 1);
    }
  }, [apiSession?.email, tenantId]);

  const skipFirstQuerySearch = useRef(true);
  useEffect(() => {
    if (skipFirstQuerySearch.current) {
      skipFirstQuerySearch.current = false;
      return;
    }
    if (!apiSession || !tenantId) return;
    const timer = window.setTimeout(() => {
      setPage(1);
      setMessage("");
      refreshPatients(tenantId, 1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (
      view !== "list" ||
      !apiSession ||
      !tenantId ||
      typeof window === "undefined"
    )
      return;
    const pendingPatientId =
      sessionStorage.getItem("medizinhub.patientId") ||
      readNotificationTarget("patient")?.resourceId;
    if (!pendingPatientId) return;
    sessionStorage.removeItem("medizinhub.patientId");
    router.push(`/patients/${pendingPatientId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.email, tenantId, view]);

  // The App Router remounts this page component on every navigation (unlike
  // layouts, page-level state isn't preserved across URL changes), so a
  // success message set right before navigating to a new view — e.g. after
  // create/update — is discarded before the fresh instance can render it.
  // Stash it in sessionStorage and consume it once on mount instead.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("medizinhub.patientPendingMessage");
    if (!raw) return;
    sessionStorage.removeItem("medizinhub.patientPendingMessage");
    try {
      const pending = JSON.parse(raw);
      if (
        pending?.id === selectedId &&
        pending?.message &&
        Date.now() - pending.at < 10000
      )
        setMessage(pending.message);
    } catch {}
  }, []);

  const detailFetchInFlightRef = useRef(false);
  // Keyed by patient id, not by mount: this component is rendered from
  // ../layout.tsx (see the comment there) so it stays mounted across
  // PatientFlow's tab switches — only `view`/`selectedId`/`section` change.
  // fetchedForRef stops those tab switches from re-triggering a fetch for a
  // patient we've already loaded; it only re-fires when selectedId actually
  // changes (a different patient) or on a genuine remount (hard refresh).
  const fetchedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (isInitialLoading) return;
    if ((view !== "detail" && view !== "edit") || !selectedId) return;
    if (fetchedForRef.current === selectedId) return;
    fetchedForRef.current = selectedId;
    detailFetchInFlightRef.current = true;
    loadPatientDetail(scopedSession, selectedId).finally(() => {
      detailFetchInFlightRef.current = false;
    });
  }, [view, selectedId, isInitialLoading]);

  useEffect(() => {
    if (
      (view !== "detail" && view !== "edit") ||
      !selectedId ||
      busy ||
      detailFetchInFlightRef.current ||
      selectedDetail?.id === selectedId
    )
      return;
    router.replace("/patients");
  }, [view, selectedId, busy, selectedDetail?.id]);

  function open(nextView: string, id = "") {
    const path =
      nextView === "create"
        ? `/patients/${newSegment("patient")}`
        : nextView === "edit" && id
          ? `/patients/${id}/${editSegment("patient")}`
          : nextView === "detail" && id
            ? `/patients/${id}`
            : "/patients";
    beginNavigation("patients", path);
    router.push(path);
    setMessage("");
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  function openPatientEdit(id: string) {
    if (!id) return;
    open("edit", id);
  }

  function openPatientSection(id: string, nextSection: PatientSectionId) {
    if (!id) return;
    const path =
      nextSection === "home"
        ? `/patients/${id}`
        : `/patients/${id}/${nextSection}`;
    beginNavigation("patients", path);
    router.push(path);
  }

  const {
    createPatient,
    updatePatient,
    uploadPhoto,
    sendEngagementAction,
    saveManualPrescriptionDate,
    saveManualLabDate,
    deactivatePatient,
    activatePatient,
    enrollMembership,
    updateMembershipBenefitUsage,
    createFamilyRelationship,
    deleteFamilyRelationship,
  } = usePatientActions({
    apiSession,
    scopedSession,
    selectedId,
    selected,
    branchId,
    setBusy,
    setMessage,
    setConfirm,
    setRows,
    setSelectedDetail,
    setPatientIntelligence,
    loadPatientDetail,
    syncSharedPatient,
    setPatients,
    refreshPatients: () => refreshPatients(tenantId),
    loadLiveData,
    openDetail: (id: string) => open("detail", id),
  });

  if (!apiSession)
    return (
      <Card>
        <h3 className="card-title font-bold">EMR / Patient Management</h3>
        <p className="mt-2 text-sm text-slate-500">
          Backend login is required to view patient records.
        </p>
      </Card>
    );

  if (view === "create" && canCreatePatient)
    return (
      <PatientForm
        title="Create Patient"
        branches={branches}
        defaultBranchId={branchId || apiSession?.user?.branch_id || ""}
        apiSession={scopedSession}
        busy={busy}
        error={message}
        onSubmit={createPatient}
        back={() => open("list")}
      />
    );
  if (view === "edit" && selected && canEditPatient) {
    if (selectedDetail?.id !== selectedId) {
      return (
        <Card>
          <p className="text-sm text-slate-500">Loading patient...</p>
        </Card>
      );
    }
    return (
      <PatientForm
        key={selected.id}
        title="Edit Patient"
        patient={selected}
        branches={branches}
        defaultBranchId={branchId || apiSession?.user?.branch_id || ""}
        apiSession={scopedSession}
        familyRelationships={familyRelationships}
        busy={busy}
        error={message}
        onSubmit={updatePatient}
        back={() => open("detail", selected.id)}
      />
    );
  }
  if (view === "detail" && selected)
    return (
      <PatientFlow
        activeSection={section}
        onSectionChange={(nextSection: PatientSectionId) =>
          openPatientSection(selected.id, nextSection)
        }
        apiSession={scopedSession}
        patient={selected}
        summary={summary}
        patientIpAdmissions={patientIpAdmissions}
        consultations={consultations}
        labOrders={labOrders}
        homeCareBookings={homeCareBookings}
        pharmacyIssues={pharmacyIssues}
        physioCases={physioCases}
        membershipPlans={membershipPlans}
        membershipEnrollments={membershipEnrollments}
        patientInvoices={patientInvoices}
        patientCommunications={patientCommunications}
        familyRelationships={familyRelationships}
        patientIntelligence={patientIntelligence}
        patientIntelligenceError={patientIntelligenceError}
        branches={branches}
        loading={busy}
        message={message}
        onMessageClose={() => setMessage("")}
        onEnrollMembership={enrollMembership}
        onUpdateMembershipBenefitUsage={updateMembershipBenefitUsage}
        onCreateFamilyRelationship={createFamilyRelationship}
        onDeleteFamilyRelationship={deleteFamilyRelationship}
        onBack={() => open("list")}
        onEdit={() => openPatientEdit(selected.id)}
        onUploadPhoto={uploadPhoto}
        onSaveManualPrescriptionDate={saveManualPrescriptionDate}
        onSaveManualLabDate={saveManualLabDate}
        onSendEngagementAction={sendEngagementAction}
        setActive={setActive}
      />
    );
  // Route-driven tabs remount this page on every switch, so `selected`
  // (selectedDetail || rows.find(...)) is briefly empty while the fresh
  // fetch runs — without this branch that fell through to the patient LIST
  // view below, flashing its generic table skeleton over the detail page.
  if (view === "detail" && !selected)
    return (
      <PatientDetailSkeleton section={section} onBack={() => open("list")} />
    );

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows;

  const patientColumns = getPatientColumns({
    branches,
    canCopyIds,
    canEditPatient,
    canDeletePatient,
    onView: (id: string) => open("detail", id),
    onEdit: (id: string) => openPatientEdit(id),
    onDelete: (row: any) => setConfirm({ kind: "delete", row }),
    onActivate: (row: any) => activatePatient(row),
  });

  return (
    <Card className="">
      <BreadcrumbSlot>
        <div className="flex items-center gap-2">
          <AdaptiveResultCount
            shown={pageRows.length}
            total={totalRows}
            noun="patients"
          />
          <RefreshButton
            onRefresh={() => {
              setMessage("");
              refreshPatients(tenantId);
            }}
            className="h-auto rounded-md px-2.5 py-1 text-[11px]"
          />
          <AdaptiveFilterTrigger
            schema={patientSchema}
            query={query}
            setQuery={setQuery}
            filterValues={filterValues}
            onFilterChange={handleFilterChange}
            sort={sort}
            onSortChange={handleSortChange}
            showSort={false}
            onReset={resetPatientFilters}
            queryFields={patientQueryFields}
            queryFilters={queryFilters}
            onQueryFiltersChange={handleQueryFiltersChange}
          />
          <AdaptiveSortTrigger
            fields={patientSchema.sortFields}
            sort={sort}
            onSortChange={handleSortChange}
          />
        </div>
      </BreadcrumbSlot>

      <DataHeader
        title="EMR / Patient Management"
        description="Tenant-scoped patient registry with history, alerts, treatment
              timeline, and audited record views"
        canCreate={canCreatePatient}
        cardIcon={Users}
        buttonText="Create Patient"
        open={open}
        count={String(rows.length)}
      />
      <StatusToast message={message} onClose={() => setMessage("")} />
      <div className="table-wrapper-width">
        <DataTable
          columns={patientColumns}
          data={pageRows}
          loading={busy}
          emptyMessage="No patients match your search."
          emptyDescription="Patients registered here will show up in this list once added."
          emptyIcon={Users}
          minBodyHeight={`${pageRows.length > 0 ? "" : "220px"}`}
          onRowClick={(row: any) => open("detail", row.id)}
          sort={sort ?? undefined}
          onSortChange={handleSortChange}
          className="table-width"
        />
      </div>
      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={totalRows}
        onPage={(nextPage) => {
          setPage(nextPage);
          setMessage("");
          refreshPatients(tenantId, nextPage);
        }}
      />
      {confirm && (
        <ConfirmModal
          busy={busy}
          action={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => deactivatePatient(confirm.row)}
        />
      )}
    </Card>
  );
}
