"""
seed_demo_new.py
================
Fresh seed for MedizinHub HMS – completely new records, no overlap with
any previous seed.

Hierarchy
─────────
1 Super Admin  (platform level)

Tenant 1 → Sunrise Multispeciality Clinic   (Polyclinic, Chennai)
  Branch 1-A  → Sunrise Main Centre          (code: SUN-MAIN)
    Departments: General Medicine, Pediatrics, Dermatology, ENT, Orthopedics
      Each dept → 2 doctors  (10 doctors total for branch)
    Staff roles: Receptionist, Lab Technician, Pharmacist, Billing Executive, Ward Coordinator
      Each role → 1 user per branch  (5 staff users for branch)
  Branch 1-B  → Sunrise North Wing           (code: SUN-NORTH)
    Same 5 departments, 2 doctors each, 5 staff roles

Tenant 2 → BlueCross Hospitals Pvt Ltd      (General Hospital, Coimbatore)
  Branch 2-A  → BlueCross City Hospital      (code: BLU-CITY)
    Departments: Cardiology, Neurology, Oncology, Nephrology, Pulmonology
      Each dept → 2 doctors
    Same 5 staff roles
  Branch 2-B  → BlueCross Suburban Clinic    (code: BLU-SUB)
    Same 5 departments, 2 doctors each, 5 staff roles

Full clinical data seeded for Tenant-1 / Branch-1-A:
  Patients, Appointments (all types), Queue + Events,
  Consultations (vitals, complaints, diagnoses, medicines, referrals,
                 addenda, clinical templates),
  Billing (tax rules, fee rules, invoices, invoice items, payments,
            discount approvals, credit notes, doctor settlements),
  Lab (catalog, packages, result templates, orders, items, samples, results),
  Pharmacy (medicines, suppliers, purchases, batches, stock ledger,
             issues, issue items, returns, return items),
  Notifications, Settings, Subscriptions (plans, credits, invoices),
  Auth sessions, Audit events.

Run modes
─────────
  python scripts/seed_demo_new.py            # seed only
  python scripts/seed_demo_new.py --reset    # truncate ALL tables, then seed
"""

from __future__ import annotations

import argparse
import json
from datetime import date, datetime, time, timedelta, timezone

import sqlalchemy
from sqlalchemy.exc import ProgrammingError
from sqlmodel import Session, select

from app.core.database import engine
from app.modules.appointments.models import (
    Appointment,
    AppointmentStatus,
    AppointmentType,
)
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import (
    ApprovalStatus,
    CreditNote,
    CreditNoteStatus,
    DiscountApproval,
    DoctorFeeRule,
    DoctorSettlement,
    FeeShareType,
    Invoice,
    InvoiceStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
    SettlementStatus,
    TaxRule,
)
from app.modules.billing.service import create_consultation_invoice
from app.modules.consultations.models import (
    ClinicalTemplate,
    Consultation,
    ConsultationAddendum,
    ConsultationComplaint,
    ConsultationDiagnosis,
    ConsultationMedicine,
    ConsultationReferral,
    ConsultationStatus,
    ConsultationVital,
)
from app.modules.identity import permissions
from app.modules.identity.models import (
    AuthSession,
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)
from app.modules.identity.security import hash_password
from app.modules.lab.models import (
    LabOrder,
    LabOrderItem,
    LabOrderPriority,
    LabOrderSource,
    LabOrderStatus,
    LabResult,
    LabResultTemplate,
    LabSample,
    LabTestCatalog,
    LabTestPackage,
    LabTestPackageItem,
)
from app.modules.notifications.models import (
    NotificationEvent,
    NotificationEventType,
    NotificationProvider,
)
from app.modules.notifications.service import queue_notification_if_allowed
from app.modules.patients.models import (
    AlertSeverity,
    AlertType,
    Gender,
    Patient,
    PatientAlert,
    PatientContact,
)
from app.modules.pharmacy.models import (
    MedicineBatch,
    MedicineCatalog,
    PharmacyIssue,
    PharmacyIssueItem,
    PharmacyIssueSource,
    PharmacyIssueStatus,
    PharmacyPurchase,
    PharmacyPurchaseItem,
    PharmacyReturn,
    PharmacyReturnItem,
    PharmacyStockLedger,
    PharmacySupplier,
    StockLedgerMovement,
)
from app.modules.practitioners.models import (
    Practitioner,
    PractitionerBranch,
    PractitionerDepartment,
    PractitionerLeave,
    PractitionerRoomAssignment,
    PractitionerSchedule,
    PractitionerType,
)
from app.modules.queue.models import QueueEntry, QueueEvent
from app.modules.queue.service import create_queue_entry_for_appointment
from app.modules.settings.models import SettingKey, SettingScope
from app.modules.settings.service import upsert_setting
from app.modules.subscriptions.models import (
    CreditStatus,
    SubscriptionCredit,
    SubscriptionInvoice,
    SubscriptionInvoiceStatus,
    SubscriptionPlan,
    TenantSubscription,
)
from app.modules.subscriptions.service import ensure_default_plans, modules_to_json
from app.modules.tenants.models import (
    Branch,
    Department,
    Tenant,
    TenantStatus,
    TenantType,
)

# ══════════════════════════════════════════════════════════════════════════════
# MASTER DATA DEFINITIONS
# ══════════════════════════════════════════════════════════════════════════════

# ── Passwords ──────────────────────────────────────────────────────────────
SUPER_ADMIN_PASSWORD = "Sunrise@Super1"
TENANT_ADMIN_PASSWORD = "Tenant@Admin1"
STAFF_PASSWORD = "Staff@Pass1"
DOCTOR_PASSWORD = "Doctor@Pass1"

# ── Super admin ────────────────────────────────────────────────────────────
SUPER_ADMIN = {
    "name": "Karthik Narayanan",
    "email": "karthik.narayanan@medizinhub.io",
}

# ── Tenant definitions ─────────────────────────────────────────────────────
TENANTS = [
    {
        "slug": "sunrise",
        "name": "Sunrise Multispeciality Clinic",
        "legal_name": "Sunrise Health Services Pvt Ltd",
        "description": "Leading polyclinic serving Chennai since 2010.",
        "email": "admin@sunriseclinic.in",
        "phone": "9444100001",
        "address": "12 Gandhi Salai, Nungambakkam, Chennai – 600034",
        "type": TenantType.POLYCLINIC,
        "city": "Chennai",
        "state": "Tamil Nadu",
        "admin": {
            "name": "Preethi Sundarajan",
            "email": "linuxuser206@gmail.com",
        },
        "branches": [
            {
                "slug": "sun_main",
                "name": "Sunrise Main Centre",
                "code": "SUN-MAIN",
                "address": "12 Gandhi Salai, Nungambakkam",
                "city": "Chennai",
                "invoice_prefix": "SUN",
                "departments": [
                    {"slug": "sun_gen", "name": "General Medicine", "code": "GEN"},
                    {"slug": "sun_ped", "name": "Pediatrics", "code": "PED"},
                    {"slug": "sun_derm", "name": "Dermatology", "code": "DERM"},
                    {"slug": "sun_ent", "name": "ENT", "code": "ENT"},
                    {"slug": "sun_ortho", "name": "Orthopedics", "code": "ORTHO"},
                ],
            },
            {
                "slug": "sun_north",
                "name": "Sunrise North Wing",
                "code": "SUN-NORTH",
                "address": "78 Poonamallee High Road, Kilpauk",
                "city": "Chennai",
                "invoice_prefix": "SNN",
                "departments": [
                    {"slug": "snn_gen", "name": "General Medicine", "code": "GEN"},
                    {"slug": "snn_ped", "name": "Pediatrics", "code": "PED"},
                    {"slug": "snn_derm", "name": "Dermatology", "code": "DERM"},
                    {"slug": "snn_ent", "name": "ENT", "code": "ENT"},
                    {"slug": "snn_ortho", "name": "Orthopedics", "code": "ORTHO"},
                ],
            },
        ],
        "plans": ["sunrise_premium"],
    },
    {
        "slug": "bluecross",
        "name": "BlueCross Hospitals Pvt Ltd",
        "legal_name": "BlueCross Healthcare Limited",
        "description": "Multi-branch general hospital group based in Coimbatore.",
        "email": "admin@bluecrosshospitals.in",
        "phone": "9444200001",
        "address": "45 Avinashi Road, RS Puram, Coimbatore – 641002",
        "type": TenantType.GENERAL_HOSPITAL,
        "city": "Coimbatore",
        "state": "Tamil Nadu",
        "admin": {
            "name": "Rajesh Venkataraman",
            "email": "rajesh.venkataraman@bluecrosshospitals.in",
        },
        "branches": [
            {
                "slug": "blu_city",
                "name": "BlueCross City Hospital",
                "code": "BLU-CITY",
                "address": "45 Avinashi Road, RS Puram",
                "city": "Coimbatore",
                "invoice_prefix": "BLC",
                "departments": [
                    {"slug": "blc_cardio", "name": "Cardiology", "code": "CARDIO"},
                    {"slug": "blc_neuro", "name": "Neurology", "code": "NEURO"},
                    {"slug": "blc_onco", "name": "Oncology", "code": "ONCO"},
                    {"slug": "blc_nephro", "name": "Nephrology", "code": "NEPHRO"},
                    {"slug": "blc_pulmo", "name": "Pulmonology", "code": "PULMO"},
                ],
            },
            {
                "slug": "blu_sub",
                "name": "BlueCross Suburban Clinic",
                "code": "BLU-SUB",
                "address": "18 Saibaba Colony, Coimbatore",
                "city": "Coimbatore",
                "invoice_prefix": "BLS",
                "departments": [
                    {"slug": "bls_cardio", "name": "Cardiology", "code": "CARDIO"},
                    {"slug": "bls_neuro", "name": "Neurology", "code": "NEURO"},
                    {"slug": "bls_onco", "name": "Oncology", "code": "ONCO"},
                    {"slug": "bls_nephro", "name": "Nephrology", "code": "NEPHRO"},
                    {"slug": "bls_pulmo", "name": "Pulmonology", "code": "PULMO"},
                ],
            },
        ],
        "plans": ["bluecross_standard"],
    },
]

# ── Doctors per department per tenant ──────────────────────────────────────
# Key → branch_slug + dept_slug  (generated at runtime using indices)
# We define a pool: (slug_id, full_name, specialty, reg_no, mobile, email_prefix)
SUNRISE_DOCTORS = {
    "sun_gen": [
        (
            "sun_dr_gen1",
            "Dr. Arjun Krishnamurthy",
            "General Medicine",
            "TNMC-2010-1101",
            "9500001101",
            "arjun.krishnamurthy",
        ),
        (
            "sun_dr_gen2",
            "Dr. Meena Parthasarathy",
            "General Medicine",
            "TNMC-2012-1102",
            "9500001102",
            "meena.parthasarathy",
        ),
    ],
    "sun_ped": [
        (
            "sun_dr_ped1",
            "Dr. Vijay Balakrishnan",
            "Pediatrics",
            "TNMC-2011-1201",
            "9500001201",
            "vijay.balakrishnan",
        ),
        (
            "sun_dr_ped2",
            "Dr. Nalini Subramaniam",
            "Pediatrics",
            "TNMC-2013-1202",
            "9500001202",
            "nalini.subramaniam",
        ),
    ],
    "sun_derm": [
        (
            "sun_dr_derm1",
            "Dr. Deepa Raghunathan",
            "Dermatology",
            "TNMC-2014-1301",
            "9500001301",
            "deepa.raghunathan",
        ),
        (
            "sun_dr_derm2",
            "Dr. Sanjay Iyer",
            "Dermatology",
            "TNMC-2015-1302",
            "9500001302",
            "sanjay.iyer",
        ),
    ],
    "sun_ent": [
        (
            "sun_dr_ent1",
            "Dr. Kavitha Annamalai",
            "ENT",
            "TNMC-2009-1401",
            "9500001401",
            "kavitha.annamalai",
        ),
        (
            "sun_dr_ent2",
            "Dr. Murugan Selvam",
            "ENT",
            "TNMC-2016-1402",
            "9500001402",
            "murugan.selvam",
        ),
    ],
    "sun_ortho": [
        (
            "sun_dr_ort1",
            "Dr. Balamurugan Natarajan",
            "Orthopedics",
            "TNMC-2008-1501",
            "9500001501",
            "balamurugan.natarajan",
        ),
        (
            "sun_dr_ort2",
            "Dr. Saranya Chandrasekhar",
            "Orthopedics",
            "TNMC-2017-1502",
            "9500001502",
            "saranya.chandrasekhar",
        ),
    ],
    # North Wing – distinct doctors
    "snn_gen": [
        (
            "snn_dr_gen1",
            "Dr. Prakash Venkatesh",
            "General Medicine",
            "TNMC-2011-2101",
            "9500002101",
            "prakash.venkatesh",
        ),
        (
            "snn_dr_gen2",
            "Dr. Usha Ramachandran",
            "General Medicine",
            "TNMC-2013-2102",
            "9500002102",
            "usha.ramachandran",
        ),
    ],
    "snn_ped": [
        (
            "snn_dr_ped1",
            "Dr. Gowri Shankar",
            "Pediatrics",
            "TNMC-2012-2201",
            "9500002201",
            "gowri.shankar",
        ),
        (
            "snn_dr_ped2",
            "Dr. Kalpana Muthusamy",
            "Pediatrics",
            "TNMC-2014-2202",
            "9500002202",
            "kalpana.muthusamy",
        ),
    ],
    "snn_derm": [
        (
            "snn_dr_derm1",
            "Dr. Harish Subramanian",
            "Dermatology",
            "TNMC-2015-2301",
            "9500002301",
            "harish.subramanian",
        ),
        (
            "snn_dr_derm2",
            "Dr. Revathi Gopalakrishnan",
            "Dermatology",
            "TNMC-2016-2302",
            "9500002302",
            "revathi.gopalakrishnan",
        ),
    ],
    "snn_ent": [
        (
            "snn_dr_ent1",
            "Dr. Senthil Kumar Raj",
            "ENT",
            "TNMC-2010-2401",
            "9500002401",
            "senthil.kumarraj",
        ),
        (
            "snn_dr_ent2",
            "Dr. Asha Krishnan",
            "ENT",
            "TNMC-2018-2402",
            "9500002402",
            "asha.krishnan",
        ),
    ],
    "snn_ortho": [
        (
            "snn_dr_ort1",
            "Dr. Dinesh Balaji",
            "Orthopedics",
            "TNMC-2009-2501",
            "9500002501",
            "dinesh.balaji",
        ),
        (
            "snn_dr_ort2",
            "Dr. Poorni Suresh",
            "Orthopedics",
            "TNMC-2019-2502",
            "9500002502",
            "poorni.suresh",
        ),
    ],
}

