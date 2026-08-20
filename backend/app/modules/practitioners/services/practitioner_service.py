from datetime import datetime, timezone

from sqlmodel import Session

from app.core.list_filters import ListFilter, ListFilterOption, ListSort
from app.core.pagination import Page
from app.modules.audit.service import record_audit_event
from app.modules.practitioners.models import Practitioner
from app.modules.practitioners.repositories import (
    PractitionerLinkRepository,
    PractitionerRepository,
)
from app.modules.practitioners.schemas import (
    PractitionerCreate,
    PractitionerRead,
    PractitionerUpdate,
)
from app.modules.practitioners.services.read_models import (
    practitioner_read_with_links,
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


def _actor_id(payload_actor_id: str | None, actor: object | None = None) -> str | None:
    return getattr(actor, "id", None) or payload_actor_id


def create_practitioner(
    session: Session, *, tenant_id: str, payload: PractitionerCreate, actor=None
) -> PractitionerRead:
    actor_user_id = _actor_id(payload.actor_user_id, actor)
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
            "created_by_user_id": actor_user_id,
            "updated_by_user_id": actor_user_id,
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
        actor_user_id=actor_user_id,
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
    practitioner_ids = {practitioner.id for practitioner in practitioners}
    links = PractitionerLinkRepository(session)
    branch_ids_by_practitioner = links.active_branch_ids_by_practitioner(
        tenant_id=tenant_id,
        practitioner_ids=practitioner_ids,
    )
    department_ids_by_practitioner = links.active_department_ids_by_practitioner(
        tenant_id=tenant_id,
        practitioner_ids=practitioner_ids,
    )
    if branch_id:
        practitioners = [
            practitioner
            for practitioner in practitioners
            if branch_id in branch_ids_by_practitioner.get(practitioner.id, [])
        ]
    if department_id:
        department_ids = department_filter_ids(session, tenant_id, department_id)
        practitioners = [
            practitioner
            for practitioner in practitioners
            if department_ids.intersection(
                department_ids_by_practitioner.get(practitioner.id, [])
            )
        ]
    return [
        practitioner_read_with_links(
            practitioner,
            branch_ids=branch_ids_by_practitioner.get(practitioner.id, []),
            department_ids=department_ids_by_practitioner.get(practitioner.id, []),
        )
        for practitioner in practitioners
    ]


def list_practitioner_page(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    department_id: str | None,
    doctor_practitioner_id: str | None,
    q: str | None,
    list_filters: list[ListFilter],
    list_sort: ListSort | None,
    limit: int,
    offset: int,
) -> Page[PractitionerRead]:
    repository = PractitionerRepository(session)
    department_ids = (
        department_filter_ids(session, tenant_id, department_id)
        if department_id
        else None
    )
    practitioners = repository.list_page(
        tenant_id=tenant_id,
        practitioner_id=doctor_practitioner_id,
        branch_id=branch_id,
        department_ids=department_ids,
        q=q,
        list_filters=list_filters,
        list_sort=list_sort,
        limit=limit,
        offset=offset,
    )
    links = PractitionerLinkRepository(session)
    practitioner_ids = {practitioner.id for practitioner in practitioners}
    branch_ids_by_practitioner = links.active_branch_ids_by_practitioner(
        tenant_id=tenant_id,
        practitioner_ids=practitioner_ids,
    )
    department_ids_by_practitioner = links.active_department_ids_by_practitioner(
        tenant_id=tenant_id,
        practitioner_ids=practitioner_ids,
    )
    items = [
        practitioner_read_with_links(
            practitioner,
            branch_ids=branch_ids_by_practitioner.get(practitioner.id, []),
            department_ids=department_ids_by_practitioner.get(practitioner.id, []),
        )
        for practitioner in practitioners
    ]
    total = repository.count_page(
        tenant_id=tenant_id,
        practitioner_id=doctor_practitioner_id,
        branch_id=branch_id,
        department_ids=department_ids,
        q=q,
        list_filters=list_filters,
    )
    return Page(items=items, total=total, limit=limit, offset=offset)


def list_practitioner_filter_options(
    session: Session,
    *,
    tenant_id: str,
) -> dict[str, list[ListFilterOption]]:
    return PractitionerRepository(session).filter_options(tenant_id=tenant_id)


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
    actor=None,
) -> PractitionerRead:
    actor_user_id = _actor_id(payload.actor_user_id, actor)
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
    practitioner.updated_by_user_id = actor_user_id
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
        actor_user_id=actor_user_id,
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
    practitioner.updated_by_user_id = actor_user_id
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
