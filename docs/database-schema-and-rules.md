# Database Schema And Rules

This file is the quick database map for MedizinHub HMS. Use it when you need to understand how tables connect, where a column is defined, why an API says `column does not exist`, or where to add a new database field safely.

## How The Database Is Built

| Area | File | Purpose |
|---|---|---|
| DB connection | `backend/app/core/database.py` | Creates the SQLModel engine from `DATABASE_URL` and registers all models. |
| Model registry | `backend/app/models.py` | Imports all module models so `SQLModel.metadata.create_all()` can see every table. |
| Table definitions | `backend/app/modules/*/models.py` | SQLModel table classes. This is the source of database columns. |
| API payload schemas | `backend/app/modules/*/schemas.py` | Pydantic request/response models. These are not tables. |
| Runtime schema repair | `backend/app/core/schema_repair.py` | Adds missing columns in dev databases when migrations were not run. |
| Alembic migrations | `backend/alembic/versions/` | Permanent database schema history for real environments. |
| App startup repair | `backend/app/main.py` | Calls `ensure_upload_schema()` and `ensure_default_plans()` on startup. |

Table names are generated from SQLModel class names, usually lowercase:

| Model class | Table name |
|---|---|
| `Tenant` | `tenant` |
| `Branch` | `branch` |
| `Department` | `department` |
| `IPAdmission` | `ipadmission` |
| `DoctorFeeRule` | `doctorfeerule` |
| `PharmacyIssue` | `pharmacyissue` |

## Core Rules

| Rule | Meaning |
|---|---|
| Every tenant-owned table must have `tenant_id`. | Never query business data without tenant scope. |
| Branch-owned workflow tables should have `branch_id`. | Used for branch filtering and staff branch access. |
| Super admin can cross tenants. | Platform level only. |
| Tenant admin can access all branches inside own tenant. | Must not access another tenant. |
| Staff users are usually branch-scoped by `user.branch_id`. | `require_user_branch_access()` and `scoped_branch_id()` enforce this. |
| Doctors are linked through `practitioner.user_id`. | Doctor login should see only their practitioner context. |
| Use soft status fields where present. | Prefer `is_active`, `status`, or domain status over deleting business history. |
| Money is stored as integer rupees. | Existing billing fields use `int`, not decimal paise. Keep this consistent unless doing a full money refactor. |
| File uploads store URL/name metadata in the domain table. | Actual files live under `uploads/`. |

## Main Relationship Map

```text
Tenant
  -> Branch
  -> Department
  -> User
       -> UserRole -> Role -> RolePermission -> Permission
  -> Patient
       -> PatientContact
       -> PatientAlert
  -> Practitioner
       -> PractitionerBranch -> Branch
       -> PractitionerDepartment -> Department
       -> PractitionerSchedule
       -> PractitionerLeave
  -> Appointment
       -> QueueEntry -> QueueEvent
       -> Consultation
            -> ConsultationMedicine
            -> ConsultationReferral
            -> ConsultationVital
            -> ConsultationDiagnosis
            -> LabOrder
            -> PharmacyIssue
            -> Invoice
  -> IPAdmission
       -> IPTreatment
       -> IPConsultation
       -> IPConsentForm
       -> IPDischargeSummary
       -> IPCharge
       -> IPBillingItem
       -> IPMedicationOrder -> IPMedicationAdministration
  -> PhysiotherapyCase
       -> PhysiotherapySession
       -> Invoice
  -> Billing
       -> TaxRule
       -> DoctorFeeRule
       -> Invoice -> InvoiceItem -> Payment
       -> CreditNote
       -> DiscountApproval
       -> DoctorSettlement
  -> Lab catalog/order/result tables
  -> Pharmacy catalog/purchase/stock/issue tables
  -> AuditEvent
  -> NotificationEvent
```

## Tables By Module

### Tenants

Source: `backend/app/modules/tenants/models.py`

