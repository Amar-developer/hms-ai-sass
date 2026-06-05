# MedizinHub HMS Project Workflow And Code Map

This guide is for a new developer or fresher joining the project. It explains what each major file does, how the frontend talks to the backend, how modules map to APIs and database tables, where roles and permissions live, and where to look when something breaks.

## 1. Product In One Paragraph

MedizinHub HMS is a multi-tenant healthcare SaaS for clinics, hospitals, physiotherapy centers, and multi-branch healthcare groups. One platform supports super admin SaaS operations, tenant admin configuration, reception workflows, doctor consultation, patients/EMR, queue, IP admission, lab, pharmacy, physiotherapy, billing, subscriptions, reports, and audit.

The most important product rule is tenant isolation: every live healthcare record belongs to a tenant, and most records also belong to a branch.

## 2. High-Level Architecture

Frontend:

- Next.js app using React components.
- Feature screens live in `features/`.
- Shared UI primitives live in `components/ui.tsx`.
- Shell/navigation/session state lives in `features/shell/`.
- API helper functions live in `lib/api.ts`.

Backend:

- FastAPI app.
- API route files live in `backend/app/api/v1/`.
- SQLModel database models live in `backend/app/modules/*/models.py`.
- Pydantic request/response schemas live in `backend/app/modules/*/schemas.py`.
- Permissions live in `backend/app/modules/identity/permissions.py`.
- Alembic migrations live in `backend/alembic/versions/`.

Database:

- SQLModel models define tables.
- Alembic migrations update the real database.
- Most tables include `tenant_id`; branch-scoped tables also include `branch_id`.

## 3. Startup Flow

1. Browser opens `app/page.tsx`.
2. `app/page.tsx` uses `features/shell/useAppController.ts`.
3. If no session exists, the login screen is shown.
4. Login calls `POST /api/v1/auth/login`.
5. `useAppController` stores `token`, `tenantId`, `email`, and `user` in local storage.
6. `loadLiveData()` loads branches, departments, patients, appointments, queue, consultations, invoices, IP admissions, and practitioners based on permissions.
7. `features/shell/AppShell.tsx` renders sidebar, top header, breadcrumbs, profile card, and the active module page.

## 4. Frontend File Map

| File | Purpose |
| --- | --- |
| `app/page.tsx` | App entry point. It decides whether to show login or the authenticated app shell. |
| `features/shell/useAppController.ts` | Main frontend state controller. Handles login session, tenant switch, branch/department state, live data loading, permission-derived module access, and props passed to screens. |
| `features/shell/AppShell.tsx` | Main app frame. Sidebar, header, tenant/branch/department controls, profile menu, breadcrumbs, back/forward history, and page router. |
| `lib/api.ts` | API base URL, authenticated JSON requests, blob download, multipart upload. Use `apiFetch`, `apiBlob`, `apiUpload`. |
| `lib/navigation.ts` | Sidebar modules and role-to-module defaults. |
| `lib/moduleAccess.ts` | Checks if a module can open for role and tenant. |
| `lib/liveData.ts` | Converts backend patient/appointment data into frontend shape. |
| `lib/authPresets.ts` | Demo login presets and visible demo role labels. |
| `components/ui.tsx` | Shared simple UI components: `Card`, `Badge`, `Field`, `Input`, `Select`, `Button`. |
| `features/dashboard/Dashboard.tsx` | Dashboard cards and click-through navigation. |
| `features/platform/SuperAdminDashboard.tsx` | Super admin tenant, users, roles, branches, departments, subscriptions, settings. |
| `features/admin/TenantAdmin.tsx` | Tenant admin controls for users, roles, branch/department/settings where permitted. |
| `features/appointments/AppointmentCalendarBooking.tsx` | Appointment creation, calendar/list booking workflow. |
| `features/queue/TokenQueue.tsx` | Token queue display, call/requeue/workflow links. |
| `features/patients/Patient.tsx` | Patient/EMR management, registration, patient photo/document behavior. |
| `features/doctors/Doctors.tsx` | Practitioner/doctor CRUD and branch/department mapping. |
| `features/scheduling/Scheduling.tsx` | Practitioner schedules and availability. |
| `features/doctor/DoctorConsultation.tsx` | Doctor dashboard and consultation workspace. |
| `features/ip/IPAdmission.tsx` | IP admission, ward/room/bed selection, Aadhaar/file upload, treatment, MAR, billing, discharge. |
| `features/lab/Lab.tsx` | Lab catalog, orders, sample/result release. |
| `features/pharmacy/Pharmacy.tsx` | Pharmacy catalog, purchase, returns, stock, medicine issue. |
| `features/physiotherapy/Physiotherapy.tsx` | OP/IP physiotherapy cases, equipment, consent uploads, sessions, billing. |
| `features/billing/Billing.tsx` | Invoices, payments, receipts, billing reports. |
| `features/reports/Reports.tsx` | Reports and exports. |
| `features/patient_subscriptions/PatientSubscriptions.tsx` | Patient membership plan UI. |

