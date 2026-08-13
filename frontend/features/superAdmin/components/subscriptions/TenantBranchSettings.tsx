"use client";

import { useEffect } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { defaultNumberingEntities, numberEntityLabel } from "../../constants";
import { formatTenantType } from "../../helpers";
import { Empty } from "@/app/components/common/Empty";
import { Info } from "@/app/components/common/Info";
import { TenantPicker } from "../shared/TenantPicker";
import { useTenantBranchSettings } from "../../api";

function CatalogPluginControl({
  title,
  value,
  onChange,
  allowExternal = true,
}: any) {
  const enabled = Boolean(value?.enabled);
  const effectiveEnabled = allowExternal && enabled;
  return (
    <div
      className={`rounded-2xl border p-4 text-sm ${effectiveEnabled ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}
    >
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={effectiveEnabled}
          disabled={!allowExternal}
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
            {!allowExternal
              ? "Using local MedizinHub catalog."
              : effectiveEnabled
                ? "Plugin source enabled for this tenant."
                : "Using local MedizinHub catalog."}
          </span>
        </span>
      </label>
      <div className="mt-3">
        <FormField label="Provider">
          <Select
            value={allowExternal ? value?.provider || "local" : "local"}
            disabled={!allowExternal}
            onChange={(e: any) =>
              onChange({
                provider: e.target.value,
                enabled: e.target.value !== "local",
              })
            }
          >
            <option value="local">MedizinHub Local</option>
            {allowExternal && (
              <option value="external_catalog">
                External Catalog Provider
              </option>
            )}
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
  const {
    visibleSelected,
    activePlan,
    editableModules,
    selectedModules,
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
  } = useTenantBranchSettings(
    apiSession,
    selectedId,
    tenants,
    selected,
    plans,
    modules,
  );

  useEffect(() => {
    if (!tenants.length) return;
    if (!tenants.some((tenant: any) => tenant.id === selectedId)) {
      setSelectedId(tenants[0].id);
    }
  }, [selectedId, setSelectedId, tenants]);

  return (
    <div className="space-y-5">
      <Card className="mt-3">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h3 className="card-title font-bold">Tenant & Branch Settings</h3>
            <p className="card-desc text-slate-500">
              Configuration page for tenant type, enabled modules, branch
              settings, queue rules, invoice prefix, and communication
              providers.
            </p>
          </div>
          <div className="w-[30%] lg:w-[25%]">
            <TenantPicker
              tenants={tenants}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
            />
          </div>
        </div>
        {visibleSelected && (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Info label="Tenant" value={visibleSelected.name} />
            <Info
              label="Type"
              value={formatTenantType(visibleSelected.tenant_type)}
            />
            <Info label="Status" value={visibleSelected.status} />
            <Info label="Email" value={visibleSelected.email || "-"} />
            <Info label="Phone" value={visibleSelected.phone || "-"} />
            <Info label="Timezone" value={visibleSelected.timezone || "-"} />
          </div>
        )}
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h1 className="card-title font-bold">
              Accounts & Bank Details
            </h1>
            <p className="card-desc text-slate-500">
              Tenant bank account details shown on printable invoices.
            </p>
          </div>
          <Badge
            tone="blue"
            className="normal-badge"
          >
            Tenant scoped
          </Badge>
        </div>
        <StatusToast
          message={accountsMessage}
          onClose={() => setAccountsMessage("")}
        />
        <form onSubmit={saveBankDetails} className="mt-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Account Name">
              <Input
                value={bankDetails.account_name || ""}
                onChange={(e: any) =>
                  setBankDetail("account_name", e.target.value)
                }
                placeholder="Tenant legal account name"
              />
            </Field>
            <Field label="Bank Branch">
              <Input
                value={bankDetails.branch_name || ""}
                onChange={(e: any) =>
                  setBankDetail("branch_name", e.target.value)
                }
                placeholder="Branch"
              />
            </Field>
            <Field label="Account Number">
              <Input
                value={bankDetails.account_number || ""}
                onChange={(e: any) =>
                  setBankDetail("account_number", e.target.value)
                }
                placeholder="Account number"
              />
            </Field>
            <Field label="IFSC">
              <Input
                value={bankDetails.ifsc || ""}
                onChange={(e: any) =>
                  setBankDetail("ifsc", e.target.value.toUpperCase())
                }
                placeholder="IFSC"
              />
            </Field>
            <Field label="UPI ID">
              <Input
                value={bankDetails.upi_id || ""}
                onChange={(e: any) => setBankDetail("upi_id", e.target.value)}
                placeholder="name@bank"
              />
            </Field>
            <Field label="GSTIN">
              <Input
                value={bankDetails.gstin || ""}
                onChange={(e: any) =>
                  setBankDetail("gstin", e.target.value.toUpperCase())
                }
                placeholder="Tenant GSTIN"
              />
            </Field>
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              disabled={settingsLoading || !visibleSelected}
              className="save-button"
            >
              {settingsLoading ? "Saving..." : "Save Accounts"}
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h1 className="card-title font-bold">
              Document Numbering
            </h1>
            <p className="card-desc text-slate-500">
              Set the tenant prefix, digit length, and module codes used for
              generated IDs.
            </p>
          </div>
          <Badge
            tone="blue"
            className="normal-badge"
          >
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
            <Button disabled={settingsLoading || !visibleSelected}
            className='save-button'>
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
            <h1 className="card-title font-bold">
              Catalog Plugin Controls
            </h1>
            <p className="card-desc text-slate-500">
              Tenant-specific catalog source routing for custom integrations.
              Disabled plugins use MedizinHub local catalog data.
            </p>
          </div>
          <Badge
            tone="blue"
            className="normal-badge"
          >
            Tenant scoped
          </Badge>
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
            allowExternal={false}
            onChange={(patch: any) => setCatalogPlugin("lab_items", patch)}
          />
          <CatalogPluginControl
            title="Medicine Item Catalog"
            value={catalogIntegrations.medicine_items}
            onChange={(patch: any) => setCatalogPlugin("medicine_items", patch)}
          />
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button disabled={pluginLoading || !visibleSelected} className='save-button'>
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
            <h4 className="card-title font-bold">
              Plan Module Access
            </h4>
            <p className="card-desc text-slate-500">
              Modules are controlled by the active subscription plan. Upgrade
              the tenant plan from Subscription Management to change access.
            </p>
          </div>
          <div className="text-right w-[30%] lg:w-[15%]">
            {activePlan ? (
              <>
                <Badge tone="blue" className="normal-badge">
                  {activePlan.name}
                </Badge>
              </>
            ) : (
              <Badge tone="amber" className="normal-badge">
                No active plan
              </Badge>
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
                      <Badge tone="green" className="normal-badge">
                        Patient Membership
                      </Badge>
                    )}
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
