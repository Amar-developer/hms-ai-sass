from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.identity.models import User
from app.modules.physiotherapy.models import PhysiotherapyCase
from app.modules.physiotherapy.repositories import PhysiotherapyCaseRepository


class PhysiotherapyCaseLookup:
    """Shared case fetch-or-404 used by the case, session, and billing services."""

    def __init__(self, session: Session):
        self.cases = PhysiotherapyCaseRepository(session)

    def get_or_404(
        self, tenant_id: str, case_id: str, actor: User
    ) -> PhysiotherapyCase:
        case = self.cases.get_for_tenant(tenant_id, case_id)
        if not case:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Physiotherapy case not found",
            )
        require_user_branch_access(actor, case.branch_id)
        return case