### Important Frontend Functions

| Function/Area | File | What It Does |
| --- | --- | --- |
| `handleLogin` | `features/shell/useAppController.ts` | Calls backend login, stores session, initializes tenant/branch/department context, loads live data. |
| `handleLogout` | `features/shell/useAppController.ts` | Clears local session and returns user to login. |
| `handlePasswordChanged` | `features/shell/useAppController.ts` | Closes password change state after successful password update. |
| `switchTenant` | `features/shell/useAppController.ts` | Super admin tenant switch. Updates active tenant and reloads tenant-specific data. |
| `loadLiveData` | `features/shell/useAppController.ts` | Central frontend data loader. Most module data shown on dashboard and screens comes through this flow. |
| `setSelectedBranchId` | `features/shell/useAppController.ts` / `AppShell.tsx` | Changes branch where the current role is allowed to change it. |
| `setSelectedDepartmentId` | `features/shell/useAppController.ts` / `AppShell.tsx` | Changes department where the current role is allowed to change it. |
| `navigatePage` | `features/shell/AppShell.tsx` | Opens a module page and records page history for breadcrumbs/back/forward. |
| `renderPage` | `features/shell/AppShell.tsx` | Chooses which feature component to display for the active module id. |
| `apiFetch` | `lib/api.ts` | Main JSON API client. Adds auth token and tenant header. |
| `apiUpload` | `lib/api.ts` | Multipart upload client for patient docs, IP documents, consent forms, etc. |

When debugging frontend data, start with `useAppController.ts`. When debugging layout/navigation/header behavior, start with `AppShell.tsx`.

## 5. Backend File Map

| File/Folder | Purpose |
| --- | --- |
| `backend/app/main.py` | FastAPI app creation, CORS, middleware, API router, static uploads mount, startup tasks. |
| `backend/app/api/router.py` | Includes all v1 routers. If a new API module is created, add it here. |
| `backend/app/core/database.py` | SQLModel engine/session dependency. |
| `backend/app/core/auth.py` | Current-user and permission dependencies. |
| `backend/app/core/access_control.py` | Branch and doctor scoping helpers. |
| `backend/app/core/tenant_context.py` | Reads required tenant id from request context/header. |
| `backend/app/core/middleware.py` | Tenant context middleware. |
| `backend/app/core/uploads.py` | Upload validation and saving files to `uploads/`. |
| `backend/app/core/schema_repair.py` | Dev safety repair for recently added upload columns when hot reload runs before migration. |
| `backend/app/models.py` | Imports all SQLModel models so metadata is complete. |
| `backend/app/modules/*/models.py` | Database table models. |
| `backend/app/modules/*/schemas.py` | API request/response schemas. |
| `backend/app/api/v1/*.py` | FastAPI endpoints for each module. |
| `backend/alembic/versions/*.py` | Database migrations. |
| `backend/tests/*.py` | Backend pytest coverage by module. |

### Backend Request Lifecycle

