"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { mapWithConcurrency } from "@/lib/concurrency";

function notifyEntitlementsChanged() {
  try {
    localStorage.setItem(
      "medizinhub.entitlements.refresh",
      String(Date.now()),
    );
    window.dispatchEvent(new Event("medizinhub.entitlements.refresh"));
  } catch {}
}

export function useSubscriptionConsole(
  apiSession: any,
  tenants: any[],
  selectedId: string,
  reloadPlans: () => Promise<any> | void,
) {
  const [usage, setUsage] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadSubscriptionConsole() {
    if (!apiSession) return;
    setLoading(true);
    setMessage("");
    try {
      const scoped = {
        ...apiSession,
        tenantId: selectedId || apiSession.tenantId,
      };
      const subscriptionCalls = mapWithConcurrency(
        tenants,
        (tenant: any) =>
          apiFetch("/subscription-plans/tenant-subscriptions", {
            ...apiSession,
            tenantId: tenant.id,
          })
            .then((rows: any[]) =>
              rows.map((row) => ({ ...row, tenant_name: tenant.name })),
            )
            .catch(() => []),
        4,
      );
      const calls: any[] = [
        apiFetch("/subscription-plans/platform/revenue-summary", apiSession),
        subscriptionCalls,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.tenantId, selectedId, tenants.length]);

  async function createPlan(payload: any) {
    if (!apiSession) return false;
    setLoading(true);
    setMessage("");
    try {
      await apiFetch("/subscription-plans", apiSession, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await reloadPlans();
      await loadSubscriptionConsole();
      notifyEntitlementsChanged();
      setMessage("Custom subscription plan created.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not create plan.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function updatePlan(planId: string, payload: any) {
    if (!apiSession) return false;
    setLoading(true);
    setMessage("");
    try {
      await apiFetch(`/subscription-plans/${planId}`, apiSession, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await reloadPlans();
      await loadSubscriptionConsole();
      notifyEntitlementsChanged();
      setMessage(
        "Subscription plan updated. Active tenant entitlements using this plan now use the new modules.",
      );
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not update plan.");
      return false;
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

  async function assignSubscription(payload: any) {
    if (!apiSession || !selectedId) return false;
    setLoading(true);
    setMessage("");
    try {
      const scoped = { ...apiSession, tenantId: selectedId };
      await apiFetch("/subscription-plans/tenant-subscriptions", scoped, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadSubscriptionConsole();
      notifyEntitlementsChanged();
      setMessage(
        "Tenant subscription assigned. Future start dates stay scheduled until activation date.",
      );
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not assign subscription.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function addCredits(payload: any) {
    if (!apiSession || !selectedId) return false;
    setLoading(true);
    setMessage("");
    try {
      const scoped = { ...apiSession, tenantId: selectedId };
      await apiFetch("/subscription-plans/credits", scoped, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadSubscriptionConsole();
      setMessage("Additional credits added and invoice generated.");
      return true;
    } catch (err: any) {
      setMessage(err.message || "Could not add credits.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  return {
    usage,
    announcements,
    subscriptions,
    credits,
    invoices,
    revenue,
    loading,
    message,
    setMessage,
    loadSubscriptionConsole,
    createPlan,
    updatePlan,
    changePlanStatus,
    assignSubscription,
    addCredits,
  };
}
