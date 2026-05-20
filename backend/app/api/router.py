from fastapi import APIRouter

from app.api.v1.appointments import router as appointments_router
from app.api.v1.audit import router as audit_router
from app.api.v1.billing import router as billing_router
from app.api.v1.consultations import router as consultations_router
from app.api.v1.health import router as health_router
from app.api.v1.identity import router as identity_router
from app.api.v1.ip import router as ip_router
from app.api.v1.lab import router as lab_router
from app.api.v1.modules import router as modules_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.patients import router as patients_router
from app.api.v1.pharmacy import router as pharmacy_router
from app.api.v1.physiotherapy import router as physiotherapy_router
from app.api.v1.practitioners import router as practitioners_router
from app.api.v1.queue import router as queue_router
from app.api.v1.reports import router as reports_router
from app.api.v1.settings import router as settings_router
from app.api.v1.subscriptions import router as subscriptions_router
from app.api.v1.tenants import router as tenants_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["platform"])
api_router.include_router(modules_router, tags=["platform"])
api_router.include_router(identity_router, tags=["identity"])
api_router.include_router(tenants_router, tags=["tenants"])
api_router.include_router(subscriptions_router, tags=["subscriptions"])
api_router.include_router(audit_router, tags=["audit"])
api_router.include_router(patients_router, tags=["patients"])
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
api_router.include_router(settings_router, tags=["settings"])
api_router.include_router(notifications_router, tags=["notifications"])