1. Request reaches `backend/app/main.py`.
2. Middleware in `backend/app/core/middleware.py` reads tenant context.
3. Router is selected through `backend/app/api/router.py`.
4. Endpoint dependency checks auth and permission using `backend/app/core/auth.py`.
5. Endpoint reads tenant id using `require_tenant_id`.
6. Endpoint applies branch/doctor scope helpers where needed.
7. Endpoint reads/writes SQLModel models through `get_session`.
8. Important writes create audit/notification records where implemented.
9. Response is serialized through module schemas.

### Backend Module Pattern

Most modules follow this structure:

| File | Responsibility |
| --- | --- |
| `models.py` | Database table classes and enum values. |
| `schemas.py` | API request/response shapes. Frontend should match these fields. |
| `service.py` | Reusable business logic when a module has more than simple CRUD. |
| `backend/app/api/v1/<module>.py` | Endpoint routes, permission dependencies, tenant/branch filtering, validation. |
| `backend/tests/test_<module>.py` | Expected behavior and permission coverage. |

If a module does not have `service.py`, the endpoint file currently owns most business logic.

## 6. Module Map: Frontend, API, Models

| Module | Frontend | API Router | Models | Schemas |
| --- | --- | --- | --- | --- |
| Platform/Super Admin | `features/platform/SuperAdminDashboard.tsx` | `backend/app/api/v1/tenants.py`, `subscriptions.py`, `identity.py`, `modules.py` | `tenants/models.py`, `subscriptions/models.py`, `identity/models.py` | same module `schemas.py` |
| Tenant Admin | `features/admin/TenantAdmin.tsx` | `identity.py`, `tenants.py`, `settings.py` | `identity`, `tenants`, `settings` | same module `schemas.py` |
| Patients/EMR | `features/patients/Patient.tsx` | `patients.py` | `patients/models.py` | `patients/schemas.py` |
| Appointments | `features/appointments/AppointmentCalendarBooking.tsx` | `appointments.py` | `appointments/models.py` | `appointments/schemas.py` |
| Queue | `features/queue/TokenQueue.tsx` | `queue.py` | `queue/models.py` | `queue` service/models |
| Doctors/Practitioners | `features/doctors/Doctors.tsx` | `practitioners.py` | `practitioners/models.py` | `practitioners/schemas.py` |
| Scheduling | `features/scheduling/Scheduling.tsx` | `practitioners.py` | `practitioners/models.py` | `practitioners/schemas.py` |
| Consultations | `features/doctor/DoctorConsultation.tsx` | `consultations.py` | `consultations/models.py` | `consultations/schemas.py` |
| IP Admission | `features/ip/IPAdmission.tsx` | `ip.py` | `ip/models.py` | `ip/schemas.py` |
| Lab | `features/lab/Lab.tsx` | `lab.py` | `lab/models.py` | `lab/schemas.py` |
| Pharmacy | `features/pharmacy/Pharmacy.tsx` | `pharmacy.py` | `pharmacy/models.py` | `pharmacy/schemas.py` |
| Physiotherapy | `features/physiotherapy/Physiotherapy.tsx` | `physiotherapy.py` | `physiotherapy/models.py` | `physiotherapy/schemas.py` |
| Billing | `features/billing/Billing.tsx` | `billing.py` | `billing/models.py` | `billing/schemas.py` |
| Reports/Audit | `features/reports/Reports.tsx` | `audit.py`, report endpoints in modules | `audit/models.py` | `audit/schemas.py` |

### API Responsibility Map