| Table | Main columns | Connects to | Notes |
|---|---|---|---|
| `tenant` | `id`, `name`, `tenant_type`, `is_primary`, `status` | Most tables via `tenant_id` | Primary tenant is platform owner. Customer tenants are clinics/hospitals. |
| `branch` | `id`, `tenant_id`, `name`, `code`, `is_active` | `tenant`, many workflow tables | Multi-branch clinics use multiple rows. |
| `department` | `id`, `tenant_id`, `branch_id`, `name`, `code` | `tenant`, optional `branch` | Same department name can exist in multiple branches. UI should de-duplicate where needed. |

### Identity And Permissions

Source: `backend/app/modules/identity/models.py`

| Table | Main columns | Connects to | Notes |
|---|---|---|---|
| `user` | `id`, `tenant_id`, `branch_id`, `user_type`, `email`, `is_super_admin` | `tenant`, `branch` | Tenant admins may have branch_id in seed data but are tenant-wide by backend access rules. |
| `role` | `id`, `tenant_id`, `name`, `key` | `tenant`, `userrole` | Tenant roles are tenant-owned. Template roles can be locked. |
| `permission` | `id`, `key` | `rolepermission` | Permission catalog lives in `backend/app/modules/identity/permissions.py`. |
| `userrole` | `user_id`, `role_id`, `tenant_id` | `user`, `role` | Many-to-many users to roles. |
| `rolepermission` | `role_id`, `permission_id` | `role`, `permission` | Many-to-many roles to permissions. |
| `authsession` | `user_id`, `tenant_id`, `token_hash`, `expires_at` | `user`, `tenant` | Login token sessions. |

Permission rule location:

| File | Use |
|---|---|
| `backend/app/core/auth.py` | `require_permission`, `require_any_permission`, tenant admin checks. |
| `backend/app/core/access_control.py` | Branch scoping and doctor/practitioner access. |

### Patients

Source: `backend/app/modules/patients/models.py`

| Table | Main columns | Connects to | Notes |
|---|---|---|---|
| `patient` | `tenant_id`, `branch_id`, `patient_number`, `full_name`, `mobile`, `gender`, `status`, `photo_url` | `tenant`, `branch` | Patient registry base. |
| `patientcontact` | `tenant_id`, `patient_id`, contact fields | `patient` | Relatives/emergency contacts. |
| `patientalert` | `tenant_id`, `patient_id`, alert fields | `patient` | Allergies and clinical alerts. |

### Practitioners And Doctors

Source: `backend/app/modules/practitioners/models.py`

| Table | Main columns | Connects to | Notes |
|---|---|---|---|
| `practitioner` | `tenant_id`, `user_id`, `full_name`, `practitioner_type`, `primary_specialty`, `status` | `user` | Doctors, physiotherapists, nurses, technicians. |
| `practitionerbranch` | `practitioner_id`, `branch_id`, `tenant_id` | `practitioner`, `branch` | A doctor can work in many branches. |
| `practitionerdepartment` | `practitioner_id`, `department_id`, `tenant_id` | `practitioner`, `department` | Department mapping. |
| `practitionerschedule` | `practitioner_id`, `branch_id`, `department_id`, weekday/time | `practitioner`, `branch` | Appointment slot availability. |
| `practitionerleave` | `practitioner_id`, dates/times | `practitioner` | Blocks scheduling. |
| `practitionerroomassignment` | `practitioner_id`, `branch_id`, room/time | `practitioner`, `branch` | Room mapping. |

Doctor fee is not stored in `practitioner`. It is stored in `doctorfeerule`.

### Appointments And Queue

Sources:

| Module | File |
|---|---|
| Appointments | `backend/app/modules/appointments/models.py` |
| Queue | `backend/app/modules/queue/models.py` |

| Table | Main columns | Connects to | Notes |
|---|---|---|---|
| `appointment` | `tenant_id`, `branch_id`, `patient_id`, `department_id`, practitioner/date/status | `patient`, `branch`, `department` | OP/IP/visit scheduling starts here. |
| `queueentry` | `appointment_id`, `patient_id`, status/queue | `appointment`, `patient` | Token queue row. |
| `queueevent` | `queue_entry_id`, `appointment_id`, event fields | `queueentry` | Queue audit/history. |

### Consultation

Source: `backend/app/modules/consultations/models.py`

