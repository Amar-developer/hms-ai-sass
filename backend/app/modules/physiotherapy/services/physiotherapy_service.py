from fastapi import UploadFile
from sqlmodel import Session

from app.modules.billing.schemas import InvoiceDetailRead
from app.modules.identity.models import User
from app.modules.physiotherapy.models import PhysiotherapyCase, PhysiotherapySession
from app.modules.physiotherapy.schemas import (
    PhysiotherapyCaseCreate,
    PhysiotherapyCaseUpdate,
    PhysiotherapyInvoiceCreate,
    PhysiotherapySessionCreate,
)
from app.modules.physiotherapy.services.billing_service import (
    PhysiotherapyBillingService,
)
from app.modules.physiotherapy.services.case_service import (
    PhysiotherapyCaseService as PhysiotherapyCaseLifecycleService,
)
from app.modules.physiotherapy.services.equipment_service import (  # noqa: F401
    PhysiotherapyEquipmentService,
)
from app.modules.physiotherapy.services.session_service import (
    PhysiotherapySessionService,
)


class PhysiotherapyCaseService:
    """Facade over case lifecycle, session, and billing services for
    physiotherapy cases."""

    def __init__(self, session: Session):
        self.session = session
        self.case_service = PhysiotherapyCaseLifecycleService(session)
        self.session_service = PhysiotherapySessionService(session)
        self.billing_service = PhysiotherapyBillingService(session)

    def list_cases(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        patient_id: str | None,
        care_context: str | None,
        actor: User,
    ) -> list[PhysiotherapyCase]:
        return self.case_service.list_cases(
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id=patient_id,
            care_context=care_context,
            actor=actor,
        )

    def create_case(
        self, *, tenant_id: str, payload: PhysiotherapyCaseCreate, actor: User
    ) -> PhysiotherapyCase:
        return self.case_service.create_case(
            tenant_id=tenant_id, payload=payload, actor=actor
        )

    def update_case(
        self,
        *,
        tenant_id: str,
        case_id: str,
        payload: PhysiotherapyCaseUpdate,
        actor: User,
    ) -> PhysiotherapyCase:
        return self.case_service.update_case(
            tenant_id=tenant_id, case_id=case_id, payload=payload, actor=actor
        )

    async def upload_consent_form(
        self,
        *,
        tenant_id: str,
        case_id: str,
        files: list[UploadFile],
        notes: str | None,
        actor: User,
    ) -> PhysiotherapyCase:
        return await self.case_service.upload_consent_form(
            tenant_id=tenant_id,
            case_id=case_id,
            files=files,
            notes=notes,
            actor=actor,
        )

    def list_sessions(
        self, *, tenant_id: str, case_id: str, actor: User
    ) -> list[PhysiotherapySession]:
        return self.session_service.list_sessions(
            tenant_id=tenant_id, case_id=case_id, actor=actor
        )

    def create_session(
        self,
        *,
        tenant_id: str,
        case_id: str,
        payload: PhysiotherapySessionCreate,
        actor: User,
    ) -> PhysiotherapySession:
        return self.session_service.create_session(
            tenant_id=tenant_id, case_id=case_id, payload=payload, actor=actor
        )

    def get_case_invoice(
        self, *, tenant_id: str, case_id: str, actor: User
    ) -> InvoiceDetailRead | None:
        return self.billing_service.get_case_invoice(
            tenant_id=tenant_id, case_id=case_id, actor=actor
        )

    def generate_invoice(
        self,
        *,
        tenant_id: str,
        case_id: str,
        payload: PhysiotherapyInvoiceCreate | None,
        actor: User,
    ) -> InvoiceDetailRead:
        return self.billing_service.generate_invoice(
            tenant_id=tenant_id, case_id=case_id, payload=payload, actor=actor
        )
