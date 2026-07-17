"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  RefreshButton,
  SearchableSelect,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { apiFetch } from "@/lib/api";
import { uniqueDepartmentRows } from "@/lib/options";
import {
  canDeleteMembershipPlans,
  codeFromName,
  mapQuantitiesToIds,
  parsePharmacySlabs,
  sameName,
} from "../patients/helpers";
import { ActiveEnrollmentsTable } from "../patients/components/ActiveEnrollmentsTable";
import { PlanDetailPage } from "../patients/components/PlanDetailPage";
import { PlanForm } from "../patients/components/PlanForm";
import { money } from "@/utils/helper";
import { PlanTableRow } from "../patients/components/PlanTableRow";
import { QueuedEnrollmentsTable } from "../patients/components/QueuedEnrollmentsTable";
import { Pagination } from "@/app/components/common/Pagination";
import { pageSize } from "@/utils/constants";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";

export function PatientSubscriptions({
  apiSession,
  branchId,
  branches,
  clinic,
  patients,
  showEnrollment = false,
}: any) {
  const [plans, setPlans] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [labTests, setLabTests] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [view, setView] = useState("list");
  const [toast, setToast] = useState<{
    text: string;
    kind: "success" | "error" | "warn";
  } | null>(null);
  const [loadError, setLoadError] = useState("");
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
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
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
  const [detailPlanId, setDetailPlanId] = useState("");
  const [planPage, setPlanPage] = useState(1);
  const planTotalPages = Math.max(1, Math.ceil(plans.length / pageSize));
  const safePlanPage = Math.min(planPage, planTotalPages);
  const patientMap = useMemo<Map<string, any>>(
    () => new Map((patients || []).map((p: any) => [p.id, p])),
    [patients],
  );
  const [confirm, setConfirm] = useState<any>(null);
  async function load() {
    if (!apiSession) return;
    setLoadError("");
    try {
      const [planRows, enrollmentRows, testRows, medicineRows, departmentRows] =
        await Promise.all([
          apiFetch(
            "/patient-subscriptions/plans?include_inactive=true",
            apiSession,
          ),
          apiFetch("/patient-subscriptions/enrollments", apiSession),
          apiFetch("/lab/catalog/tests", apiSession).catch(() => []),
          apiFetch(
            `/pharmacy/medicines?branch_id=${encodeURIComponent(branchId || "")}`,
            apiSession,
          ).catch(() => []),
          apiFetch(
            `/tenants/${apiSession.tenantId}/departments`,
            apiSession,
          ).catch(() => []),
        ]);
      setPlans(planRows);
      setEnrollments(enrollmentRows);
      setLabTests(testRows);
      setMedicines(medicineRows);
      setDepartments(
        uniqueDepartmentRows(
          (departmentRows || []).filter(
            (dept: any) => dept?.is_active !== false,
          ),
        ),
      );
      setDetailPlanId((current) =>
        planRows.some((row: any) => row.id === current) ? current : "",
      );
      setSelectedPlan((current) =>
        planRows.some((row: any) => row.id === current)
          ? current
          : planRows[0]?.id || "",
      );
      setSelectedPatient((current) =>
        patients?.some((row: any) => row.id === current)
          ? current
          : patients?.[0]?.id || "",
      );
    } catch (err: any) {
      const msg = err.message || "Could not load patient subscriptions.";
      setLoadError(msg);
    }
  }

  useEffect(() => {
    load();
  }, [apiSession?.tenantId, branchId, patients?.length]);
  useEffect(() => {
    if (planPage !== safePlanPage) setPlanPage(safePlanPage);
  }, [planPage, safePlanPage]);

  async function resolveLabBenefitIds(values: string[], branchValue: string) {
    const resolved: string[] = [];
    for (const value of values) {
      if (!value.startsWith("new:")) {
        resolved.push(value);
        continue;
      }
      const name = value.slice(4).trim();
      if (!name) continue;
      const existing = labTests.find((row: any) => sameName(row, name));
      if (existing) {
        resolved.push(existing.id);
        continue;
      }
      const created = await apiFetch("/lab/catalog/tests", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: branchValue || branchId || null,
          code: codeFromName("LAB", name),
          name,
          department: "Membership Benefit",
          sample_type: null,
          default_price: 0,
          purchase_price: 0,
          created_by_user_id: apiSession.user?.id,
        }),
      });
      resolved.push(created.id);
    }
    return resolved;
  }

  async function resolveMedicineBenefitIds(
    values: string[],
    branchValue: string,
  ) {
    const resolved: string[] = [];
    for (const value of values) {
      if (!value.startsWith("new:")) {
        resolved.push(value);
        continue;
      }
      const name = value.slice(4).trim();
      if (!name) continue;
      const existing = medicines.find((row: any) => sameName(row, name));
      if (existing) {
        resolved.push(existing.id);
        continue;
      }
      const created = await apiFetch("/pharmacy/medicines", apiSession, {
        method: "POST",
        body: JSON.stringify({
          branch_id: branchValue || branchId || null,
          code: codeFromName("MED", name),
          name,
          generic_name: null,
          form: "Tablet",
          default_sale_price: 0,
          purchase_price: 0,
          reorder_level: 0,
          created_by_user_id: apiSession.user?.id,
        }),
      });
      resolved.push(created.id);
    }
    return resolved;
  }

  async function createPlan(form: HTMLFormElement) {
    const fd = new FormData(form);
    if (busy === "plan") return;
    setBusy("plan");
    setToast(null);
    try {
      const basePayload = {
        name: fd.get("name"),
        code: fd.get("code") || null,
        price_amount: Number(fd.get("priceAmount") || 0),
        duration_days: Number(fd.get("durationDays") || 0),
        activation_after_days: Number(fd.get("activationAfterDays") || 0),
        free_consultations: Number(fd.get("freeConsultations") || 0),
        free_consultation_department_ids: freeConsultDeptIds,
        lab_discount_percentage: Number(fd.get("labDiscount") || 0),
        pharmacy_discount_percentage: Number(fd.get("pharmacyDiscount") || 0),
        min_discount_amount: Number(fd.get("minDiscountAmount") || 0),
        pharmacy_discount_slabs: parsePharmacySlabs(fd),
        created_by_user_id: apiSession.user?.id,
      };
      const freeLabIds = await resolveLabBenefitIds(
        freeLabTestIds,
        branchId || "",
      );
      const discountedLabIds = await resolveLabBenefitIds(
        discountedLabTestIds,
        branchId || "",
      );
      const freeMedIds = await resolveMedicineBenefitIds(
        freeMedicineIds,
        branchId || "",
      );
      const discountedMedIds = await resolveMedicineBenefitIds(
        discountedMedicineIds,
        branchId || "",
      );
      await apiFetch("/patient-subscriptions/plans", apiSession, {
        method: "POST",
        body: JSON.stringify({
          ...basePayload,
          branch_id: null,
          free_lab_test_ids: freeLabIds,
          free_lab_test_quantities: mapQuantitiesToIds(
            freeLabTestIds,
            freeLabIds,
            freeLabQuantities,
          ),
          discounted_lab_test_ids: discountedLabIds,
          free_medicine_ids: freeMedIds,
          free_medicine_quantities: mapQuantitiesToIds(
            freeMedicineIds,
            freeMedIds,
            freeMedicineQuantities,
          ),
          discounted_medicine_ids: discountedMedIds,
        }),
      });
      form.reset();
      setFreeConsultDeptIds([]);
      setFreeLabTestIds([]);
      setFreeLabQuantities({});
      setDiscountedLabTestIds([]);
      setFreeMedicineIds([]);
      setFreeMedicineQuantities({});
      setDiscountedMedicineIds([]);
      setView("list");
      await load();
      setToast({
        text: "Tenant-scoped patient subscription plan created.",
        kind: "success",
      });
    } catch (err: any) {
      setToast({
        text: err.message || "Could not create plan.",
        kind: "error",
      });
    } finally {
      setBusy("");
    }
  }

  async function enroll(event: any) {
    event.preventDefault();
    if (!selectedPatient || !selectedPlan) {
      setToast({ text: "Select patient and plan.", kind: "warn" });
      return;
    }
    setBusy("enroll");
    setToast(null);
    try {
      const created = await apiFetch(
        "/patient-subscriptions/enrollments",
        apiSession,
        {
          method: "POST",
          body: JSON.stringify({
            branch_id: branchId,
            patient_id: selectedPatient,
            plan_id: selectedPlan,
            starts_on: new Date().toISOString().slice(0, 10),
            created_by_user_id: apiSession.user?.id,
          }),
        },
      );
      await load();
      setToast({
        text:
          created?.status === "queued"
            ? "Patient already has an active plan — this one is queued and will activate automatically once it ends."
            : "Patient enrolled in subscription plan.",
        kind: "success",
      });
    } catch (err: any) {
      setToast({
        text: err.message || "Could not enroll patient.",
        kind: "error",
      });
    } finally {
      setBusy("");
    }
  }

  function startEdit(plan: any) {
    setEditingPlan(plan);
    setView("edit");
    setEditFreeConsultDeptIds(plan.free_consultation_department_ids || []);
    setEditFreeLabIds(plan.free_lab_test_ids || []);
    setEditFreeLabQuantities(plan.free_lab_test_quantities || {});
    setEditDiscountedLabIds(plan.discounted_lab_test_ids || []);
    setEditFreeMedIds(plan.free_medicine_ids || []);
    setEditFreeMedQuantities(plan.free_medicine_quantities || {});
    setEditDiscountedMedIds(plan.discounted_medicine_ids || []);
    setToast(null);
  }

  function cancelEdit() {
    setEditingPlan(null);
    setConfirmDelete("");
    setView("list");
  }

  async function updatePlan(form: HTMLFormElement) {
    if (!editingPlan) return;
    const fd = new FormData(form);
    setBusy("edit");
    setToast(null);
    try {
      await apiFetch(
        `/patient-subscriptions/plans/${editingPlan.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: fd.get("name"),
            code: fd.get("code") || null,
            price_amount: Number(fd.get("priceAmount") || 0),
            duration_days: Number(fd.get("durationDays") || 0),
            activation_after_days: Number(fd.get("activationAfterDays") || 0),
            free_consultations: Number(fd.get("freeConsultations") || 0),
            free_consultation_department_ids: editFreeConsultDeptIds,
            lab_discount_percentage: Number(fd.get("labDiscount") || 0),
            pharmacy_discount_percentage: Number(
              fd.get("pharmacyDiscount") || 0,
            ),
            min_discount_amount: Number(fd.get("minDiscountAmount") || 0),
            pharmacy_discount_slabs: parsePharmacySlabs(fd),
            free_lab_test_ids: editFreeLabIds,
            free_lab_test_quantities: mapQuantitiesToIds(
              editFreeLabIds,
              editFreeLabIds,
              editFreeLabQuantities,
            ),
            discounted_lab_test_ids: editDiscountedLabIds,
            free_medicine_ids: editFreeMedIds,
            free_medicine_quantities: mapQuantitiesToIds(
              editFreeMedIds,
              editFreeMedIds,
              editFreeMedQuantities,
            ),
            discounted_medicine_ids: editDiscountedMedIds,
            updated_by_user_id: apiSession.user?.id,
          }),
        },
      );
      setEditingPlan(null);
      setView("list");
      await load();
      setToast({ text: "Plan updated successfully.", kind: "success" });
    } catch (err: any) {
      setToast({
        text: err.message || "Could not update plan.",
        kind: "error",
      });
    } finally {
      setBusy("");
    }
  }

  async function togglePlanActive(plan: any) {
    setBusy(`toggle-${plan.id}`);
    setToast(null);
    try {
      await apiFetch(`/patient-subscriptions/plans/${plan.id}`, apiSession, {
        method: "PATCH",
        body: JSON.stringify({
          is_active: !plan.is_active,
          updated_by_user_id: apiSession.user?.id,
        }),
      });
      await load();
      setToast({
        text: `Plan ${plan.is_active ? "paused" : "activated"}.`,
        kind: "success",
      });
    } catch (err: any) {
      setToast({
        text: err.message || "Could not update plan status.",
        kind: "error",
      });
    } finally {
      setBusy("");
    }
  }

  async function deletePlan(planId: string) {
    setBusy(`delete-${planId}`);
    setToast(null);
    try {
      await apiFetch(`/patient-subscriptions/plans/${planId}`, apiSession, {
        method: "DELETE",
      });
      setConfirmDelete("");
      setDetailPlanId((current) => (current === planId ? "" : current));
      await load();
      setToast({ text: "Plan deactivated.", kind: "success" });
    } catch (err: any) {
      const message = String(err.message || "");
      setToast({
        text: message || "Could not deactivate plan.",
        kind: "error",
      });
      setConfirmDelete("");
    } finally {
      setBusy("");
    }
  }

  async function updateEnrollment(row: any, updates: any) {
    if (!canDeletePlans) {
      setToast({ kind: "warn", text: "Tenant admin access required." });
      return;
    }
    setBusy(`enrollment-${row.id}`);
    setToast(null);
    try {
      await apiFetch(
        `/patient-subscriptions/enrollments/${row.id}`,
        apiSession,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...updates,
            updated_by_user_id: apiSession.user?.id,
          }),
        },
      );
      await load();
      setToast({ kind: "success", text: "Enrollment updated." });
    } catch (err: any) {
      setToast({
        kind: "error",
        text: err.message || "Could not update enrollment.",
      });
    } finally {
      setBusy("");
    }
  }
  function requestCancelEnrollment(row: any) {
    setConfirm(row);
  }
  function cancelEnrollment(row: any) {
    const patientName =
      patientMap.get(row.patient_id)?.name ||
      patientMap.get(row.patient_id)?.full_name ||
      "this patient";
    const planName = row.plan?.name || "membership plan";
    // if (!window.confirm(`Cancel ${planName} enrollment for ${patientName}?`)) {
    //   return;
    // }
    updateEnrollment(row, {
      status: "cancelled",
      ends_on: new Date().toISOString().slice(0, 10),
    });
    setConfirm(false)
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
  const userPermissions = apiSession.user?.permissions || [];
  const hasPermission = (...keys: string[]) =>
    Boolean(
      apiSession.user?.is_super_admin ||
      userPermissions.includes("*") ||
      keys.some((key) => userPermissions.includes(key)),
    );
  const canDeletePlans =
    canDeleteMembershipPlans(apiSession.user) ||
    hasPermission(
      "patient_subscriptions.manage",
      "patient_subscriptions.delete",
      "settings.manage",
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
  const detailPlan = detailPlanId
    ? plans.find((plan: any) => plan.id === detailPlanId)
    : null;
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
          onBack={() => {
            setDetailPlanId("");
            setView("list");
          }}
          onEdit={() => startEdit(detailPlan)}
          onToggle={() => togglePlanActive(detailPlan)}
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
          back={() => setView("list")}
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
                  <SearchableSelect
                    required
                    value={selectedPatient}
                    onChange={(value: string) => setSelectedPatient(value)}
                    placeholder="Select patient"
                    searchPlaceholder="Search patient by name"
                    options={(patients || []).map((p: any) => ({
                      value: p.id,
                      label: p.name || p.full_name || p.id,
                    }))}
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
                    {busy === "enroll" ? "Enrolling..." : "Enroll"}
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
                    onClick={() => setView("create")}
                    className="save-button text-xs"
                  >
                    Create Plan
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              {plans.length === 0 && (
                <p className="p-4 text-sm text-slate-500">
                  No patient plans yet.
                </p>
              )}
              {plans.length > 0 && (
                <div>
                  <div className="min-w-full overflow-x-auto lg:block">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        <tr>
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
                              openDetail={() => {
                                setDetailPlanId(plan.id);
                                setView("detail");
                              }}
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
          onConfirm={() => cancelEnrollment(confirm)}
        />
      )}
    </div>
  );
}
