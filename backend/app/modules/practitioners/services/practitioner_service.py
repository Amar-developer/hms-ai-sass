from datetime import datetime, timezone

from sqlmodel import Session

from app.modules.audit.service import record_audit_event
from app.modules.practitioners.models import Practitioner
from app.modules.practitioners.repositories import PractitionerRepository
from app.modules.practitioners.schemas import (
    PractitionerCreate,
    PractitionerRead,
    PractitionerUpdate,
)
from app.modules.practitioners.services.read_models import (
    practitioner_branch_ids,
    practitioner_department_ids,
    read_practitioner,
)
from app.modules.practitioners.services.validation import (
    department_filter_ids,
    get_practitioner_or_404,
    replace_links,
    validate_doctor_login_user,
    validate_links,
)
from app.modules.settings.numbering import next_document_number


def create_practitioner(
    session: Session, *, tenant_id: str, payload: PractitionerCreate
) -> PractitionerRead:
    validate_doctor_login_user(session, tenant_id, payload.user_id)
    validate_links(session, tenant_id, payload.branch_ids, payload.department_ids)
    branch_id = payload.branch_ids[0] if payload.branch_ids else None
    practitioner = Practitioner.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "practitioner_number": next_document_number(
                session, tenant_id=tenant_id, branch_id=branch_id, entity="doctor"
            ),
        },
    )
    PractitionerRepository(session).add(practitioner)
    session.commit()
    session.refresh(practitioner)
    replace_links(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner.id,
        branch_ids=payload.branch_ids,
        department_ids=payload.department_ids,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=payload.actor_user_id,
        action="practitioner.created",
        resource_type="practitioner",
        resource_id=practitioner.id,
        purpose="practitioner_setup",
    )
    return read_practitioner(session, practitioner)


def list_practitioners(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    department_id: str | None,
    doctor_practitioner_id: str | None,
) -> list[PractitionerRead]:
    practitioners = PractitionerRepository(session).list_for_tenant(
        tenant_id=tenant_id,
        practitioner_id=doctor_practitioner_id,
    )
    if branch_id:
        practitioners = [
            practitioner
            for practitioner in practitioners
            if branch_id in practitioner_branch_ids(session, tenant_id, practitioner.id)
        ]
    if department_id:
        department_ids = department_filter_ids(session, tenant_id, department_id)
        practitioners = [
            practitioner
            for practitioner in practitioners
            if department_ids.intersection(
                practitioner_department_ids(session, tenant_id, practitioner.id)
            )
        ]
    return [read_practitioner(session, practitioner) for practitioner in practitioners]


def get_practitioner_read(
    session: Session, *, tenant_id: str, practitioner_id: str
) -> PractitionerRead:
    return read_practitioner(
        session, get_practitioner_or_404(session, tenant_id, practitioner_id)
    )


def update_practitioner(
    session: Session,
    *,
    tenant_id: str,
    practitioner_id: str,
    payload: PractitionerUpdate,
) -> PractitionerRead:
    practitioner = get_practitioner_or_404(session, tenant_id, practitioner_id)
    if "user_id" in payload.model_fields_set:
        validate_doctor_login_user(session, tenant_id, payload.user_id, practitioner_id)
    branch_ids = payload.branch_ids
    department_ids = payload.department_ids
    validate_links(session, tenant_id, branch_ids or [], department_ids or [])
    for key, value in payload.model_dump(
        exclude_unset=True, exclude={"branch_ids", "department_ids", "actor_user_id"}
    ).items():
        setattr(practitioner, key, value)
    practitioner.updated_at = datetime.now(timezone.utc)
    PractitionerRepository(session).add(practitioner)
    session.commit()
    session.refresh(practitioner)
    replace_links(
        session,
        tenant_id=tenant_id,
        practitioner_id=practitioner.id,
        branch_ids=branch_ids,
        department_ids=department_ids,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=payload.actor_user_id,
        action="practitioner.updated",
        resource_type="practitioner",
        resource_id=practitioner.id,
        purpose="practitioner_setup",
    )
    return read_practitioner(session, practitioner)


def delete_practitioner(
    session: Session, *, tenant_id: str, practitioner_id: str, actor_user_id: str
) -> dict[str, bool | str]:
    practitioner = get_practitioner_or_404(session, tenant_id, practitioner_id)
    practitioner.status = "inactive"
    practitioner.updated_at = datetime.now(timezone.utc)
    PractitionerRepository(session).add(practitioner)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        action="practitioner.deleted",
        resource_type="practitioner",
        resource_id=practitioner.id,
        purpose="practitioner_setup",
    )
    return {"deleted": True, "mode": "deactivated", "practitioner_id": practitioner.id}