| Table | Main columns | Connects to | Notes |
|---|---|---|---|
| `consultation` | `appointment_id`, `patient_id`, status/sign fields | `appointment`, `patient` | One consultation per appointment. |
| `consultationaddendum` | `consultation_id`, notes | `consultation` | Post-sign notes. |
| `consultationvital` | `consultation_id`, vitals | `consultation` | BP, temp, etc. |
| `consultationcomplaint` | `consultation_id`, complaint | `consultation` | Chief complaints. |
| `consultationdiagnosis` | `consultation_id`, diagnosis | `consultation` | Diagnoses. |
| `consultationmedicine` | `consultation_id`, medicine/dose/frequency | `consultation` | Prescription source for pharmacy issue. |
| `consultationreferral` | `consultation_id`, target module | `consultation` | Lab/physio/pharmacy referrals. |
| `clinicaltemplate` | `tenant_id`, template fields | `tenant` | Reusable clinical templates. |

### Billing And Invoices

Source: `backend/app/modules/billing/models.py`

| Table | Main columns | Connects to | Notes |
|---|---|---|---|
| `taxrule` | `tenant_id`, `branch_id`, `tax_percentage`, `tax_label` | `tenant`, optional `branch` | Controls tax rate. |
| `doctorfeerule` | `tenant_id`, `branch_id`, `department_id`, `practitioner_id`, `fee_amount`, `share_type`, `doctor_share_percentage`, `share_tax_with_doctor` | `tenant`, optional `branch`, doctor by id | Fee and doctor settlement rule. More specific rules should win over generic rules. |
| `invoice` | `tenant_id`, `branch_id`, `patient_id`, source ids, amounts, `fee_rule_id` | `patient`, `appointment`, `consultation`, `doctorfeerule` | Stores final billed amounts and doctor/clinic split. |
| `invoiceitem` | `invoice_id`, description, quantity, amounts | `invoice` | Line items. |
| `payment` | `invoice_id`, method, amount, reference | `invoice` | Updates paid and balance totals. |
| `discountapproval` | source ids, requested amount, status | appointment/consultation ids | Discount workflow. |
| `creditnote` | `invoice_id`, amount, reason | `invoice` | Refund/credit tracking. |
| `doctorsettlement` | `practitioner_id`, invoice totals, settlement amount | practitioner by id | Finalized doctor settlement summary. |

Doctor fee calculation source:

| File | Function |
|---|---|
| `backend/app/modules/billing/service.py` | `find_fee_rule`, `calculate_fee_split`, invoice creation/refresh logic |

Doctor fee rule priority should be understood like this:

```text
doctor + branch + department + appointment type
doctor + branch + appointment type
department + branch + appointment type
branch + appointment type
tenant-wide default
```

The exact scoring lives in `find_fee_rule()`.

Tax sharing:

| `share_tax_with_doctor` | Doctor share base |
|---|---|
| `false` | Taxable/base amount only. Clinic keeps tax. |
| `true` | Total including tax. Doctor shares tax amount too. |

### Lab

Source: `backend/app/modules/lab/models.py`

| Table | Main columns | Connects to | Notes |
|---|---|---|---|
| `labtestcatalog` | `tenant_id`, `branch_id`, test name/price/status | `tenant`, optional `branch` | Test master. |
| `labtestpackage` | `tenant_id`, `branch_id`, package fields | `tenant`, optional `branch` | Package master. |
| `labtestpackageitem` | `package_id`, `test_id` | package/test | Package composition. |
| `labresulttemplate` | `tenant_id`, `test_id`, template fields | test | Result format. |
| `laborder` | `tenant_id`, `branch_id`, `patient_id`, `consultation_id`, status/amount | `patient`, optional `consultation` | Worklist header. |
| `laborderitem` | `lab_order_id`, `test_id`, `package_id` | order/test/package | Ordered tests. |
| `labsample` | `lab_order_id`, sample status | order | Sample workflow. |
| `labresult` | `lab_order_id`, result fields/report URL | order | Result entry and release. |

### Pharmacy

Source: `backend/app/modules/pharmacy/models.py`

