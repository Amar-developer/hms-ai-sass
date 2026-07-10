from sqlmodel import Session

from app.core.access_control import scoped_branch_id
from app.modules.identity.models import User
from app.modules.ip.models import IPAdmission
from app.modules.ip.repositories import IPAdmissionRepository
from app.modules.ip.services.validation import assert_ip_enabled


def list_ip_admissions(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    patient_id: str | None,
    status_filter: str | None,
    current_user: User,
) -> list[IPAdmission]:
    assert_ip_enabled(session, tenant_id)
    branch_scope = scoped_branch_id(current_user, branch_id)
    return IPAdmissionRepository(session).list_admissions(
        tenant_id=tenant_id,
        branch_id=branch_scope,
        patient_id=patient_id,
        status_filter=status_filter,
    )