BLUECROSS_DOCTORS = {
    "blc_cardio": [
        (
            "blc_dr_car1",
            "Dr. Anand Subramanian",
            "Cardiology",
            "TNMC-2007-3101",
            "9600003101",
            "anand.subramanian",
        ),
        (
            "blc_dr_car2",
            "Dr. Sudha Rajendran",
            "Cardiology",
            "TNMC-2009-3102",
            "9600003102",
            "sudha.rajendran",
        ),
    ],
    "blc_neuro": [
        (
            "blc_dr_neu1",
            "Dr. Manoj Pillai",
            "Neurology",
            "TNMC-2010-3201",
            "9600003201",
            "manoj.pillai",
        ),
        (
            "blc_dr_neu2",
            "Dr. Chithra Narayanan",
            "Neurology",
            "TNMC-2012-3202",
            "9600003202",
            "chithra.narayanan",
        ),
    ],
    "blc_onco": [
        (
            "blc_dr_onc1",
            "Dr. Ravi Shankar Reddy",
            "Oncology",
            "TNMC-2006-3301",
            "9600003301",
            "ravi.reddy",
        ),
        (
            "blc_dr_onc2",
            "Dr. Lalitha Srinivasan",
            "Oncology",
            "TNMC-2008-3302",
            "9600003302",
            "lalitha.srinivasan",
        ),
    ],
    "blc_nephro": [
        (
            "blc_dr_nep1",
            "Dr. Sundaram Venugopal",
            "Nephrology",
            "TNMC-2011-3401",
            "9600003401",
            "sundaram.venugopal",
        ),
        (
            "blc_dr_nep2",
            "Dr. Gayathri Ramasamy",
            "Nephrology",
            "TNMC-2013-3402",
            "9600003402",
            "gayathri.ramasamy",
        ),
    ],
    "blc_pulmo": [
        (
            "blc_dr_pul1",
            "Dr. Krishnakumar Iyer",
            "Pulmonology",
            "TNMC-2014-3501",
            "9600003501",
            "krishnakumar.iyer",
        ),
        (
            "blc_dr_pul2",
            "Dr. Padmavathi Nair",
            "Pulmonology",
            "TNMC-2015-3502",
            "9600003502",
            "padmavathi.nair",
        ),
    ],
    # Suburban clinic
    "bls_cardio": [
        (
            "bls_dr_car1",
            "Dr. Venkat Raghavan",
            "Cardiology",
            "TNMC-2008-4101",
            "9600004101",
            "venkat.raghavan",
        ),
        (
            "bls_dr_car2",
            "Dr. Nithya Kumaravel",
            "Cardiology",
            "TNMC-2010-4102",
            "9600004102",
            "nithya.kumaravel",
        ),
    ],
    "bls_neuro": [
        (
            "bls_dr_neu1",
            "Dr. Saravanan Murugesan",
            "Neurology",
            "TNMC-2012-4201",
            "9600004201",
            "saravanan.murugesan",
        ),
        (
            "bls_dr_neu2",
            "Dr. Bhavani Suresh",
            "Neurology",
            "TNMC-2011-4202",
            "9600004202",
            "bhavani.suresh",
        ),
    ],
    "bls_onco": [
        (
            "bls_dr_onc1",
            "Dr. Ramkumar Selvadurai",
            "Oncology",
            "TNMC-2009-4301",
            "9600004301",
            "ramkumar.selvadurai",
        ),
        (
            "bls_dr_onc2",
            "Dr. Mythili Krishnamoorthy",
            "Oncology",
            "TNMC-2013-4302",
            "9600004302",
            "mythili.krishnamoorthy",
        ),
    ],
    "bls_nephro": [
        (
            "bls_dr_nep1",
            "Dr. Suresh Babu Pillai",
            "Nephrology",
            "TNMC-2014-4401",
            "9600004401",
            "sureshbabu.pillai",
        ),
        (
            "bls_dr_nep2",
            "Dr. Vanitha Anand",
            "Nephrology",
            "TNMC-2016-4402",
            "9600004402",
            "vanitha.anand",
        ),
    ],
    "bls_pulmo": [
        (
            "bls_dr_pul1",
            "Dr. Thiyagarajan Perumal",
            "Pulmonology",
            "TNMC-2015-4501",
            "9600004501",
            "thiyagarajan.perumal",
        ),
        (
            "bls_dr_pul2",
            "Dr. Hema Priya Doss",
            "Pulmonology",
            "TNMC-2017-4502",
            "9600004502",
            "hemapriya.doss",
        ),
    ],
}

ALL_DOCTORS = {**SUNRISE_DOCTORS, **BLUECROSS_DOCTORS}

# ── Staff role definitions (5 per branch) ─────────────────────────────────
# (role_key_suffix, display_name, permission_list)
STAFF_ROLE_SPECS = [
    (
        "receptionist",
        "Receptionist",
        [
            permissions.PATIENTS_READ,
            permissions.PATIENTS_WRITE,
            permissions.PATIENTS_CREATE,
            permissions.PATIENTS_EDIT,
            permissions.APPOINTMENTS_MANAGE,
            permissions.APPOINTMENTS_CREATE,
            permissions.APPOINTMENTS_READ,
            permissions.APPOINTMENTS_EDIT,
            permissions.QUEUE_MANAGE,
            permissions.NOTIFICATIONS_MANAGE,
        ],
    ),
    (
        "lab_technician",
        "Lab Technician",
        [
            permissions.PATIENTS_READ,
            permissions.LAB_MANAGE,
            permissions.LAB_CREATE,
            permissions.LAB_READ,
            permissions.LAB_EDIT,
            permissions.NOTIFICATIONS_MANAGE,
        ],
    ),
    (
        "pharmacist",
        "Pharmacist",
        [
            permissions.PATIENTS_READ,
            permissions.PHARMACY_MANAGE,
            permissions.PHARMACY_CREATE,
            permissions.PHARMACY_READ,
            permissions.PHARMACY_EDIT,
            permissions.BILLING_MANAGE,
        ],
    ),
    (
        "billing_executive",
        "Billing Executive",
        [
            permissions.PATIENTS_READ,
            permissions.BILLING_MANAGE,
            permissions.INVOICES_CREATE,
            permissions.INVOICES_READ,
            permissions.INVOICES_EDIT,
            permissions.PAYMENTS_MANAGE,
            permissions.SETTLEMENTS_READ,
        ],
    ),
    (
        "ward_coordinator",
        "Ward Coordinator",
        [
            permissions.PATIENTS_READ,
            permissions.APPOINTMENTS_READ,
            permissions.QUEUE_MANAGE,
            permissions.REPORTS_READ,
            permissions.AUDIT_READ,
            permissions.SETTLEMENTS_READ,
        ],
    ),
]

# Staff user data per branch (branch_slug → list of (name, email_prefix, mobile))
STAFF_USERS: dict[str, list[tuple[str, str, str]]] = {
    "sun_main": [
        ("Lavanya Kannan", "lavanya.kannan", "9700001001"),
        ("Durai Murugan", "durai.murugan", "9700001002"),
        ("Sumathi Rajagopalan", "sumathi.rajagopalan", "9700001003"),
        ("Balaji Sundaresan", "balaji.sundaresan", "9700001004"),
        ("Indira Selvakumar", "indira.selvakumar", "9700001005"),
    ],
    "sun_north": [
        ("Nirmala Krishnaswamy", "nirmala.krishnaswamy", "9700002001"),
        ("Senthilnathan Rajan", "senthilnathan.rajan", "9700002002"),
        ("Priya Natarajan", "priya.natarajan", "9700002003"),
        ("Madhavan Chandran", "madhavan.chandran", "9700002004"),
        ("Vasantha Raghavan", "vasantha.raghavan", "9700002005"),
    ],
    "blu_city": [
        ("Elamathi Subramaniam", "elamathi.subramaniam", "9800003001"),
        ("Vinothkumar Perumal", "vinothkumar.perumal", "9800003002"),
        ("Lakshmi Narayanan", "lakshmi.narayanan", "9800003003"),
        ("Gopalakrishnan Iyer", "gopalakrishnan.iyer", "9800003004"),
        ("Tamilarasi Pandian", "tamilarasi.pandian", "9800003005"),
    ],
    "blu_sub": [
        ("Manimegalai Arumugam", "manimegalai.arumugam", "9800004001"),
        ("Selvakumar Thangavel", "selvakumar.thangavel", "9800004002"),
        ("Rohini Venkatraman", "rohini.venkatraman", "9800004003"),
        ("Balachandran Pillai", "balachandran.pillai", "9800004004"),
        ("Annapoorani Sundaram", "annapoorani.sundaram", "9800004005"),
    ],
}

# Patient pool (10 patients for Tenant-1 clinical data) ─────────────────
PATIENTS_T1 = [
    # (number, full_name, mobile, alt_mobile, email, gender, dob, age, area, blood_group, guardian)
    (
        "SUN-P-0001",
        "Aarav Mehta",
        "9811100001",
        "9811100011",
        "aarav.mehta@mail.com",
        Gender.MALE,
        date(1985, 3, 12),
        39,
        "Nungambakkam",
        "O+",
        None,
    ),
    (
        "SUN-P-0002",
        "Bharati Sureshkumar",
        "9811100002",
        None,
        None,
        Gender.FEMALE,
        date(1992, 7, 25),
        31,
        "Kilpauk",
        "A+",
        None,
    ),
    (
        "SUN-P-0003",
        "Chandrakumar Pillai",
        "9811100003",
        "9811100033",
        "chandrakumar@mail.com",
        Gender.MALE,
        date(1970, 11, 5),
        53,
        "Egmore",
        "B+",
        None,
    ),
    (
        "SUN-P-0004",
        "Divya Lakshmi Rao",
        "9811100004",
        None,
        "divya.rao@mail.com",
        Gender.FEMALE,
        date(2010, 2, 18),
        14,
        "Anna Nagar",
        "AB+",
        "Ramesh Rao",
    ),
    (
        "SUN-P-0005",
        "Ezhilarasan Murugan",
        "9811100005",
        None,
        None,
        Gender.MALE,
        date(1958, 6, 30),
        65,
        "Chetpet",
        "B-",
        None,
    ),
    (
        "SUN-P-0006",
        "Fathima Begum",
        "9811100006",
        "9811100066",
        None,
        Gender.FEMALE,
        date(1999, 9, 14),
        24,
        "Vepery",
        "O-",
        None,
    ),
    (
        "SUN-P-0007",
        "Ganesan Palaniappan",
        "9811100007",
        None,
        None,
        Gender.MALE,
        date(1975, 4, 22),
        49,
        "Aminjikarai",
        "A-",
        None,
    ),
    (
        "SUN-P-0008",
        "Hema Vijayakumar",
        "9811100008",
        None,
        "hema.v@mail.com",
        Gender.FEMALE,
        date(1988, 12, 3),
        35,
        "Perambur",
        "B+",
        None,
    ),
    (
        "SUN-P-0009",
        "Ilavarasan Thangam",
        "9811100009",
        None,
        None,
        Gender.MALE,
        date(2018, 8, 7),
        5,
        "Villivakkam",
        "O+",
        "Thangam Ilavarasan",
    ),
    (
        "SUN-P-0010",
        "Janaki Ramadoss",
        "9811100010",
        "9811100100",
        None,
        Gender.FEMALE,
        date(1945, 1, 19),
        79,
        "Royapettah",
        "AB-",
        None,
    ),
]

# ── Plan definitions ───────────────────────────────────────────────────────
PLAN_DEFS = [
    {
        "key": "sunrise_premium",
        "name": "Sunrise Premium Plan",
        "patient_limit": 2000,
        "branches": 5,
        "doctors": 30,
        "price": 7999,
        "modules": [
            "patients",
            "appointments",
            "queue",
            "consultations",
            "billing_basic",
            "billing_advanced",
            "whatsapp",
            "sms",
            "voice",
            "lab",
            "pharmacy",
            "physiotherapy",
            "ai",
            "ip",
        ],
    },
    {
        "key": "bluecross_standard",
        "name": "BlueCross Standard Plan",
        "patient_limit": 1500,
        "branches": 4,
        "doctors": 25,
        "price": 5999,
        "modules": [
            "patients",
            "appointments",
            "queue",
            "consultations",
            "billing_basic",
            "billing_advanced",
            "sms",
            "voice",
            "lab",
            "pharmacy",
        ],
    },
]

# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════


def _first(session: Session, stmt):
    return session.exec(stmt).first()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ago(days: int = 0, hours: int = 0) -> datetime:
    return _now() - timedelta(days=days, hours=hours)


