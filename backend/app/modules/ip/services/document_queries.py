from sqlmodel import Session

from app.modules.identity.models import User
from app.modules.ip.models import IPDocument
from app.modules.ip.services.documents import list_admission_documents_safe
from app.modules.ip.services.validation import assert_ip_enabled, get_admission


def list_ip_admission_documents(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    current_user: User,
) -> list[IPDocument]:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    return list_admission_documents_safe(
        session,
        tenant_id=tenant_id,
        admission_id=admission.id,
    )
