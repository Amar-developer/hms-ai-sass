from fastapi import APIRouter

from app.api.v1.billing.configuration import router as configuration_router
from app.api.v1.billing.invoices import router as invoices_router
from app.api.v1.billing.payments import router as payments_router
from app.api.v1.billing.settlements import router as settlements_router

router = APIRouter()
router.include_router(configuration_router)
router.include_router(invoices_router)
router.include_router(payments_router)
router.include_router(settlements_router)
