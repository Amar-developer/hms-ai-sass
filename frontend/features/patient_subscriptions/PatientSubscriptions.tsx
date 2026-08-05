"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { PlanForm } from "../patients/components/PlanForm";
import { money } from "@/utils/helper";
import { PlanTableRow } from "../patients/components/PlanTableRow";
import { QueuedEnrollmentsTable } from "../patients/components/QueuedEnrollmentsTable";
import { PatientSearchSelect } from "../patients/components/PatientSearchSelect";
import { Pagination } from "@/app/components/common/Pagination";
import { pageSize } from "@/utils/constants";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { TableSkeleton } from "@/app/components/common/loader/TableSkeleton";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";
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
        ? "/admin/membership/new"
        : nextView === "edit"
          ? `/admin/membership/${id}/edit`
          : nextView === "detail"
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
    view === "detail"
      ? plans.find((plan: any) => plan.id === selectedId)
      : null;

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
    if ((view !== "edit" && view !== "detail") || !selectedId || loading)
      return;
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

  const {
    createPlan,
    enroll,
    updatePlan,
    togglePlanActive,
    deletePlan,
    updateEnrollment,
    cancelEnrollment,
  } = usePatientSubscriptionsActions({
    apiSession,
    branchId,
    labTests,
    medicines,
    patientMap,
    canDeletePlans,
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
  const pagedPlans = plans.slice(
    (safePlanPage - 1) * pageSize,
    safePlanPage * pageSize,
  );

  function requestDeletePlan(plan: any) {
    setConfirmDelete(plan.id);
  }

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
      {view === "detail" && detailPlan && (
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

          <Card>
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div>
                <h3 className="text-base lg:text-lg font-bold">Plans</h3>
                <p className="card-desc text-slate-500">
                  Create and manage branch-specific patient membership plans.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <RefreshButton onRefresh={load} />
                {canCreatePlan && (
                  <Button
                    type="button"
                    onClick={() => goTo("create")}
                    className="save-button text-xs"
                  >
                    Create Plan
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              {loading && <TableSkeleton />}
              {!loading && plans.length === 0 && (
                <p className="p-4 text-sm text-slate-500">
                  No patient plans yet.
                </p>
              )}
              {!loading && plans.length > 0 && (
                <div>
                  <div className="min-w-full overflow-x-auto lg:block">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        <tr className="text-sm">
                          <th className="px-4 py-3">Plan</th>
                          <th className="px-4 py-3">Price</th>
                          <th className="px-4 py-3">Duration</th>
                          <th className="px-4 py-3">Consults</th>
                          {/* <th className="px-4 py-3">Scope</th> */}
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Enrolled</th>
                          <th className="px-4 py-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pagedPlans.map((plan: any) => {
                          const activeEnrollmentCount =
                            activeEnrollmentCountByPlan.get(plan.id) || 0;
                          return (
                            <PlanTableRow
                              key={plan.id}
                              plan={plan}
                              activeEnrollmentCount={activeEnrollmentCount}
                              busy={busy}
                              confirmDelete={confirmDelete}
                              setConfirmDelete={setConfirmDelete}
                              deletePlan={deletePlan}
                              requestDeletePlan={requestDeletePlan}
                              startEdit={startEdit}
                              togglePlanActive={togglePlanActive}
                              canDeletePlans={canDeletePlans}
                              canEditPlans={canEditPlans}
                              openDetail={() => goTo("detail", plan.id)}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <Pagination
              page={safePlanPage}
              totalPages={planTotalPages}
              total={plans.length}
              onPage={setPlanPage}
            />
          </Card>
          <ActiveEnrollmentsTable
            rows={activeEnrollments}
            patientMap={patientMap}
            canManage={canDeletePlans}
            busy={busy}
            onUpdate={updateEnrollment}
            onCancel={requestCancelEnrollment}
          />
          <QueuedEnrollmentsTable
            rows={queuedEnrollments}
            patientMap={patientMap}
          />
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
    </div>
  );
}
