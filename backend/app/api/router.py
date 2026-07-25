from fastapi import APIRouter

from app.api.v1.appointments import router as appointments_router
from app.api.v1.audit import activity_router, router as audit_router
from app.api.v1.billing import router as billing_router
from app.api.v1.client_logs import (
    legacy_router as legacy_client_logs_router,
    router as error_logs_router,
)
from app.api.v1.consultations import router as consultations_router
from app.api.v1.health import router as health_router
from app.api.v1.files import router as files_router
from app.api.v1.home_care import router as home_care_router
from app.api.v1.identity import router as identity_router
from app.api.v1.ip import router as ip_router
from app.api.v1.lab import router as lab_router
from app.api.v1.modules import router as modules_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.communications import router as communications_router
from app.api.v1.patients import router as patients_router
from app.api.v1.patient_subscriptions import router as patient_subscriptions_router
from app.api.v1.pharmacy import router as pharmacy_router
from app.api.v1.physiotherapy import router as physiotherapy_router
from app.api.v1.practitioners import router as practitioners_router
from app.api.v1.queue import router as queue_router
from app.api.v1.reports import router as reports_router
from app.api.v1.settings import router as settings_router
from app.api.v1.subscriptions import router as subscriptions_router
from app.api.v1.tenants import router as tenants_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["Health"])
api_router.include_router(files_router, tags=["Files"])
api_router.include_router(modules_router, tags=["Modules"])
api_router.include_router(identity_router, tags=["identity"])
api_router.include_router(error_logs_router, tags=["Error Logs"])
api_router.include_router(legacy_client_logs_router, tags=["Error Logs"])
api_router.include_router(tenants_router, tags=["tenants"])
api_router.include_router(subscriptions_router, tags=["subscriptions"])
api_router.include_router(audit_router, tags=["Audit"])
api_router.include_router(activity_router, tags=["Activity"])
api_router.include_router(patients_router, tags=["patients"])
api_router.include_router(patient_subscriptions_router, tags=["patient-subscriptions"])
api_router.include_router(practitioners_router, tags=["practitioners"])
api_router.include_router(appointments_router, tags=["appointments"])
api_router.include_router(queue_router, tags=["queue"])
api_router.include_router(reports_router, tags=["reports"])
api_router.include_router(consultations_router, tags=["consultations"])
api_router.include_router(billing_router, tags=["billing"])
api_router.include_router(ip_router, tags=["ip"])
api_router.include_router(lab_router, tags=["lab"])
api_router.include_router(pharmacy_router, tags=["pharmacy"])
api_router.include_router(physiotherapy_router, tags=["physiotherapy"])
api_router.include_router(home_care_router, tags=["home-care"])
api_router.include_router(settings_router, tags=["Settings"])
api_router.include_router(notifications_router, tags=["Notifications"])
api_router.include_router(communications_router, tags=["Communications"])
