from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.audit.service import record_audit_event
from app.modules.identity.models import User
from app.modules.physiotherapy.models import PhysiotherapySession
from app.modules.physiotherapy.repositories import (
    PhysiotherapyBillingRepository,
    PhysiotherapyEquipmentRepository,
    PhysiotherapyReferenceRepository,
    PhysiotherapySessionRepository,
)
from app.modules.physiotherapy.schemas import PhysiotherapySessionCreate
from app.modules.physiotherapy.services.case_lookup import PhysiotherapyCaseLookup
from app.modules.subscriptions.service import enforce_module_enabled


class PhysiotherapySessionService:
    """Manages physiotherapy session logging for a case."""

    def __init__(self, session: Session):
        self.session = session
        self.sessions = PhysiotherapySessionRepository(session)
        self.equipment = PhysiotherapyEquipmentRepository(session)
        self.references = PhysiotherapyReferenceRepository(session)
        self.billing = PhysiotherapyBillingRepository(session)
        self.lookup = PhysiotherapyCaseLookup(session)

    def list_sessions(
        self, *, tenant_id: str, case_id: str, actor: User
    ) -> list[PhysiotherapySession]:
        enforce_module_enabled(self.session, tenant_id, "physiotherapy")
        case = self.lookup.get_or_404(tenant_id, case_id, actor)
        return self.sessions.list_for_case(tenant_id=tenant_id, case_id=case.id)

    def create_session(
        self,
        *,
        tenant_id: str,
        case_id: str,
        payload: PhysiotherapySessionCreate,
        actor: User,
    ) -> PhysiotherapySession:
        enforce_module_enabled(self.session, tenant_id, "physiotherapy")
        case = self.lookup.get_or_404(tenant_id, case_id, actor)
        existing_invoice = self.billing.get_case_invoice(
            tenant_id=tenant_id, case_id=case.id
        )
        if existing_invoice:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot add sessions after physiotherapy invoice is generated",
            )
        if payload.equipment_id:
            equipment = self.equipment.get_for_tenant(tenant_id, payload.equipment_id)
            if not equipment:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Physiotherapy equipment not found",
                )
            require_user_branch_access(actor, equipment.branch_id)
        physiotherapist_id = payload.physiotherapist_id or case.physiotherapist_id
        if physiotherapist_id:
            practitioner = self.references.get_physiotherapist_for_tenant(
                tenant_id, physiotherapist_id
            )
            if not practitioner:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid physiotherapist",
                )
        count = self.sessions.count_for_case(tenant_id=tenant_id, case_id=case.id)
        treatment = PhysiotherapySession.model_validate(
            payload,
            update={
                "tenant_id": tenant_id,
                "branch_id": case.branch_id,
                "case_id": case.id,
                "physiotherapist_id": physiotherapist_id,
                "session_date": payload.session_date or date.today(),
                "session_number": int(count or 0) + 1,
                "created_by_user_id": actor.id,
            },
        )
        self.sessions.add(treatment)
        self.session.commit()
        self.session.refresh(treatment)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=case.branch_id,
            actor_user_id=actor.id,
            action="physiotherapy_session.created",
            resource_type="physiotherapy_session",
            resource_id=treatment.id,
            purpose="physiotherapy",
        )
        return treatment
