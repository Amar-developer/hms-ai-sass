"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  parseBankDetails,
  parseCatalogIntegrations,
  parseNumberingRules,
} from "../constants";
import { entitlementModules } from "../helpers";

export function useTenantBranchSettings(
  apiSession: any,
  selectedId: string,
  tenants: any[],
  selected: any,
  plans: any[],
  modules: any[],
) {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [numberingRules, setNumberingRules] = useState<any>(
    parseNumberingRules(null, "SUN"),
  );
  const [catalogIntegrations, setCatalogIntegrations] = useState<any>(
    parseCatalogIntegrations(null),
  );
  const [bankDetails, setBankDetails] = useState<any>(parseBankDetails(null));
  const [settingsMessage, setSettingsMessage] = useState("");
  const [accountsMessage, setAccountsMessage] = useState("");
  const [pluginMessage, setPluginMessage] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [pluginLoading, setPluginLoading] = useState(false);

  const visibleSelected =
    tenants.find((tenant: any) => tenant.id === selectedId) ||
    (tenants.some((tenant: any) => tenant.id === selected?.id)
      ? selected
      : tenants[0]);
  const planById = new Map((plans || []).map((plan: any) => [plan.id, plan]));
  const activeSubscription =
    subscriptions.find(
      (item: any) => item.status === "active" || item.is_active,
    ) || subscriptions[0];
  const activePlan = activeSubscription
    ? (planById.get(activeSubscription.plan_id) as any)
    : null;
  const editableModules = entitlementModules(modules || []);

  async function loadTenantSubscription() {
    if (!apiSession || !selectedId) {
      setSubscriptions([]);
      setSelectedModules([]);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const rows = await apiFetch("/subscription-plans/tenant-subscriptions", {
        ...apiSession,
        tenantId: selectedId,
      });
      setSubscriptions(rows);
      const current =
        rows.find((item: any) => item.status === "active" || item.is_active) ||
        rows[0];
      const plan = current
        ? (plans || []).find((item: any) => item.id === current.plan_id)
        : null;
      const enabled = plan?.enabled_modules?.length
        ? plan.enabled_modules
        : editableModules
            .filter((module: any) => module.default_enabled)
            .map((module: any) => module.entitlement_key);
      setSelectedModules(enabled);
    } catch (err: any) {
      setSubscriptions([]);
      setSelectedModules(
        editableModules
          .filter((module: any) => module.default_enabled)
          .map((module: any) => module.entitlement_key),
      );
      setMessage(err.message || "Could not load tenant modules.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTenantSettings() {
    if (!apiSession || !selectedId) {
      setSettings([]);
      setNumberingRules(parseNumberingRules(null, "SUN"));
      setCatalogIntegrations(parseCatalogIntegrations(null));
      setBankDetails(parseBankDetails(null));
      return;
    }
    setSettingsLoading(true);
    setSettingsMessage("");
    try {
      const rows = await apiFetch("/settings", {
        ...apiSession,
        tenantId: selectedId,
      });
      setSettings(rows);
      const find = (key: string) =>
        rows.find((setting: any) => setting.key === key);
      setNumberingRules(
        parseNumberingRules(
          find("numbering.rules")?.value,
          find("invoice.prefix")?.value || "SUN",
        ),
      );
      setCatalogIntegrations(
        parseCatalogIntegrations(find("catalog.integrations")?.value),
      );
      const bankRow =
        rows.find(
          (setting: any) =>
            setting.key === "accounts.bank_details" &&
            setting.scope === "tenant",
        ) || find("accounts.bank_details");
      setBankDetails(parseBankDetails(bankRow?.value));
    } catch (err: any) {
      setSettings([]);
      setNumberingRules(parseNumberingRules(null, "SUN"));
      setCatalogIntegrations(parseCatalogIntegrations(null));
      setBankDetails(parseBankDetails(null));
      setSettingsMessage(err.message || "Could not load numbering settings.");
    } finally {
      setSettingsLoading(false);
    }
  }

  useEffect(() => {
    loadTenantSubscription();
    loadTenantSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSession?.tenantId, selectedId, plans?.length, modules?.length]);

  function setNumberRule(key: string, value: any) {
    setNumberingRules({ ...numberingRules, [key]: value });
  }
  function setEntityCode(key: string, value: string) {
    setNumberingRules({
      ...numberingRules,
      entities: {
        ...(numberingRules.entities || {}),
        [key]: value.toUpperCase(),
      },
    });
  }
  function setBankDetail(key: string, value: string) {
    setBankDetails({ ...bankDetails, [key]: value });
  }

  async function saveNumberingSettings(e: any) {
    e.preventDefault();
    if (!apiSession || !visibleSelected) return;
    setSettingsLoading(true);
    setSettingsMessage("");
    try {
      await Promise.all([
        apiFetch(
          "/settings",
          { ...apiSession, tenantId: visibleSelected.id },
          {
            method: "PUT",
            body: JSON.stringify({
              scope: "tenant",
              module: "numbering",
              key: "numbering.rules",
              value: numberingRules,
              actor_user_id: apiSession.user?.id,
            }),
          },
        ),
        apiFetch(
          "/settings",
          { ...apiSession, tenantId: visibleSelected.id },
          {
            method: "PUT",
            body: JSON.stringify({
              scope: "tenant",
              module: "invoice",
              key: "invoice.prefix",
              value: numberingRules.prefix,
              actor_user_id: apiSession.user?.id,
            }),
          },
        ),
      ]);
      await loadTenantSettings();
      setSettingsMessage("Document numbering settings saved.");
    } catch (err: any) {
      setSettingsMessage(err.message || "Could not save numbering settings.");
    } finally {
      setSettingsLoading(false);
    }
  }

  function setCatalogPlugin(key: string, patch: any) {
    setCatalogIntegrations({
      ...catalogIntegrations,
      [key]: { ...(catalogIntegrations[key] || {}), ...patch },
    });
  }

  async function saveCatalogIntegrations(e: any) {
    e.preventDefault();
    if (!apiSession || !visibleSelected) return;
    setPluginLoading(true);
    setPluginMessage("");
    try {
      await apiFetch(
        "/settings",
        { ...apiSession, tenantId: visibleSelected.id },
        {
          method: "PUT",
          body: JSON.stringify({
            scope: "tenant",
            module: "integrations",
            key: "catalog.integrations",
            value: catalogIntegrations,
            actor_user_id: apiSession.user?.id,
          }),
        },
      );
      await loadTenantSettings();
      setPluginMessage("Tenant catalog plugin controls saved.");
    } catch (err: any) {
      setPluginMessage(
        err.message || "Could not save catalog plugin controls.",
      );
    } finally {
      setPluginLoading(false);
    }
  }

  async function saveBankDetails(e: any) {
    e.preventDefault();
    if (!apiSession || !visibleSelected) return;
    setSettingsLoading(true);
    setAccountsMessage("");
    try {
      await apiFetch(
        "/settings",
        { ...apiSession, tenantId: visibleSelected.id },
        {
          method: "PUT",
          body: JSON.stringify({
            scope: "tenant",
            module: "accounts",
            key: "accounts.bank_details",
            value: bankDetails,
            actor_user_id: apiSession.user?.id,
          }),
        },
      );
      await loadTenantSettings();
      setAccountsMessage("Tenant account details saved.");
    } catch (err: any) {
      setAccountsMessage(err.message || "Could not save account details.");
    } finally {
      setSettingsLoading(false);
    }
  }

  return {
    visibleSelected,
    activePlan,
    editableModules,
    subscriptions,
    selectedModules,
    settings,
    numberingRules,
    catalogIntegrations,
    bankDetails,
    settingsMessage,
    setSettingsMessage,
    accountsMessage,
    setAccountsMessage,
    pluginMessage,
    setPluginMessage,
    message,
    setMessage,
    loading,
    settingsLoading,
    pluginLoading,
    setNumberRule,
    setEntityCode,
    setBankDetail,
    saveNumberingSettings,
    setCatalogPlugin,
    saveCatalogIntegrations,
    saveBankDetails,
  };
}
