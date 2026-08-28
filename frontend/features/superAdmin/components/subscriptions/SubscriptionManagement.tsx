"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Input, StatusToast } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import {
  catalogSubscriptionPlans,
  entitlementModules,
  moduleKeysWithDependencies,
} from "../../helpers";
import { useSubscriptionConsole } from "../../api/useSubscriptionConsole";
import { CreateActionButton } from "../shared/CreateActionButton";
import { PlanDetailModal } from "./PlanDetailModal";
import { SubscriptionAssignPlan } from "./SubscriptionAssignPlan";
import { SubscriptionCreatePlan } from "./SubscriptionCreatePlan";
import { SubscriptionCreditsPage } from "./SubscriptionCreditsPage";
import { SubscriptionDetailModal } from "./SubscriptionDetailModal";
import { SubscriptionEditPlan } from "./SubscriptionEditPlan";
import { SettingsWorkspaceHeader } from "../shared/SettingsWorkspaceHeader";
import { Info } from "@/app/components/common/Info";
import { Pagination } from "@/app/components/common/Pagination";
import {
  FilterSection,
  FilterConfig,
} from "@/app/components/common/FilterSection";
import { DataTable } from "@/app/components/common/DataTable";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { getPlanColumns, getSubscriptionColumns } from "./Column";
import { subscriptin_status_options } from "../../constants";
import { CreditCard, Receipt } from "lucide-react";



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
  const [activeTab, setActiveTab] = useState<"subscriptions" | "plans">(
    "subscriptions",
  );
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
  const [planStatusConfirm, setPlanStatusConfirm] = useState<any>(null);
  const {
    usage,
    announcements,
    subscriptions,
    credits,
    invoices,
    revenue,
    loading,
    message,
    setMessage,
    createPlan: createPlanRequest,
    updatePlan: updatePlanRequest,
    changePlanStatus,
    assignSubscription: assignSubscriptionRequest,
    addCredits: addCreditsRequest,
  } = useSubscriptionConsole(apiSession, tenants, selectedId, reloadPlans);
  const catalogPlans = catalogSubscriptionPlans(plans);
  const activePlans = catalogPlans.filter((plan: any) => plan.is_active);
  const selectedTenant = tenants.find(
    (tenant: any) => tenant.id === selectedId,
  );
  const planById = new Map<string, any>(
    plans.map((plan: any) => [plan.id, plan]),
  );
  const tenantById = new Map<string, any>(
    tenants.map((tenant: any) => [tenant.id, tenant]),
  );
  const editableModules = entitlementModules(modules);
  const pageSize = 8;

  const filterConfigs: FilterConfig[] = [
    {
      key: "plan",
      label: "Plan",
      options: [
        { value: "all", label: "All plans" },
        ...catalogPlans.map((plan: any) => ({
          value: plan.id,
          label: plan.name,
        })),
      ],
    },
    {
      key: "status",
      label: "Status",
      options: subscriptin_status_options,
    },
  ];

  function updateFilter(key: string, value: string) {
    setFilters({ ...filters, [key]: value });
  }
  function resetFilters() {
    setFilters({
      tenant: "",
      plan: "all",
      status: "all",
      fromDate: "",
      toDate: "",
    });
  }

  function openSubscriptionView(nextView: string) {
    setView(nextView);
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  useEffect(() => {
    setPage(1);
  }, [filters, subscriptions.length]);

  async function createPlan(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const created = await createPlanRequest({
      key: String(fd.get("key") || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_"),
      name: fd.get("name"),
      monthly_patient_limit: Number(fd.get("monthlyPatientLimit") || 0),
      monthly_whatsapp_message_limit: Number(
        fd.get("monthlyWhatsAppMessageLimit") || 0,
      ),
      included_branches: Number(fd.get("includedBranches") || 1),
      included_doctors: Number(fd.get("includedDoctors") || 1),
      price_inr_monthly: Number(fd.get("priceInrMonthly") || 0),
      enabled_modules: moduleKeysWithDependencies(
        fd.getAll("enabledModules").map(String),
        modules,
      ),
    });
    if (created) {
      form.reset();
      openSubscriptionView("list");
    }
  }

  async function updatePlan(e: any) {
    e.preventDefault();
    if (!editingPlan) return;
    const fd = new FormData(e.currentTarget);
    const updated = await updatePlanRequest(editingPlan.id, {
      name: fd.get("name"),
      monthly_patient_limit: Number(fd.get("monthlyPatientLimit") || 0),
      monthly_whatsapp_message_limit: Number(
        fd.get("monthlyWhatsAppMessageLimit") || 0,
      ),
      included_branches: Number(fd.get("includedBranches") || 0),
      included_doctors: Number(fd.get("includedDoctors") || 0),
      price_inr_monthly: Number(fd.get("priceInrMonthly") || 0),
      enabled_modules: moduleKeysWithDependencies(
        fd.getAll("enabledModules").map(String),
        modules,
      ),
    });
    if (updated) {
      setEditingPlan(null);
      openSubscriptionView("list");
    }
  }

  async function assignSubscription(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const billingAmount = String(fd.get("billingAmount") || "").trim();
    const payload: any = {
      plan_id: fd.get("planId"),
      starts_on: fd.get("startsOn"),
      ends_on: fd.get("endsOn") || null,
      notes: fd.get("notes") || null,
    };
    if (billingAmount) payload.billing_amount = Number(billingAmount);
    const assigned = await assignSubscriptionRequest(payload);
    if (assigned) {
      form.reset();
      openSubscriptionView("list");
    }
  }

  async function addCredits(e: any) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const added = await addCreditsRequest({
      credit_type: fd.get("creditType") || "patients",
      quantity: Number(fd.get("quantity") || 0),
      amount: Number(fd.get("amount") || 0),
      starts_on: fd.get("startsOn") || new Date().toISOString().slice(0, 10),
      expires_on: fd.get("expiresOn") || null,
      reason: fd.get("reason") || null,
    });
    if (added) {
      form.reset();
      openSubscriptionView("list");
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

  const subscriptionColumns = getSubscriptionColumns({
    tenantById,
    planById,
    setDetailSubscription,
    setSelectedId,
    openSubscriptionView,
  });

  const planColumns = getPlanColumns({
    setDetailPlan,
    setEditingPlan,
    openSubscriptionView,
    setPlanStatusConfirm,
  });

  return (
    <div className="space-y-3">
      <SettingsWorkspaceHeader<"subscriptions" | "plans">
        icon={CreditCard}
        title="Subscription Workspace"
        description="Manage tenant subscriptions, plan catalog, upgrades, and credits."
        tabs={[
          {
            id: "subscriptions",
            label: "Subscriptions",
            icon: CreditCard,
            count: subscriptions.length,
          },
          {
            id: "plans",
            label: "Plan Catalog",
            icon: Receipt,
            count: catalogPlans.length,
          },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CreateActionButton
              label="Create Custom Plan"
              onClick={() => openSubscriptionView("createPlan")}
            />
            <button
              type="button"
              onClick={() => openSubscriptionView("assign")}
              className="close-button"
            >
              Assign / Upgrade
            </button>
            <button
              type="button"
              onClick={() => openSubscriptionView("credits")}
              className="close-button"
            >
              Additional Credits
            </button>
          </div>
        }
      />
      <StatusToast message={message} onClose={() => setMessage("")} />
      {announcements.length > 0 && (
        <div className="overflow-hidden rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-800">
          <div className="animate-pulse whitespace-nowrap">
            {announcements.map((item) => item.message).join("  |  ")}
          </div>
        </div>
      )}
      {activeTab === "subscriptions" && <div className="grid gap-4 md:grid-cols-4">
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
      </div>}
      {activeTab === "subscriptions" && <div>
        <Card className="pt-2">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <h4 className="card-title font-bold">Subscriptions</h4>
              <p className="card-desc text-slate-500">
                Compact tenant subscription list. Open details for IDs, notes,
                and module information.
              </p>
            </div>
            <Badge tone="blue" className="normal-label">
              {filtered.length} records
            </Badge>
          </div>
          <FilterSection
            title="Tenant / Plan"
            query={filters.tenant}
            setQuery={(value) => updateFilter("tenant", value)}
            searchPlaceholder="Search tenant or plan"
            filters={filterConfigs}
            filterValues={filters}
            onFilterChange={updateFilter}
            onReset={resetFilters}
            className="lg:grid-cols-4 xl:grid-cols-6"
          >
            <FormField label="From">
              <Input
                type="date"
                value={filters.fromDate}
                onChange={(e: any) => updateFilter("fromDate", e.target.value)}
              />
            </FormField>
            <FormField label="To">
              <Input
                type="date"
                value={filters.toDate}
                onChange={(e: any) => updateFilter("toDate", e.target.value)}
              />
            </FormField>
          </FilterSection>
          <div className="mt-4 rounded-lg border border-slate-200">
            <DataTable
              columns={subscriptionColumns}
              data={rows}
              emptyMessage={
                loading
                  ? "Loading subscriptions..."
                  : "No subscriptions match your search."
              }
              emptyDescription="Tenant subscriptions assigned from plans will show up here."
              emptyIcon={CreditCard}
              minBodyHeight={`${rows.length > 0 ?'':'220px'}`}
            />
          </div>
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={filtered.length}
            pageSize={pageSize}
            onPage={setPage}
          />
        </Card>
      </div>}
      {activeTab === "plans" && <div>
        <Card className="pt-2">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <h4 className="card-title font-bold">Plan Catalog</h4>
              <p className="card-desc text-slate-500">
                Reusable DB-backed SaaS plan catalog. Module lists and IDs live
                in details.
              </p>
            </div>
            <Badge
              tone="blue"
              className="normal-label"
            >
              {catalogPlans.length} plans
            </Badge>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <div className="min-w-[900px]">
              <DataTable
                columns={planColumns}
                data={catalogPlans}
                emptyMessage="No subscription plans found."
                emptyDescription="Subscription plans created for the catalog will show up here."
                emptyIcon={Receipt}
                minBodyHeight={`${catalogPlans.length > 0 ?'':'220px'}`}
              />
            </div>
          </div>
        </Card>
      </div>}
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
      {planStatusConfirm && (
        <ConfirmModal
          busy={loading}
          title={
            planStatusConfirm.is_active ? "Deactivate Plan" : "Activate Plan"
          }
          message={`${
            planStatusConfirm.is_active ? "Deactivate" : "Activate"
          } ${planStatusConfirm.name}?`}
          confirmLabel={
            planStatusConfirm.is_active ? "Yes, Deactivate" : "Yes, Activate"
          }
          onCancel={() => setPlanStatusConfirm(null)}
          onConfirm={async () => {
            await changePlanStatus(planStatusConfirm);
            setPlanStatusConfirm(null);
          }}
        />
      )}
    </div>
  );
}