| Table | Main columns | Connects to | Notes |
|---|---|---|---|
| `medicinecatalog` | `tenant_id`, `branch_id`, medicine info/status | `tenant`, optional `branch` | Medicine master. |
| `pharmacysupplier` | supplier info | `tenant` | Vendor master. |
| `pharmacypurchase` | `branch_id`, `supplier_id` | branch/supplier | Purchase header. |
| `medicinebatch` | `medicine_id`, batch, stock, expiry | medicine/purchase | Batch stock. |
| `pharmacypurchaseitem` | `purchase_id`, `medicine_id`, `batch_id` | purchase/medicine/batch | Purchase lines. |
| `pharmacyreturn` | `supplier_id`, `purchase_id` | supplier/purchase | Return header. |
| `pharmacyreturnitem` | `return_id`, `medicine_id`, `batch_id` | return/medicine/batch | Return lines. |
| `pharmacystockledger` | `medicine_id`, `batch_id`, movement qty | medicine/batch | Stock audit trail. |
| `pharmacyissue` | `patient_id`, `consultation_id`, status/amount | patient/consultation | Prescription issue header. |
| `pharmacyissueitem` | `pharmacy_issue_id`, `medicine_id`, `batch_id`, qty/price | issue/medicine/batch | Dispensed medicines. |

### IP Admission

Source: `backend/app/modules/ip/models.py`

| Table | Main columns | Connects to | Notes |
|---|---|---|---|
| `iproom` | `tenant_id`, `branch_id`, ward/room/bed/rate/status | branch | Bed inventory. |
| `ipadmission` | `patient_id`, `source_appointment_id`, `room_id`, `aadhaar_number`, document fields, status | patient/appointment/room | OP to IP admission header. |
| `iptreatment` | `admission_id`, treatment fields | admission | Treatment notes. |
| `ipconsultation` | `admission_id`, practitioner details | admission | IP doctor consults. |
| `ipconsentform` | `admission_id`, consent fields | admission | IP consent forms. |
| `ipdischargesummary` | `admission_id`, summary/status | admission | Discharge workflow. |
| `ipcharge` | `admission_id`, charge fields | admission | Charge capture. |
| `ipbillingitem` | `admission_id`, bill item fields | admission | Billable IP items. |
| `ipmedicationorder` | `admission_id`, medication order | admission | Medication plan. |
| `ipmedicationadministration` | `medication_order_id`, given status | medication order | MAR tracking. |

### Physiotherapy

Source: `backend/app/modules/physiotherapy/models.py`

| Table | Main columns | Connects to | Notes |
|---|---|---|---|
| `physiotherapyequipment` | `tenant_id`, `branch_id`, equipment fields | branch | Equipment master. |
| `physiotherapycase` | `patient_id`, appointment/IP source, department, consent file fields, status | patient/appointment/IP | Case header and consent uploads. |
| `physiotherapysession` | `case_id`, `physiotherapist_id`, session/equipment fields, `charge_amount` | case/equipment/practitioner by id | Treatment sessions. Session charge is normally filled from the selected physiotherapist's `doctorfeerule`. |

Physiotherapist billing rule:

```text
practitioner.practitioner_type = physiotherapist
  -> doctorfeerule.practitioner_id
  -> doctorfeerule.treatment_type = physiotherapy_session
  -> physiotherapysession.physiotherapist_id
  -> invoice.doctor_share_amount / clinic_share_amount
```

### Subscriptions

Source: `backend/app/modules/subscriptions/models.py`

| Table | Main columns | Connects to | Notes |
|---|---|---|---|
| `subscriptionplan` | plan key/name/limits/modules JSON | none | SaaS plan master. |
| `tenantsubscription` | `tenant_id`, `plan_id`, dates/status | tenant/plan | Active subscription. |
| `subscriptioncredit` | tenant/subscription/credit qty | tenant/subscription | Add-on credits. |
| `subscriptioninvoice` | tenant/subscription/credit amount/status | tenant/subscription | SaaS invoice. |

### Settings, Notifications, Audit