| API File | Main Responsibility |
| --- | --- |
| `health.py` | Health checks and basic platform liveness. |
| `modules.py` | Enabled module/entitlement information. |
| `identity.py` | Login, users, roles, permissions, password change. |
| `tenants.py` | Tenants, branches, departments, tenant metadata. |
| `subscriptions.py` | SaaS plans, subscriptions, invoices, credits, access enforcement. |
| `patients.py` | Patient registration, contacts, alerts, patient document/photo upload. |
| `practitioners.py` | Doctors/practitioners, branch/department mappings, schedules, leaves, rooms. |
| `appointments.py` | Appointment booking, status changes, visit purpose flows. |
| `queue.py` | Queue token generation, call/requeue/complete flow. |
| `consultations.py` | Doctor consultation, vitals, complaints, diagnosis, medicine, referral, sign/addendum. |
| `billing.py` | Invoices, invoice items, payments, credit notes, tax rules, settlements. |
| `ip.py` | IP rooms, admission, Aadhaar/document upload, care notes, MAR, billing items, discharge. |
| `lab.py` | Lab catalog, orders, packages, samples, results, templates. |
| `pharmacy.py` | Medicine catalog, batches, suppliers, purchase, return, stock ledger, issue. |
| `physiotherapy.py` | Physiotherapy cases, consent uploads, equipment, sessions, invoice/payment helpers. |
| `settings.py` | Tenant admin settings. |
| `notifications.py` | Notification event APIs. |
| `audit.py` | Audit trail read APIs. |

## 7. Database Schema Overview

Core tenant tables:

- `tenant`: customer or platform tenant.
- `branch`: branch/center/hospital location.
- `department`: specialty/department.
- `tenantsubscription`, `subscriptionplan`, `subscriptioninvoice`, `subscriptioncredit`: SaaS subscription model.

Identity and RBAC:

- `user`: login user.
- `role`: role key/name scoped to tenant.
- `permission`: permission key catalog.
- `userrole`: user-role mapping.
- `rolepermission`: role-permission mapping.
- `authsession`: login/session tracking.

Clinical/front-office:

- `patient`, `patientcontact`, `patientalert`
- `appointment`
- `queueentry`, `queueevent`
- `consultation`, `consultationvital`, `consultationcomplaint`, `consultationdiagnosis`, `consultationmedicine`, `consultationreferral`, `consultationaddendum`
- `practitioner`, `practitionerbranch`, `practitionerdepartment`, `practitionerschedule`, `practitionerleave`, `practitionerroomassignment`

Hospital/IP:

- `iproom`
- `ipadmission`
- `iptreatment`
- `ipconsultation`
- `ipconsentform`
- `ipdischargesummary`
- `ipcharge`
- `ipbillingitem`
- `ipmedicationorder`
- `ipmedicationadministration`

Diagnostics/medicines:

- `labtestcatalog`, `labtestpackage`, `labtestpackageitem`
- `laborder`, `laborderitem`, `labsample`, `labresult`, `labresulttemplate`
- `medicinecatalog`, `medicinebatch`, `pharmacysupplier`, `pharmacypurchase`, `pharmacypurchaseitem`, `pharmacyreturn`, `pharmacyreturnitem`, `pharmacystockledger`, `pharmacyissue`, `pharmacyissueitem`

Physiotherapy:

- `physiotherapyequipment`
- `physiotherapycase`
- `physiotherapysession`

Billing/audit/settings:

- `invoice`, `invoiceitem`, `payment`, `creditnote`
- `taxrule`, `doctorfeerule`, `discountapproval`, `doctorsettlement`
- `auditevent`
- `adminsetting`
- `notificationevent`

For detailed fields and gaps, read `docs/db-design-erd-production-gaps.md`.

### Database Change Workflow

When adding or changing a field, update all layers together:

1. SQLModel table in `backend/app/modules/<module>/models.py`.
2. Request/response schema in `backend/app/modules/<module>/schemas.py`.
3. API create/update/read logic in `backend/app/api/v1/<module>.py`.
4. Alembic migration in `backend/alembic/versions/`.
5. Frontend TypeScript shape and form state in the related `features/<module>/` component.
6. Tests in `backend/tests/test_<module>.py`.
7. Docs if the behavior is user-facing or affects permissions/workflow.

Never rely only on changing `models.py`. PostgreSQL will not get the new column until the migration runs.

## 8. Permissions And Roles

Permission constants live in:

- `backend/app/modules/identity/permissions.py`

Endpoint permission rules live inside each API router using:

- `require_permission(...)`

Frontend module visibility is controlled by:

- `lib/navigation.ts`
- `features/shell/useAppController.ts`
- `lib/moduleAccess.ts`