def _date_ago(days: int) -> date:
    return date.today() - timedelta(days=days)


def _domain(tenant_slug: str) -> str:
    return f"{tenant_slug}.medizinhub.io"


# ══════════════════════════════════════════════════════════════════════════════
# TRUNCATE
# ══════════════════════════════════════════════════════════════════════════════


def truncate_all_tables(session: Session) -> None:
    """Wipe every table in leaf-to-root order, restarting sequences."""
    tables = [
        "auditevent",
        "notificationevent",
        "queueevent",
        "queueentry",
        "doctorsettlement",
        "creditnote",
        "discountapproval",
        "payment",
        "invoiceitem",
        "labresult",
        "labsample",
        "laborderitem",
        "labtestpackageitem",
        "pharmacyissueitem",
        "pharmacyissue",
        "pharmacystockledger",
        "pharmacyreturnitem",
        "pharmacyreturn",
        "pharmacypurchaseitem",
        "medicinebatch",
        "pharmacypurchase",
        "pharmacysupplier",
        "medicinecatalog",
        "consultationreferral",
        "consultationmedicine",
        "consultationdiagnosis",
        "consultationcomplaint",
        "consultationvital",
        "consultationaddendum",
        "clinicaltemplate",
        "laborder",
        "labresulttemplate",
        "labtestpackage",
        "labtestcatalog",
        "invoice",
        "doctorfeerule",
        "taxrule",
        "consultation",
        "appointment",
        "authsession",
        "rolepermission",
        "userrole",
        "permission",
        "practitionerroomassignment",
        "practitionerleave",
        "practitionerschedule",
        "practitionerdepartment",
        "practitionerbranch",
        "practitioner",
        "patientalert",
        "patientcontact",
        "patient",
        "adminsetting",
        "subscriptioninvoice",
        "subscriptioncredit",
        "tenantsubscription",
        "subscriptionplan",
        "role",
        "user",
        "department",
        "branch",
        "tenant",
    ]
    print("⚡  Truncating all tables …")
    for tbl in tables:
        try:
            session.exec(
                sqlalchemy.text(  # type: ignore[call-overload]
                    f'TRUNCATE TABLE "{tbl}" RESTART IDENTITY CASCADE'
                )
            )
            print(f"   ✓  {tbl}")
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            print(f"   –  {tbl}  (skipped: {str(exc)[:80]})")
    session.commit()
    print("✅  All tables cleared.\n")


# ══════════════════════════════════════════════════════════════════════════════
# PLATFORM LAYER
# ══════════════════════════════════════════════════════════════════════════════


