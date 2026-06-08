"use client";

import { useRef, useState } from "react";
import { Badge, Button, Card, Field, Input, Select } from "@/components/common/ui";
import { tenantTypes } from "../../../utils/superAdmin/constants";
import { invoiceLimitLabel, limitLabel, readTenantOnboardingDraft } from "../../../utils/superAdmin/superAdmin";
import { Info } from "../shared/Info";

function ReviewSection({ title, rows, onEdit }: any) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="font-bold">{title}</h4>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-xl border px-3 py-2 text-xs font-bold"
        >
          Edit
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(([label, value]: any) => (
          <div key={label} className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="text-xs font-bold uppercase text-slate-500">
              {label}
            </p>
            <p className="mt-1 break-words font-semibold text-slate-900">
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OnboardingReview({ draft, validSteps, steps, onEdit }: any) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {steps.slice(0, 5).map((label: string, index: number) => (
          <div
            key={label}
            className={`rounded-2xl border p-4 ${validSteps[index] ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">
                  Step {index + 1}
                </p>
                <h4 className="font-bold">{label}</h4>
              </div>
              <Badge tone={validSteps[index] ? "green" : "red"}>
                {validSteps[index] ? "Complete" : "Missing"}
              </Badge>
            </div>
            <button
              type="button"
              onClick={() => onEdit(index)}
              className="mt-3 rounded-xl border bg-white px-3 py-2 text-xs font-bold"
            >
              Edit Step
            </button>
          </div>
        ))}
      </div>
      <ReviewSection
        title="1. Tenant"
        onEdit={() => onEdit(0)}
        rows={[
          ["Tenant Name", draft.name || "Missing"],
          ["Legal Name", draft.legalName || "-"],
          ["Tenant Type", draft.tenantTypeLabel],
          ["Status", draft.status],
          ["Logo", draft.logoName],
          ["Email", draft.email || "-"],
          ["Phone", draft.phone || "-"],
          ["Country", draft.country],
          ["Timezone", draft.timezone],
          ["Address", draft.address || "-"],
          ["Description", draft.description || "-"],
        ]}
      />
      <ReviewSection
        title="2. Plan & Branches"
        onEdit={() => onEdit(1)}
        rows={[
          ["Subscription Plan", draft.planName],
          [
            "Branches",
            `${draft.branches.length} branch${draft.branches.length === 1 ? "" : "es"}`,
          ],
          ...draft.branches.map((branch: any, index: number) => [
            `Branch ${index + 1}`,
            [
              branch.name || "Missing name",
              branch.code || "Missing code",
              branch.area,
              branch.city,
              branch.state,
            ]
              .filter(Boolean)
              .join(" · "),
          ]),
        ]}
      />
      <ReviewSection
        title="3. Modules"
        onEdit={() => onEdit(2)}
        rows={[
          [
            "Enabled Modules",
            draft.moduleLabels.length
              ? draft.moduleLabels.join(", ")
              : "No modules selected",
          ],
        ]}
      />
      <ReviewSection
        title="4. Templates"
        onEdit={() => onEdit(3)}
        rows={[
          [
            "Roles",
            draft.roleTemplates.length
              ? draft.roleTemplates.join(", ")
              : "None selected",
          ],
          [
            "Medical Departments",
            draft.departmentTemplates.length
              ? draft.departmentTemplates.join(", ")
              : "None selected",
          ],
          [
            "Branch Templates",
            draft.branchTemplates.length
              ? draft.branchTemplates.join(", ")
              : "None selected",
          ],
        ]}
      />
      <ReviewSection
        title="5. Admin User"
        onEdit={() => onEdit(4)}
        rows={[
          ["Admin Name", draft.adminName || "Missing"],
          ["Admin Email", draft.adminEmail || "Missing"],
          ["Temporary Password", draft.adminPassword ? "Set" : "Missing"],
          ["Mobile", draft.adminMobile || "-"],
          ["Must Change Password", draft.adminMustChangePassword],
        ]}
      />
    </div>
  );
}

function PlanModulePreview({ plan, modules }: any) {
  if (!plan)
    return (
      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
        Select a subscription plan first.
      </div>
    );
  const moduleNames = (plan.enabled_modules || []).map((key: string) => {
    const module = (modules || []).find(
      (item: any) => (item.entitlement_key || item.key) === key,
    );
    return module?.name || key;
  });
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-5">
        <Info label="Plan" value={plan.name} />
        <Info label="Price" value={`₹${plan.price_inr_monthly}`} />
        <Info label="Patients" value={limitLabel(plan.monthly_patient_limit)} />
        <Info label="Invoices" value={invoiceLimitLabel(plan)} />
        <Info label="Branches" value={limitLabel(plan.included_branches)} />
      </div>
      <Card>
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h4 className="font-bold">Included Modules</h4>
            <p className="text-sm text-slate-500">
              Tenant access follows these modules from the selected plan.
            </p>
          </div>
          <Badge tone="blue">{moduleNames.length} modules</Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {moduleNames.length ? (
            moduleNames.map((name: string) => (
              <span
                key={name}
                className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
              >
                {name}
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-400">
              No modules configured.
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}

function TemplateChecklist({ title, name, items, defaultSelected, empty }: any) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <h4 className="font-bold">{title}</h4>
      <div className="mt-3 grid gap-2">
        {items.length === 0 && (
          <p className="text-sm text-slate-500">{empty}</p>
        )}
        {items.map((item: any) => (
          <label
            key={item.id}
            className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm"
          >
            <input
              type="checkbox"
              name={name}
              value={item.id}
              defaultChecked={defaultSelected(item)}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="font-semibold">{item.name}</span>
              <span className="block break-all text-xs text-slate-500">
                {item.key || item.code}
              </span>
              {item.is_global_template && (
                <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                  Global
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function CreateTenantForm({
  plans,
  moduleRegistry,
  templates,
  busy,
  createTenant,
}: any) {
  const [branches, setBranches] = useState([{ id: Date.now() }]);
  const [step, setStep] = useState(0);
  const [, setReviewTick] = useState(0);
  const formRef = useRef<HTMLFormElement | null>(null);
  const steps = [
    "Tenant",
    "Plan & Branches",
    "Included Modules",
    "Templates",
    "Admin User",
    "Review",
  ];
  const roleDefaults = new Set(["tenant_admin"]);
  const departmentDefaults = new Set(["general_medicine", "general"]);
  const branchDefaults = new Set(["MAIN", "OP_MAIN"]);
  const draft = readTenantOnboardingDraft(
    formRef.current,
    branches,
    plans,
    moduleRegistry,
    templates,
  );
  const validSteps = [
    Boolean(
      draft.name &&
        draft.tenantType &&
        draft.status &&
        draft.country &&
        draft.timezone,
    ),
    Boolean(
      draft.planId &&
        draft.branches.length &&
        draft.branches.every((branch: any) => branch.name && branch.code),
    ),
    Boolean(draft.planId),
    true,
    Boolean(draft.adminName && draft.adminEmail && draft.adminPassword),
  ];
  const firstInvalidStep = validSteps.findIndex((valid) => !valid);
  const allSetupValid = firstInvalidStep === -1;
  const canComplete = step === steps.length - 1 && allSetupValid && !busy;
  const currentStepValid =
    step >= validSteps.length ? allSetupValid : validSteps[step];
  const furthestStep = allSetupValid ? steps.length - 1 : firstInvalidStep;

  function refreshDraft() {
    setReviewTick((value) => value + 1);
  }
  function goToStep(index: number) {
    if (index <= furthestStep || index < step) setStep(index);
  }
  function nextStep() {
    if (!currentStepValid) return;
    setStep(Math.min(steps.length - 1, step + 1));
  }
  function submitWizard(event: any) {
    if (!canComplete) {
      event.preventDefault();
      setStep(firstInvalidStep >= 0 ? firstInvalidStep : steps.length - 1);
      return;
    }
    createTenant(event);
  }

  const stepHelp = [
    "Tenant name, type, status, country, and timezone are required.",
    "Select a plan and complete every branch name and code.",
    "Review the modules included with the selected catalog plan.",
    "Templates are optional, but review selected defaults before continuing.",
    "Admin name, email, and temporary password are required.",
    "Review every section, then complete onboarding.",
  ];

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-bold">Tenant Onboarding Wizard</h3>
          <p className="mt-1 text-sm text-slate-500">
            Create tenant, assign plan, module entitlements, branches, default
            templates, tenant admin credentials, and onboarding checklist in one
            guided flow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {steps.map((label, index) => {
            const complete =
              index < validSteps.length ? validSteps[index] : allSetupValid;
            const locked = index > furthestStep && index > step;
            return (
              <button
                key={label}
                type="button"
                onClick={() => goToStep(index)}
                disabled={locked}
                className={`rounded-xl px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300 ${step === index ? "bg-slate-900 text-white" : complete ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
              >
                {index + 1}. {label}
                {complete && index !== step ? " ✓" : ""}
              </button>
            );
          })}
        </div>
      </div>
      <form
        ref={formRef}
        onSubmit={submitWizard}
        onChange={refreshDraft}
        onInput={refreshDraft}
        noValidate
        className="mt-5 grid gap-4"
      >
        <input type="hidden" name="branchCount" value={branches.length} />
        <div className="rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">
          {stepHelp[step]}{" "}
          {!currentStepValid && step < 5 && (
            <span className="text-red-600"> Complete this step to continue.</span>
          )}
        </div>
        <div className={step === 0 ? "grid gap-4 md:grid-cols-3" : "hidden"}>
          <Field label="Tenant Name">
            <Input name="name" required placeholder="Clinic name" />
          </Field>
          <Field label="Legal Name">
            <Input name="legalName" placeholder="Registered legal name" />
          </Field>
          <Field label="Tenant Type">
            <Select name="tenantType">
              {tenantTypes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue="trial">
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </Select>
          </Field>
          <Field label="Tenant Logo">
            <Input name="logoFile" type="file" accept="image/*" />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" />
          </Field>
          <Field label="Phone">
            <Input name="phone" />
          </Field>
          <Field label="Country">
            <Input name="country" defaultValue="IN" maxLength={2} />
          </Field>
          <Field label="Timezone">
            <Input name="timezone" defaultValue="Asia/Kolkata" />
          </Field>
          <div className="md:col-span-3">
            <Field label="Address">
              <Input name="address" />
            </Field>
          </div>
          <div className="md:col-span-3">
            <Field label="Description">
              <Input
                name="description"
                placeholder="Clinic, hospital, or group description"
              />
            </Field>
          </div>
        </div>
        <div className={step === 1 ? "grid gap-4" : "hidden"}>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Subscription Model">
              <Select name="planId" required>
                {plans.map((plan: any) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} - ₹{plan.price_inr_monthly}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-bold">Branches</h4>
                <p className="text-sm text-slate-500">
                  Add local branches for the tenant. Every branch needs a name
                  and code.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBranches([
                    ...branches,
                    { id: Date.now() + branches.length },
                  ]);
                  setTimeout(refreshDraft, 0);
                }}
                className="rounded-2xl border px-4 py-3 text-sm font-bold"
              >
                Add More Branch
              </button>
            </div>
            <div className="mt-3 grid gap-3">
              {branches.map((branch: any, index: number) => (
                <div
                  key={branch.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <b>Branch {index + 1}</b>
                    {branches.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setBranches(
                            branches.filter(
                              (item: any) => item.id !== branch.id,
                            ),
                          );
                          setTimeout(refreshDraft, 0);
                        }}
                        className="rounded-xl border px-3 py-2 text-xs font-bold text-red-600"
                      >
                        Cancel Branch
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Branch Name">
                      <Input
                        name={`branchName_${index}`}
                        defaultValue={index === 0 ? "Main Branch" : ""}
                        required
                      />
                    </Field>
                    <Field label="Branch Code">
                      <Input
                        name={`branchCode_${index}`}
                        defaultValue={index === 0 ? "MAIN" : ""}
                        placeholder={`BR${index + 1}`}
                        required
                      />
                    </Field>
                    <Field label="City">
                      <Input
                        name={`branchCity_${index}`}
                        placeholder="Chennai"
                      />
                    </Field>
                    <Field label="Area">
                      <Input
                        name={`branchArea_${index}`}
                        placeholder="Chrompet"
                      />
                    </Field>
                    <Field label="State">
                      <Input
                        name={`branchState_${index}`}
                        placeholder="Tamil Nadu"
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="Branch Address">
                        <Input name={`branchAddress_${index}`} />
                      </Field>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={step === 2 ? "grid gap-4" : "hidden"}>
          <PlanModulePreview
            plan={plans.find((plan: any) => plan.id === draft.planId)}
            modules={moduleRegistry}
          />
        </div>
        <div className={step === 3 ? "grid gap-4 lg:grid-cols-3" : "hidden"}>
          <TemplateChecklist
            title="Default Roles"
            name="roleTemplateIds"
            items={templates.roles}
            defaultSelected={(item: any) => roleDefaults.has(item.key)}
            empty="Create default roles under MedizinHub HMS first."
          />
          <TemplateChecklist
            title="Default Medical Departments"
            name="departmentTemplateIds"
            items={templates.departments}
            defaultSelected={(item: any) =>
              departmentDefaults.has(item.code) ||
              departmentDefaults.has(String(item.code || "").toLowerCase())
            }
            empty="Create default medical departments under MedizinHub HMS first."
          />
          <TemplateChecklist
            title="Default Branch Templates"
            name="branchTemplateIds"
            items={templates.branches}
            defaultSelected={(item: any) => branchDefaults.has(item.code)}
            empty="Create branch templates under MedizinHub HMS first."
          />
        </div>
        <div className={step === 4 ? "grid gap-4 md:grid-cols-3" : "hidden"}>
          <Field label="Admin Name">
            <Input
              name="adminName"
              defaultValue="Tenant Admin"
              placeholder="Clinic Owner / Admin"
              required
            />
          </Field>
          <Field label="Admin Email">
            <Input
              name="adminEmail"
              type="email"
              placeholder="admin@clinic.local"
              required
            />
          </Field>
          <Field label="Temporary Password">
            <Input
              name="adminPassword"
              type="text"
              defaultValue="TempPass123"
              required
            />
          </Field>
          <Field label="Admin Mobile">
            <Input name="adminMobile" placeholder="Optional" />
          </Field>
          <Field label="Must Change Password">
            <Select name="adminMustChangePassword" defaultValue="true">
              <option value="true">Yes</option>
              <option value="false">No</option>
            </Select>
          </Field>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 md:col-span-3">
            The wizard copies the Tenant Admin role template automatically and
            creates the first tenant admin user.
          </div>
        </div>
        <div className={step === 5 ? "grid gap-4" : "hidden"}>
          <OnboardingReview
            draft={draft}
            validSteps={validSteps}
            steps={steps}
            onEdit={setStep}
          />
          <div className="rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-blue-700">
            Submitting this wizard creates the tenant, assigns the selected
            catalog plan, copies selected defaults, creates the tenant admin
            user, and returns to the Tenants listing with the latest tenant
            first.
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="rounded-2xl border px-4 py-3 text-sm font-bold disabled:text-slate-300"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={nextStep}
              disabled={step === steps.length - 1 || !currentStepValid}
              className="rounded-2xl border px-4 py-3 text-sm font-bold disabled:text-slate-300"
            >
              Next
            </button>
          </div>
          <Button disabled={!canComplete}>
            {busy ? "Onboarding..." : "Complete Onboarding"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