Important role behavior in the current shell:

- Super Admin: can switch tenant, branch, and department. Tenant switch reloads tenant-specific data.
- Tenant Admin: can switch branch and department.
- Receptionist: can switch department only.
- Doctor: cannot switch branch or department; assigned scope is read-only.

### Role Scope Matrix

| Role | Tenant | Branch | Department | Notes |
| --- | --- | --- | --- | --- |
| `super_admin` | Can change | Can change after tenant selection | Can change after tenant/branch selection | Used for SaaS/platform management and cross-tenant support. |
| `tenant_admin` | Fixed to login tenant | Can change | Can change | Used by clinic/hospital admin users. |
| `reception` | Fixed to login tenant | Fixed/current branch | Can change | Reception can work by department but should not switch tenant. |
| `doctor` | Fixed to login tenant | Read-only assigned branch | Read-only assigned department | Doctor scope comes from practitioner mappings. |
| `lab` | Fixed to login tenant | Usually fixed/current branch | Usually fixed/current department | Should only see lab workflows allowed by permissions. |
| `pharmacy` | Fixed to login tenant | Usually fixed/current branch | Usually fixed/current department | Should only see pharmacy/billing workflows allowed by permissions. |
| `billing` | Fixed to login tenant | Usually fixed/current branch | Usually fixed/current department | Should only see patient/billing reports allowed by permissions. |

This role matrix is enforced partly by UI controls and partly by backend permissions/scope checks. Backend checks are the source of truth.

When a user cannot see a module:

1. Check the backend user roles and permissions.
2. Check `features/shell/useAppController.ts` permission-to-module mapping.
3. Check `lib/navigation.ts` role module defaults.
4. Check tenant subscription/module entitlement in backend.

## 9. Common Workflows

Login:

1. `features/auth/AuthScreen.tsx` collects email/password.
2. `useAppController.handleLogin()` calls `POST /api/v1/auth/login`.
3. Session is stored in local storage.
4. `loadLiveData()` loads data allowed by permissions.

Super admin tenant switch:

1. Header tenant dropdown calls `switchTenant()`.
2. Session `tenantId` changes.
3. Branches/departments and live data reload for that tenant.

Appointment to consultation:

1. Reception creates appointment.
2. Queue token can be created/managed.
3. Doctor opens dashboard/workspace.
4. Doctor signs consultation.
5. Billing can generate invoice.

OP to IP:

1. `IPAdmission.tsx` converts an OP appointment or creates direct admission.
2. Backend creates `ipadmission`.
3. Room/bed availability checks `iproom` and active admissions.
4. IP care entries create treatment, consultation, medication orders, and billable items.
5. Discharge requires invoice before finalization.

Physiotherapy:

1. Create OP/IP physiotherapy case.
2. Upload one or more consent files.
3. Add sessions/equipment usage.
4. Generate physiotherapy invoice.
5. Payment is collected through billing.

Tenant setup:

1. Super admin creates tenant and subscription.
2. Super admin or tenant admin creates branches.
3. Admin creates departments.
4. Admin creates users and roles.
5. Admin maps doctors to branch/department.
6. Front-office users can start appointments, queue, patient, billing, and clinical workflows based on permissions.

Lab and pharmacy:

1. Admin or module user maintains catalog.
2. Doctor or staff creates order/issue from patient workflow.
3. Lab/pharmacy team updates status and result/stock.
4. Billing records charges and payments.

Reports:

1. Frontend reads live module data and report endpoints.
2. Backend filters by tenant, branch, permissions, and date ranges.
3. Use reports to verify totals when billing, queue, appointment, or patient counts look wrong.

## 10. API Patterns

Frontend JSON request:

```ts
await apiFetch('/patients', apiSession)
```

Frontend file upload:

```ts
const form = new FormData()
form.append('file', file)
await apiUpload('/patients/{id}/photo', apiSession, form)
```

Backend router pattern:

```py
@router.post('/resource', response_model=ResourceRead)
def create_resource(
    payload: ResourceCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.SOME_PERMISSION)),
):
    ...
```

