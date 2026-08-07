from sqlmodel import Session

from app.core.access_control import scoped_branch_id
from app.core.pagination import DEFAULT_LIST_LIMIT
from app.modules.identity.models import User
from app.modules.ip.repositories import IPAdmissionRepository
from app.modules.ip.services.validation import assert_ip_enabled
from app.modules.ip.schemas import IPAdmissionRead
from app.modules.patients.services.references import patient_reference_map


def list_ip_admissions(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    patient_id: str | None,
    status_filter: str | None,
    current_user: User,
    limit: int = DEFAULT_LIST_LIMIT,
    offset: int = 0,
) -> list[IPAdmissionRead]:
    assert_ip_enabled(session, tenant_id)
    branch_scope = scoped_branch_id(current_user, branch_id)
    rows = IPAdmissionRepository(session).list_admissions(
        tenant_id=tenant_id,
        branch_id=branch_scope,
        patient_id=patient_id,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )
    patients = patient_reference_map(
        session,
        tenant_id=tenant_id,
        patient_ids={row.patient_id for row in rows},
    )
    result: list[IPAdmissionRead] = []
    for row in rows:
        read = IPAdmissionRead.model_validate(row, from_attributes=True)
        patient = patients.get(row.patient_id)
        if patient:
            read.patient_name = patient.name
            read.patient_number = patient.number
        result.append(read)
    return result