| Table | Source | Notes |
|---|---|---|
| `adminsetting` | `backend/app/modules/settings/models.py` | Tenant or branch settings. |
| `notificationevent` | `backend/app/modules/notifications/models.py` | Queued/sent notification records. |
| `auditevent` | `backend/app/modules/audit/models.py` | Business audit log. |

## Common Flow Joins

### OP Appointment To Invoice

```text
patient
  -> appointment.patient_id
  -> consultation.appointment_id
  -> invoice.consultation_id
  -> invoiceitem.invoice_id
  -> payment.invoice_id
```

Useful filters:

```sql
WHERE appointment.tenant_id = :tenant_id
  AND appointment.branch_id = :branch_id
```

### Doctor Fee And Settlement

```text
practitioner
  -> appointment.practitioner_id
  -> doctorfeerule.practitioner_id
  -> invoice.fee_rule_id
  -> doctorsettlement.practitioner_id
```

If doctor fee is wrong, check:

1. `doctorfeerule` has active rule for tenant/branch/doctor.
2. `appointment.practitioner_id` matches the doctor.
3. `invoice.fee_rule_id` points to the expected rule.
4. `share_tax_with_doctor` matches clinic agreement.

### Lab Worklist

```text
consultation
  -> laborder.consultation_id
  -> laborderitem.lab_order_id
  -> labtestcatalog.id
  -> labsample.lab_order_id
  -> labresult.lab_order_id
```

### Pharmacy Worklist

```text
consultation
  -> consultationmedicine.consultation_id
  -> pharmacyissue.consultation_id
  -> pharmacyissueitem.pharmacy_issue_id
  -> medicinecatalog.id
  -> medicinebatch.id
```

### IP Admission

```text
appointment
  -> ipadmission.source_appointment_id
  -> iproom.id
  -> iptreatment / ipconsultation / ipcharge / ipbillingitem
  -> invoice.ip_admission_id
```

### Physiotherapy

```text
patient or appointment or IP admission
  -> physiotherapycase
  -> physiotherapysession
  -> invoice.physiotherapy_case_id
```

## How To Add A New Column

1. Add the field in the module model.

   Example:

   ```py
   class DoctorFeeRule(SQLModel, table=True):
       share_tax_with_doctor: bool = Field(default=False, index=True)
   ```

2. Add request/response fields in the matching schema file if API needs it.

   ```text
   backend/app/modules/<module>/schemas.py
   ```

3. Add Alembic migration in:

   ```text
   backend/alembic/versions/
   ```

4. For local/dev hot-reload databases, add a safe repair line in:

   ```text
   backend/app/core/schema_repair.py
   ```

5. Update API mapping/service logic.

6. Add or update tests.

7. Restart backend and verify with the database.

## How To Find Schema Issues

### Error: `column <table>.<column> does not exist`

Meaning: model code expects a column, but database does not have it.

Check:

```bash
rg -n "<column_name>" backend/app backend/alembic
```

Then inspect database columns:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = '<table_name>'
ORDER BY ordinal_position;
```

Fix path:

| Environment | Fix |
|---|---|
| Local dev | Add repair in `schema_repair.py`, restart backend. |
| Proper migrated DB | Add/run Alembic migration. |
| Docker DB already running | Restart backend after repair; if migration-only, run migration command. |

### Error: `403 Forbidden`

Check in order:

| Check | File |
|---|---|
| Tenant header `X-Tenant-ID` | `lib/api.ts` |
| Permission dependency | `backend/app/core/auth.py` |
| Branch access | `backend/app/core/access_control.py` |
| Module entitlement | `backend/app/modules/subscriptions/service.py` |
| Endpoint permission | `backend/app/api/v1/<module>.py` |

Tenant admin rule:

```text
tenant admin = all access inside own tenant
tenant admin != access to other tenants
```

### Error: invalid branch or missing branch rows

Check:

```sql
SELECT id, tenant_id, name, code, is_active
FROM branch
WHERE tenant_id = '<tenant_id>';
```

If department dropdown repeats, check duplicate branch-specific departments:

```sql
SELECT tenant_id, branch_id, name, code, COUNT(*)
FROM department
GROUP BY tenant_id, branch_id, name, code
HAVING COUNT(*) > 1;
```

### Doctor fee not applying

Check:

```sql
SELECT id, tenant_id, branch_id, department_id, practitioner_id,
       appointment_type, fee_amount, doctor_share_percentage,
       share_tax_with_doctor, is_active, created_at