Backend must usually do:

- Enforce module entitlement where applicable.
- Validate tenant and branch scope.
- Check user permission.
- Record audit event for important changes.
- Commit and refresh database row.

### Frontend Component Data Pattern

Most feature components receive data and callbacks from `useAppController.ts` through `AppShell.tsx`.

Common props include:

- `apiSession`: token and tenant id for API calls.
- `selectedBranchId`: current branch context.
- `selectedDepartmentId`: current department context.
- `patients`, `appointments`, `practitioners`, `queue`, `invoices`: live data arrays.
- Callback props like `onReload`, `onNavigate`, `onCreateInvoice`, or module-specific handlers.

If a screen needs fresh backend data after saving, call the relevant API and then call the reload callback instead of manually duplicating global state.

### Upload Pattern

Use uploads for patient documents, admission documents, consent forms, and related files.

Frontend:

- Build `FormData`.
- Use `apiUpload`.
- Show uploaded filename/link from backend response.

Backend:

- Validate file type and size in `backend/app/core/uploads.py`.
- Save under `uploads/`.
- Store URL/name/timestamp fields on the related table.
- Mount static uploads in `backend/app/main.py`.

## 11. Where To Fix Common Issues

| Problem | First Files To Check |
| --- | --- |
| Login fails | `features/shell/useAppController.ts`, `backend/app/api/v1/identity.py`, `backend/app/modules/identity/security.py` |
| API URL wrong | `lib/api.ts`, `.env`, `.env.example`, Docker compose env |
| User cannot see module | `features/shell/useAppController.ts`, `lib/navigation.ts`, `lib/moduleAccess.ts`, `backend/app/modules/identity/permissions.py` |
| 403 Forbidden | Backend router permission dependency, user role permissions, tenant module entitlement |
| Wrong tenant/branch data | `useAppController.loadLiveData()`, `X-Tenant-ID`, `require_tenant_id`, branch access helpers |
| Doctor sees wrong department | Practitioner mapping in `practitioners/models.py`, `useAppController` doctor scope logic |
| Header role control wrong | `features/shell/AppShell.tsx` |
| Sidebar/menu issue | `features/shell/AppShell.tsx`, `lib/navigation.ts` |
| Dashboard card navigation | `features/dashboard/Dashboard.tsx` |
| Patient registration issue | `features/patients/Patient.tsx`, `backend/app/api/v1/patients.py` |
| Appointment issue | `features/appointments/AppointmentCalendarBooking.tsx`, `backend/app/api/v1/appointments.py` |
| Queue issue | `features/queue/TokenQueue.tsx`, `backend/app/api/v1/queue.py` |
| IP room/bed issue | `features/ip/IPAdmission.tsx`, `backend/app/api/v1/ip.py`, `backend/app/modules/ip/models.py` |
| File upload issue | `lib/api.ts`, `backend/app/core/uploads.py`, static mount in `backend/app/main.py` |
| Database column missing | Alembic migration in `backend/alembic/versions/`, SQLModel model, `backend/app/core/schema_repair.py` for dev-only repairs |
| Tests failing | Related `backend/tests/test_*.py` or `__tests__/*.test.ts` |
| Role switch control wrong | `features/shell/AppShell.tsx`, role matrix in this guide, `useAppController.ts` selected scope logic |
| Super admin tenant switch not reloading | `useAppController.switchTenant()`, `loadLiveTenants`, `loadLiveData`, `X-Tenant-ID` |
| Reception cannot change department | `AppShell.tsx` role control rules, department options loaded in `useAppController.ts` |
| Doctor can change department by mistake | `AppShell.tsx` doctor read-only rendering, practitioner branch/department mapping |
| Sidebar/global scroll wrong | `features/shell/AppShell.tsx`, `app/globals.css` layout and `.scrollbar-hidden` |
| UI design/alignment messy | `features/shell/AppShell.tsx`, `components/common/ui.tsx`, active feature component CSS classes |
| Permission works in UI but API returns 403 | Backend `require_permission`, seeded role permissions, API permission matrix |
| API works but UI hides module | `lib/navigation.ts`, `useAppController.ts` permission-to-module mapping |

