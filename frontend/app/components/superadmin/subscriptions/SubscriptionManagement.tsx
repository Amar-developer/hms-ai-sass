"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Card,
  Input,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { apiFetch } from "@/lib/api";
import {
  catalogSubscriptionPlans,
  entitlementModules,
  formatDate,
  formatTenantType,
  limitLabel,
  moduleKeysWithDependencies,
} from "@/utils/superAdmin/superAdmin";
import { CreateActionButton } from "../shared/CreateActionButton";
import { Info } from "../shared/Info";
import {Empty} from "@/app/components/admin/Empty";
import { Pagination } from "@/app/components/admin/Pagination";
import { PlanDetailModal } from "./PlanDetailModal";
import { SubscriptionAssignPlan } from "./SubscriptionAssignPlan";
import { SubscriptionCreatePlan } from "./SubscriptionCreatePlan";
import { SubscriptionCreditsPage } from "./SubscriptionCreditsPage";
import { SubscriptionDetailModal } from "./SubscriptionDetailModal";
import { SubscriptionEditPlan } from "./SubscriptionEditPlan";

export function SubscriptionManagement({
  apiSession,
  plans,
  tenants,
  selectedId,
  setSelectedId,
  reloadPlans,
  modules = [],
}: any) {
  const [view, setView] = useState("list");
  const [filters, setFilters] = useState({
    tenant: "",
    plan: "all",
    status: "all",
    fromDate: "",
    toDate: "",
  });
  const [page, setPage] = useState(1);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [detailSubscription, setDetailSubscription] = useState<any>(null);
  const [detailPlan, setDetailPlan] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const catalogPlans = catalogSubscriptionPlans(plans);
  const activePlans = catalogPlans.filter((plan: any) => plan.is_active);
  const selectedTenant = tenants.find(
    (tenant: any) => tenant.id === selectedId,
  );
  const planById = new Map(plans.map((plan: any) => [plan.id, plan]));
  const tenantById = new Map(tenants.map((tenant: any) => [tenant.id, tenant]));
  const editableModules = entitlementModules(modules);
  const pageSize = 8;

  function notifyEntitlementsChanged() {
    try {
      localStorage.setItem(
        "medizinhub.entitlements.refresh",
        String(Date.now()),
      );
      window.dispatchEvent(new Event("medizinhub.entitlements.refresh"));
    } catch {}
  }

  function openSubscriptionView(nextView: string) {
    setView(nextView);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  async function loadSubscriptionConsole() {
    if (!apiSession) return;
    setLoading(true);
    setMessage("");
    try {
      const scoped = {
        ...apiSession,
        tenantId: selectedId || apiSession.tenantId,
      };
      const subscriptionCalls = tenants.map((tenant: any) =>
        apiFetch("/subscription-plans/tenant-subscriptions", {
          ...apiSession,
          tenantId: tenant.id,
        })
          .then((rows: any[]) =>
            rows.map((row) => ({ ...row, tenant_name: tenant.name })),
          )
          .catch(() => []),
      );
      const calls: any[] = [
        apiFetch("/subscription-plans/platform/revenue-summary", apiSession),
        Promise.all(subscriptionCalls),
      ];
      if (selectedId) {
        calls.push(apiFetch("/subscription-plans/usage", scoped));
        calls.push(apiFetch("/subscription-plans/announcements", scoped));
        calls.push(apiFetch("/subscription-plans/credits", scoped));
        calls.push(apiFetch("/subscription-plans/invoices", scoped));
      }
      const [
        revenueRows,
        allSubscriptionRows = [],
        usageRows = [],
        announcementRows = [],
        creditRows = [],
        invoiceRows = [],
      ] = await Promise.all(calls);
      setRevenue(revenueRows);
      setUsage(selectedId ? usageRows : null);
      setAnnouncements(selectedId ? announcementRows : []);
      setSubscriptions(
        allSubscriptionRows
          .flat()
          .sort(
            (a: any, b: any) =>
              new Date(b.created_at || b.starts_on).getTime() -
              new Date(a.created_at || a.starts_on).getTime(),
          ),
      );
      setCredits(selectedId ? creditRows : []);
      setInvoices(selectedId ? invoiceRows : []);
    } catch (err: any) {
      setMessage(err.message || "Could not load subscription details.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubscriptionConsole();
  }, [apiSession?.token, apiSession?.tenantId, selectedId, tenants.length]);
  useEffect(() => {
    setPage(1);
  }, [filters, subscriptions.length]);

  async function createPlan(e: any) {
    e.preventDefault();
    if (!apiSession) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setLoading(true);
    setMessage("");
    try {
      await apiFetch("/subscription-plans", apiSession, {
        method: "POST",
        body: JSON.stringify({
          key: String(fd.get("key") || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_"),
          name: fd.get("name"),
          monthly_patient_limit: Number(fd.get("monthlyPatientLimit") || 0),
          included_branches: Number(fd.get("includedBranches") || 1),
          included_doctors: Number(fd.get("includedDoctors") || 1),
          price_inr_monthly: Number(fd.get("priceInrMonthly") || 0),
          enabled_modules: moduleKeysWithDependencies(
            fd.getAll("enabledModules").map(String),
            modules,
          ),
        }),
      });
      form.reset();
      await reloadPlans();
      await loadSubscriptionConsole();
      notifyEntitlementsChanged();
      openSubscriptionView("list");
      setMessage("Custom subscription plan created.");
    } catch (err: any) {
      setMessage(err.message || "Could not create plan.");
    } finally {
      setLoading(false);
    }
  }

  async function updatePlan(e: any) {
    e.preventDefault();
    if (!apiSession || !editingPlan) return;
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setMessage("");
    try {
      await apiFetch(`/subscription-plans/${editingPlan.id}`, apiSession, {
        method: "PATCH",
        body: JSON.stringify({
          name: fd.get("name"),
          monthly_patient_limit: Number(fd.get("monthlyPatientLimit") || 0),
          included_branches: Number(fd.get("includedBranches") || 0),
          included_doctors: Number(fd.get("includedDoctors") || 0),
          price_inr_monthly: Number(fd.get("priceInrMonthly") || 0),
          enabled_modules: moduleKeysWithDependencies(
            fd.getAll("enabledModules").map(String),
            modules,
          ),
        }),
      });
      setEditingPlan(null);
      await reloadPlans();
      await loadSubscriptionConsole();
      notifyEntitlementsChanged();
      openSubscriptionView("list");
      setMessage(
        "Subscription plan updated. Active tenant entitlements using this plan now use the new modules.",
      );
    } catch (err: any) {
      setMessage(err.message || "Could not update plan.");
    } finally {
      setLoading(false);
    }
  }

  async function changePlanStatus(plan: any) {
    if (!apiSession) return;
    setLoading(true);
    setMessage("");
    try {
      await apiFetch(`/subscription-plans/${plan.id}/status`, apiSession, {
        method: "POST",
        body: JSON.stringify({ is_active: !plan.is_active }),
      });
      await reloadPlans();
      await loadSubscriptionConsole();
      notifyEntitlementsChanged();
      setMessage(
        `${plan.name} ${plan.is_active ? "deactivated" : "activated"}.`,
      );
    } catch (err: any) {
      setMessage(err.message || "Could not change plan status.");
    } finally {
      setLoading(false);
    }
  }

  async function assignSubscription(e: any) {
    e.preventDefault();
    if (!apiSession || !selectedId) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setLoading(true);
    setMessage("");
    try {
      const scoped = { ...apiSession, tenantId: selectedId };
      const billingAmount = String(fd.get("billingAmount") || "").trim();
      const payload: any = {
        plan_id: fd.get("planId"),
        starts_on: fd.get("startsOn"),
        ends_on: fd.get("endsOn") || null,
        notes: fd.get("notes") || null,
      };
      if (billingAmount) payload.billing_amount = Number(billingAmount);
      await apiFetch("/subscription-plans/tenant-subscriptions", scoped, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
      await loadSubscriptionConsole();
      notifyEntitlementsChanged();
      openSubscriptionView("list");
      setMessage(
        "Tenant subscription assigned. Future start dates stay scheduled until activation date.",
      );
    } catch (err: any) {
      setMessage(err.message || "Could not assign subscription.");
    } finally {
      setLoading(false);
    }
  }

  async function addCredits(e: any) {
    e.preventDefault();
    if (!apiSession || !selectedId) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setLoading(true);
    setMessage("");
    try {
      const scoped = { ...apiSession, tenantId: selectedId };
      await apiFetch("/subscription-plans/credits", scoped, {
        method: "POST",
        body: JSON.stringify({
          credit_type: fd.get("creditType") || "patients",
          quantity: Number(fd.get("quantity") || 0),
          amount: Number(fd.get("amount") || 0),
          starts_on:
            fd.get("startsOn") || new Date().toISOString().slice(0, 10),
          expires_on: fd.get("expiresOn") || null,
          reason: fd.get("reason") || null,
        }),
      });
      form.reset();
      await loadSubscriptionConsole();
      openSubscriptionView("list");
      setMessage("Additional credits added and invoice generated.");
    } catch (err: any) {
      setMessage(err.message || "Could not add credits.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = subscriptions.filter((subscription: any) => {
    const tenant = tenantById.get(subscription.tenant_id) as any;
    const plan = planById.get(subscription.plan_id) as any;
    const tenantText = [
      subscription.tenant_name,
      tenant?.name,
      subscription.tenant_id,
    ]
      .join(" ")
      .toLowerCase();
    const planMatch =
      filters.plan === "all" || subscription.plan_id === filters.plan;
    const statusMatch =
      filters.status === "all" || subscription.status === filters.status;
    const dateValue =
      subscription.updated_at ||
      subscription.created_at ||
      subscription.starts_on;
    const timestamp = dateValue ? new Date(dateValue).getTime() : 0;
    const from = filters.fromDate ? new Date(filters.fromDate).getTime() : 0;
    const to = filters.toDate
      ? new Date(`${filters.toDate}T23:59:59`).getTime()
      : Number.MAX_SAFE_INTEGER;
    return (
      (!filters.tenant ||
        tenantText.includes(filters.tenant.toLowerCase()) ||
        String(plan?.name || "")
          .toLowerCase()
          .includes(filters.tenant.toLowerCase())) &&
      planMatch &&
      statusMatch &&
      (!filters.fromDate || timestamp >= from) &&
      (!filters.toDate || timestamp <= to)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (view === "createPlan")
    return (
      <SubscriptionCreatePlan
        loading={loading}
        createPlan={createPlan}
        back={() => openSubscriptionView("list")}
        modules={editableModules}
      />
    );
  if (view === "editPlan" && editingPlan)
    return (
      <SubscriptionEditPlan
        loading={loading}
        plan={editingPlan}
        updatePlan={updatePlan}
        back={() => {
          setEditingPlan(null);
          openSubscriptionView("list");
        }}
        modules={editableModules}
      />
    );
  if (view === "assign")
    return (
      <SubscriptionAssignPlan
        loading={loading}
        tenants={tenants}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        plans={activePlans}
        selectedTenant={selectedTenant}
        assignSubscription={assignSubscription}
        back={() => openSubscriptionView("list")}
      />
    );
  if (view === "credits")
    return (
      <SubscriptionCreditsPage
        loading={loading}
        tenants={tenants}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        usage={usage}
        credits={credits}
        invoices={invoices}
        addCredits={addCredits}
        back={() => openSubscriptionView("list")}
      />
    );

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h3 className="text-base lg:text-lg font-bold">
              Subscription Management
            </h3>
            <p className="text-xs lg:text-sm text-slate-500">
              Search tenant subscriptions, review SaaS revenue, and open focused
              pages for plan setup, upgrades, and credits.
            </p>
          </div>
          <div className="flex flex-wrap justify-start lg:justify-around items-center  gap-2 w-[38%] lg:w-[30%]">
            <CreateActionButton
              label="Create Custom Plan"
              onClick={() => openSubscriptionView("createPlan")}
            />
            <div className="flex justify-between lg:justify-around w-full">
              <button
                type="button"
                onClick={() => openSubscriptionView("assign")}
                className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
              >
                Assign / Upgrade
              </button>
              <button
                type="button"
                onClick={() => openSubscriptionView("credits")}
                className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
              >
                Additional Credits
              </button>
            </div>
          </div>
        </div>
        <StatusToast message={message} onClose={() => setMessage("")} />
        {announcements.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
            <div className="animate-pulse whitespace-nowrap">
              {announcements.map((item) => item.message).join("  |  ")}
            </div>
          </div>
        )}
      </Card>
      <div className="grid gap-4 md:grid-cols-4">
        <Info
          label="Active Subscriptions"
          value={revenue?.total_active_subscriptions ?? "-"}
        />
        <Info
          label="Scheduled"
          value={revenue?.scheduled_subscriptions ?? "-"}
        />
        <Info
          label="Estimated MRR"
          value={`₹${revenue?.estimated_monthly_recurring_revenue ?? 0}`}
        />
        <Info
          label="Pending Invoice"
          value={`₹${revenue?.pending_invoice_amount ?? 0}`}
        />
      </div>
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h4 className="text-base lg:text-lg font-bold">Subscriptions</h4>
            <p className=" text-xs lg:text-sm text-slate-500">
              Compact tenant subscription list. Open details for IDs, notes, and
              module information.
            </p>
          </div>
          <Badge tone="blue" className="px-2 py-2 rounded-lg md:w-[15%] lg:w-[10%] text-center">
            {filtered.length} records
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <FormField label="Tenant / Plan">
            <Input
              value={filters.tenant}
              onChange={(e: any) =>
                setFilters({ ...filters, tenant: e.target.value })
              }
              placeholder="Search tenant or plan"
            />
          </FormField>
          <FormField label="Plan">
            <Select
              value={filters.plan}
              onChange={(e: any) =>
                setFilters({ ...filters, plan: e.target.value })
              }
            >
              <option value="all">All plans</option>
              {catalogPlans.map((plan: any) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Status">
            <Select
              value={filters.status}
              onChange={(e: any) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </FormField>
          <FormField label="From">
            <Input
              type="date"
              value={filters.fromDate}
              onChange={(e: any) =>
                setFilters({ ...filters, fromDate: e.target.value })
              }
            />
          </FormField>
          <FormField label="To">
            <Input
              type="date"
              value={filters.toDate}
              onChange={(e: any) =>
                setFilters({ ...filters, toDate: e.target.value })
              }
            />
          </FormField>
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[1fr_1fr_.6fr_.52fr_.52fr_.52fr_1.5fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500">
              <span>Tenant</span>
              <span>Plan</span>
              <span>Status</span>
              <span>Start</span>
              <span>End</span>
              <span>Amount</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-slate-200">
              {rows.length === 0 && (
                <Empty
                  text={
                    loading
                      ? "Loading subscriptions..."
                      : "No subscriptions match your search."
                  }
                />
              )}
              {rows.map((subscription: any) => {
                const plan = planById.get(subscription.plan_id) as any;
                const tenant = tenantById.get(subscription.tenant_id) as any;
                return (
                  <div
                    key={subscription.id}
                    className="grid grid-cols-[.8fr_.8fr_.5fr_.52fr_.52fr_.42fr_1.15fr] gap-3 px-4 py-4 text-sm items-center"
                  >
                    <div className="min-w-0">
                      <b className=" text-xs lg:text-sm block truncate">
                        {subscription.tenant_name || tenant?.name || "Tenant"}
                      </b>
                      <span className="text-[10px] lg:text-xs text-slate-500">
                        {formatTenantType(tenant?.tenant_type || "")}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <b className="text-xs lg:text-sm block truncate">
                        {plan?.name || "Custom plan"}
                      </b>
                      <span className="text-[10px] lg:text-xs text-slate-500">
                        {plan?.key?.startsWith("tenant_")
                          ? "Tenant custom"
                          : plan?.key || "Plan"}
                      </span>
                    </div>
                    <div>
                      <Badge
                        tone={
                          subscription.status === "active"
                            ? "green"
                            : subscription.status === "scheduled"
                              ? "amber"
                              : subscription.status === "expired"
                                ? "slate"
                                : "red"
                        }
                        className="rounded-full px-1 py-1 text-xs lg:text-sm"
                      >
                        {subscription.status}
                      </Badge>
                    </div>
                    <span className="text-xs lg:text-sm">
                      {formatDate(subscription.starts_on)}
                    </span>
                    <span className="text-xs lg:text-sm">
                      {formatDate(subscription.ends_on)}
                    </span>
                    <b className="text-xs lg:text-sm">
                      ₹{subscription.billing_amount}
                    </b>
                    <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          setDetailSubscription({
                            ...subscription,
                            plan,
                            tenant,
                          })
                        }
                        className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(subscription.tenant_id);
                          openSubscriptionView("assign");
                        }}
                        className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
                      >
                        Upgrade
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(subscription.tenant_id);
                          openSubscriptionView("credits");
                        }}
                        className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
                      >
                        Credits
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={pageSize}
          onPage={setPage}
        />
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h4 className="text-base lg:text-lg font-bold">Plan Catalog</h4>
            <p className="text-xs lg:text-sm text-slate-500">
              Reusable DB-backed SaaS plan catalog. Module lists and IDs live in
              details.
            </p>
          </div>
          <Badge tone="blue" className="px-2 py-2 rounded-lg md:w-[15%] lg:w-[10%] text-center">{catalogPlans.length} plans</Badge>
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[1.35fr_.75fr_1fr_.75fr_.75fr_1.2fr] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase text-slate-500">
              <span>Plan</span>
              <span>Price</span>
              <span>Limits</span>
              <span>Modules</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-slate-200">
              {catalogPlans.map((plan: any) => (
                <div
                  key={plan.id}
                  className="grid grid-cols-[1.35fr_.75fr_1fr_.75fr_.75fr_1.2fr] gap-3 px-4 py-4 text-sm items-center"
                >
                  <div className="min-w-0">
                    <b className="text-xs lg:text-sm block truncate">
                      {plan.name}
                    </b>
                    <span className="text-[10px] text-xs text-slate-500">
                      {plan.key}
                    </span>
                  </div>
                  <b>₹{plan.price_inr_monthly}</b>
                  <span className="text-slate-600 text-xs lg:text-sm">
                    {limitLabel(plan.monthly_patient_limit)} patients ·{" "}
                    {limitLabel(plan.included_branches)} branches
                  </span>
                  <Badge tone="slate" className="rounded-full text-xs lg:text-sm py-1 px-1">
                    {(plan.enabled_modules || []).length}
                  </Badge>
                  <Badge tone={plan.is_active ? "green" : "slate"} className="rounded-full text-xs lg:text-sm py-1 px-1">
                    {plan.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setDetailPlan(plan)}
                      className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPlan(plan);
                        openSubscriptionView("editPlan");
                      }}
                      className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => changePlanStatus(plan)}
                      className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm border font-bold"
                    >
                      {plan.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
      {detailSubscription && (
        <SubscriptionDetailModal
          subscription={detailSubscription}
          onClose={() => setDetailSubscription(null)}
          onUpgrade={() => {
            setSelectedId(detailSubscription.tenant_id);
            setDetailSubscription(null);
            openSubscriptionView("assign");
          }}
          onCredits={() => {
            setSelectedId(detailSubscription.tenant_id);
            setDetailSubscription(null);
            openSubscriptionView("credits");
          }}
        />
      )}
      {detailPlan && (
        <PlanDetailModal
          plan={detailPlan}
          onClose={() => setDetailPlan(null)}
          onEdit={() => {
            setEditingPlan(detailPlan);
            setDetailPlan(null);
            openSubscriptionView("editPlan");
          }}
        />
      )}
    </div>
  );
}
