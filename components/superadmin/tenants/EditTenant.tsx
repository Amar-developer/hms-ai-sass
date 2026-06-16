"use client";

import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  LayoutGrid,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
} from "@/components/common/ui";
import { tenantTypes } from "../../../utils/superAdmin/constants";
import {
  formatTenantType,
  invoiceLimitLabel,
  limitLabel,
} from "../../../utils/superAdmin/superAdmin";
import { Info } from "../shared/Info";

const sections = [
  { label: "Tenant Details", short: "Tenant", icon: Building2 },
  { label: "Plan & Branches", short: "Plan", icon: LayoutGrid },
  { label: "Included Modules", short: "Modules", icon: ShieldCheck },
  { label: "Default Templates", short: "Templates", icon: ClipboardCheck },
  { label: "Tenant Admin", short: "Admin", icon: CircleUserRound },
  { label: "Review & Save", short: "Review", icon: CheckCircle2 },
];

function TemplateGroup({
  title,
  name,
  templates,
  assignedIds,
  assignedKeys,
  keyField,
}: any) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h5 className="font-bold text-slate-950">{title}</h5>
        <Badge tone="blue" className="rounded-full px-2 py-1 text-[10px]">
          {assignedIds.size} assigned
        </Badge>
      </div>
      <div className="mt-3 grid gap-2">
        {!templates.length && (
          <p className="text-xs text-slate-500">No templates available.</p>
        )}
        {templates.map((template: any) => {
          const assigned =
            assignedIds.has(template.id) ||
            assignedKeys.has(String(template[keyField] || ""));
          return (
            <label
              key={template.id}
              className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${
                assigned
                  ? "border-emerald-200 bg-emerald-50/70"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <input
                type="checkbox"
                name={name}
                value={template.id}
                defaultChecked={assigned}
                disabled={assigned}
                className="mt-1 h-4 w-4"
              />
              {assigned && (
                <input type="hidden" name={name} value={template.id} />
              )}
              <span className="min-w-0">
                <span className="block font-semibold">{template.name}</span>
                <span className="block break-all text-xs text-slate-500">
                  {template[keyField] || template.id}
                </span>
                {assigned && (
                  <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                    Assigned and protected
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function EditTenant({
  selected,
  branches,
  plans,
  moduleRegistry,
  templates,
  roles,
  departments,
  users,
  subscriptions,
  busy,
  updateTenant,
  suspendTenant,
  back,
}: any) {
  const [section, setSection] = useState(0);
  const [branchRows, setBranchRows] = useState<any[]>([]);
  const activeSubscription =
    (subscriptions || []).find(
      (subscription: any) =>
        subscription.is_active && subscription.status === "active",
    ) || (subscriptions || [])[0];
  const [planId, setPlanId] = useState(activeSubscription?.plan_id || "");
  const selectedPlan = (plans || []).find((plan: any) => plan.id === planId);
  const tenantAdmin = (users || []).find(
    (user: any) =>
      user.user_type === "tenant_admin" ||
      (user.roles || []).includes("tenant_admin"),
  );

  useEffect(() => {
    const rows = (branches || []).map((branch: any) => ({
      ...branch,
      _key: branch.id,
    }));
    setBranchRows(
      rows.length
        ? rows
        : [
            {
              _key: Date.now(),
              name: "Main Branch",
              code: "MAIN",
              is_active: true,
            },
          ],
    );
  }, [selected.id, branches]);

  useEffect(() => {
    setPlanId(activeSubscription?.plan_id || "");
    setSection(0);
  }, [selected.id, activeSubscription?.plan_id]);

  const assignedRoleTemplateIds = useMemo(
    () =>
      new Set(
        (roles || [])
          .map((role: any) => role.source_template_role_id)
          .filter(Boolean),
      ),
    [roles],
  );
  const assignedRoleKeys = useMemo(
    () => new Set((roles || []).map((role: any) => String(role.key || ""))),
    [roles],
  );
  const assignedDepartmentTemplateIds = useMemo(
    () =>
      new Set(
        (departments || [])
          .map((department: any) => department.source_template_department_id)
          .filter(Boolean),
      ),
    [departments],
  );
  const assignedDepartmentCodes = useMemo(
    () =>
      new Set(
        (departments || []).map((department: any) =>
          String(department.code || ""),
        ),
      ),
    [departments],
  );
  const assignedBranchTemplateIds = useMemo(
    () =>
      new Set(
        (branches || [])
          .map((branch: any) => branch.source_template_branch_id)
          .filter(Boolean),
      ),
    [branches],
  );
  const assignedBranchCodes = useMemo(
    () =>
      new Set(
        (branches || []).map((branch: any) => String(branch.code || "")),
      ),
    [branches],
  );
  const moduleNames = (selectedPlan?.enabled_modules || []).map(
    (key: string) =>
      (moduleRegistry || []).find(
        (module: any) => (module.entitlement_key || module.key) === key,
      )?.name || key,
  );
  const SectionIcon = sections[section].icon;

  function addBranch() {
    setBranchRows((current) => [
      ...current,
      {
        _key: Date.now() + current.length,
        name: "",
        code: `BR${current.length + 1}`,
        is_active: true,
      },
    ]);
  }

  function removeUnsavedBranch(key: any) {
    setBranchRows((current) =>
      current.filter((branch: any) => branch._key !== key),
    );
  }

  return (
    <Card className="overflow-hidden border-slate-200 bg-slate-50/60 p-0">
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-6 text-white lg:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge
              tone="blue"
              className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-[10px] uppercase tracking-wider text-blue-100"
            >
              Tenant Configuration
            </Badge>
            <h3 className="text-xl font-bold lg:text-2xl">
              Edit {selected.name}
            </h3>
            <p className="mt-1 text-xs text-slate-300 lg:text-sm">
              Review and update the same six areas used during onboarding.
            </p>
          </div>
          <button
            type="button"
            onClick={back}
            className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/15"
          >
            Back to Tenants
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-white p-4 lg:border-b-0 lg:border-r lg:p-5">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-1">
            {sections.map(({ label, short, icon: Icon }, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setSection(index)}
                className={`flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                  section === index
                    ? "border-blue-200 bg-blue-50 text-blue-950 shadow-sm"
                    : "border-transparent bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                    section === index
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <Icon size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Section {index + 1}
                  </span>
                  <span className="hidden truncate text-xs font-bold lg:block">
                    {label}
                  </span>
                  <span className="block truncate text-[10px] font-bold sm:text-xs lg:hidden">
                    {short}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <form onSubmit={updateTenant} className="min-w-0 bg-white">
          <input
            type="hidden"
            name="currentPlanId"
            value={activeSubscription?.plan_id || ""}
          />
          <input
            type="hidden"
            name="assignedRoleTemplateIds"
            value={Array.from(assignedRoleTemplateIds).join(",")}
          />
          <input
            type="hidden"
            name="assignedDepartmentTemplateIds"
            value={Array.from(assignedDepartmentTemplateIds).join(",")}
          />
          <input
            type="hidden"
            name="assignedBranchTemplateIds"
            value={Array.from(assignedBranchTemplateIds).join(",")}
          />
          <input
            type="hidden"
            name="adminUserId"
            value={tenantAdmin?.id || ""}
          />

          <div className="border-b border-slate-100 px-5 py-5 lg:px-7">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <SectionIcon size={20} />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                  Section {section + 1} of 6
                </p>
                <h4 className="text-lg font-bold text-slate-950">
                  {sections[section].label}
                </h4>
              </div>
            </div>
          </div>

          <div className="min-h-[470px] px-5 py-6 lg:px-7">
            <div
              className={
                section === 0 ? "grid gap-4 md:grid-cols-3" : "hidden"
              }
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
                <Input
                  name="legalName"
                  defaultValue={selected.legal_name || ""}
                />
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
                <Input
                  name="email"
                  type="email"
                  defaultValue={selected.email || ""}
                />
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
                  {selected.is_primary && (
                    <option value="primary">Primary</option>
                  )}
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
              <div className="md:col-span-3">
                <Field label="Address">
                  <Input
                    name="address"
                    defaultValue={selected.address || ""}
                  />
                </Field>
              </div>
              <div className="md:col-span-3">
                <Field label="Description">
                  <Input
                    name="description"
                    defaultValue={selected.description || ""}
                  />
                </Field>
              </div>
            </div>

            <div className={section === 1 ? "grid gap-5" : "hidden"}>
              {!selected.is_primary && (
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Subscription Plan">
                    <Select
                      name="planId"
                      value={planId}
                      onChange={(event: any) => setPlanId(event.target.value)}
                      required
                    >
                      {(plans || []).map((plan: any) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} - ₹{plan.price_inr_monthly}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Info
                    label="Current Subscription"
                    value={
                      (plans || []).find(
                        (plan: any) =>
                          plan.id === activeSubscription?.plan_id,
                      )?.name || "Not assigned"
                    }
                  />
                  <Info
                    label="Subscription Status"
                    value={activeSubscription?.status || "-"}
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h5 className="font-bold text-slate-950">Branches</h5>
                  <p className="text-xs text-slate-500">
                    Local branches are editable. Assigned templates remain
                    protected.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addBranch}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold"
                >
                  Add Branch
                </button>
              </div>
              <input
                type="hidden"
                name="branchCount"
                value={branchRows.length}
              />
              <div className="grid gap-3">
                {branchRows.map((branch: any, index: number) => {
                  const locked =
                    branch.is_template_locked ||
                    branch.source_template_branch_id;
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
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <b>Branch {index + 1}</b>
                          {locked && (
                            <Badge
                              tone="purple"
                              className="rounded-full px-2 py-1 text-[10px]"
                            >
                              Template
                            </Badge>
                          )}
                        </div>
                        {!branch.id && branchRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              removeUnsavedBranch(branch._key)
                            }
                            className="text-xs font-bold text-red-600"
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
                            required
                            disabled={locked}
                          />
                        </Field>
                        <Field label="Branch Code">
                          <Input
                            name={`branchCode_${index}`}
                            defaultValue={branch.code || ""}
                            required
                            disabled={locked}
                          />
                        </Field>
                        <Field label="Status">
                          <Select
                            name={`branchActive_${index}`}
                            defaultValue={String(
                              branch.is_active !== false,
                            )}
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
                        <div className="md:col-span-3">
                          <Field label="Branch Address">
                            <Input
                              name={`branchAddress_${index}`}
                              defaultValue={branch.address || ""}
                              disabled={locked}
                            />
                          </Field>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={section === 2 ? "grid gap-4" : "hidden"}>
              {selectedPlan ? (
                <>
                  <div className="grid gap-3 md:grid-cols-5">
                    <Info label="Plan" value={selectedPlan.name} />
                    <Info
                      label="Price"
                      value={`₹${selectedPlan.price_inr_monthly}`}
                    />
                    <Info
                      label="Patients"
                      value={limitLabel(
                        selectedPlan.monthly_patient_limit,
                      )}
                    />
                    <Info
                      label="Invoices"
                      value={invoiceLimitLabel(selectedPlan)}
                    />
                    <Info
                      label="Branches"
                      value={limitLabel(selectedPlan.included_branches)}
                    />
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold">Included Modules</h5>
                      <Badge
                        tone="blue"
                        className="rounded-full px-2 py-1 text-[10px]"
                      >
                        {moduleNames.length} modules
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {moduleNames.map((name: string) => (
                        <span
                          key={name}
                          className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  Select a plan in section 2 to preview modules.
                </p>
              )}
            </div>

            <div
              className={
                section === 3
                  ? "grid gap-4 lg:grid-cols-3"
                  : "hidden"
              }
            >
              <TemplateGroup
                title="Roles"
                name="roleTemplateIds"
                templates={templates?.roles || []}
                assignedIds={assignedRoleTemplateIds}
                assignedKeys={assignedRoleKeys}
                keyField="key"
              />
              <TemplateGroup
                title="Medical Departments"
                name="departmentTemplateIds"
                templates={templates?.departments || []}
                assignedIds={assignedDepartmentTemplateIds}
                assignedKeys={assignedDepartmentCodes}
                keyField="code"
              />
              <TemplateGroup
                title="Branch Templates"
                name="branchTemplateIds"
                templates={templates?.branches || []}
                assignedIds={assignedBranchTemplateIds}
                assignedKeys={assignedBranchCodes}
                keyField="code"
              />
            </div>

            <div className={section === 4 ? "grid gap-4" : "hidden"}>
              {tenantAdmin ? (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Admin Name">
                      <Input
                        name="adminName"
                        defaultValue={tenantAdmin.name}
                        required
                      />
                    </Field>
                    <Field label="Admin Email">
                      <Input
                        name="adminEmail"
                        type="email"
                        defaultValue={tenantAdmin.email}
                        required
                      />
                    </Field>
                    <Field label="Mobile">
                      <Input
                        name="adminMobile"
                        defaultValue={tenantAdmin.mobile || ""}
                      />
                    </Field>
                    <Field label="Account Status">
                      <Select
                        name="adminIsActive"
                        defaultValue={String(tenantAdmin.is_active)}
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </Select>
                    </Field>
                    <Field label="Must Change Password">
                      <Select
                        name="adminMustChangePassword"
                        defaultValue={String(
                          tenantAdmin.must_change_password,
                        )}
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </Select>
                    </Field>
                    <Field label="New Temporary Password">
                      <Input
                        name="adminNewPassword"
                        type="password"
                        minLength={8}
                        autoComplete="new-password"
                        placeholder="Leave blank to keep current password"
                      />
                    </Field>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-800">
                    Passwords cannot be displayed. Enter a new temporary
                    password only when a reset is required.
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <h5 className="font-bold text-amber-900">
                    No tenant admin found
                  </h5>
                  <p className="mt-1 text-sm text-amber-800">
                    Create a tenant-admin account from the Users section, then
                    return here to manage it with the tenant configuration.
                  </p>
                </div>
              )}
            </div>

            <div className={section === 5 ? "grid gap-4" : "hidden"}>
              <div className="grid gap-3 md:grid-cols-3">
                <Info label="Tenant" value={selected.name} />
                <Info
                  label="Type"
                  value={formatTenantType(selected.tenant_type)}
                />
                <Info label="Status" value={selected.status} />
                <Info
                  label="Plan"
                  value={selectedPlan?.name || "Not assigned"}
                />
                <Info
                  label="Branches"
                  value={`${branchRows.length} configured`}
                />
                <Info
                  label="Modules"
                  value={`${moduleNames.length} included`}
                />
                <Info
                  label="Roles"
                  value={`${(roles || []).length} assigned`}
                />
                <Info
                  label="Departments"
                  value={`${(departments || []).length} assigned`}
                />
                <Info
                  label="Tenant Admin"
                  value={tenantAdmin?.email || "Not created"}
                />
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                Saving applies changes from all six sections. Selecting a
                different plan creates a new active subscription and refreshes
                tenant entitlements.
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur lg:px-7">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSection((current) => Math.max(0, current - 1))}
                disabled={section === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold disabled:text-slate-300"
              >
                <ChevronLeft size={15} />
                Previous
              </button>
              <button
                type="button"
                onClick={() =>
                  setSection((current) =>
                    Math.min(sections.length - 1, current + 1),
                  )
                }
                disabled={section === sections.length - 1}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
              >
                Next
                <ChevronRight size={15} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => suspendTenant(selected)}
                disabled={busy || selected.is_primary}
                className="rounded-xl border border-red-200 px-4 py-2.5 text-xs font-bold text-red-600 disabled:text-slate-300"
              >
                Deactivate
              </button>
              <Button
                disabled={busy}
                className="rounded-xl px-5 py-2.5 text-xs lg:text-sm"
              >
                {busy ? "Saving..." : "Save All Changes"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Card>
  );
}