## 12. Adding A New Module

1. Add database models in `backend/app/modules/<module>/models.py`.
2. Add schemas in `backend/app/modules/<module>/schemas.py`.
3. Import models in `backend/app/models.py`.
4. Create API router in `backend/app/api/v1/<module>.py`.
5. Include router in `backend/app/api/router.py`.
6. Add permissions in `backend/app/modules/identity/permissions.py`.
7. Add Alembic migration.
8. Add frontend screen in `features/<module>/<Module>.tsx`.
9. Add nav entry and role modules in `lib/navigation.ts`.
10. Add module access mapping in `features/shell/useAppController.ts`.
11. Add tests in `backend/tests/` and/or `__tests__/`.
12. Update docs.

### Adding A New Field To An Existing Form

Example: adding a field to IP admission or physiotherapy consent.

1. Add form state and input in the feature component.
2. Add the field to frontend create/update payload.
3. Add the field to backend schema.
4. Add the field to backend model.
5. Add migration.
6. Save/read the field in API endpoint.
7. Add test for create/read/update behavior.
8. Verify role permissions still allow the correct users only.

### Adding A New Permission

1. Add constant in `backend/app/modules/identity/permissions.py`.
2. Add it to `PERMISSION_CATALOG`.
3. Seed or assign it to the required roles.
4. Use it in the API endpoint with `require_permission`.
5. Add frontend module or action gating if needed.
6. Add/adjust RBAC tests.

## 13. Testing And Quality

Frontend:

```bash
npm test
npx tsc --noEmit
npm run build
```

Backend:

```bash
backend/.venv/bin/pytest backend/tests -q
backend/.venv/bin/ruff check backend/app backend/tests
```

If `npm run build` fails because `.next` files are owned by another user, fix file ownership or clean `.next` outside the sandbox. That is an environment issue, not always a code issue.

## 14. Design Rules Used In This Project

- The app shell should stay quiet and SaaS-like.
- Header should not repeat tenant/clinic information.
- Profile menu contains login details and account actions.
- Sidebar scrolls independently.
- Main workspace scrolls independently.
- Cards should represent actions or grouped information, not nested decorative boxes.
- Role/tenant/branch/department controls must match the permission matrix.

### Shell/Header Design Rules

- Do not show the same tenant/clinic name twice in the header.
- Super admin uses the tenant selector in the top control area.
- Other roles show tenant/clinic context as the header title or read-only control, depending on current design.
- Password change and logout belong inside the profile dropdown.
- Notification and profile initials can stay in the top bar.
- Breadcrumbs/back/forward live below the compact header.
- Keep header controls single-line on desktop and predictable on smaller widths.

## 15. Important Existing Docs

Read these next:

- `docs/developer-setup.md`
- `docs/module-development-guide.md`
- `docs/api-permission-matrix.md`
- `docs/db-design-erd-production-gaps.md`
- `docs/backend-architecture-spec.md`
- `docs/product-blueprint.md`

## 16. Best First Reading Path For Freshers

1. Read this file once fully.
2. Read `docs/developer-setup.md` and run the project.
3. Open `features/shell/useAppController.ts` to understand app state.
4. Open `features/shell/AppShell.tsx` to understand navigation/layout.
5. Open one simple module end to end, such as patients:
   - `features/patients/Patient.tsx`
   - `backend/app/api/v1/patients.py`
   - `backend/app/modules/patients/models.py`
   - `backend/app/modules/patients/schemas.py`
   - `backend/tests/test_patients.py`
6. Then study a complex workflow, such as IP:
   - `features/ip/IPAdmission.tsx`
   - `backend/app/api/v1/ip.py`
   - `backend/app/modules/ip/models.py`
   - `backend/app/modules/ip/schemas.py`
   - `backend/tests/test_ip_management.py`

Once this pattern is clear, every other module follows the same project logic.
