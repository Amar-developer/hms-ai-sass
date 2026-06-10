"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, Input, Select, StatusToast } from "@/components/common/ui";
import { FormField } from "@/components/FormElements";
import { apiFetch } from "@/lib/api";
import {
  defaultNumberingEntities,
  numberEntityLabel,
  parseCatalogIntegrations,
  parseNumberingRules,
} from "../../../utils/superAdmin/constants";
import {
  entitlementModules,
  formatTenantType,
  limitLabel,
} from "../../../utils/superAdmin/superAdmin";
import { Empty } from "@/components/admin/Empty";
import { Info } from "../shared/Info";
import { TenantPicker } from "../shared/TenantPicker";

function CatalogPluginControl({ title, value, onChange }: any) {
  const enabled = Boolean(value?.enabled);
  return (
    <div
      className={`rounded-2xl border p-4 text-sm ${enabled ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}
    >
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e: any) =>
            onChange({
              enabled: e.target.checked,
              provider: e.target.checked
                ? value?.provider === "local"
                  ? "external_catalog"
                  : value?.provider || "external_catalog"
                : "local",
            })
          }
          className="mt-1 h-4 w-4"
        />
        <span>
          <b>{title}</b>
          <span className="mt-1 block text-xs text-slate-500">
            {enabled
              ? "Plugin source enabled for this tenant."
              : "Using local MedizinHub catalog."}
          </span>
        </span>
      </label>
      <div className="mt-3">
        <FormField label="Provider">
          <Select
            value={value?.provider || "local"}
            onChange={(e: any) =>
              onChange({
                provider: e.target.value,
                enabled: e.target.value !== "local",
              })
            }
          >
            <option value="local">MedizinHub Local</option>
            <option value="external_catalog">External Catalog Provider</option>
            <option value="frappe_erpnext">Legacy External Provider</option>
          </Select>
        </FormField>
      </div>
    </div>
  );
}

export function TenantBranchSettings({
  apiSession,
  selected,
  tenants,
  selectedId,
  setSelectedId,
  plans,
  modules,
  reloadPlans,
}: any) {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [numberingRules, setNumberingRules] = useState<any>(
    parseNumberingRules(null, "SUN"),
  );
  const [catalogIntegrations, setCatalogIntegrations] = useState<any>(
    parseCatalogIntegrations(null),
  );
  const [settingsMessage, setSettingsMessage] = useState("");
  const [pluginMessage, setPluginMessage] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [pluginLoading, setPluginLoading] = useState(false);
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
    } catch (err: any) {
      setSettings([]);
      setNumberingRules(parseNumberingRules(null, "SUN"));
      setCatalogIntegrations(parseCatalogIntegrations(null));
      setSettingsMessage(err.message || "Could not load numbering settings.");
    } finally {
      setSettingsLoading(false);
    }
  }

  useEffect(() => {
    loadTenantSubscription();
    loadTenantSettings();
  }, [apiSession?.token, selectedId, plans?.length, modules?.length]);

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

  async function saveNumberingSettings(e: any) {
    e.preventDefault();
    if (!apiSession || !selected) return;
    setSettingsLoading(true);
    setSettingsMessage("");
    try {
      await Promise.all([
        apiFetch(
          "/settings",
          { ...apiSession, tenantId: selected.id },
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
          { ...apiSession, tenantId: selected.id },
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
      setSettingsMessage(
        err.message || "Could not save numbering settings.",
      );
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
    if (!apiSession || !selected) return;
    setPluginLoading(true);
    setPluginMessage("");
    try {
      await apiFetch(
        "/settings",
        { ...apiSession, tenantId: selected.id },
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

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h3 className="text-base lg:text-lg font-bold">Tenant & Branch Settings</h3>
            <p className="text-xs lg:text-sm text-slate-500">
              Configuration page for tenant type, enabled modules, branch
              settings, queue rules, invoice prefix, and communication
              providers.
            </p>
          </div>
         <div className="w-[30%] lg:w-[15%]">
           <TenantPicker
            tenants={tenants}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
         </div>
        </div>
        {selected && (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Info label="Tenant" value={selected.name} />
            <Info
              label="Type"
              value={formatTenantType(selected.tenant_type)}
            />
            <Info label="Status" value={selected.status} />
            <Info label="Email" value={selected.email || "-"} />
            <Info label="Phone" value={selected.phone || "-"} />
            <Info label="Timezone" value={selected.timezone || "-"} />
          </div>
        )}
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h4 className="text-base lg:text-lg font-bold">Document Numbering</h4>
            <p className="text-xs lg:text-sm text-slate-500">
              Set the tenant prefix, digit length, and module codes used for
              generated IDs.
            </p>
          </div>
          <Badge tone="blue" className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm">
            {settingsLoading ? "Loading" : "Tenant scoped"}
          </Badge>
        </div>
        <StatusToast
          message={settingsMessage}
          onClose={() => setSettingsMessage("")}
        />
        <form onSubmit={saveNumberingSettings} className="mt-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Prefix">
              <Input
                value={numberingRules.prefix || "SUN"}
                onChange={(e: any) =>
                  setNumberRule("prefix", e.target.value.toUpperCase())
                }
                placeholder="SUN"
              />
            </Field>
            <Field label="Digits">
              <Input
                type="number"
                min="1"
                max="12"
                value={numberingRules.digits || 5}
                onChange={(e: any) =>
                  setNumberRule("digits", Number(e.target.value || 5))
                }
              />
            </Field>
            <Info
              label="Example"
              value={`${numberingRules.prefix || "SUN"}-${numberingRules.entities?.patient || "PAT"}-${String(1).padStart(Number(numberingRules.digits || 5), "0")}`}
            />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {Object.entries(
              numberingRules.entities || defaultNumberingEntities,
            ).map(([key, value]: any) => (
              <Field key={key} label={`${numberEntityLabel(key)} Code`}>
                <Input
                  value={value}
                  onChange={(e: any) => setEntityCode(key, e.target.value)}
                />
              </Field>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button disabled={settingsLoading || !selected}>
              {settingsLoading ? "Saving..." : "Save Numbering"}
            </Button>
            <span className="text-xs text-slate-500">
              Previous enabled modules and tenant settings remain unchanged.
            </span>
          </div>
        </form>
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h4 className="text-base lg:text-lg font-bold">Catalog Plugin Controls</h4>
            <p className="text-xs lg:text-sm text-slate-500">
              Tenant-specific catalog source routing for custom integrations.
              Disabled plugins use MedizinHub local catalog data.
            </p>
          </div>
          <Badge tone="blue" className="rounded-lg w-[25%] lg:w-[15%] px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm">Tenant scoped</Badge>
        </div>
        <StatusToast
          message={pluginMessage}
          onClose={() => setPluginMessage("")}
        />
        <form
          onSubmit={saveCatalogIntegrations}
          className="mt-4 grid gap-3 md:grid-cols-2"
        >
          <CatalogPluginControl
            title="Lab Item Catalog"
            value={catalogIntegrations.lab_items}
            onChange={(patch: any) => setCatalogPlugin("lab_items", patch)}
          />
          <CatalogPluginControl
            title="Medicine Item Catalog"
            value={catalogIntegrations.medicine_items}
            onChange={(patch: any) =>
              setCatalogPlugin("medicine_items", patch)
            }
          />
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button disabled={pluginLoading || !selected}>
              {pluginLoading ? "Saving..." : "Save Plugin Controls"}
            </Button>
            <span className="text-xs text-slate-500">
              Subscription module access remains controlled by the active plan.
            </span>
          </div>
        </form>
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h4 className="text-base lg:text-lg font-bold">Plan Module Access</h4>
            <p className="text-xs lg:text-sm text-slate-500">
              Modules are controlled by the active subscription plan. Upgrade
              the tenant plan from Subscription Management to change access.
            </p>
          </div>
          <div className="text-right w-[30%] lg:w-[15%]">
            {activePlan ? (
              <>
                <Badge tone="blue" className=" rounded-lg py-1 px-1 ">{activePlan.name}</Badge>
                <p className="mt-1 text-xs text-slate-500">Current plan</p>
              </>
            ) : (
              <Badge tone="amber" className="text-center">No active plan</Badge>
            )}
          </div>
        </div>
        <StatusToast message={message} onClose={() => setMessage("")} />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {editableModules.length === 0 && (
            <Empty
              text={
                loading ? "Loading modules..." : "No entitlement modules found."
              }
            />
          )}
          {editableModules.map((module: any) => {
            const key = module.entitlement_key;
            const checked = selectedModules.includes(key);
            return (
              <div
                key={module.key}
                className={`flex min-h-[92px] gap-3 rounded-2xl border p-4 text-sm ${checked ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white opacity-60"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  disabled
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="flex flex-wrap items-center gap-2">
                    <b>{module.name}</b>
                    {key === "patient_subscriptions" && (
                      <Badge tone="green">Patient Membership</Badge>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {key}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs font-semibold text-slate-500">
          {selectedModules.length} modules enabled by the active plan.
        </p>
      </Card>
      <p className="text-xs text-slate-500">
        Detailed branch settings reuse the tenant admin settings APIs. A
        dedicated branch CRUD/settings API page can be added next.
      </p>
    </div>
  );
}
