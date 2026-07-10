"use client";

import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  LayoutGrid,
  LockKeyhole,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { useRef, useState } from "react";
import { Badge, Button, Card, Field, Input, Select } from "@/app/components/common/ui";
import { tenantTypes } from "../../constants";
import {
  readTenantOnboardingDraft,
} from "../../helpers";
import { OnboardingReview } from "@/features/admin/components/OnboardingReview";
import { PlanModulePreview } from "@/features/admin/components/PlanModulePreview";
import { TemplateChecklist } from "@/features/admin/components/TemplateChecklist";



export function CreateTenantForm({
  plans,
  moduleRegistry,
  templates,
  busy,
  createTenant,
}: any) {
  const [branches, setBranches] = useState([{ id: Date.now() }]);
  const [step, setStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    () => new Set(),
  );
  const [, setReviewTick] = useState(0);
  const formRef = useRef<HTMLFormElement | null>(null);
  const steps = [
    { label: "Tenant Details", shortLabel: "Tenant", icon: Building2 },
    { label: "Plan & Branches", shortLabel: "Plan", icon: LayoutGrid },
    { label: "Included Modules", shortLabel: "Modules", icon: ShieldCheck },
    { label: "Default Templates", shortLabel: "Templates", icon: ClipboardCheck },
    { label: "Tenant Admin", shortLabel: "Admin", icon: CircleUserRound },
    { label: "Review & Create", shortLabel: "Review", icon: Check },
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
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const branchCodes = draft.branches.map((branch: any) =>
    String(branch.code || "").trim().toLowerCase(),
  );
  const validationMessages = [
    draft.name.length < 2
      ? "Tenant name must contain at least 2 characters."
      : draft.email && !emailPattern.test(draft.email)
        ? "Enter a valid tenant email address."
        : draft.country.length !== 2
          ? "Country must be a 2-letter code."
          : !draft.tenantType || !draft.status || !draft.timezone
            ? "Tenant type, status, and timezone are required."
            : "",
    !draft.planId
      ? "Select a subscription plan."
      : !draft.branches.length
        ? "Add at least one branch."
        : draft.branches.some(
              (branch: any) =>
                branch.name.trim().length < 2 ||
                branch.code.trim().length < 2,
            )
          ? "Every branch name and code must contain at least 2 characters."
          : new Set(branchCodes).size !== branchCodes.length
            ? "Branch codes must be unique within the tenant."
            : "",
    !draft.planId ? "Select a subscription plan before reviewing modules." : "",
    "",
    draft.adminName.length < 2
      ? "Admin name must contain at least 2 characters."
      : !emailPattern.test(draft.adminEmail)
        ? "Enter a valid admin email address."
        : draft.adminPassword.length < 8
          ? "Temporary password must contain at least 8 characters."
          : "",
  ];
  const validSteps = validationMessages.map((message) => !message);
  const firstInvalidStep = validSteps.findIndex((valid) => !valid);
  const allSetupValid = firstInvalidStep === -1;
  const setupStepsCompleted = validSteps.every(
    (valid, index) => valid && completedSteps.has(index),
  );
  const canComplete =
    step === steps.length - 1 && setupStepsCompleted && !busy;
  const currentStepValid =
    step >= validSteps.length ? allSetupValid : validSteps[step];
  const completedCount = validSteps.filter(
    (valid, index) => valid && completedSteps.has(index),
  ).length;

  function refreshDraft() {
    setReviewTick((value) => value + 1);
  }
  function isStepUnlocked(index: number) {
    if (index === 0) return true;
    return validSteps
      .slice(0, index)
      .every((valid, previousIndex) => valid && completedSteps.has(previousIndex));
  }
  function goToStep(index: number) {
    if (isStepUnlocked(index)) setStep(index);
  }
  function nextStep() {
    if (!currentStepValid) return;
    if (step < validSteps.length) {
      setCompletedSteps((previous) => {
        const next = new Set(previous);
        next.add(step);
        return next;
      });
    }
    setStep(Math.min(steps.length - 1, step + 1));
  }
  function submitWizard(event: any) {
    event.preventDefault();
    if (step < steps.length - 1) {
      nextStep();
      return;
    }
    if (!canComplete) {
      const firstIncompleteStep = validSteps.findIndex(
        (valid, index) => !valid || !completedSteps.has(index),
      );
      setStep(firstIncompleteStep >= 0 ? firstIncompleteStep : 0);
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
  const currentStep = steps[step];
  const CurrentStepIcon = currentStep.icon;

  return (
    <Card className="overflow-hidden border-slate-200 bg-white p-0 shadow-sm">
      <div className="border-b border-slate-200 bg-white px-5 py-4 lg:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue" className="rounded-md px-2 py-1 text-[10px] uppercase">
                Tenant Setup
              </Badge>
              <span className="text-xs font-semibold text-slate-500">
                Billing workspace provisioning
              </span>
            </div>
            <h3 className="mt-2 text-lg font-black text-slate-950 lg:text-xl">
              New Tenant Onboarding
            </h3>
            <p className="mt-1 text-xs text-slate-500 lg:text-sm">
              Configure plan, branches, templates, and the first billing admin account.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[520px]">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-500">Progress</p>
              <p className="mt-1 text-sm font-black text-slate-950">{completedCount}/5 complete</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-500">Branches</p>
              <p className="mt-1 text-sm font-black text-slate-950">{branches.length} configured</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-500">Plan</p>
              <p className="mt-1 truncate text-sm font-black text-slate-950">{draft.planName || "Pending"}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${(completedCount / 5) * 100}%` }}
          />
        </div>
      </div>
      <div className="grid lg:grid-cols-[245px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-slate-50 p-3 lg:border-b-0 lg:border-r lg:p-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-1">
          {steps.map(({ label, shortLabel, icon: StepIcon }, index) => {
            const stepValid =
              index < validSteps.length ? validSteps[index] : allSetupValid;
            const complete =
              index < validSteps.length
                ? stepValid && completedSteps.has(index)
                : setupStepsCompleted;
            const locked = !isStepUnlocked(index);
            return (
              <button
                key={label}
                type="button"
                onClick={() => goToStep(index)}
                disabled={locked}
                className={`group flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition disabled:cursor-not-allowed ${
                  step === index
                    ? "border-blue-300 bg-white text-blue-950 shadow-sm"
                    : complete
                      ? "border-emerald-200 bg-white text-emerald-900 hover:border-emerald-300"
                      : locked
                        ? "border-transparent bg-slate-100 text-slate-400"
                        : "border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-white"
                }`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                    step === index
                      ? "bg-blue-600 text-white"
                      : complete
                        ? "bg-emerald-600 text-white"
                        : "bg-white text-slate-500"
                  }`}
                >
                  {locked ? (
                    <LockKeyhole size={14} />
                  ) : complete ? (
                    <Check size={16} />
                  ) : (
                    <StepIcon size={16} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Step {index + 1}
                  </span>
                  <span className="hidden truncate text-xs font-bold lg:block">
                    {label}
                  </span>
                  <span className="block truncate text-[10px] font-bold sm:text-xs lg:hidden">
                    {shortLabel}
                  </span>
                </span>
                {complete && index !== step && (
                  <Pencil size={12} className="ml-auto hidden lg:block" />
                )}
              </button>
            );
          })}
          </div>
          <div className="mt-4 hidden rounded-lg border border-slate-200 bg-white p-3 lg:block">
            <p className="text-xs font-bold text-slate-950">Provisioning rule</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Tenant access follows the selected billing plan. The first admin receives tenant-wide access.
            </p>
          </div>
        </aside>
      <form
        ref={formRef}
        onSubmit={submitWizard}
        onChange={refreshDraft}
        onInput={refreshDraft}
        noValidate
        className="min-w-0 bg-white"
      >
        <input type="hidden" name="branchCount" value={branches.length} />
        <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4 lg:px-6">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-blue-100 bg-white text-blue-700">
              <CurrentStepIcon size={20} />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">
                Step {step + 1} of {steps.length}
              </p>
              <h4 className="mt-1 text-lg font-black text-slate-950">
                {currentStep.label}
              </h4>
              <p className="mt-1 text-xs text-slate-500 ">
                {stepHelp[step]}
              </p>
              {!currentStepValid && step < 5 && (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  {validationMessages[step]}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="min-h-[430px] px-5 py-5 lg:px-6">
        <div className={step === 0 ? "grid gap-4 md:grid-cols-3" : "hidden"}>
          <Field label="Tenant Name">
            <Input
              name="name"
              required
              placeholder="Clinic name"
              className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
            />
          </Field>
          <Field label="Legal Name">
            <Input
              name="legalName"
              placeholder="Registered legal name"
              className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
            />
          </Field>
          <Field label="Tenant Type">
            <Select
              name="tenantType"
              className="rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm"
            >
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
              defaultValue="trial"
              className="rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm"
            >
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </Select>
          </Field>
          <Field label="Tenant Logo">
            <Input
              name="logoFile"
              type="file"
              accept="image/*"
              className="rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm input-file"
            />
          </Field>
          <Field label="Email">
            <Input
              name="email"
              type="email"
              className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
            />
          </Field>
          <Field label="Phone">
            <Input
              name="phone"
              className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
            />
          </Field>
          <Field label="Country">
            <Input
              name="country"
              defaultValue="IN"
              maxLength={2}
              className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
            />
          </Field>
          <Field label="Timezone">
            <Input
              name="timezone"
              defaultValue="Asia/Kolkata"
              className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
            />
          </Field>
          <div className="md:col-span-3">
            <Field label="Address">
              <Input
                name="address"
                className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
              />
            </Field>
          </div>
          <div className="md:col-span-3">
            <Field label="Description">
              <Input
                name="description"
                placeholder="Clinic, hospital, or group description"
                className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
              />
            </Field>
          </div>
        </div>
        <div className={step === 1 ? "grid gap-4" : "hidden"}>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Subscription Model">
              <Select name="planId" required className='rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm'>
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
                <p className="text-xs lg:text-sm text-slate-500">
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
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold hover:bg-slate-50"
              >
                Add Branch
              </button>
            </div>
            <div className="mt-3 grid gap-3">
              {branches.map((branch: any, index: number) => (
                <div
                  key={branch.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <b className="text-sm font-black text-slate-950">Branch {index + 1}</b>
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
                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600"
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
                        className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
                      />
                    </Field>
                    <Field label="Branch Code">
                      <Input
                        name={`branchCode_${index}`}
                        defaultValue={index === 0 ? "MAIN" : ""}
                        placeholder={`BR${index + 1}`}
                        required
                        className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
                      />
                    </Field>
                    <Field label="City">
                      <Input
                        name={`branchCity_${index}`}
                        placeholder="Chennai"
                        className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
                      />
                    </Field>
                    <Field label="Area">
                      <Input
                        name={`branchArea_${index}`}
                        placeholder="Chrompet"
                        className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
                      />
                    </Field>
                    <Field label="State">
                      <Input
                        name={`branchState_${index}`}
                        placeholder="Tamil Nadu"
                        className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="Branch Address">
                        <Input
                          name={`branchAddress_${index}`}
                          className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
                        />
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
              className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
            />
          </Field>
          <Field label="Admin Email">
            <Input
              name="adminEmail"
              type="email"
              placeholder="admin@clinic.local"
              required
              className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
            />
          </Field>
          <Field label="Temporary Password">
            <Input
              name="adminPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              required
              className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
            />
          </Field>
          <Field label="Admin Mobile">
            <Input
              name="adminMobile"
              placeholder="Optional"
              className="rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-xs lg:text-sm"
            />
          </Field>
          <Field label="Must Change Password">
            <Select
              name="adminMustChangePassword"
              defaultValue="true"
              className="rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 text-xs lg:text-sm"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </Select>
          </Field>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs lg:text-sm text-slate-600 md:col-span-3">
            The wizard copies the Tenant Admin role template automatically and
            creates the first tenant admin user.
          </div>
        </div>
        <div className={step === 5 ? "grid gap-4" : "hidden"}>
          <OnboardingReview
            draft={draft}
            validSteps={validSteps}
            steps={steps.map((item) => item.label)}
            onEdit={setStep}
          />
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-xs lg:text-sm font-semibold text-blue-700">
            Submitting this wizard creates the tenant, assigns the selected
            catalog plan, copies selected defaults, creates the tenant admin
            user, and returns to the Tenants listing with the latest tenant
            first.
          </div>
        </div>
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur lg:px-6">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <ChevronLeft size={15} />
              Previous
            </button>
            <button
              type="button"
              onClick={nextStep}
              disabled={step === steps.length - 1 || !currentStepValid}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              Save & Continue
              <ChevronRight size={15} />
            </button>
          </div>
          <Button
            disabled={!canComplete}
            className="rounded-lg px-5 py-2.5 text-xs lg:text-sm"
          >
            {busy ? "Onboarding..." : "Complete Onboarding"}
          </Button>
        </div>
      </form>
      </div>
    </Card>
  );
}
