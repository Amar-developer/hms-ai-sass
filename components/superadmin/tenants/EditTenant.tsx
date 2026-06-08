"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, Input, Select } from "@/components/common/ui";
import { tenantTypes } from "../../../utils/superAdmin/constants";

export function EditTenant({
  selected,
  branches,
  busy,
  updateTenant,
  suspendTenant,
  back,
}: any) {
  const [branchRows, setBranchRows] = useState<any[]>([]);

  useEffect(() => {
    const rows = (branches || []).map((branch: any) => ({
      ...branch,
      _key: branch.id,
    }));
    setBranchRows(
      rows.length
        ? rows
        : [{ _key: Date.now(), name: "Main Branch", code: "MAIN", is_active: true }],
    );
  }, [selected.id, branches]);

  function addBranch() {
    setBranchRows([
      ...branchRows,
      {
        _key: Date.now() + branchRows.length,
        name: "",
        code: `BR${branchRows.length + 1}`,
        is_active: true,
      },
    ]);
  }

  function removeUnsavedBranch(key: any) {
    setBranchRows(branchRows.filter((branch: any) => branch._key !== key));
  }

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold">Edit Tenant Details</h3>
          <p className="text-sm text-slate-500">{selected.name}</p>
        </div>
        <button
          type="button"
          onClick={back}
          className="rounded-2xl border px-4 py-3 text-sm font-bold"
        >
          Back to Tenants
        </button>
      </div>
      <form
        onSubmit={updateTenant}
        className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <Field label="Tenant Name">
          <Input
            name="name"
            defaultValue={selected.name}
            required
            disabled={selected.is_primary}
          />
        </Field>
        <Field label="Legal Name">
          <Input name="legalName" defaultValue={selected.legal_name || ""} />
        </Field>
        <Field label="Tenant Logo">
          <Input name="logoFile" type="file" accept="image/*" />
          {selected.logo_url && (
            <p className="mt-1 break-all text-xs text-slate-500">
              {selected.logo_url}
            </p>
          )}
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={selected.email || ""} />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={selected.phone || ""} />
        </Field>
        <Field label="Tenant Type">
          <Select
            name="tenantType"
            defaultValue={selected.tenant_type}
            disabled={selected.is_primary}
          >
            {selected.is_primary && <option value="primary">Primary</option>}
            {tenantTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            name="status"
            defaultValue={selected.status}
            disabled={selected.is_primary}
          >
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
        </Field>
        <Field label="Country">
          <Input
            name="country"
            defaultValue={selected.country || "IN"}
            maxLength={2}
          />
        </Field>
        <Field label="Timezone">
          <Input
            name="timezone"
            defaultValue={selected.timezone || "Asia/Kolkata"}
          />
        </Field>
        <div className="md:col-span-2 xl:col-span-3">
          <Field label="Address">
            <Input name="address" defaultValue={selected.address || ""} />
          </Field>
        </div>
        <div className="md:col-span-2 xl:col-span-3">
          <Field label="Description">
            <Input name="description" defaultValue={selected.description || ""} />
          </Field>
        </div>
        <div className="md:col-span-2 xl:col-span-3">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h4 className="font-bold">Branches</h4>
              <p className="text-sm text-slate-500">
                Edit local branches or add new branches for this tenant. Locked
                global branches are managed from MedizinHub HMS templates.
              </p>
            </div>
            <button
              type="button"
              onClick={addBranch}
              className="rounded-2xl border px-4 py-3 text-sm font-bold"
            >
              Add Branch
            </button>
          </div>
          <input type="hidden" name="branchCount" value={branchRows.length} />
          <div className="mt-3 grid gap-3">
            {branchRows.map((branch: any, index: number) => {
              const locked =
                branch.is_template_locked || branch.source_template_branch_id;
              return (
                <div
                  key={branch._key}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <input
                    type="hidden"
                    name={`branchId_${index}`}
                    value={branch.id || ""}
                  />
                  <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <b>Branch {index + 1}</b>
                        {branch.is_global_template && (
                          <Badge tone="blue">Global</Badge>
                        )}
                        {locked && <Badge tone="purple">Locked</Badge>}
                      </div>
                      {branch.id && (
                        <p className="break-all text-xs text-slate-500">
                          {branch.id}
                        </p>
                      )}
                    </div>
                    {!branch.id && branchRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeUnsavedBranch(branch._key)}
                        className="rounded-xl border px-3 py-2 text-xs font-bold text-red-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Branch Name">
                      <Input
                        name={`branchName_${index}`}
                        defaultValue={branch.name || ""}
                        required={index === 0}
                        disabled={locked}
                      />
                    </Field>
                    <Field label="Branch Code">
                      <Input
                        name={`branchCode_${index}`}
                        defaultValue={branch.code || ""}
                        required={index === 0}
                        disabled={locked}
                      />
                    </Field>
                    <Field label="Status">
                      <Select
                        name={`branchActive_${index}`}
                        defaultValue={String(branch.is_active !== false)}
                        disabled={locked}
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </Select>
                    </Field>
                    <Field label="City">
                      <Input
                        name={`branchCity_${index}`}
                        defaultValue={branch.city || ""}
                        disabled={locked}
                      />
                    </Field>
                    <Field label="Area">
                      <Input
                        name={`branchArea_${index}`}
                        defaultValue={branch.area || ""}
                        disabled={locked}
                      />
                    </Field>
                    <Field label="State">
                      <Input
                        name={`branchState_${index}`}
                        defaultValue={branch.state || ""}
                        disabled={locked}
                      />
                    </Field>
                    <Field label="Branch Address">
                      <Input
                        name={`branchAddress_${index}`}
                        defaultValue={branch.address || ""}
                        disabled={locked}
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-3">
          <Button disabled={busy}>
            {busy ? "Saving..." : "Update Tenant"}
          </Button>
          <button
            type="button"
            onClick={() => suspendTenant(selected)}
            disabled={busy || selected.is_primary}
            className="rounded-2xl border px-4 py-3 text-sm font-bold text-red-600 disabled:text-slate-300"
          >
            Deactivate Tenant
          </button>
        </div>
      </form>
    </Card>
  );
}