FROM doctorfeerule
WHERE tenant_id = '<tenant_id>'
ORDER BY created_at DESC;
```

Then compare against:

```sql
SELECT id, tenant_id, branch_id, department_id, practitioner_id,
       appointment_type, appointment_date, status
FROM appointment
WHERE id = '<appointment_id>';
```

### Invoice totals wrong

Check:

```sql
SELECT id, invoice_number, subtotal_amount, discount_amount,
       taxable_amount, tax_amount, total_amount, paid_amount,
       balance_amount, doctor_share_amount, clinic_share_amount, fee_rule_id
FROM invoice
WHERE id = '<invoice_id>';
```

Then:

```sql
SELECT * FROM invoiceitem WHERE invoice_id = '<invoice_id>';
SELECT * FROM payment WHERE invoice_id = '<invoice_id>';
SELECT * FROM doctorfeerule WHERE id = '<fee_rule_id>';
```

## Naming And ID Conventions

| Prefix | Entity |
|---|---|
| `tenant_` | Tenant |
| `branch_` | Branch |
| `dept_` | Department |
| `user_` | User |
| `role_` | Role |
| `patient`/domain prefix varies | Patient and workflow records |
| `prac_` | Practitioner |
| `feerule_` | Doctor fee rule |
| `invoice_` | Invoice |

IDs are generated by `new_id(prefix)` in `backend/app/modules/tenants/models.py`.

## Safe Query Pattern

Always tenant-scope business queries:

```py
statement = select(Patient).where(Patient.tenant_id == tenant_id)
```

Then branch-scope if the endpoint is branch-limited:

```py
branch_id = scoped_branch_id(current_user, branch_id)
if branch_id:
    statement = statement.where(Patient.branch_id == branch_id)
```

For create/update, validate branch belongs to tenant:

```py
require_branch_in_tenant(session, tenant_id, payload.branch_id)
require_user_branch_access(current_user, payload.branch_id)
```

## Files To Open By Problem

| Problem | Start here |
|---|---|
| Missing table/column | `backend/app/modules/<module>/models.py`, then `backend/app/core/schema_repair.py`, then `backend/alembic/versions/` |
| API payload not accepting field | `backend/app/modules/<module>/schemas.py` |
| API saves but field not persisted | `backend/app/api/v1/<module>.py` |
| Calculated value wrong | `backend/app/modules/<module>/service.py` |
| Tenant/branch access denied | `backend/app/core/auth.py`, `backend/app/core/access_control.py` |
| UI sends wrong field | `features/<module>/*.tsx` |
| Frontend API headers | `lib/api.ts` |
| Seeded demo data wrong | `backend/scripts/seed_demo_new.py` |

## Backend Verification Commands

```bash
PYTHONPYCACHEPREFIX=/tmp/medizinhub-pycache python3 -m compileall backend/app
```

```bash
rg -n "class .*\\(SQLModel, table=True\\)" backend/app/modules
```

```bash
rg -n "foreign_key=" backend/app/modules
```

If tests are installed:

```bash
python3 -m pytest backend/tests
```

## Frontend Verification Commands

```bash
npx tsc --noEmit
```

Use browser devtools Network tab to confirm:

| Header | Expected |
|---|---|
| `Authorization` | `Bearer <token>` |
| `X-Tenant-ID` | Current tenant id |
| `Content-Type` | `application/json` for JSON APIs |

## Quick Mental Model

```text
Tenant owns everything.
Branch scopes daily operations.
Department groups clinical service.
User owns login.
Role/Permission controls capability.
Practitioner represents doctor/provider profile.
Patient is the clinical subject.
Appointment starts OP workflow.
Consultation signs clinical work.
Lab/Pharmacy/IP/Physio branch from consultation or admission.
Invoice captures money.
DoctorFeeRule controls doctor fee and settlement split.
AuditEvent records important changes.
```