def create_primary_tenant(session: Session) -> Tenant:
    t = _first(session, select(Tenant).where(Tenant.is_primary == True))  # noqa: E712
    if t:
        return t
    t = Tenant(
        name="MedizinHub Platform",
        legal_name="MedizinHub Technologies Pvt Ltd",
        description="SaaS platform tenant with global administrative authority.",
        email="platform@medizinhub.io",
        phone="9000000000",
        address="MedizinHub HQ, Tidel Park, Chennai – 600113",
        tenant_type=TenantType.PRIMARY.value,
        is_primary=True,
        status=TenantStatus.ACTIVE,
        country="IN",
        timezone="Asia/Kolkata",
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    return t


def create_super_admin(session: Session, primary_tenant: Tenant) -> User:
    u = _first(session, select(User).where(User.email == SUPER_ADMIN["email"]))
    if u:
        return u
    u = User(
        tenant_id=primary_tenant.id,
        user_type="platform_admin",
        name=SUPER_ADMIN["name"],
        email=SUPER_ADMIN["email"],
        mobile="9000000001",
        password_hash=hash_password(SUPER_ADMIN_PASSWORD),
        is_super_admin=True,
        is_active=True,
    )
    session.add(u)
    session.commit()
    session.refresh(u)

    # Super admin role on primary tenant
    role = _get_or_create_role(
        session,
        primary_tenant.id,
        "super_admin",
        "Super Admin",
        permissions.PERMISSION_CATALOG,
        is_global=True,
    )
    _assign_role(session, u, role, primary_tenant.id)

    # Auth session
    _create_auth_session(session, u, primary_tenant, days_valid=30)

    record_audit_event(
        session,
        tenant_id=primary_tenant.id,
        actor_user_id=u.id,
        action="user.super_admin_created",
        resource_type="user",
        resource_id=u.id,
        purpose="system_seed",
    )
    return u


# ══════════════════════════════════════════════════════════════════════════════
# IDENTITY HELPERS
# ══════════════════════════════════════════════════════════════════════════════


def _get_or_create_permission(session: Session, key: str) -> Permission:
    p = _first(session, select(Permission).where(Permission.key == key))
    if not p:
        p = Permission(key=key, description=key.replace(".", " ").title())
        session.add(p)
        session.commit()
        session.refresh(p)
    return p


def _get_or_create_role(
    session: Session,
    tenant_id: str,
    key: str,
    name: str,
    perm_keys: list[str],
    is_global: bool = False,
) -> Role:
    role = _first(
        session, select(Role).where(Role.tenant_id == tenant_id, Role.key == key)
    )
    if not role:
        role = Role(
            tenant_id=tenant_id, key=key, name=name, is_global_template=is_global
        )
        session.add(role)
        session.commit()
        session.refresh(role)
    for pk in perm_keys:
        perm = _get_or_create_permission(session, pk)
        if not _first(
            session,
            select(RolePermission).where(
                RolePermission.role_id == role.id,
                RolePermission.permission_id == perm.id,
            ),
        ):
            session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    session.commit()
    return role


def _assign_role(session: Session, user: User, role: Role, tenant_id: str) -> None:
    if not _first(
        session,
        select(UserRole).where(
            UserRole.user_id == user.id, UserRole.role_id == role.id
        ),
    ):
        session.add(UserRole(user_id=user.id, role_id=role.id, tenant_id=tenant_id))
        session.commit()


def _create_auth_session(
    session: Session, user: User, tenant: Tenant, days_valid: int = 1
) -> None:
    token = f"tok_{user.id[:8]}_{tenant.id[:8]}"
    if not _first(session, select(AuthSession).where(AuthSession.token_hash == token)):
        session.add(
            AuthSession(
                user_id=user.id,
                tenant_id=tenant.id,
                token_hash=token,
                expires_at=_now() + timedelta(days=days_valid),
            )
        )
        session.commit()


def _tenant_admin_permissions() -> list[str]:
    return [k for k in permissions.PERMISSION_CATALOG if not k.startswith("platform.")]


# ══════════════════════════════════════════════════════════════════════════════
# TENANT / BRANCH / DEPARTMENT CREATION
# ══════════════════════════════════════════════════════════════════════════════


def create_tenant(session: Session, tdef: dict, super_admin: User) -> Tenant:
    t = _first(session, select(Tenant).where(Tenant.name == tdef["name"]))
    if t:
        return t
    t = Tenant(
        name=tdef["name"],
        legal_name=tdef["legal_name"],
        description=tdef["description"],
        email=tdef["email"],
        phone=tdef["phone"],
        address=tdef["address"],
        tenant_type=tdef["type"].value,
        is_primary=False,
        status=TenantStatus.ACTIVE,
        country="IN",
        timezone="Asia/Kolkata",
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    record_audit_event(
        session,
        tenant_id=t.id,
        actor_user_id=super_admin.id,
        action="tenant.created",
        resource_type="tenant",
        resource_id=t.id,
        purpose="system_seed",
    )
    return t


def create_tenant_admin(
    session: Session, tdef: dict, tenant: Tenant, branch: Branch, super_admin: User
) -> User:
    adef = tdef["admin"]
    email = f"{adef['email']}"
    u = _first(session, select(User).where(User.email == email))
    if u:
        return u
    u = User(
        tenant_id=tenant.id,
        branch_id=branch.id,
        user_type="tenant_admin",
        name=adef["name"],
        email=email,
        mobile=tenant.phone,
        password_hash=hash_password(TENANT_ADMIN_PASSWORD),
        is_active=True,
    )
    session.add(u)
    session.commit()
    session.refresh(u)
    role = _get_or_create_role(
        session,
        tenant.id,
        "tenant_admin",
        "Tenant Admin",
        _tenant_admin_permissions(),
    )
    _assign_role(session, u, role, tenant.id)
    _create_auth_session(session, u, tenant, days_valid=7)
    record_audit_event(
        session,
        tenant_id=tenant.id,
        actor_user_id=super_admin.id,
        action="user.tenant_admin_created",
        resource_type="user",
        resource_id=u.id,
        purpose="system_seed",
    )
    return u


def create_branch(session: Session, bdef: dict, tenant: Tenant, admin: User) -> Branch:
    b = _first(
        session,
        select(Branch).where(
            Branch.tenant_id == tenant.id, Branch.code == bdef["code"]
        ),
    )
    if b:
        return b
    b = Branch(
        tenant_id=tenant.id,
        name=bdef["name"],
        code=bdef["code"],
        address=bdef["address"],
        city=bdef["city"],
        state="Tamil Nadu",
    )
    session.add(b)
    session.commit()
    session.refresh(b)
    record_audit_event(
        session,
        tenant_id=tenant.id,
        branch_id=b.id,
        actor_user_id=admin.id,
        action="branch.created",
        resource_type="branch",
        resource_id=b.id,
        purpose="system_seed",
    )
    return b


def create_department(
    session: Session, ddef: dict, tenant: Tenant, branch: Branch
) -> Department:
    # unique slug per branch
    unique_id = ddef["slug"]
    dept = session.get(Department, unique_id)
    if not dept:
        dept = Department(
            id=unique_id,
            tenant_id=tenant.id,
            branch_id=branch.id,
            name=ddef["name"],
            code=ddef["code"],
        )
        session.add(dept)
        session.commit()
        session.refresh(dept)
    return dept


# ══════════════════════════════════════════════════════════════════════════════
# PRACTITIONERS
# ══════════════════════════════════════════════════════════════════════════════


def create_doctor(
    session: Session,
    doc_tuple: tuple,
    tenant: Tenant,
    branch: Branch,
    dept: Department,
    admin: User,
) -> Practitioner:
    slug, full_name, specialty, reg_no, mobile, email_prefix = doc_tuple
    domain = _domain(tenant.name.split()[0].lower())
    email = f"{email_prefix}@{domain}"

    prac = session.get(Practitioner, slug)
    if not prac:
        prac = Practitioner(
            id=slug,
            tenant_id=tenant.id,
            full_name=full_name,
            practitioner_type=PractitionerType.DOCTOR,
            primary_specialty=specialty,
            registration_number=reg_no,
            mobile=mobile,
            email=email,
        )
        session.add(prac)
        session.commit()
        session.refresh(prac)

    # Doctor user account
    doc_user = _first(session, select(User).where(User.email == email))
    if not doc_user:
        doc_user = User(
            tenant_id=tenant.id,
            branch_id=branch.id,
            user_type="doctor",
            name=full_name,
            email=email,
            mobile=mobile,
            password_hash=hash_password(DOCTOR_PASSWORD),
            is_active=True,
        )
        session.add(doc_user)
        session.commit()
        session.refresh(doc_user)
    prac.user_id = prac.user_id or doc_user.id
    session.add(prac)
    session.commit()

    # Doctor role
    doc_role = _get_or_create_role(
        session,
        tenant.id,
        "doctor",
        "Doctor",
        [
            permissions.PATIENTS_READ,
            permissions.QUEUE_MANAGE,
            permissions.CONSULTATIONS_READ,
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_SIGN,
            permissions.LAB_READ,
            permissions.PHARMACY_READ,
        ],
    )
    _assign_role(session, doc_user, doc_role, tenant.id)

    # Branch link
    if not session.get(PractitionerBranch, (slug, branch.id)):
        session.add(
            PractitionerBranch(
                tenant_id=tenant.id, practitioner_id=slug, branch_id=branch.id
            )
        )

    # Department link
    if not session.get(PractitionerDepartment, (slug, dept.id)):
        session.add(
            PractitionerDepartment(
                tenant_id=tenant.id, practitioner_id=slug, department_id=dept.id
            )
        )

    # Schedule Mon–Sat (weekday 0–5)
    for wd in range(6):
        if not _first(
            session,
            select(PractitionerSchedule).where(
                PractitionerSchedule.tenant_id == tenant.id,
                PractitionerSchedule.practitioner_id == slug,
                PractitionerSchedule.branch_id == branch.id,
                PractitionerSchedule.weekday == wd,
            ),
        ):
            session.add(
                PractitionerSchedule(
                    tenant_id=tenant.id,
                    practitioner_id=slug,
                    branch_id=branch.id,
                    department_id=dept.id,
                    weekday=wd,
                    start_time=time(9, 0),
                    end_time=time(13, 0),
                    slot_minutes=15,
                    room_name=f"{dept.name} Room",
                )
            )

        # Room assignment
        if not _first(
            session,
            select(PractitionerRoomAssignment).where(
                PractitionerRoomAssignment.tenant_id == tenant.id,
                PractitionerRoomAssignment.practitioner_id == slug,
                PractitionerRoomAssignment.branch_id == branch.id,
                PractitionerRoomAssignment.weekday == wd,
            ),
        ):
            session.add(
                PractitionerRoomAssignment(
                    tenant_id=tenant.id,
                    practitioner_id=slug,
                    branch_id=branch.id,
                    department_id=dept.id,
                    room_name=f"{dept.name} Room",
                    weekday=wd,
                    start_time=time(9, 0),
                    end_time=time(13, 0),
                )
            )

    # Leave record (1 upcoming leave per doctor)
    leave_start = date.today() + timedelta(days=20)
    leave_end = date.today() + timedelta(days=21)
    if not _first(
        session,
        select(PractitionerLeave).where(
            PractitionerLeave.tenant_id == tenant.id,
            PractitionerLeave.practitioner_id == slug,
            PractitionerLeave.start_date == leave_start,
        ),
    ):
        session.add(
            PractitionerLeave(
                tenant_id=tenant.id,
                practitioner_id=slug,
                branch_id=branch.id,
                start_date=leave_start,
                end_date=leave_end,
                reason="Personal leave",
            )
        )

    session.commit()
    return prac


# ══════════════════════════════════════════════════════════════════════════════
# STAFF USERS (5 per branch, one per role)
# ══════════════════════════════════════════════════════════════════════════════


def create_branch_staff(
    session: Session,
    branch_slug: str,
    tenant: Tenant,
    branch: Branch,
    admin: User,
) -> list[User]:
    staff_list = STAFF_USERS[branch_slug]
    domain = _domain(tenant.name.split()[0].lower())
    created: list[User] = []

    for (role_key, role_name, perm_keys), (name, email_prefix, mobile) in zip(
        STAFF_ROLE_SPECS, staff_list
    ):
        email = f"{email_prefix}@{domain}"
        u = _first(session, select(User).where(User.email == email))
        if not u:
            u = User(
                tenant_id=tenant.id,
                branch_id=branch.id,
                user_type=role_key,
                name=name,
                email=email,
                mobile=mobile,
                password_hash=hash_password(STAFF_PASSWORD),
                is_active=True,
            )
            session.add(u)
            session.commit()
            session.refresh(u)

        # Role keyed by branch to keep them separate per branch
        full_role_key = f"{branch_slug}_{role_key}"
        role = _get_or_create_role(
            session, tenant.id, full_role_key, role_name, perm_keys
        )
        _assign_role(session, u, role, tenant.id)
        _create_auth_session(session, u, tenant, days_valid=1)
        created.append(u)

    session.commit()
    return created


# ══════════════════════════════════════════════════════════════════════════════
# SUBSCRIPTIONS & SETTINGS
# ══════════════════════════════════════════════════════════════════════════════


def create_plans(session: Session) -> dict[str, SubscriptionPlan]:
    ensure_default_plans(session)
    plans: dict[str, SubscriptionPlan] = {}
    for pdef in PLAN_DEFS:
        plan = _first(
            session, select(SubscriptionPlan).where(SubscriptionPlan.key == pdef["key"])
        )
        if not plan:
            plan = SubscriptionPlan(
                key=pdef["key"],
                name=pdef["name"],
                monthly_patient_limit=pdef["patient_limit"],
                included_branches=pdef["branches"],
                included_doctors=pdef["doctors"],
                price_inr_monthly=pdef["price"],
                enabled_modules_json=modules_to_json(pdef["modules"]),
                created_at=_now(),
                updated_at=_now(),
            )
            session.add(plan)
            session.commit()
            session.refresh(plan)
        plans[pdef["key"]] = plan
    return plans


def create_subscription(
    session: Session, tenant: Tenant, plan: SubscriptionPlan
) -> TenantSubscription:
    sub = _first(
        session,
        select(TenantSubscription).where(
            TenantSubscription.tenant_id == tenant.id,
            TenantSubscription.plan_id == plan.id,
            TenantSubscription.is_active == True,  # noqa: E712
        ),
    )
    if sub:
        return sub
    sub = TenantSubscription(
        tenant_id=tenant.id,
        plan_id=plan.id,
        starts_on=date.today(),
        is_trial=False,
        billing_amount=plan.price_inr_monthly,
    )
    session.add(sub)
    session.commit()
    session.refresh(sub)

    # Credits
    for credit_type, qty, amount in [
        ("patients", plan.monthly_patient_limit, 0),
        ("sms", 1000, 500),
    ]:
        if not _first(
            session,
            select(SubscriptionCredit).where(
                SubscriptionCredit.tenant_id == tenant.id,
                SubscriptionCredit.subscription_id == sub.id,
                SubscriptionCredit.credit_type == credit_type,
            ),
        ):
            session.add(
                SubscriptionCredit(
                    tenant_id=tenant.id,
                    subscription_id=sub.id,
                    credit_type=credit_type,
                    quantity=qty,
                    used_quantity=0,
                    amount=amount,
                    starts_on=date.today(),
                    expires_on=date.today() + timedelta(days=30),
                    status=CreditStatus.ACTIVE,
                    reason=f"Included with {plan.name}",
                )
            )

    # Subscription invoices (paid + pending)
    for inv_no, desc, paid_amt, bal_amt, status_val, gw_status in [
        (
            f"SUBINV-{tenant.id[:6].upper()}-001",
            "Month 1 subscription",
            plan.price_inr_monthly + 1440,
            0,
            SubscriptionInvoiceStatus.PAID,
            "captured",
        ),
        (
            f"SUBINV-{tenant.id[:6].upper()}-002",
            "Month 2 renewal",
            plan.price_inr_monthly + 1440,
            plan.price_inr_monthly + 1440,
            SubscriptionInvoiceStatus.ISSUED,
            None,
        ),
    ]:
        taxable = plan.price_inr_monthly
        tax = 1440
        total = taxable + tax
        if not _first(
            session,
            select(SubscriptionInvoice).where(
                SubscriptionInvoice.invoice_number == inv_no
            ),
        ):
            session.add(
                SubscriptionInvoice(
                    tenant_id=tenant.id,
                    subscription_id=sub.id,
                    invoice_number=inv_no,
                    description=desc,
                    amount=taxable,
                    taxable_amount=taxable,
                    tax_amount=tax,
                    total_amount=total,
                    paid_amount=paid_amt,
                    balance_amount=bal_amt,
                    status=status_val,
                    issued_on=date.today(),
                    due_on=date.today(),
                    paid_on=date.today()
                    if status_val == SubscriptionInvoiceStatus.PAID
                    else None,
                    payment_method="upi"
                    if status_val == SubscriptionInvoiceStatus.PAID
                    else None,
                    payment_reference=f"UPI-{inv_no}"
                    if status_val == SubscriptionInvoiceStatus.PAID
                    else None,
                    gateway_transaction_id=f"gw-{inv_no.lower()}",
                    gateway_status=gw_status,
                )
            )
    session.commit()
    return sub


def create_branch_settings(
    session: Session, tenant: Tenant, branch: Branch, invoice_prefix: str
) -> None:
    upsert_setting(
        session,
        tenant_id=tenant.id,
        scope=SettingScope.TENANT,
        scope_id=tenant.id,
        module="communication",
        key=SettingKey.COMMUNICATION_PROVIDERS_ENABLED,
        value=["whatsapp", "sms", "voice"],
    )
    upsert_setting(
        session,
        tenant_id=tenant.id,
        scope=SettingScope.TENANT,
        scope_id=tenant.id,
        module="payment",
        key=SettingKey.PAYMENT_METHODS_ENABLED,
        value=[m.value for m in PaymentMethod],
    )
    upsert_setting(
        session,
        tenant_id=tenant.id,
        scope=SettingScope.BRANCH,
        scope_id=branch.id,
        module="invoice",
        key=SettingKey.INVOICE_PREFIX,
        value=invoice_prefix,
    )
    upsert_setting(
        session,
        tenant_id=tenant.id,
        scope=SettingScope.BRANCH,
        scope_id=branch.id,
        module="queue",
        key=SettingKey.QUEUE_REQUEUE_AFTER_PATIENTS,
        value=3,
    )
    upsert_setting(
        session,
        tenant_id=tenant.id,
        scope=SettingScope.BRANCH,
        scope_id=branch.id,
        module="queue",
        key=SettingKey.QUEUE_AUTO_NO_SHOW_AFTER_MISSED_CALLS,
        value=3,
    )
    upsert_setting(
        session,
        tenant_id=tenant.id,
        scope=SettingScope.BRANCH,
        scope_id=branch.id,
        module="appointment",
        key=SettingKey.FOLLOW_UP_VALIDITY_DAYS,
        value=7,
    )
    upsert_setting(
        session,
        tenant_id=tenant.id,
        scope=SettingScope.BRANCH,
        scope_id=branch.id,
        module="token",
        key=SettingKey.TOKEN_LANGUAGE,
        value="en",
    )


# ══════════════════════════════════════════════════════════════════════════════
# PATIENTS
# ══════════════════════════════════════════════════════════════════════════════


def create_patients(
    session: Session, tenant: Tenant, branch: Branch, admin: User
) -> list[Patient]:
    result: list[Patient] = []
    for (
        number,
        name,
        mobile,
        alt_mobile,
        email,
        gender,
        dob,
        age,
        area,
        blood_group,
        guardian,
    ) in PATIENTS_T1:
        p = _first(
            session,
            select(Patient).where(
                Patient.tenant_id == tenant.id, Patient.patient_number == number
            ),
        )
        if not p:
            p = Patient(
                tenant_id=tenant.id,
                branch_id=branch.id,
                patient_number=number,
                full_name=name,
                mobile=mobile,
                alternate_mobile=alt_mobile,
                email=email,
                gender=gender,
                date_of_birth=dob,
                age_years=age,
                area=area,
                blood_group=blood_group,
                guardian_name=guardian,
                guardian_mobile=alt_mobile if guardian else None,
            )
            session.add(p)
            session.commit()
            session.refresh(p)
            record_audit_event(
                session,
                tenant_id=tenant.id,
                branch_id=branch.id,
                actor_user_id=admin.id,
                action="patient.created",
                resource_type="patient",
                resource_id=p.id,
                purpose="system_seed",
            )

        # PatientContact (2 per patient where mobile exists)
        for label, c_name, c_mobile, rel, is_primary in [
            ("primary", f"{name} (self)", mobile, "self", True),
            (
                "emergency",
                guardian or f"Guardian of {name}",
                alt_mobile or mobile,
                "guardian",
                False,
            ),
        ]:
            if not _first(
                session,
                select(PatientContact).where(
                    PatientContact.patient_id == p.id, PatientContact.label == label
                ),
            ):
                session.add(
                    PatientContact(
                        tenant_id=tenant.id,
                        patient_id=p.id,
                        label=label,
                        name=c_name,
                        mobile=c_mobile,
                        relationship=rel,
                        is_primary=is_primary,
                    )
                )

        result.append(p)

    # PatientAlert variety
    alert_specs = [
        (
            result[0],
            AlertType.ALLERGY,
            "Sulfa drug allergy",
            AlertSeverity.HIGH,
            "Severe rash on previous exposure.",
        ),
        (
            result[0],
            AlertType.CHRONIC_CONDITION,
            "Type 2 Diabetes Mellitus",
            AlertSeverity.MEDIUM,
            "On Metformin 500mg BD.",
        ),
        (
            result[1],
            AlertType.RISK,
            "Hypertension – Stage 1",
            AlertSeverity.MEDIUM,
            "BP: 145/90. Monitor at every visit.",
        ),
        (
            result[2],
            AlertType.ALLERGY,
            "Penicillin allergy",
            AlertSeverity.CRITICAL,
            "Anaphylaxis history. Do NOT prescribe.",
        ),
        (result[3], AlertType.NOTE, "Prefers paediatric ward", AlertSeverity.LOW, None),
        (
            result[4],
            AlertType.CHRONIC_CONDITION,
            "Ischemic Heart Disease",
            AlertSeverity.HIGH,
            "On aspirin + statin. Avoid NSAIDs.",
        ),
        (
            result[5],
            AlertType.RISK,
            "Anaemia – Iron deficiency",
            AlertSeverity.MEDIUM,
            "Hb: 9.2 g/dL. On iron supplements.",
        ),
        (
            result[6],
            AlertType.ALLERGY,
            "Contrast dye allergy",
            AlertSeverity.HIGH,
            "Avoid iodine-based contrast.",
        ),
        (
            result[7],
            AlertType.NOTE,
            "Patient anxiety – needs calm consultation",
            AlertSeverity.LOW,
            None,
        ),
        (
            result[8],
            AlertType.NOTE,
            "Child – guardian must be present",
            AlertSeverity.LOW,
            None,
        ),
        (
            result[9],
            AlertType.CHRONIC_CONDITION,
            "Osteoarthritis – bilateral knee",
            AlertSeverity.MEDIUM,
            "Mobility aids in use.",
        ),
    ]
    for pat, a_type, title, severity, desc in alert_specs:
        if not _first(
            session,
            select(PatientAlert).where(
                PatientAlert.patient_id == pat.id, PatientAlert.title == title
            ),
        ):
            session.add(
                PatientAlert(
                    tenant_id=tenant.id,
                    patient_id=pat.id,
                    alert_type=a_type,
                    title=title,
                    description=desc,
                    severity=severity,
                    created_by_user_id=admin.id,
                )
            )
    session.commit()
    return result


# ══════════════════════════════════════════════════════════════════════════════
# APPOINTMENTS
# ══════════════════════════════════════════════════════════════════════════════


def create_appointments(
    session: Session,
    tenant: Tenant,
    branch: Branch,
    patients: list[Patient],
    doctors: dict[str, Practitioner],  # dept_slug → first doctor
    depts: dict[str, Department],
    admin: User,
) -> list[Appointment]:
    today = date.today()
    yesterday = _date_ago(1)
    last_week = _date_ago(7)

    # Pick a primary doctor (General Medicine, Main branch)
    primary_doc = doctors.get("sun_gen_0")
    cardio_doc = doctors.get("sun_ent_0")  # reuse for variety
    ped_doc = doctors.get("sun_ped_0")
    ortho_doc = doctors.get("sun_ortho_0")

    gen_dept = depts.get("sun_gen")
    ped_dept = depts.get("sun_ped")
    ent_dept = depts.get("sun_ent")
    orth_dept = depts.get("sun_ortho")

    specs = [
        # (patient, appt_type, date, appt_time, dept, doctor, status, reason, billable, emergency_reason)
        (
            patients[0],
            AppointmentType.OP,
            today,
            time(9, 0),
            gen_dept,
            primary_doc,
            AppointmentStatus.CONSULTATION_COMPLETED,
            "Fever and body ache",
            True,
            None,
        ),
        (
            patients[1],
            AppointmentType.OP,
            today,
            time(9, 15),
            gen_dept,
            primary_doc,
            AppointmentStatus.WAITING,
            "Persistent cough 10 days",
            True,
            None,
        ),
        (
            patients[2],
            AppointmentType.FOLLOW_UP,
            today,
            time(9, 30),
            gen_dept,
            primary_doc,
            AppointmentStatus.CALLED,
            "Post-diabetes medication review",
            True,
            None,
        ),
        (
            patients[3],
            AppointmentType.OP,
            today,
            time(10, 0),
            ped_dept,
            ped_doc,
            AppointmentStatus.CHECKED_IN,
            "Ear pain and fever",
            True,
            None,
        ),
        (
            patients[4],
            AppointmentType.EMERGENCY,
            today,
            None,
            gen_dept,
            primary_doc,
            AppointmentStatus.IN_CONSULTATION,
            "Chest pain – acute onset",
            True,
            "Acute chest pain, BP 160/100",
        ),
        (
            patients[5],
            AppointmentType.WALK_IN,
            today,
            time(11, 0),
            gen_dept,
            primary_doc,
            AppointmentStatus.SCHEDULED,
            "Routine checkup",
            True,
            None,
        ),
        (
            patients[6],
            AppointmentType.DOCTOR_REVIEW,
            today,
            time(11, 30),
            gen_dept,
            primary_doc,
            AppointmentStatus.WAITING,
            "Review post-treatment",
            False,
            None,
        ),
        (
            patients[7],
            AppointmentType.FITNESS_CERTIFICATE,
            today,
            time(14, 0),
            gen_dept,
            primary_doc,
            AppointmentStatus.SCHEDULED,
            "Pre-employment fitness cert",
            True,
            None,
        ),
        (
            patients[8],
            AppointmentType.OP,
            today,
            time(10, 30),
            ped_dept,
            ped_doc,
            AppointmentStatus.WAITING,
            "Child 5yr – vaccination review",
            True,
            None,
        ),
        (
            patients[9],
            AppointmentType.OP,
            today,
            time(15, 0),
            orth_dept,
            ortho_doc,
            AppointmentStatus.SCHEDULED,
            "Knee pain bilateral",
            True,
            None,
        ),
        # Yesterday
        (
            patients[0],
            AppointmentType.OP,
            yesterday,
            time(9, 0),
            gen_dept,
            primary_doc,
            AppointmentStatus.BILLED,
            "Initial fever consultation",
            True,
            None,
        ),
        (
            patients[1],
            AppointmentType.ONLINE,
            yesterday,
            time(16, 0),
            gen_dept,
            primary_doc,
            AppointmentStatus.BILLED,
            "Teleconsultation – cough",
            True,
            None,
        ),
        # Last week
        (
            patients[2],
            AppointmentType.OP,
            last_week,
            time(9, 0),
            gen_dept,
            primary_doc,
            AppointmentStatus.NO_SHOW,
            "Was scheduled; did not attend",
            True,
            None,
        ),
        (
            patients[3],
            AppointmentType.OP,
            last_week,
            time(10, 0),
            ped_dept,
            ped_doc,
            AppointmentStatus.BILLED,
            "Ear infection first visit",
            True,
            None,
        ),
    ]

    appointments: list[Appointment] = []
    for (
        pat,
        appt_type,
        appt_date,
        appt_time,
        dept,
        doc,
        status,
        reason,
        billable,
        emergency_reason,
    ) in specs:
        if doc is None or dept is None:
            continue
        existing = _first(
            session,
            select(Appointment).where(
                Appointment.tenant_id == tenant.id,
                Appointment.patient_id == pat.id,
                Appointment.appointment_type == appt_type,
                Appointment.appointment_date == appt_date,
            ),
        )
        if existing:
            appointments.append(existing)
            continue
        appt = Appointment(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=pat.id,
            department_id=dept.id,
            practitioner_id=doc.id,
            appointment_type=appt_type,
            appointment_date=appt_date,
            appointment_time=appt_time,
            reason=reason,
            status=status,
            is_billable=billable,
            billing_note="Free review – within 7-day window" if not billable else None,
            emergency_reason=emergency_reason,
            created_by_user_id=admin.id,
        )
        session.add(appt)
        session.commit()
        session.refresh(appt)
        record_audit_event(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            actor_user_id=admin.id,
            action="appointment.booked",
            resource_type="appointment",
            resource_id=appt.id,
            purpose="system_seed",
        )
        appointments.append(appt)
    return appointments


# ══════════════════════════════════════════════════════════════════════════════
# QUEUE
# ══════════════════════════════════════════════════════════════════════════════


def create_queue(
    session: Session,
    tenant: Tenant,
    branch: Branch,
    appointments: list[Appointment],
    admin: User,
) -> list[QueueEntry]:
    entries: list[QueueEntry] = []
    for appt in appointments:
        if appt.appointment_date != date.today():
            continue
        qe = _first(
            session,
            select(QueueEntry).where(
                QueueEntry.tenant_id == tenant.id, QueueEntry.appointment_id == appt.id
            ),
        )
        if not qe:
            qe = create_queue_entry_for_appointment(session, appt)
        qe.status = appt.status
        session.add(qe)
        session.commit()
        entries.append(qe)

    # QueueEvent – 2 events per first 2 entries
    for qe in entries[:2]:
        for action, from_st, to_st in [
            ("check_in", AppointmentStatus.SCHEDULED, AppointmentStatus.CHECKED_IN),
            ("call", AppointmentStatus.CHECKED_IN, AppointmentStatus.CALLED),
        ]:
            if not _first(
                session,
                select(QueueEvent).where(
                    QueueEvent.queue_entry_id == qe.id, QueueEvent.action == action
                ),
            ):
                session.add(
                    QueueEvent(
                        tenant_id=tenant.id,
                        branch_id=branch.id,
                        queue_entry_id=qe.id,
                        appointment_id=qe.appointment_id,
                        action=action,
                        from_status=from_st,
                        to_status=to_st,
                        actor_user_id=admin.id,
                    )
                )
    session.commit()
    return entries


# ══════════════════════════════════════════════════════════════════════════════
# CONSULTATION (full sub-records)
# ══════════════════════════════════════════════════════════════════════════════


def create_consultation(
    session: Session,
    tenant: Tenant,
    branch: Branch,
    patient: Patient,
    appt: Appointment,
    admin: User,
) -> Consultation:
    existing = _first(
        session,
        select(Consultation).where(
            Consultation.tenant_id == tenant.id, Consultation.appointment_id == appt.id
        ),
    )
    if existing:
        return existing

    now = _now()
    consult = Consultation(
        tenant_id=tenant.id,
        branch_id=branch.id,
        appointment_id=appt.id,
        patient_id=patient.id,
        practitioner_id=appt.practitioner_id,
        status=ConsultationStatus.SIGNED,
        treatment_type="general_consultation",
        chief_complaint="Fever 102°F with body ache for 3 days",
        diagnosis="Viral fever with myalgia; rule out dengue",
        clinical_notes=(
            "Patient presents with high-grade fever, body ache, retro-orbital pain. "
            "No rash. Vitals: Temp 38.8°C, BP 110/70, PR 96/min, SpO2 98%. "
            "Advised rest, hydration, paracetamol. CBC ordered."
        ),
        prescription_text=(
            "1. Paracetamol 650mg – TID after food × 5 days\n"
            "2. Cetirizine 10mg – OD at night × 3 days\n"
            "3. ORS sachets – after each loose stool"
        ),
        lab_referral_text="CBC with differential, NS1 antigen, Dengue IgM/IgG",
        scan_referral_text=None,
        follow_up_advice="Review after 3 days or immediately if rash, bleeding, or breathlessness.",
        patient_remarks="Patient concerned about returning to work.",
        created_by_user_id=admin.id,
        signed_by_user_id=appt.practitioner_id,
        signed_at=now,
    )
    appt.status = AppointmentStatus.CONSULTATION_COMPLETED
    appt.updated_at = now
    session.add(consult)
    session.add(appt)
    session.commit()
    session.refresh(consult)

    # Vitals
    for vname, vval, vunit in [
        ("Temperature", "38.8", "°C"),
        ("Blood Pressure", "110/70", "mmHg"),
        ("Pulse Rate", "96", "bpm"),
        ("SpO2", "98", "%"),
        ("Weight", "68", "kg"),
        ("Height", "165", "cm"),
    ]:
        session.add(
            ConsultationVital(
                tenant_id=tenant.id,
                consultation_id=consult.id,
                name=vname,
                value=vval,
                unit=vunit,
            )
        )

    # Complaints
    for complaint, duration, severity in [
        ("High-grade fever", "3 days", "severe"),
        ("Body ache / myalgia", "3 days", "moderate"),
        ("Retro-orbital headache", "2 days", "moderate"),
        ("Loss of appetite", "2 days", "mild"),
        ("Mild nausea", "1 day", "mild"),
    ]:
        session.add(
            ConsultationComplaint(
                tenant_id=tenant.id,
                consultation_id=consult.id,
                complaint=complaint,
                duration=duration,
                severity=severity,
            )
        )

    # Diagnoses
    for dx, dx_type, notes in [
        ("Viral fever with myalgia", "primary", "Probable dengue – awaiting NS1."),
        ("Dehydration – mild", "secondary", "Oral hydration advised."),
        (
            "Reactive thrombocytopenia risk",
            "secondary",
            "Monitor platelet count on Day 3.",
        ),
    ]:
        session.add(
            ConsultationDiagnosis(
                tenant_id=tenant.id,
                consultation_id=consult.id,
                diagnosis=dx,
                diagnosis_type=dx_type,
                notes=notes,
            )
        )

    # Medicines
    for med, dosage, freq, dur, instructions in [
        (
            "Paracetamol 650mg",
            "650mg",
            "Three times daily",
            "5 days",
            "After food. Avoid on empty stomach.",
        ),
        ("Cetirizine 10mg", "10mg", "Once daily", "3 days", "At bedtime."),
        (
            "ORS Sachet",
            "1 pkt",
            "After each stool",
            "3 days",
            "Dissolve in 200ml water.",
        ),
        ("Vitamin C 500mg", "500mg", "Once daily", "7 days", "After breakfast."),
    ]:
        session.add(
            ConsultationMedicine(
                tenant_id=tenant.id,
                consultation_id=consult.id,
                medicine_name=med,
                dosage=dosage,
                frequency=freq,
                duration=dur,
                instructions=instructions,
            )
        )

    # Referrals
    for ref_type, item_name, priority, instructions in [
        (
            "lab",
            "CBC with differential count",
            "urgent",
            "Collect within 24 hrs. Fasting not required.",
        ),
        ("lab", "NS1 Antigen", "urgent", "Dengue rapid card test."),
        ("lab", "Dengue IgM / IgG", "routine", "Serology panel."),
        ("lab", "Fasting Blood Sugar", "routine", "8-hour fast required."),
    ]:
        session.add(
            ConsultationReferral(
                tenant_id=tenant.id,
                consultation_id=consult.id,
                referral_type=ref_type,
                item_name=item_name,
                priority=priority,
                instructions=instructions,
            )
        )

    session.commit()

    # Addenda
    for note in [
        "Patient called at 6 PM – fever persisted at 39°C. Advised to increase fluid intake and return if platelet drops below 1 lakh.",
        "Day 2 follow-up call: fever subsided to 37.8°C. NS1 result awaited. Continue current medications.",
    ]:
        session.add(
            ConsultationAddendum(
                tenant_id=tenant.id,
                consultation_id=consult.id,
                note=note,
                created_by_user_id=admin.id,
            )
        )

    # Clinical templates
    for tname, ttype, dept_id, fields in [
        (
            "Viral Fever Protocol",
            "consultation",
            "sun_gen",
            ["temp", "bp", "pulse", "spo2", "diagnosis", "prescription"],
        ),
        (
            "Dengue Workup Checklist",
            "consultation",
            "sun_gen",
            ["ns1_result", "platelet_count", "hematocrit", "fluid_intake"],
        ),
        (
            "Pediatric URTI Template",
            "consultation",
            "sun_ped",
            ["weight", "temp", "throat_exam", "ear_exam", "prescription"],
        ),
        (
            "Dermatology Skin Assessment",
            "consultation",
            "sun_derm",
            ["lesion_type", "location", "duration", "trigger", "rx"],
        ),
    ]:
        if not _first(
            session,
            select(ClinicalTemplate).where(
                ClinicalTemplate.tenant_id == tenant.id, ClinicalTemplate.name == tname
            ),
        ):
            session.add(
                ClinicalTemplate(
                    tenant_id=tenant.id,
                    department_id=dept_id,
                    name=tname,
                    template_type=ttype,
                    content_json=json.dumps({"fields": fields}),
                    created_by_user_id=admin.id,
                )
            )

    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant.id,
        branch_id=branch.id,
        actor_user_id=appt.practitioner_id,
        action="consultation.signed",
        resource_type="consultation",
        resource_id=consult.id,
        purpose="system_seed",
    )
    return consult


# ══════════════════════════════════════════════════════════════════════════════
# BILLING
# ══════════════════════════════════════════════════════════════════════════════


def create_billing(
    session: Session,
    tenant: Tenant,
    branch: Branch,
    appointments: list[Appointment],
    consultation: Consultation,
    doctors: dict[str, Practitioner],
    admin: User,
) -> Invoice:
    # Tax rules
    for tname, pct, label in [
        ("GST 18% – Medical Services", 18, "GST"),
        ("GST 5% – Medicines", 5, "GST"),
        ("Tax Exempt – Basic OPD", 0, "NIL"),
    ]:
        if not _first(
            session,
            select(TaxRule).where(
                TaxRule.tenant_id == tenant.id, TaxRule.name == tname
            ),
        ):
            session.add(
                TaxRule(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    name=tname,
                    tax_percentage=pct,
                    tax_label=label,
                    created_by_user_id=admin.id,
                )
            )
    session.commit()

    # Fee rules.
    # treatment_type=None is a wildcard — the scoring function only penalises
    # when rule.treatment_type is NOT None and does not match the appointment.
    # Branch-level catch-alls (practitioner_id=None, department_id=None) guarantee
    # every appointment type always has at least one eligible rule scoring >= 0.
    fee_specs = [
        # (doctor_slug, dept_id, appt_type, treatment_type, fee, share_pct)
        ("sun_dr_gen1", "sun_gen", AppointmentType.OP, None, 600, 60),
        ("sun_dr_gen1", "sun_gen", AppointmentType.FOLLOW_UP, None, 300, 60),
        ("sun_dr_gen1", "sun_gen", AppointmentType.EMERGENCY, None, 1500, 70),
        ("sun_dr_gen1", "sun_gen", AppointmentType.DOCTOR_REVIEW, None, 0, 60),
        ("sun_dr_gen1", "sun_gen", AppointmentType.FITNESS_CERTIFICATE, None, 500, 60),
        ("sun_dr_gen1", "sun_gen", AppointmentType.ONLINE, None, 400, 60),
        ("sun_dr_gen1", "sun_gen", AppointmentType.WALK_IN, None, 600, 60),
        ("sun_dr_gen2", "sun_gen", AppointmentType.OP, None, 600, 60),
        ("sun_dr_ped1", "sun_ped", AppointmentType.OP, None, 700, 60),
        ("sun_dr_ped1", "sun_ped", AppointmentType.FOLLOW_UP, None, 350, 60),
        ("sun_dr_ped2", "sun_ped", AppointmentType.OP, None, 700, 60),
        ("sun_dr_ent1", "sun_ent", AppointmentType.OP, None, 800, 65),
        ("sun_dr_ort1", "sun_ortho", AppointmentType.OP, None, 1000, 65),
        # Branch-level catch-alls — no practitioner/dept filter, no treatment filter.
        # These score exactly 0 and are only picked when no doctor-specific rule exists.
        (None, None, AppointmentType.OP, None, 600, 60),
        (None, None, AppointmentType.FOLLOW_UP, None, 300, 60),
        (None, None, AppointmentType.EMERGENCY, None, 1500, 70),
        (None, None, AppointmentType.DOCTOR_REVIEW, None, 0, 60),
        (None, None, AppointmentType.FITNESS_CERTIFICATE, None, 500, 60),
        (None, None, AppointmentType.ONLINE, None, 400, 60),
        (None, None, AppointmentType.WALK_IN, None, 600, 60),
    ]
    for doc_id, dept_id, appt_type, treatment_type, fee, share_pct in fee_specs:
        if not _first(
            session,
            select(DoctorFeeRule).where(
                DoctorFeeRule.tenant_id == tenant.id,
                DoctorFeeRule.branch_id == branch.id,
                DoctorFeeRule.practitioner_id == doc_id,
                DoctorFeeRule.appointment_type == appt_type,
                DoctorFeeRule.treatment_type == treatment_type,
            ),
        ):
            session.add(
                DoctorFeeRule(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    department_id=dept_id,
                    practitioner_id=doc_id,
                    appointment_type=appt_type,
                    treatment_type=treatment_type,
                    fee_amount=fee,
                    share_type=FeeShareType.PERCENTAGE,
                    doctor_share_percentage=share_pct,
                )
            )
    session.commit()

    # Primary invoice (for the signed consultation)
    primary_appt = _first(
        session,
        select(Appointment).where(Appointment.id == consultation.appointment_id),
    )
    invoice = _first(
        session,
        select(Invoice).where(
            Invoice.tenant_id == tenant.id, Invoice.consultation_id == consultation.id
        ),
    )
    if not invoice:
        invoice, _item = create_consultation_invoice(
            session,
            appointment=primary_appt,
            consultation_id=consultation.id,
            discount_amount=0,
            created_by_user_id=admin.id,
            treatment_type=None,  # None so scorer does not penalise on treatment_type mismatch
        )
        record_audit_event(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            actor_user_id=admin.id,
            action="invoice.generated",
            resource_type="invoice",
            resource_id=invoice.id,
            purpose="system_seed",
        )

    # Payments (split – cash + UPI)
    half = invoice.total_amount // 2
    remainder = invoice.total_amount - half
    for method, amount, ref in [
        (PaymentMethod.CASH, half, None),
        (PaymentMethod.UPI, remainder, f"UPI-{invoice.invoice_number}"),
    ]:
        if not _first(
            session,
            select(Payment).where(
                Payment.invoice_id == invoice.id, Payment.method == method
            ),
        ):
            session.add(
                Payment(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    invoice_id=invoice.id,
                    method=method,
                    amount=amount,
                    reference_number=ref,
                    status=PaymentStatus.RECORDED,
                    collected_by_user_id=admin.id,
                )
            )
    invoice.paid_amount = invoice.total_amount
    invoice.balance_amount = 0
    invoice.status = InvoiceStatus.PAID
    session.add(invoice)
    session.commit()

    # Discount approvals
    for disc_amt, reason, status_val, approved_by in [
        (100, "Senior citizen concession (65+)", ApprovalStatus.APPROVED, admin.id),
        (200, "Staff family – pending review", ApprovalStatus.PENDING, None),
        (150, "BPL card holder discount", ApprovalStatus.REJECTED, admin.id),
    ]:
        if not _first(
            session,
            select(DiscountApproval).where(
                DiscountApproval.tenant_id == tenant.id,
                DiscountApproval.reason == reason,
            ),
        ):
            session.add(
                DiscountApproval(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    appointment_id=primary_appt.id,
                    consultation_id=consultation.id,
                    requested_amount=disc_amt,
                    reason=reason,
                    status=status_val,
                    requested_by_user_id=admin.id,
                    approved_by_user_id=approved_by,
                    decided_at=_now() if status_val != ApprovalStatus.PENDING else None,
                )
            )

    # Credit notes
    for cn_no, cn_amt, cn_reason, cn_status in [
        (
            f"CN-{branch.id[:4].upper()}-001",
            300,
            "Duplicate billing correction",
            CreditNoteStatus.ISSUED,
        ),
        (
            f"CN-{branch.id[:4].upper()}-002",
            150,
            "Service cancelled before visit",
            CreditNoteStatus.CANCELLED,
        ),
    ]:
        if not _first(
            session, select(CreditNote).where(CreditNote.credit_note_number == cn_no)
        ):
            session.add(
                CreditNote(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    invoice_id=invoice.id,
                    credit_note_number=cn_no,
                    amount=cn_amt,
                    reason=cn_reason,
                    status=cn_status,
                    created_by_user_id=admin.id,
                )
            )

    # Doctor settlements
    for doc_id, inv_count, total_inv, total_paid, doc_share, settle_amt in [
        ("sun_dr_gen1", 25, 15000, 14500, 8700, 8700),
        ("sun_dr_gen2", 18, 10800, 10800, 6480, 6480),
        ("sun_dr_ped1", 20, 14000, 13000, 7800, 7800),
        ("sun_dr_ent1", 15, 12000, 12000, 7800, 7800),
        ("sun_dr_ort1", 12, 12000, 11000, 7150, 7150),
    ]:
        if not _first(
            session,
            select(DoctorSettlement).where(
                DoctorSettlement.tenant_id == tenant.id,
                DoctorSettlement.practitioner_id == doc_id,
            ),
        ):
            session.add(
                DoctorSettlement(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    practitioner_id=doc_id,
                    invoice_count=inv_count,
                    total_invoice_amount=total_inv,
                    total_paid_amount=total_paid,
                    total_doctor_share=doc_share,
                    settlement_amount=settle_amt,
                    status=SettlementStatus.FINALIZED,
                    finalized_by_user_id=admin.id,
                )
            )
    session.commit()
    return invoice


# ══════════════════════════════════════════════════════════════════════════════
# LAB
# ══════════════════════════════════════════════════════════════════════════════


def create_lab(
    session: Session,
    tenant: Tenant,
    branch: Branch,
    patient: Patient,
    consultation: Consultation,
    admin: User,
) -> LabOrder:
    # ── Catalog ──────────────────────────────────────────────────────────────
    def _test(code, name, dept, sample, price, tat):
        t = _first(
            session,
            select(LabTestCatalog).where(
                LabTestCatalog.tenant_id == tenant.id, LabTestCatalog.code == code
            ),
        )
        if not t:
            t = LabTestCatalog(
                tenant_id=tenant.id,
                branch_id=branch.id,
                code=code,
                name=name,
                department=dept,
                sample_type=sample,
                default_price=price,
                turnaround_minutes=tat,
                created_by_user_id=admin.id,
            )
            session.add(t)
            session.commit()
            session.refresh(t)
        return t

    cbc = _test("CBC", "Complete Blood Count", "Haematology", "Blood (EDTA)", 300, 120)
    ns1 = _test("NS1", "NS1 Dengue Antigen", "Serology", "Blood (plain)", 450, 60)
    dengue = _test("DEN_IGM", "Dengue IgM / IgG", "Serology", "Blood (plain)", 600, 180)
    fbs = _test("FBS", "Fasting Blood Sugar", "Biochemistry", "Blood (F)", 120, 180)
    hba1c = _test(
        "HBA1C", "HbA1c Glycated Haemoglobin", "Biochemistry", "Blood (EDTA)", 450, 360
    )
    creatinine = _test(
        "CREAT", "Serum Creatinine", "Biochemistry", "Blood (plain)", 180, 180
    )
    urine_re = _test(
        "URE", "Urine Routine Examination", "Pathology", "Urine (mid)", 80, 120
    )
    ecg = _test("ECG12", "12-Lead ECG", "Cardiology", "Procedure", 200, 30)
    xray = _test("XRAY_CXR", "Chest X-Ray PA View", "Radiology", "Procedure", 350, 60)

    # ── Packages ─────────────────────────────────────────────────────────────
    def _pkg(code, name, desc, price, tests):
        pkg = _first(
            session,
            select(LabTestPackage).where(
                LabTestPackage.tenant_id == tenant.id, LabTestPackage.code == code
            ),
        )
        if not pkg:
            pkg = LabTestPackage(
                tenant_id=tenant.id,
                branch_id=branch.id,
                code=code,
                name=name,
                description=desc,
                package_price=price,
                created_by_user_id=admin.id,
            )
            session.add(pkg)
            session.commit()
            session.refresh(pkg)
            for t_obj in tests:
                session.add(
                    LabTestPackageItem(
                        tenant_id=tenant.id, package_id=pkg.id, test_id=t_obj.id
                    )
                )
            session.commit()
        return pkg

    dengue_panel = _pkg(
        "DENGUE_PANEL",
        "Dengue Fever Panel",
        "CBC + NS1 + Dengue IgM/IgG",
        1100,
        [cbc, ns1, dengue],
    )
    diabetes_pkg = _pkg(
        "DIAB_PANEL", "Diabetes Monitoring Panel", "FBS + HbA1c", 500, [fbs, hba1c]
    )
    renal_pkg = _pkg(
        "RENAL_PANEL",
        "Renal Function Panel",
        "Creatinine + Urine RE",
        240,
        [creatinine, urine_re],
    )
    cardiac_pkg = _pkg(
        "CARDIAC_SCR", "Cardiac Screening", "ECG + Chest X-Ray", 500, [ecg, xray]
    )

    # ── Result templates ─────────────────────────────────────────────────────
    for tmpl_name, test_obj, fields in [
        (
            "CBC Report Template",
            cbc,
            ["Hb", "WBC", "Neutrophils%", "Lymphocytes%", "Platelets", "Remarks"],
        ),
        ("NS1 Antigen Template", ns1, ["Result", "Band_Intensity", "Remarks"]),
        ("FBS Report Template", fbs, ["FBS_mg_dL", "Reference_Range", "Remarks"]),
        ("HbA1c Report Template", hba1c, ["HbA1c_%", "Avg_Glucose_mg_dL", "Remarks"]),
        (
            "Urine RE Template",
            urine_re,
            ["Colour", "Clarity", "pH", "Protein", "Glucose", "RBC", "WBC", "Remarks"],
        ),
        (
            "ECG Report Template",
            ecg,
            ["Heart_Rate", "Rhythm", "PR_ms", "QRS_ms", "QTc_ms", "Interpretation"],
        ),
    ]:
        if not _first(
            session,
            select(LabResultTemplate).where(
                LabResultTemplate.tenant_id == tenant.id,
                LabResultTemplate.name == tmpl_name,
            ),
        ):
            session.add(
                LabResultTemplate(
                    tenant_id=tenant.id,
                    test_id=test_obj.id,
                    name=tmpl_name,
                    content_json=json.dumps({"fields": fields}),
                    created_by_user_id=admin.id,
                )
            )
    session.commit()

    cbc_template = _first(
        session,
        select(LabResultTemplate).where(
            LabResultTemplate.tenant_id == tenant.id,
            LabResultTemplate.name == "CBC Report Template",
        ),
    )

    # ── Lab Order 1 – from consultation ──────────────────────────────────────
    order1 = _first(
        session,
        select(LabOrder).where(
            LabOrder.tenant_id == tenant.id, LabOrder.consultation_id == consultation.id
        ),
    )
    if not order1:
        order1 = LabOrder(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            consultation_id=consultation.id,
            source=LabOrderSource.CONSULTATION,
            status=LabOrderStatus.RESULT_READY,
            priority=LabOrderPriority.URGENT,
            tests="CBC, NS1 Antigen, Dengue IgM/IgG",
            notes="Dengue fever workup. Urgent – collect immediately.",
            amount=1100,
            ordered_by_user_id=admin.id,
            sample_collected_at=_ago(hours=3),
            result_ready_at=_ago(hours=1),
        )
        session.add(order1)
        session.commit()
        session.refresh(order1)
        record_audit_event(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            actor_user_id=admin.id,
            action="lab_order.created",
            resource_type="lab_order",
            resource_id=order1.id,
            purpose="system_seed",
        )

    for test_obj in [cbc, ns1, dengue]:
        if not _first(
            session,
            select(LabOrderItem).where(
                LabOrderItem.tenant_id == tenant.id,
                LabOrderItem.lab_order_id == order1.id,
                LabOrderItem.test_id == test_obj.id,
            ),
        ):
            session.add(
                LabOrderItem(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    lab_order_id=order1.id,
                    test_id=test_obj.id,
                    package_id=dengue_panel.id,
                    test_name=test_obj.name,
                    sample_type=test_obj.sample_type,
                    price=0,
                    status=LabOrderStatus.RESULT_READY,
                )
            )

    if not _first(
        session,
        select(LabSample).where(
            LabSample.tenant_id == tenant.id, LabSample.lab_order_id == order1.id
        ),
    ):
        session.add(
            LabSample(
                tenant_id=tenant.id,
                branch_id=branch.id,
                lab_order_id=order1.id,
                barcode=f"BAR-{order1.id[-8:].upper()}-1",
                sample_type="Blood (EDTA + Plain)",
                collected_by_user_id=admin.id,
                notes="3 mL EDTA + 3 mL plain tubes collected.",
            )
        )

    if not _first(
        session,
        select(LabResult).where(
            LabResult.tenant_id == tenant.id, LabResult.lab_order_id == order1.id
        ),
    ):
        session.add(
            LabResult(
                tenant_id=tenant.id,
                branch_id=branch.id,
                lab_order_id=order1.id,
                template_id=cbc_template.id if cbc_template else None,
                result_summary=(
                    "CBC: Hb 13.2 g/dL, WBC 3800/µL (Lymphocytosis 52%), "
                    "Platelets 98,000/µL ↓ (Low). "
                    "NS1 Antigen: POSITIVE. Dengue IgM: Reactive. "
                    "Impression: Dengue fever confirmed – monitor platelets daily."
                ),
                abnormal_flag=True,
                report_url=f"https://reports.sunriseclinic.in/lab/{order1.id}.pdf",
                report_file_name=f"dengue_panel_{patient.patient_number}.pdf",
                released_by_user_id=admin.id,
            )
        )

    # ── Lab Order 2 – OP direct (diabetes workup) ─────────────────────────
    order2 = _first(
        session,
        select(LabOrder).where(
            LabOrder.tenant_id == tenant.id,
            LabOrder.patient_id == patient.id,
            LabOrder.source == LabOrderSource.OP_DIRECT,
        ),
    )
    if not order2:
        order2 = LabOrder(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            consultation_id=None,
            source=LabOrderSource.OP_DIRECT,
            status=LabOrderStatus.IN_PROGRESS,
            priority=LabOrderPriority.ROUTINE,
            tests="FBS, HbA1c",
            notes="Annual diabetes monitoring.",
            amount=500,
            ordered_by_user_id=admin.id,
            sample_collected_at=_ago(hours=6),
        )
        session.add(order2)
        session.commit()
        session.refresh(order2)
        for test_obj in [fbs, hba1c]:
            session.add(
                LabOrderItem(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    lab_order_id=order2.id,
                    test_id=test_obj.id,
                    package_id=diabetes_pkg.id,
                    test_name=test_obj.name,
                    sample_type=test_obj.sample_type,
                    price=test_obj.default_price,
                    status=LabOrderStatus.IN_PROGRESS,
                )
            )
        session.add(
            LabSample(
                tenant_id=tenant.id,
                branch_id=branch.id,
                lab_order_id=order2.id,
                barcode=f"BAR-{order2.id[-8:].upper()}-2",
                sample_type="Blood (Fasting)",
                collected_by_user_id=admin.id,
            )
        )

    session.commit()
    return order1


# ══════════════════════════════════════════════════════════════════════════════
# PHARMACY
# ══════════════════════════════════════════════════════════════════════════════


def create_pharmacy(
    session: Session,
    tenant: Tenant,
    branch: Branch,
    patient: Patient,
    consultation: Consultation,
    admin: User,
) -> PharmacyIssue:
    # ── Medicine catalog ──────────────────────────────────────────────────────
    def _med(code, name, generic, form, strength, manufacturer, price, reorder):
        m = _first(
            session,
            select(MedicineCatalog).where(
                MedicineCatalog.tenant_id == tenant.id, MedicineCatalog.code == code
            ),
        )
        if not m:
            m = MedicineCatalog(
                tenant_id=tenant.id,
                branch_id=branch.id,
                code=code,
                name=name,
                generic_name=generic,
                form=form,
                strength=strength,
                manufacturer=manufacturer,
                default_sale_price=price,
                reorder_level=reorder,
                created_by_user_id=admin.id,
            )
            session.add(m)
            session.commit()
            session.refresh(m)
        return m

    pcm650 = _med(
        "PCM650",
        "Paracetamol 650mg",
        "Paracetamol",
        "Tablet",
        "650mg",
        "Abbott India Ltd",
        6,
        50,
    )
    cetirizine = _med(
        "CTZ10", "Cetirizine 10mg", "Cetirizine", "Tablet", "10mg", "GSK Pharma", 4, 30
    )
    ors = _med(
        "ORS_PKT", "ORS Sachet Electral", "ORS", "Sachet", "21.8g", "FDC Limited", 9, 40
    )
    vitc = _med(
        "VIT_C500",
        "Vitamin C 500mg",
        "Ascorbic Acid",
        "Tablet",
        "500mg",
        "Himalaya",
        5,
        30,
    )
    metformin = _med(
        "MET500", "Metformin 500mg", "Metformin", "Tablet", "500mg", "Sun Pharma", 7, 30
    )
    amlodipine = _med(
        "AML5", "Amlodipine 5mg", "Amlodipine", "Tablet", "5mg", "Cipla Ltd", 8, 20
    )
    pantop = _med(
        "PANTO40",
        "Pantoprazole 40mg",
        "Pantoprazole",
        "Tablet",
        "40mg",
        "Zydus Cadila",
        9,
        25,
    )
    azith = _med(
        "AZ500",
        "Azithromycin 500mg",
        "Azithromycin",
        "Tablet",
        "500mg",
        "Cipla Ltd",
        28,
        15,
    )

    # ── Suppliers ─────────────────────────────────────────────────────────────
    def _supplier(name, phone, email, address):
        s = _first(
            session,
            select(PharmacySupplier).where(
                PharmacySupplier.tenant_id == tenant.id, PharmacySupplier.name == name
            ),
        )
        if not s:
            s = PharmacySupplier(
                tenant_id=tenant.id,
                name=name,
                phone=phone,
                email=email,
                address=address,
                created_by_user_id=admin.id,
            )
            session.add(s)
            session.commit()
            session.refresh(s)
        return s

    supp1 = _supplier(
        "Sunrise Pharma Distributor",
        "9444501001",
        "orders@sunrisepharma.in",
        "23 Anna Salai, Chennai – 600002",
    )
    supp2 = _supplier(
        "MedPlus Wholesale Chennai",
        "9444502001",
        "wholesale@medplus.in",
        "7 Pantheon Road, Egmore, Chennai – 600008",
    )

    # ── Purchase 1 ────────────────────────────────────────────────────────────
    pur1 = _first(
        session,
        select(PharmacyPurchase).where(
            PharmacyPurchase.tenant_id == tenant.id,
            PharmacyPurchase.invoice_number == "PINV-SUN-2025-001",
        ),
    )
    if not pur1:
        pur1 = PharmacyPurchase(
            tenant_id=tenant.id,
            branch_id=branch.id,
            supplier_id=supp1.id,
            invoice_number="PINV-SUN-2025-001",
            total_amount=4850,
            purchased_by_user_id=admin.id,
        )
        session.add(pur1)
        session.commit()
        session.refresh(pur1)

    # ── Purchase 2 ────────────────────────────────────────────────────────────
    pur2 = _first(
        session,
        select(PharmacyPurchase).where(
            PharmacyPurchase.tenant_id == tenant.id,
            PharmacyPurchase.invoice_number == "PINV-SUN-2025-002",
        ),
    )
    if not pur2:
        pur2 = PharmacyPurchase(
            tenant_id=tenant.id,
            branch_id=branch.id,
            supplier_id=supp2.id,
            invoice_number="PINV-SUN-2025-002",
            total_amount=3200,
            purchased_by_user_id=admin.id,
        )
        session.add(pur2)
        session.commit()
        session.refresh(pur2)

    # ── Batches + purchase items + stock ledger ───────────────────────────────
    def _batch(medicine, purchase, batch_no, qty, cost, sale):
        b = _first(
            session,
            select(MedicineBatch).where(
                MedicineBatch.tenant_id == tenant.id,
                MedicineBatch.medicine_id == medicine.id,
                MedicineBatch.batch_number == batch_no,
            ),
        )
        if not b:
            b = MedicineBatch(
                tenant_id=tenant.id,
                branch_id=branch.id,
                medicine_id=medicine.id,
                purchase_id=purchase.id,
                batch_number=batch_no,
                quantity_on_hand=qty,
                cost_price=cost,
                sale_price=sale,
            )
            session.add(b)
            session.commit()
            session.refresh(b)
            session.add(
                PharmacyPurchaseItem(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    purchase_id=purchase.id,
                    medicine_id=medicine.id,
                    batch_id=b.id,
                    quantity=qty,
                    cost_price=cost,
                    sale_price=sale,
                    taxable_amount=qty * cost,
                )
            )
            session.add(
                PharmacyStockLedger(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    medicine_id=medicine.id,
                    batch_id=b.id,
                    movement_type=StockLedgerMovement.PURCHASE,
                    quantity_delta=qty,
                    balance_after=qty,
                    reference_type="pharmacy_purchase",
                    reference_id=purchase.id,
                    actor_user_id=admin.id,
                )
            )
            session.commit()
        return b

    b_pcm = _batch(pcm650, pur1, "PCM650-A2501", 200, 3, 6)
    b_ctz = _batch(cetirizine, pur1, "CTZ10-B2501", 100, 2, 4)
    b_ors = _batch(ors, pur1, "ORS-C2501", 150, 5, 9)
    b_vitc = _batch(vitc, pur1, "VITC-D2501", 120, 2, 5)
    b_met = _batch(metformin, pur2, "MET500-E2501", 180, 4, 7)
    b_aml = _batch(amlodipine, pur2, "AML5-F2501", 100, 4, 8)
    b_pant = _batch(pantop, pur2, "PAN40-G2501", 90, 5, 9)
    b_az = _batch(azith, pur2, "AZ500-H2501", 60, 14, 28)

    # Dispense ledger entries
    for med_obj, bat_obj, qty_disp in [
        (pcm650, b_pcm, 10),
        (cetirizine, b_ctz, 5),
        (ors, b_ors, 6),
        (vitc, b_vitc, 4),
    ]:
        if not _first(
            session,
            select(PharmacyStockLedger).where(
                PharmacyStockLedger.tenant_id == tenant.id,
                PharmacyStockLedger.medicine_id == med_obj.id,
                PharmacyStockLedger.movement_type == StockLedgerMovement.DISPENSE,
            ),
        ):
            session.add(
                PharmacyStockLedger(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    medicine_id=med_obj.id,
                    batch_id=bat_obj.id,
                    movement_type=StockLedgerMovement.DISPENSE,
                    quantity_delta=-qty_disp,
                    balance_after=bat_obj.quantity_on_hand - qty_disp,
                    reference_type="pharmacy_issue",
                    reference_id="pending_ref",
                    actor_user_id=admin.id,
                )
            )
    session.commit()

    # ── Pharmacy Return ────────────────────────────────────────────────────────
    if not _first(
        session,
        select(PharmacyReturn).where(
            PharmacyReturn.tenant_id == tenant.id,
            PharmacyReturn.purchase_id == pur1.id,
        ),
    ):
        ret = PharmacyReturn(
            tenant_id=tenant.id,
            branch_id=branch.id,
            supplier_id=supp1.id,
            purchase_id=pur1.id,
            reason="Short-expiry batch returned to supplier – 3 months to expiry.",
            total_amount=360,
            returned_by_user_id=admin.id,
        )
        session.add(ret)
        session.commit()
        session.refresh(ret)
        for med_obj, bat_obj, qty, amt in [
            (ors, b_ors, 20, 100),
            (cetirizine, b_ctz, 30, 260),
        ]:
            session.add(
                PharmacyReturnItem(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    return_id=ret.id,
                    medicine_id=med_obj.id,
                    batch_id=bat_obj.id,
                    quantity=qty,
                    amount=amt,
                )
            )
        session.commit()

    # ── Issue 1 – from consultation ───────────────────────────────────────────
    issue1 = _first(
        session,
        select(PharmacyIssue).where(
            PharmacyIssue.tenant_id == tenant.id,
            PharmacyIssue.consultation_id == consultation.id,
        ),
    )
    if not issue1:
        issue1 = PharmacyIssue(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            consultation_id=consultation.id,
            source=PharmacyIssueSource.CONSULTATION,
            status=PharmacyIssueStatus.DISPENSED,
            medicine_text=consultation.prescription_text,
            notes="Dispensed as per Dr. prescription. Counselled on ORS preparation.",
            amount=120,
            issued_by_user_id=admin.id,
            dispensed_by_user_id=admin.id,
            dispensed_at=_now(),
        )
        session.add(issue1)
        session.commit()
        session.refresh(issue1)
        record_audit_event(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            actor_user_id=admin.id,
            action="pharmacy_issue.dispensed",
            resource_type="pharmacy_issue",
            resource_id=issue1.id,
            purpose="system_seed",
        )
        for med_obj, bat_obj, qty, unit_price in [
            (pcm650, b_pcm, 10, 6),
            (cetirizine, b_ctz, 3, 4),
            (ors, b_ors, 6, 9),
            (vitc, b_vitc, 7, 5),
        ]:
            session.add(
                PharmacyIssueItem(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    pharmacy_issue_id=issue1.id,
                    medicine_id=med_obj.id,
                    batch_id=bat_obj.id,
                    medicine_name=med_obj.name,
                    quantity=qty,
                    unit_price=unit_price,
                    dispensed_quantity=qty,
                )
            )
        session.commit()

    # ── Issue 2 – external prescription ───────────────────────────────────────
    issue2 = _first(
        session,
        select(PharmacyIssue).where(
            PharmacyIssue.tenant_id == tenant.id,
            PharmacyIssue.patient_id == patient.id,
            PharmacyIssue.source == PharmacyIssueSource.EXTERNAL_PRESCRIPTION,
        ),
    )
    if not issue2:
        issue2 = PharmacyIssue(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            consultation_id=None,
            source=PharmacyIssueSource.EXTERNAL_PRESCRIPTION,
            status=PharmacyIssueStatus.DISPENSED,
            medicine_text=(
                "Metformin 500mg – BD after food × 30 days\n"
                "Amlodipine 5mg – OD morning × 30 days\n"
                "Pantoprazole 40mg – OD before breakfast × 14 days"
            ),
            external_prescriber="Dr. S. Ramachandran, Apollo Hospitals",
            notes="Repeat prescription for chronic medications.",
            amount=360,
            issued_by_user_id=admin.id,
            dispensed_by_user_id=admin.id,
            dispensed_at=_ago(days=1),
        )
        session.add(issue2)
        session.commit()
        session.refresh(issue2)
        for med_obj, bat_obj, qty, unit_price in [
            (metformin, b_met, 60, 7),
            (amlodipine, b_aml, 30, 8),
            (pantop, b_pant, 14, 9),
        ]:
            session.add(
                PharmacyIssueItem(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    pharmacy_issue_id=issue2.id,
                    medicine_id=med_obj.id,
                    batch_id=bat_obj.id,
                    medicine_name=med_obj.name,
                    quantity=qty,
                    unit_price=unit_price,
                    dispensed_quantity=qty,
                )
            )
        session.commit()

    return issue1


# ══════════════════════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ══════════════════════════════════════════════════════════════════════════════


def create_notifications(
    session: Session,
    tenant: Tenant,
    branch: Branch,
    patient: Patient,
    queue_entry: QueueEntry,
    consultation: Consultation,
    invoice: Invoice,
    lab_order: LabOrder,
    admin: User,
) -> None:
    def _once(provider, event_type, recipient, subject, message, res_type, res_id):
        if _first(
            session,
            select(NotificationEvent).where(
                NotificationEvent.tenant_id == tenant.id,
                NotificationEvent.provider == provider,
                NotificationEvent.event_type == event_type,
                NotificationEvent.resource_type == res_type,
                NotificationEvent.resource_id == res_id,
            ),
        ):
            return
        queue_notification_if_allowed(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            provider=provider,
            event_type=event_type,
            recipient=recipient,
            subject=subject,
            message=message,
            resource_type=res_type,
            resource_id=res_id,
            queued_by_user_id=admin.id,
        )

    # Appointment reminder – WhatsApp + SMS
    for prov in (NotificationProvider.WHATSAPP, NotificationProvider.SMS):
        _once(
            prov,
            NotificationEventType.APPOINTMENT_REMINDER,
            patient.mobile,
            "Appointment Confirmation",
            f"Dear {patient.full_name}, your appointment at Sunrise Main Centre "
            f"is confirmed. Token: {queue_entry.token_number}. Please arrive 15 mins early.",
            "appointment",
            queue_entry.appointment_id,
        )

    # Queue token call – Voice
    _once(
        NotificationProvider.VOICE,
        NotificationEventType.QUEUE_TOKEN_CALL,
        f"branch:{branch.id}:display_speaker",
        "Token Call",
        f"Now calling Token {queue_entry.token_number}. Please proceed to General Medicine Room.",
        "queue_entry",
        queue_entry.id,
    )

    # Payment reminder – WhatsApp + SMS
    for prov in (NotificationProvider.WHATSAPP, NotificationProvider.SMS):
        _once(
            prov,
            NotificationEventType.PAYMENT_REMINDER,
            patient.mobile,
            "Payment Due",
            f"Invoice {invoice.invoice_number} for Rs. {invoice.balance_amount} is outstanding. "
            "Please settle at billing counter. Sunrise Clinic.",
            "invoice",
            invoice.id,
        )

    # Follow-up reminder – WhatsApp + SMS
    for prov in (NotificationProvider.WHATSAPP, NotificationProvider.SMS):
        _once(
            prov,
            NotificationEventType.FOLLOW_UP_REMINDER,
            patient.mobile,
            "Follow-up Reminder",
            f"Dear {patient.full_name}, please review your follow-up: "
            f"{consultation.follow_up_advice}. Sunrise Clinic.",
            "consultation",
            consultation.id,
        )

    # Lab report ready – WhatsApp
    _once(
        NotificationProvider.WHATSAPP,
        NotificationEventType.LAB_REPORT_READY,
        patient.mobile,
        "Lab Report Ready",
        "Your lab report (Dengue Panel) is ready. "
        "Please collect from the lab counter or view at sunriseclinic.in/reports.",
        "lab_order",
        lab_order.id,
    )

    # Patient message – SMS
    _once(
        NotificationProvider.SMS,
        NotificationEventType.PATIENT_MESSAGE,
        patient.mobile,
        None,
        "Welcome to Sunrise Multispeciality Clinic. "
        "For appointments: 9444100001. We care for your health.",
        "patient",
        patient.id,
    )


# ══════════════════════════════════════════════════════════════════════════════
# MAIN SEED ORCHESTRATOR
# ══════════════════════════════════════════════════════════════════════════════


def seed(session: Session) -> dict:
    print("🌱  Starting MedizinHub seed …\n")

    # ── Platform ──────────────────────────────────────────────────────────────
    primary_tenant = create_primary_tenant(session)
    super_admin = create_super_admin(session, primary_tenant)
    plans = create_plans(session)
    print(f"✅  Primary tenant:  {primary_tenant.name}")
    print(f"✅  Super admin:     {super_admin.email}")

    # ── Collect output for summary ────────────────────────────────────────────
    summary: dict = {
        "super_admin_email": super_admin.email,
        "super_admin_password": SUPER_ADMIN_PASSWORD,
        "tenants": [],
    }

    # ── For each tenant ───────────────────────────────────────────────────────
    for t_idx, tdef in enumerate(TENANTS):
        print(f"\n{'═'*60}")
        print(f"  Tenant {t_idx+1}: {tdef['name']}")
        print(f"{'═'*60}")

        tenant = create_tenant(session, tdef, super_admin)
        plan = plans[tdef["plans"][0]]
        sub = create_subscription(session, tenant, plan)

        tenant_summary: dict = {
            "name": tenant.name,
            "admin_email": tdef["admin"]["email"],
            "admin_password": TENANT_ADMIN_PASSWORD,
            "branches": [],
        }

        # Doctors lookup for clinical data {dept_slug_idx → Practitioner}
        all_branch_doctors: dict[str, dict[str, Practitioner]] = {}

        for b_idx, bdef in enumerate(tdef["branches"]):
            print(f"\n  Branch {b_idx+1}: {bdef['name']}")

            branch = create_branch(session, bdef, tenant, super_admin)

            # Tenant admin is linked to first branch
            if b_idx == 0:
                tenant_admin = create_tenant_admin(
                    session, tdef, tenant, branch, super_admin
                )

            create_branch_settings(session, tenant, branch, bdef["invoice_prefix"])

            # Departments + Doctors
            dept_map: dict[str, Department] = {}
            doctor_map: dict[str, Practitioner] = {}  # "dept_slug_0/1" → Practitioner

            for ddef in bdef["departments"]:
                dept = create_department(session, ddef, tenant, branch)
                dept_map[ddef["slug"]] = dept
                print(f"    Dept: {dept.name}")

                doc_list = ALL_DOCTORS.get(ddef["slug"], [])
                for d_idx, doc_tuple in enumerate(doc_list):
                    prac = create_doctor(
                        session, doc_tuple, tenant, branch, dept, super_admin
                    )
                    doctor_map[f"{ddef['slug']}_{d_idx}"] = prac
                    print(f"      Dr {d_idx+1}: {prac.full_name}")

            all_branch_doctors[bdef["slug"]] = doctor_map

            # Staff (5 roles × 1 user each)
            staff = create_branch_staff(
                session, bdef["slug"], tenant, branch, super_admin
            )
            print(f"    Staff users created: {len(staff)}")

            branch_summary: dict = {
                "branch_name": branch.name,
                "branch_code": branch.code,
                "invoice_prefix": bdef["invoice_prefix"],
                "departments": [d["name"] for d in bdef["departments"]],
                "staff_roles": [r[1] for r in STAFF_ROLE_SPECS],
                "staff_emails": [
                    f"{u_info[1]}@{_domain(tdef['name'].split()[0].lower())}"
                    for u_info in STAFF_USERS[bdef["slug"]]
                ],
                "doctor_emails": [
                    f"{doc[5]}@{_domain(tdef['name'].split()[0].lower())}"
                    for dept_slug in [d["slug"] for d in bdef["departments"]]
                    for doc in ALL_DOCTORS.get(dept_slug, [])
                ],
            }

            # ── Full clinical data only for Tenant-1, Branch-1-A ────────────
            if t_idx == 0 and b_idx == 0:
                print("\n  📋  Seeding full clinical data for Tenant-1 / Branch-1-A …")

                patients = create_patients(session, tenant, branch, tenant_admin)
                appointments = create_appointments(
                    session,
                    tenant,
                    branch,
                    patients,
                    doctor_map,
                    dept_map,
                    tenant_admin,
                )
                queue_entries = create_queue(
                    session, tenant, branch, appointments, tenant_admin
                )

                primary_patient = patients[0]
                primary_appt = appointments[0]  # CONSULTATION_COMPLETED OP

                consult = create_consultation(
                    session, tenant, branch, primary_patient, primary_appt, tenant_admin
                )
                invoice = create_billing(
                    session,
                    tenant,
                    branch,
                    appointments,
                    consult,
                    doctor_map,
                    tenant_admin,
                )
                lab_order = create_lab(
                    session, tenant, branch, primary_patient, consult, tenant_admin
                )
                pharma = create_pharmacy(
                    session, tenant, branch, primary_patient, consult, tenant_admin
                )

                qe0 = queue_entries[0] if queue_entries else None
                if qe0:
                    create_notifications(
                        session,
                        tenant,
                        branch,
                        primary_patient,
                        qe0,
                        consult,
                        invoice,
                        lab_order,
                        tenant_admin,
                    )

                branch_summary.update(
                    {
                        "clinical_data": {
                            "patients_seeded": len(patients),
                            "appointments_seeded": len(appointments),
                            "queue_entries": len(queue_entries),
                            "consultation_id": consult.id,
                            "invoice_number": invoice.invoice_number,
                            "invoice_status": invoice.status,
                            "lab_order_id": lab_order.id,
                            "pharmacy_issue_id": pharma.id,
                        }
                    }
                )
                print("  ✅  Clinical data seeded.")

            tenant_summary["branches"].append(branch_summary)

        summary["tenants"].append(tenant_summary)
        print(f"\n✅  Tenant seeded: {tenant.name}")

    summary["passwords"] = {
        "super_admin": SUPER_ADMIN_PASSWORD,
        "tenant_admin": TENANT_ADMIN_PASSWORD,
        "staff": STAFF_PASSWORD,
        "doctor": DOCTOR_PASSWORD,
    }
    print("\n\n🎉  Seed complete!\n")
    return summary


# ══════════════════════════════════════════════════════════════════════════════
# TRUNCATE + ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════


def main() -> None:
    parser = argparse.ArgumentParser(
        description="MedizinHub HMS – complete fresh seed.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help=(
            "TRUNCATE every application table before seeding. "
            "Wipes ALL existing data and replaces with fresh records."
        ),
    )
    args = parser.parse_args()

    try:
        with Session(engine) as session:
            if args.reset:
                print("🗑️   --reset flag detected. Wiping existing data …\n")
                truncate_all_tables(session)
            summary = seed(session)
    except ProgrammingError as exc:
        if "UndefinedColumn" in str(exc) or "does not exist" in str(exc):
            raise SystemExit(
                "Database schema is not up to date. Run Alembic migrations first:\n\n"
                "  docker exec medizinhub-backend bash -c "
                "'alembic -c alembic/alembic.ini upgrade head'\n\n"
                "Then run the seed again."
            ) from exc
        raise

    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
