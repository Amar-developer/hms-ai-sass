"""Import all SQLModel tables so metadata is complete for migrations."""

from app.modules.appointments.models import Appointment
from app.modules.audit.models import AuditEvent, DocumentComment, DocumentCommentMention
from app.modules.billing.models import (
    BillingAdjustmentRequest,
    CreditNote,
    DiscountApproval,
    DiscountOffer,
    DoctorFeeRule,
    DoctorSettlement,
)
from app.modules.billing.models import Invoice, InvoiceItem, Payment, TaxRule
from app.modules.consultations.models import (
    ClinicalTemplate,
    Consultation,
    ConsultationAddendum,
)
from app.modules.consultations.models import (
    ConsultationComplaint,
    ConsultationDiagnosis,
    ConsultationMedicine,
)
from app.modules.consultations.models import ConsultationReferral, ConsultationVital
from app.modules.error_logs.models import ErrorLog
from app.modules.files.models import FileDocument
from app.modules.home_care.models import (
    HomeCareBooking,
    HomeCareBookingItem,
    HomeCareService,
    HomeCareVisitLog,
)
from app.modules.identity.models import (
    AuthSession,
    Permission,
    PrivilegedAccessGrant,  # noqa: F401
    Role,
    RolePermission,
    User,
    UserRole,
)
from app.modules.ip.models import (
    IPAdmission,
    IPBillingItem,
    IPCharge,
    IPConsentForm,
    IPConsultation,
    IPDischargeSummary,
    IPMedicationAdministration,
    IPMedicationOrder,
    IPRoom,
    IPTreatment,
)
from app.modules.integrations.models import TenantIntegrationPlugin
from app.modules.lab.models import (
    LabOrder,
    LabOrderItem,
    LabResult,
    LabResultTemplate,
    LabSample,
)
from app.modules.lab.models import LabTestCatalog, LabTestPackage, LabTestPackageItem
from app.modules.notifications.models import (
    DocumentDelivery,
    InAppNotification,
    NotificationEvent,
    ProductAnnouncement,
)
from app.modules.patients.models import Patient, PatientAlert, PatientContact
from app.modules.patient_subscriptions.models import (
    PatientSubscriptionEnrollment,
    PatientSubscriptionPlan,
)
from app.modules.pharmacy.models import (
    MedicineBatch,
    MedicineCatalog,
    PharmacyIssue,
    PharmacyIssueItem,
)
from app.modules.pharmacy.models import (
    PharmacyPurchase,
    PharmacyPurchaseItem,
    PharmacyStockLedger,
    PharmacySupplier,
)
from app.modules.pharmacy.models import PharmacyReturn, PharmacyReturnItem
from app.modules.physiotherapy.models import (
    PhysiotherapyCase,
    PhysiotherapyEquipment,
    PhysiotherapySession,
)
from app.modules.practitioners.models import (
    Practitioner,
    PractitionerBranch,
    PractitionerDepartment,
    PractitionerLeave,
)
from app.modules.practitioners.models import (
    PractitionerRoomAssignment,
    PractitionerSchedule,
)
from app.modules.queue.models import QueueEntry, QueueEvent
from app.modules.reports.models import ReportJob
from app.modules.settings.models import AdminSetting
from app.modules.subscriptions.models import (
    SubscriptionCredit,
    SubscriptionInvoice,
    SubscriptionPlan,
    TenantSubscription,
)
from app.modules.tenants.models import Branch, Department, Tenant

__all__ = [
    "AdminSetting",
    "Appointment",
    "AuditEvent",
    "DocumentComment",
    "DocumentCommentMention",
    "DocumentDelivery",
    "AuthSession",
    "Branch",
    "BillingAdjustmentRequest",
    "Consultation",
    "ConsultationAddendum",
    "ConsultationComplaint",
    "ConsultationDiagnosis",
    "ConsultationMedicine",
    "ConsultationReferral",
    "ConsultationVital",
    "ClinicalTemplate",
    "Department",
    "DoctorFeeRule",
    "HomeCareBooking",
    "HomeCareBookingItem",
    "HomeCareService",
    "HomeCareVisitLog",
    "DoctorSettlement",
    "ErrorLog",
    "FileDocument",
    "DiscountApproval",
    "DiscountOffer",
    "CreditNote",
    "Invoice",
    "InvoiceItem",
    "IPAdmission",
    "IPBillingItem",
    "IPCharge",
    "IPConsentForm",
    "IPConsultation",
    "IPDischargeSummary",
    "IPMedicationAdministration",
    "IPMedicationOrder",
    "IPRoom",
    "IPTreatment",
    "TenantIntegrationPlugin",
    "LabOrder",
    "LabOrderItem",
    "LabResult",
    "LabResultTemplate",
    "LabSample",
    "LabTestCatalog",
    "LabTestPackage",
    "LabTestPackageItem",
    "NotificationEvent",
    "InAppNotification",
    "Patient",
    "PatientAlert",
    "PatientContact",
    "PatientSubscriptionEnrollment",
    "PatientSubscriptionPlan",
    "Payment",
    "MedicineBatch",
    "MedicineCatalog",
    "TaxRule",
    "Permission",
    "PharmacyIssue",
    "PharmacyIssueItem",
    "PharmacyPurchase",
    "PharmacyPurchaseItem",
    "PharmacyReturn",
    "PharmacyReturnItem",
    "PharmacyStockLedger",
    "PharmacySupplier",
    "PhysiotherapyCase",
    "PhysiotherapyEquipment",
    "PhysiotherapySession",
    "Practitioner",
    "PractitionerBranch",
    "PractitionerDepartment",
    "PractitionerLeave",
    "PractitionerRoomAssignment",
    "PractitionerSchedule",
    "QueueEntry",
    "QueueEvent",
    "ReportJob",
    "ProductAnnouncement",
    "Role",
    "RolePermission",
    "SubscriptionPlan",
    "SubscriptionCredit",
    "SubscriptionInvoice",
    "Tenant",
    "TenantSubscription",
    "User",
    "UserRole",
]
