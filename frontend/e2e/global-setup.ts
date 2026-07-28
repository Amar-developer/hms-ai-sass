import { chromium, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { createApiContext, expectApi, loginApi } from "./support/api";
import { authFile, seedFile, stateDir, type ActorName } from "./support/paths";
import type { FrontendSeed, SeedActor } from "./support/types";

const frontendBaseUrl =
  process.env.MEDIZINHUB_FRONTEND_E2E_BASE_URL || "http://127.0.0.1:3100";

const allModules = [
  "patients",
  "appointments",
  "patient_subscriptions",
  "queue",
  "practitioners",
  "scheduling",
  "consultations",
  "billing_basic",
  "billing_advanced",
  "lab",
  "pharmacy",
  "ip",
  "physiotherapy",
  "home_care",
  "reports",
  "audit",
  "settings",
  "notifications",
];

async function post<T>(
  context: APIRequestContext,
  pathName: string,
  data: unknown,
  tenantId?: string,
  expected: number | number[] = 201,
) {
  return expectApi<T>(
    await context.post(pathName, {
      data,
      headers: tenantId ? { "X-Tenant-ID": tenantId } : undefined,
    }),
    expected,
  );
}

async function createRoleUser(
  admin: APIRequestContext,
  tenantId: string,
  branchId: string,
  catalog: Set<string>,
  input: {
    runId: string;
    rolePrefix: string;
    name: string;
    userType: string;
    permissionKeys: string[];
  },
): Promise<SeedActor> {
  const roleKey = `${input.rolePrefix}_${input.runId}`;
  const permissionKeys = Array.from(
    new Set(input.permissionKeys.filter((key) => catalog.has(key))),
  );
  await post(
    admin,
    "/identity/roles",
    {
      name: `${input.name} E2E`,
      key: roleKey,
      permission_keys: permissionKeys,
    },
    tenantId,
  );
  const email = `${roleKey}@e2e.medizinhub.local`;
  const password = "FrontendE2EPass123";
  const user = await post<any>(
    admin,
    "/identity/users",
    {
      name: input.name,
      email,
      password,
      branch_id: branchId,
      user_type: input.userType,
      role_keys: [roleKey],
      must_change_password: false,
    },
    tenantId,
  );
  return {
    name: input.name,
    email,
    password,
    userId: user.id,
    roleKeys: [roleKey],
  };
}

async function saveBrowserState(
  actor: ActorName,
  credentials: SeedActor,
  branchName?: string,
) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(frontendBaseUrl);
  await page.getByPlaceholder("name@clinic.com").fill(credentials.email);
  await page.getByPlaceholder("Enter password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.getByTitle("Profile").waitFor({ state: "visible", timeout: 30_000 });
  if (branchName) {
    const branchControl = page
      .getByText("Branch", { exact: true })
      .filter({ visible: true })
      .first()
      .locator("..")
      .getByRole("button")
      .first();
    if (
      (await branchControl.isVisible().catch(() => false)) &&
      !(await branchControl.innerText()).includes(branchName)
    ) {
      await branchControl.click();
      await page
        .getByRole("button", { name: branchName, exact: true })
        .filter({ visible: true })
        .last()
        .click();
      await branchControl.getByText(branchName, { exact: true }).waitFor();
    }
  }
  await context.storageState({ path: authFile(actor) });
  await browser.close();
}

export default async function globalSetup() {
  fs.rmSync(stateDir, { recursive: true, force: true });
  fs.mkdirSync(stateDir, { recursive: true });
  const runId = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  const superEmail = `super.${runId}@e2e.medizinhub.local`;
  const superPassword = "SuperAdminFrontendE2E123";
  const bootstrap = await createApiContext();
  const superUser = await post<any>(
    bootstrap,
    "/auth/bootstrap-super-admin",
    {
      name: "Frontend E2E Super Admin",
      email: superEmail,
      password: superPassword,
    },
  );
  await bootstrap.dispose();

  const { context: superContext } = await loginApi(superEmail, superPassword);
  const plan = await post<any>(
    superContext,
    "/subscription-plans",
    {
      key: `frontend_e2e_${runId}`,
      name: `Frontend E2E Plan ${runId}`,
      monthly_patient_limit: 5000,
      included_branches: 10,
      included_doctors: 20,
      price_inr_monthly: 0,
      enabled_modules: allModules,
    },
    superUser.tenant_id,
  );
  const adminEmail = `tenant.admin.${runId}@e2e.medizinhub.local`;
  const adminPassword = "TenantAdminFrontendE2E123";
  const onboarded = await post<any>(
    superContext,
    "/tenants/onboard",
    {
      tenant: {
        name: `Frontend E2E Clinic ${runId}`,
        email: `clinic.${runId}@e2e.medizinhub.local`,
        tenant_type: "clinic",
        status: "active",
      },
      branches: [{ name: "Main E2E Branch", code: "MAIN", city: "Chennai" }],
      subscription_plan_id: plan.id,
      subscription_starts_on: new Date().toISOString().slice(0, 10),
      admin_user: {
        name: "Frontend E2E Tenant Admin",
        email: adminEmail,
        password: adminPassword,
        must_change_password: false,
      },
    },
    superUser.tenant_id,
  );
  const tenantId = onboarded.tenant.id;
  const mainBranchId = onboarded.branches[0].id;
  let branchId = mainBranchId;

  const { context: adminContext, user: adminUser } = await loginApi(
    adminEmail,
    adminPassword,
  );
  const secondBranch = await post<any>(
    adminContext,
    `/tenants/${tenantId}/branches`,
    { name: "North E2E Branch", code: `NORTH_${runId}`, city: "Chennai" },
    tenantId,
  );
  branchId = secondBranch.id;
  const department = await post<any>(
    adminContext,
    `/tenants/${tenantId}/departments`,
    {
      name: "General Medicine",
      code: `GEN_${runId}`.toUpperCase(),
      branch_id: branchId,
    },
    tenantId,
  );
  const secondDepartment = await post<any>(
    adminContext,
    `/tenants/${tenantId}/departments`,
    {
      name: "Internal Medicine",
      code: `INT_${runId}`.toUpperCase(),
      branch_id: branchId,
    },
    tenantId,
  );
  const permissions = await expectApi<any[]>(
    await adminContext.get("/identity/permissions", {
      headers: { "X-Tenant-ID": tenantId },
    }),
    200,
  );
  const catalog = new Set(permissions.map((row) => row.key));
  const receptionist = await createRoleUser(
    adminContext,
    tenantId,
    branchId,
    catalog,
    {
      runId,
      rolePrefix: "receptionist",
      name: "Frontend E2E Receptionist",
      userType: "receptionist",
      permissionKeys: [
        "patients.read",
        "patients.create",
        "patients.edit",
        "appointments.manage",
        "appointments.read",
        "appointments.create",
        "appointments.edit",
        "queue.manage",
        "queue.read",
        "queue.manage",
        "practitioners.read",
        "scheduling.read",
        "departments.read",
        "branches.read",
      ],
    },
  );
  const reader = await createRoleUser(
    adminContext,
    tenantId,
    branchId,
    catalog,
    {
      runId,
      rolePrefix: "patient_reader",
      name: "Frontend E2E Reader",
      userType: "staff",
      permissionKeys: ["patients.read", "error_logs.read"],
    },
  );
  const doctor = await createRoleUser(
    adminContext,
    tenantId,
    branchId,
    catalog,
    {
      runId,
      rolePrefix: "doctor",
      name: "Frontend E2E Doctor",
      userType: "doctor",
      permissionKeys: [
        "patients.read",
        "appointments.read",
        "queue.manage",
        "queue.read",
        "consultations.edit",
        "consultations.read",
        "consultations.create",
        "consultations.edit",
        "practitioners.read",
        "scheduling.read",
        "billing.read",
        "invoices.read",
      ],
    },
  );
  const practitioner = await post<any>(
    adminContext,
    "/practitioners",
    {
      user_id: doctor.userId,
      full_name: "Dr Frontend E2E",
      practitioner_type: "doctor",
      primary_specialty: "General Medicine",
      registration_number: `REG-${runId}`,
      branch_ids: [branchId],
      department_ids: [department.id, secondDepartment.id],
    },
    tenantId,
  );
  await post(
    adminContext,
    `/practitioners/${practitioner.id}/schedules`,
    {
      branch_id: branchId,
      department_id: department.id,
      weekday: new Date().getDay() === 0 ? 6 : new Date().getDay() - 1,
      start_time: "09:00:00",
      end_time: "18:00:00",
      slot_minutes: 15,
    },
    tenantId,
  );
  const patient = await post<any>(
    adminContext,
    "/patients",
    {
      branch_id: branchId,
      full_name: `Frontend Seed Patient ${runId}`,
      mobile: `9${String(Date.now()).slice(-9)}`,
      age_years: 35,
      gender: "male",
      address: "Frontend E2E Address",
    },
    tenantId,
  );
  await post(
    adminContext,
    "/billing/doctor-fee-rules",
    {
      appointment_type: "op",
      fee_amount: 1000,
      share_type: "percentage",
      doctor_share_percentage: 60,
      branch_id: branchId,
      practitioner_id: practitioner.id,
      department_id: department.id,
      treatment_type: "general_consultation",
    },
    tenantId,
  );
  const booking = await post<any>(
    adminContext,
    "/appointments",
    {
      branch_id: branchId,
      patient_id: patient.id,
      department_id: department.id,
      practitioner_id: practitioner.id,
      appointment_type: "op",
      appointment_date: new Date().toISOString().slice(0, 10),
      reason: "Frontend E2E consultation",
    },
    tenantId,
  );
  const consultation = await post<any>(
    adminContext,
    "/consultations",
    {
      appointment_id: booking.appointment.id,
      treatment_type: "general_consultation",
      chief_complaint: "Frontend E2E fever",
      diagnosis: "Viral fever",
      clinical_notes: "Hydration advised",
      prescription_text: "Paracetamol 500mg",
      lab_referral_text: "Complete Blood Count",
    },
    tenantId,
  );
  await post(
    adminContext,
    `/consultations/${consultation.id}/sign`,
    {},
    tenantId,
    200,
  );
  const invoiceDetail = await post<any>(
    adminContext,
    "/billing/invoices/from-consultation",
    { consultation_id: consultation.id },
    tenantId,
  );
  const queueBooking = await post<any>(
    adminContext,
    "/appointments",
    {
      branch_id: branchId,
      patient_id: patient.id,
      department_id: department.id,
      practitioner_id: practitioner.id,
      appointment_type: "op",
      appointment_date: new Date().toISOString().slice(0, 10),
      reason: "Frontend E2E queue workflow",
    },
    tenantId,
  );
  const membershipPlan = await post<any>(
    adminContext,
    "/patient-subscriptions/plans",
    {
      branch_id: branchId,
      name: `Frontend Membership ${runId}`,
      price_amount: 500,
      duration_days: 30,
      free_consultations: 1,
      free_consultation_department_ids: [department.id],
    },
    tenantId,
  );
  const labTest = await post<any>(
    adminContext,
    "/lab/catalog/tests",
    {
      branch_id: branchId,
      code: `CBC_${runId}`.toUpperCase(),
      name: `Complete Blood Count ${runId}`,
      sample_type: "Blood",
      default_price: 350,
    },
    tenantId,
  );
  await post(
    adminContext,
    "/lab/orders",
    {
      branch_id: branchId,
      patient_id: patient.id,
      source: "op_direct",
      tests: labTest.name,
      test_ids: [labTest.id],
    },
    tenantId,
  );
  const medicine = await post<any>(
    adminContext,
    "/pharmacy/medicines",
    {
      branch_id: branchId,
      code: `PCM_${runId}`.toUpperCase(),
      name: `Paracetamol 500mg ${runId}`,
      generic_name: "Paracetamol",
      form: "Tablet",
      default_sale_price: 5,
      reorder_level: 5,
    },
    tenantId,
  );
  await post(
    adminContext,
    "/pharmacy/issues",
    {
      branch_id: branchId,
      patient_id: patient.id,
      source: "op_direct",
      medicine_text: medicine.name,
      amount: 10,
    },
    tenantId,
  );
  await post(
    adminContext,
    "/home-care/bookings",
    {
      branch_id: branchId,
      patient_id: patient.id,
      assigned_staff_name: "Frontend E2E Nurse",
      staff_type: "nurse",
      booking_type: "home_care",
      recurrence: "daily",
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
      location: "Frontend E2E Home",
      services: [
        {
          service_category: "home_care_service",
          description: `Nursing Visit ${runId}`,
          quantity: 2,
          unit_amount: 1200,
        },
      ],
    },
    tenantId,
  );
  await post(
    adminContext,
    "/ip/admissions",
    {
      branch_id: branchId,
      patient_id: patient.id,
      ward: "General Ward",
      bed: `E2E-${runId}`,
      reason: "Frontend E2E observation",
    },
    tenantId,
  );
  const equipment = await post<any>(
    adminContext,
    "/physiotherapy/equipment",
    {
      branch_id: branchId,
      name: `Stimulator ${runId}`,
      modality_type: "muscle_stimulator",
      is_portable: true,
    },
    tenantId,
  );
  const physioCase = await post<any>(
    adminContext,
    "/physiotherapy/cases",
    {
      branch_id: branchId,
      patient_id: patient.id,
      care_context: "op",
      assessment_date: new Date().toISOString().slice(0, 10),
      body_region: "Knee",
      condition: "Stiffness",
      pain_score: 6,
      planned_sessions: 3,
      treatment_goal: "Improve range of motion",
    },
    tenantId,
  );
  await post(
    adminContext,
    `/physiotherapy/cases/${physioCase.id}/sessions`,
    {
      session_date: new Date().toISOString().slice(0, 10),
      equipment_id: equipment.id,
      modality_type: "muscle_stimulator",
      treatment_area: "Knee",
      duration_minutes: 20,
      charge_amount: 800,
    },
    tenantId,
  );
  const missingPath = `/frontend-e2e-missing-${runId}`;
  await expectApi(
    await adminContext.get(missingPath, {
      headers: { "X-Tenant-ID": tenantId },
    }),
    404,
  );
  const errors = await expectApi<any>(
    await adminContext.get("/error-logs", {
      headers: { "X-Tenant-ID": tenantId },
      params: { q: missingPath },
    }),
    200,
  );

  const limitedPlan = await post<any>(
    superContext,
    "/subscription-plans",
    {
      key: `frontend_limited_${runId}`,
      name: `Frontend Limited Plan ${runId}`,
      monthly_patient_limit: 100,
      included_branches: 1,
      included_doctors: 1,
      price_inr_monthly: 0,
      enabled_modules: ["patients", "appointments", "queue", "billing_basic"],
    },
    superUser.tenant_id,
  );
  const limitedAdminEmail = `limited.admin.${runId}@e2e.medizinhub.local`;
  const limitedOnboarded = await post<any>(
    superContext,
    "/tenants/onboard",
    {
      tenant: {
        name: `Frontend Isolated Clinic ${runId}`,
        email: `isolated.${runId}@e2e.medizinhub.local`,
        tenant_type: "clinic",
        status: "active",
      },
      branches: [{ name: "Isolated Branch", code: "ISO", city: "Madurai" }],
      subscription_plan_id: limitedPlan.id,
      subscription_starts_on: new Date().toISOString().slice(0, 10),
      admin_user: {
        name: "Isolated Admin",
        email: limitedAdminEmail,
        password: adminPassword,
        must_change_password: false,
      },
    },
    superUser.tenant_id,
  );
  const { user: limitedAdminUser, context: limitedAdminContext } = await loginApi(
    limitedAdminEmail,
    adminPassword,
  );
  await limitedAdminContext.dispose();

  const seed: FrontendSeed = {
    runId,
    tenantId,
    tenantName: onboarded.tenant.name,
    limitedTenantId: limitedOnboarded.tenant.id,
    fullPlanId: plan.id,
    branchId,
    branchName: secondBranch.name,
    secondBranchId: mainBranchId,
    departmentId: department.id,
    secondDepartmentId: secondDepartment.id,
    practitionerId: practitioner.id,
    patientId: patient.id,
    patientName: patient.full_name,
    queueEntryId: queueBooking.queue_entry.id,
    consultationId: consultation.id,
    invoiceId: invoiceDetail.invoice.id,
    invoiceNumber: invoiceDetail.invoice.invoice_number,
    membershipPlanId: membershipPlan.id,
    errorLogId: errors.items[0].id,
    errorRoute: `/api/v1${missingPath}`,
    actors: {
      "super-admin": {
        name: "Frontend E2E Super Admin",
        email: superEmail,
        password: superPassword,
        userId: superUser.id,
        roleKeys: ["super_admin"],
      },
      "tenant-admin": {
        name: "Frontend E2E Tenant Admin",
        email: adminEmail,
        password: adminPassword,
        userId: adminUser.id,
        roleKeys: adminUser.roles,
      },
      receptionist,
      reader,
      doctor,
      "limited-admin": {
        name: "Isolated Admin",
        email: limitedAdminEmail,
        password: adminPassword,
        userId: limitedAdminUser.id,
        roleKeys: limitedAdminUser.roles,
      },
    },
  };
  fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2));
  await adminContext.dispose();
  await superContext.dispose();

  for (const actor of Object.keys(seed.actors) as ActorName[]) {
    await saveBrowserState(
      actor,
      seed.actors[actor],
      ["tenant-admin", "receptionist", "reader", "doctor"].includes(actor)
        ? seed.branchName
        : undefined,
    );
  }

  fs.writeFileSync(
    path.join(stateDir, "ready"),
    `${new Date().toISOString()}\n`,
  );
}
