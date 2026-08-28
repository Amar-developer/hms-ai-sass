"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  CreditCard,
  PlusCircle,
  ShieldCheck,
} from "lucide-react";
import {
  Button,
  Card,
  RefreshButton,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { canDeleteMembershipPlans } from "../patients/helpers";
import { ActiveEnrollmentsTable } from "../patients/components/ActiveEnrollmentsTable";
import { PlanDetailPage } from "../patients/components/PlanDetailPage";
import { newSegment, editSegment } from "@/lib/routeSlugs";
import { PlanForm } from "../patients/components/PlanForm";
import { money } from "@/utils/helper";
import { QueuedEnrollmentsTable } from "../patients/components/QueuedEnrollmentsTable";
import { PatientSearchSelect } from "../patients/components/PatientSearchSelect";
import { Pagination } from "@/app/components/common/Pagination";
import { pageSize } from "@/utils/constants";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";
import { DataTable } from "@/app/components/common/DataTable";
import { getPlanColumns } from "./Column";
import {
  usePatientSubscriptionsActions,
  usePatientSubscriptionsData,
} from "./api";

export function PatientSubscriptions({
  apiSession,
  branchId,
  branches,
  clinic,
  showEnrollment = false,
  view = "list",
  selectedId = "",
}: any) {
  const router = useRouter();
  const [toast, setToast] = useState<{
    text: string;
    kind: "success" | "error" | "warn";
  } | null>(null);
  const [busy, setBusy] = useState("");
  const [selectedPatient, setSelectedPatient] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [freeConsultDeptIds, setFreeConsultDeptIds] = useState<string[]>([]);
  const [editFreeConsultDeptIds, setEditFreeConsultDeptIds] = useState<
    string[]
  >([]);
  const [freeLabTestIds, setFreeLabTestIds] = useState<string[]>([]);
  const [freeLabQuantities, setFreeLabQuantities] = useState<
    Record<string, number>
  >({});
  const [discountedLabTestIds, setDiscountedLabTestIds] = useState<string[]>(
    [],
  );
  const [freeMedicineIds, setFreeMedicineIds] = useState<string[]>([]);
  const [freeMedicineQuantities, setFreeMedicineQuantities] = useState<
    Record<string, number>
  >({});
  const [discountedMedicineIds, setDiscountedMedicineIds] = useState<string[]>(
    [],
  );
  const [editFreeLabIds, setEditFreeLabIds] = useState<string[]>([]);
  const [editFreeLabQuantities, setEditFreeLabQuantities] = useState<
    Record<string, number>
  >({});
  const [editDiscountedLabIds, setEditDiscountedLabIds] = useState<string[]>(
    [],
  );
  const [editFreeMedIds, setEditFreeMedIds] = useState<string[]>([]);
  const [editFreeMedQuantities, setEditFreeMedQuantities] = useState<
    Record<string, number>
  >({});
  const [editDiscountedMedIds, setEditDiscountedMedIds] = useState<string[]>(
    [],
  );
  const [confirmDelete, setConfirmDelete] = useState("");
  const [planPage, setPlanPage] = useState(1);
  const [confirm, setConfirm] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<
    "plans" | "active" | "queued"
  >("plans");
  const [activeEnrollmentPlanId, setActiveEnrollmentPlanId] = useState("all");
  const {
    plans,
    enrollments,
    labTests,
    medicines,
    departments,
    loadError,
    setLoadError,
    loading,
    load,
  } = usePatientSubscriptionsData({
    apiSession,
    branchId,
    setSelectedPlan,
  });

  function goTo(nextView: string, id = "", opts: { replace?: boolean } = {}) {
    const path =
      nextView === "create"
        ? `/admin/membership/${newSegment("subscription")}`
        : nextView === "edit"
          ? `/admin/membership/${id}/${editSegment("subscription")}`
          : nextView === "view"
            ? `/admin/membership/${id}`
            : "/admin/membership";
    if (opts.replace) {
      router.replace(path);
    } else {
      router.push(path);
    }
  }

  const editingPlan =
    view === "edit" ? plans.find((plan: any) => plan.id === selectedId) : null;
  const detailPlan =
    view === "view" ? plans.find((plan: any) => plan.id === selectedId) : null;

  // Populate the edit-form working state once per target plan, not on
  // every render — editingPlan is re-derived from `plans` each render, but
  // the fields below hold in-progress edits the user is actively changing.
  // `plans` loads asynchronously, so on a fresh mount `editingPlan` is still
  // undefined the first time this runs; the ref lets the effect retry once
  // the data actually arrives instead of only firing on `view`/`selectedId`.
  const populatedEditPlanIdRef = useRef("");
  useEffect(() => {
    if (view !== "edit" || !selectedId) {
      populatedEditPlanIdRef.current = "";
      return;
    }
    if (!editingPlan || populatedEditPlanIdRef.current === selectedId) return;
    populatedEditPlanIdRef.current = selectedId;
    setEditFreeConsultDeptIds(
      editingPlan.free_consultation_department_ids || [],
    );
    setEditFreeLabIds(editingPlan.free_lab_test_ids || []);
    setEditFreeLabQuantities(editingPlan.free_lab_test_quantities || {});
    setEditDiscountedLabIds(editingPlan.discounted_lab_test_ids || []);
    setEditFreeMedIds(editingPlan.free_medicine_ids || []);
    setEditFreeMedQuantities(editingPlan.free_medicine_quantities || {});
    setEditDiscountedMedIds(editingPlan.discounted_medicine_ids || []);
    setToast(null);
  }, [view, selectedId, editingPlan]);

  // Bounce back to the list if a direct/bookmarked edit or detail link no
  // longer resolves to a real plan, but only once loading has actually
  // finished — otherwise this fires while `plans` is still empty.
  useEffect(() => {
    if ((view !== "edit" && view !== "view") || !selectedId || loading) return;
    if (!plans.some((plan: any) => plan.id === selectedId)) {
      goTo("list", "", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId, loading, plans]);
  const { patients, patientMap } = usePatientReferencesQuery(
    apiSession,
    enrollments.map((row: any) => row.patient_id),
  );
  const planTotalPages = Math.max(1, Math.ceil(plans.length / pageSize));
  const safePlanPage = Math.min(planPage, planTotalPages);

  useEffect(() => {
    if (planPage !== safePlanPage) setPlanPage(safePlanPage);
  }, [planPage, safePlanPage]);

  useEffect(() => {
    setSelectedPatient((current) =>
      patients?.some((row: any) => row.id === current)
        ? current
        : patients?.[0]?.id || "",
    );
  }, [patients]);

  const userPermissions = apiSession?.user?.permissions || [];
  const hasPermission = (...keys: string[]) =>
    Boolean(
      apiSession?.user?.is_super_admin ||
      userPermissions.includes("*") ||
      keys.some((key) => userPermissions.includes(key)),
    );
  const canDeletePlans =
    canDeleteMembershipPlans(apiSession?.user) ||
    hasPermission(
      "patient_subscriptions.manage",
      "patient_subscriptions.delete",
      "settings.manage",
    );
  const canAdjustBenefitUsage = Boolean(
    apiSession?.user?.user_type === "tenant_admin" ||
      apiSession?.user?.roles?.includes("tenant_admin"),
  );

  const {
    createPlan,
    enroll,
    updatePlan,
    togglePlanActive,
    deletePlan,
    updateEnrollment,
    updateBenefitUsage,
    cancelEnrollment,
  } = usePatientSubscriptionsActions({
    apiSession,
    branchId,
    labTests,
    medicines,
    patientMap,
    canDeletePlans,
    canAdjustBenefitUsage,
    busy,
    selectedPatient,
    selectedPlan,
    freeConsultDeptIds,
    freeLabTestIds,
    freeLabQuantities,
    discountedLabTestIds,
    freeMedicineIds,
    freeMedicineQuantities,
    discountedMedicineIds,
    editingPlan,
    editFreeConsultDeptIds,
    editFreeLabIds,
    editFreeLabQuantities,
    editDiscountedLabIds,
    editFreeMedIds,
    editFreeMedQuantities,
    editDiscountedMedIds,
    view,
    selectedId,
    setBusy,
    setToast,
    navigateToList: () => goTo("list"),
    setConfirmDelete,
    setFreeConsultDeptIds,
    setFreeLabTestIds,
    setFreeLabQuantities,
    setDiscountedLabTestIds,
    setFreeMedicineIds,
    setFreeMedicineQuantities,
    setDiscountedMedicineIds,
    load,
  });

  function startEdit(plan: any) {
    goTo("edit", plan.id);
  }

  function cancelEdit() {
    setConfirmDelete("");
    goTo("list");
  }

  function requestCancelEnrollment(row: any) {
    setConfirm(row);
  }

  function cancelEnrollmentAndClose(row: any) {
    cancelEnrollment(row);
    setConfirm(false);
  }

  if (!apiSession)
    return (
      <Card>
        <h3 className="text-lg font-bold">Patient Subscriptions</h3>
        <p className="mt-2 text-sm text-slate-500">
          Backend login is required.
        </p>
      </Card>
    );

  const activeEnrollments = enrollments.filter(
    (row: any) => row.status === "active",
  );
  const queuedEnrollments = enrollments.filter(
    (row: any) => row.status === "queued",
  );
  const canEditPlans =
    canDeletePlans ||
    hasPermission(
      "patient_subscriptions.manage",
      "patient_subscriptions.edit",
      "settings.manage",
    );
  const canCreatePlan =
    canDeletePlans ||
    hasPermission(
      "patient_subscriptions.manage",
      "patient_subscriptions.create",
      "settings.manage",
    );
  const canEnrollPatient =
    canDeletePlans ||
    hasPermission(
      "patient_subscriptions.manage",
      "patient_subscriptions.create",
      "settings.manage",
      "identity.users.manage",
    );
  const activeEnrollmentCountByPlan = useMemo(() => {
    const counts = new Map<string, number>();
    activeEnrollments.forEach((row: any) => {
      counts.set(row.plan_id, (counts.get(row.plan_id) || 0) + 1);
    });
    return counts;
  }, [activeEnrollments]);
  const activeEnrollmentPlanTabs = useMemo(
    () => [
      { id: "all", label: "All Plans", count: activeEnrollments.length },
      ...plans.map((plan: any) => ({
        id: plan.id,
        label: plan.name,
        count: activeEnrollmentCountByPlan.get(plan.id) || 0,
      })),
    ],
    [activeEnrollments.length, activeEnrollmentCountByPlan, plans],
  );
  const planFilteredActiveEnrollments = useMemo(
    () =>
      activeEnrollmentPlanId === "all"
        ? activeEnrollments
        : activeEnrollments.filter(
            (row: any) => row.plan_id === activeEnrollmentPlanId,
          ),
    [activeEnrollmentPlanId, activeEnrollments],
  );
  const pagedPlans = plans.slice(
    (safePlanPage - 1) * pageSize,
    safePlanPage * pageSize,
  );

  function requestDeletePlan(plan: any) {
    setConfirmDelete(plan.id);
  }

  useEffect(() => {
    if (
      activeEnrollmentPlanId !== "all" &&
      !plans.some((plan: any) => plan.id === activeEnrollmentPlanId)
    ) {
      setActiveEnrollmentPlanId("all");
    }
  }, [activeEnrollmentPlanId, plans]);

  return (
    <div className="">
      {loadError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span className="font-bold">⚠ Could not load plans:</span>
          <span className="flex-1">{loadError}</span>
          <button type="button" className="font-bold underline" onClick={load}>
            Retry
          </button>
          <button
            type="button"
            className="ml-2 font-bold"
            onClick={() => setLoadError("")}
          >
            ✕
          </button>
        </div>
      )}
      <StatusToast
        message={toast?.text}
        tone={
          toast?.kind === "error"
            ? "error"
            : toast?.kind === "warn"
              ? "warning"
              : undefined
        }
        onClose={() => setToast(null)}
      />
      {view === "view" && detailPlan && (
        <PlanDetailPage
          plan={detailPlan}
          labTests={labTests}
          medicines={medicines}
          departments={departments}
          onBack={() => goTo("list")}
          onEdit={() => startEdit(detailPlan)}
          onToggle={() => togglePlanActive(detailPlan)}
          toggleBusy={busy === `toggle-${detailPlan.id}`}
          canEditPlans={canEditPlans}
          activeEnrollmentCount={
            activeEnrollmentCountByPlan.get(detailPlan.id) || 0
          }
        />
      )}
      {view === "create" && canCreatePlan && (
        <PlanForm
          title="Create Plan"
          apiSession={apiSession}
          busy={busy === "plan"}
          submitLabel="Create Plan"
          onSubmit={createPlan}
          back={() => goTo("list")}
          labTests={labTests}
          medicines={medicines}
          departments={departments}
          freeConsultDeptIds={freeConsultDeptIds}
          setFreeConsultDeptIds={setFreeConsultDeptIds}
          freeLabTestIds={freeLabTestIds}
          setFreeLabTestIds={setFreeLabTestIds}
          freeLabQuantities={freeLabQuantities}
          setFreeLabQuantities={setFreeLabQuantities}
          discountedLabTestIds={discountedLabTestIds}
          setDiscountedLabTestIds={setDiscountedLabTestIds}
          freeMedicineIds={freeMedicineIds}
          setFreeMedicineIds={setFreeMedicineIds}
          freeMedicineQuantities={freeMedicineQuantities}
          setFreeMedicineQuantities={setFreeMedicineQuantities}
          discountedMedicineIds={discountedMedicineIds}
          setDiscountedMedicineIds={setDiscountedMedicineIds}
        />
      )}
      {view === "edit" && editingPlan && canEditPlans && (
        <PlanForm
          title="Edit Plan"
          apiSession={apiSession}
          plan={editingPlan}
          busy={busy === "edit"}
          submitLabel="Save Changes"
          onSubmit={updatePlan}
          back={cancelEdit}
          labTests={labTests}
          medicines={medicines}
          departments={departments}
          freeConsultDeptIds={editFreeConsultDeptIds}
          setFreeConsultDeptIds={setEditFreeConsultDeptIds}
          freeLabTestIds={editFreeLabIds}
          setFreeLabTestIds={setEditFreeLabIds}
          freeLabQuantities={editFreeLabQuantities}
          setFreeLabQuantities={setEditFreeLabQuantities}
          discountedLabTestIds={editDiscountedLabIds}
          setDiscountedLabTestIds={setEditDiscountedLabIds}
          freeMedicineIds={editFreeMedIds}
          setFreeMedicineIds={setEditFreeMedIds}
          freeMedicineQuantities={editFreeMedQuantities}
          setFreeMedicineQuantities={setEditFreeMedQuantities}
          discountedMedicineIds={editDiscountedMedIds}
          setDiscountedMedicineIds={setEditDiscountedMedIds}
        />
      )}
      {view === "list" && (
        <>
          {showEnrollment && canEnrollPatient && (
            <Card>
              <h3 className="text-lg font-bold">Enroll Patient</h3>
              <form
                onSubmit={enroll}
                className="mt-4 grid gap-3 md:grid-cols-3"
              >
                <FormField label="Patient" required>
                  <PatientSearchSelect
                    apiSession={apiSession}
                    initialPatients={patients}
                    required
                    value={selectedPatient}
                    onChange={(value: string) => setSelectedPatient(value)}
                    placeholder="Select patient"
                    searchPlaceholder="Search patient by name, mobile, or number"
                  />
                </FormField>
                <FormField label="Plan" required>
                  <Select
                    required
                    value={selectedPlan}
                    onChange={(e: any) => setSelectedPlan(e.target.value)}
                  >
                    {plans
                      .filter((p: any) => p.is_active)
                      .map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {money(p.price_amount)}
                        </option>
                      ))}
                  </Select>
                </FormField>
                <div className="flex items-end">
                  <Button disabled={busy === "enroll"}>
                    <ButtonLoader loading={busy === "enroll"}>
                      {busy === "enroll" ? "Enrolling..." : "Enroll"}
                    </ButtonLoader>
                  </Button>
                </div>
              </form>
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                If the patient already has an active plan, this purchase is
                queued. Its expected validity starts after the current plan;
                when activation actually occurs, both dates are recalculated
                from that activation date. Only one queued plan is allowed.
              </p>
            </Card>
          )}

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-brand ring-1 ring-emerald-100">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-950">
                    Patient Membership Workspace
                  </h2>
                  <p className="text-xs font-medium text-slate-500">
                    Plans, active memberships and queued enrollments
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <RefreshButton
                  onRefresh={load}
                  className="h-9 rounded-lg border border-slate-200 px-3 text-xs"
                />
                {activeTab === "plans" && canCreatePlan && (
                  <button
                    type="button"
                    onClick={() => goTo("create")}
                    className="primary-action h-9 gap-2 whitespace-nowrap px-4 text-xs"
                  >
                    <PlusCircle className="h-4 w-4" />
                    Create Plan
                  </button>
                )}
              </div>
            </div>
            <nav
              className="scrollbar-hidden flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 py-1.5"
              aria-label="Patient membership sections"
            >
              {[
                ["plans", "Plans", CreditCard, plans.length],
                ["active", "Active Enrollments", CheckCircle2, activeEnrollments.length],
                ["queued", "Queued Enrollments", Clock, queuedEnrollments.length],
              ].map(([id, label, Icon, count]: any) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => setActiveTab(id)}
                    className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold transition-colors ${
                      active
                        ? "bg-brand text-brand-fg"
                        : "text-slate-600 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    <span
                      className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] ${
                        active
                          ? "bg-white/20 text-brand-fg"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </nav>
          </section>

          {activeTab === "plans" && (
          <Card className="mt-3">
            <div className="max-w-[78vw]">
              <DataTable
                columns={getPlanColumns({
                  activeEnrollmentCountByPlan,
                  busy,
                  requestDeletePlan,
                  startEdit,
                  togglePlanActive,
                  canDeletePlans,
                  canEditPlans,
                  openDetail: (plan: any) => goTo("view", plan.id),
                })}
                data={pagedPlans}
                loading={loading}
                emptyMessage="No patient plans yet."
                emptyDescription="Membership plans created for patients will show up here."
                emptyIcon={CreditCard}
                minBodyHeight={`${pagedPlans.length > 0 ?'':'220px'}`}
                onRowClick={(plan: any) => goTo("view", plan.id)}
              />
            </div>
            <Pagination
              page={safePlanPage}
              totalPages={planTotalPages}
              total={plans.length}
              onPage={setPlanPage}
            />
          </Card>
          )}
          {activeTab === "active" && (
          <div>
            <div className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <nav
                className="scrollbar-hidden flex gap-1 overflow-x-auto bg-slate-50 px-3 py-1.5"
                aria-label="Active enrollment plan sections"
              >
                {activeEnrollmentPlanTabs.map((tab) => {
                  const active = activeEnrollmentPlanId === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => setActiveEnrollmentPlanId(tab.id)}
                      className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold transition-colors ${
                        active
                          ? "bg-brand text-brand-fg"
                          : "text-slate-600 hover:bg-white hover:text-slate-900"
                      }`}
                    >
                      {tab.label}
                      <span
                        className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] ${
                          active
                            ? "bg-white/20 text-brand-fg"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <ActiveEnrollmentsTable
              rows={planFilteredActiveEnrollments}
              patientMap={patientMap}
              canManage={canDeletePlans}
              canAdjustBenefits={canAdjustBenefitUsage}
              busy={busy}
              onUpdate={updateEnrollment}
              onUpdateBenefits={updateBenefitUsage}
              onCancel={requestCancelEnrollment}
              labTests={labTests}
              medicines={medicines}
              hidePlanFilter
            />
          </div>
          )}
          {activeTab === "queued" && (
          <QueuedEnrollmentsTable
            rows={queuedEnrollments}
            patientMap={patientMap}
          />
          )}
        </>
      )}
      {confirm && (
        <ConfirmModal
          action={{
            kind: "cancel",
            entity: "enrollment",
            row: confirm,
          }}
          busy={busy === `enrollment-${confirm.id}`}
          onCancel={() => setConfirm(null)}
          onConfirm={() => cancelEnrollmentAndClose(confirm)}
        />
      )}
      {confirmDelete &&
        (() => {
          const planToDelete = plans.find(
            (plan: any) => plan.id === confirmDelete,
          );
          if (!planToDelete) return null;
          return (
            <ConfirmModal
              title="Deactivate Plan"
              message={`Deactivate ${planToDelete.name}? Existing patient records are kept and the plan can be reactivated later.`}
              confirmLabel="Yes, Deactivate"
              busy={busy === `delete-${planToDelete.id}`}
              onCancel={() => setConfirmDelete("")}
              onConfirm={() => deletePlan(planToDelete.id)}
            />
          );
        })()}
    </div>
  );
}
