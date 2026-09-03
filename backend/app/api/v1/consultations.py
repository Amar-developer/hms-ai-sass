from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session

from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.list_filters import ListFilterOption, parse_list_filters, parse_list_sort
from app.core.pagination import Page
from app.core.tenant_context import require_tenant_id
from app.modules.consultations.models import Consultation, ConsultationAddendum
from app.modules.consultations.schemas import (
    ConsultationAddendumCreate,
    ConsultationAddendumRead,
    ConsultationCreate,
    ConsultationDetailRead,
    ConsultationRead,
    ConsultationSignRequest,
    ConsultationTemplateCreate,
    ConsultationTemplateRead,
    ConsultationTemplateUpdate,
    ConsultationUpdate,
    PatientDiagnosisRead,
)
from app.modules.consultations.services.query_service import ConsultationQueryService
from app.modules.consultations.services.record_service import ConsultationRecordService
from app.modules.consultations.services.template_service import ClinicalTemplateService
from app.modules.identity import permissions
from app.modules.identity.models import User

router = APIRouter(prefix="/consultations")


@router.post(
    "",
    response_model=ConsultationRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(
            require_any_permission(
                permissions.CONSULTATIONS_WRITE,
                permissions.CONSULTATIONS_CREATE,
            )
        )
    ],
)
def create_consultation(
    payload: ConsultationCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_CREATE,
        )
    ),
    session: Session = Depends(get_session),
) -> Consultation:
    return ConsultationRecordService(session).create_consultation(
        tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.get(
    "",
    response_model=list[ConsultationRead],
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_READ))],
)
def list_consultations(
    tenant_id: str = Depends(require_tenant_id),
    patient_id: str | None = None,
    appointment_id: str | None = None,
    branch_id: str | None = None,
    q: str | None = Query(default=None, max_length=120),
    current_user: User = Depends(require_permission(permissions.CONSULTATIONS_READ)),
    session: Session = Depends(get_session),
) -> list[Consultation]:
    return ConsultationQueryService(session).list_consultations(
        tenant_id=tenant_id,
        patient_id=patient_id,
        appointment_id=appointment_id,
        branch_id=branch_id,
        q=q,
        actor=current_user,
    )


@router.get(
    "/page",
    response_model=Page[ConsultationRead],
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_READ))],
)
def list_consultation_page(
    tenant_id: str = Depends(require_tenant_id),
    patient_id: str | None = None,
    appointment_id: str | None = None,
    branch_id: str | None = None,
    q: str | None = Query(default=None, max_length=120),
    filters: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(require_permission(permissions.CONSULTATIONS_READ)),
    session: Session = Depends(get_session),
) -> Page[ConsultationRead]:
    return ConsultationQueryService(session).list_consultation_page(
        tenant_id=tenant_id,
        patient_id=patient_id,
        appointment_id=appointment_id,
        branch_id=branch_id,
        q=q,
        list_filters=parse_list_filters(filters),
        list_sort=parse_list_sort(sort),
        limit=limit,
        offset=offset,
        actor=current_user,
    )


@router.get(
    "/filter-options",
    response_model=dict[str, list[ListFilterOption]],
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_READ))],
)
def list_consultation_filter_options(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
) -> dict[str, list[ListFilterOption]]:
    return ConsultationQueryService(session).list_consultation_filter_options(
        tenant_id=tenant_id
    )


@router.get(
    "/clinical-templates",
    response_model=list[ConsultationTemplateRead],
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_READ))],
)
def list_clinical_templates(
    tenant_id: str = Depends(require_tenant_id),
    department_id: str | None = None,
    session: Session = Depends(get_session),
) -> list[ConsultationTemplateRead]:
    return ClinicalTemplateService(session).list_clinical_templates(
        tenant_id=tenant_id, department_id=department_id
    )


@router.get(
    "/by-department/{department_id}/clinical-templates",
    response_model=list[ConsultationTemplateRead],
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_READ))],
)
def list_department_clinical_templates(
    department_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
) -> list[ConsultationTemplateRead]:
    return ClinicalTemplateService(session).list_department_clinical_templates(
        tenant_id=tenant_id, department_id=department_id
    )


@router.get(
    "/diagnoses",
    response_model=list[PatientDiagnosisRead],
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_READ))],
)
def list_patient_diagnoses(
    patient_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.CONSULTATIONS_READ)),
    session: Session = Depends(get_session),
) -> list[PatientDiagnosisRead]:
    return ConsultationQueryService(session).list_patient_diagnoses(
        tenant_id=tenant_id, patient_id=patient_id, actor=current_user
    )


@router.get(
    "/{consultation_id}",
    response_model=ConsultationDetailRead,
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_READ))],
)
def get_consultation(
    consultation_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.CONSULTATIONS_READ)),
    session: Session = Depends(get_session),
) -> ConsultationDetailRead:
    return ConsultationQueryService(session).get_consultation(
        tenant_id=tenant_id, consultation_id=consultation_id, actor=current_user
    )


@router.patch(
    "/{consultation_id}",
    response_model=ConsultationRead,
    dependencies=[
        Depends(
            require_any_permission(
                permissions.CONSULTATIONS_WRITE,
                permissions.CONSULTATIONS_EDIT,
            )
        )
    ],
)
def update_consultation(
    consultation_id: str,
    payload: ConsultationUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_EDIT,
        )
    ),
    session: Session = Depends(get_session),
) -> Consultation:
    return ConsultationRecordService(session).update_consultation(
        tenant_id=tenant_id,
        consultation_id=consultation_id,
        payload=payload,
        actor=current_user,
    )


@router.post(
    "/{consultation_id}/sign",
    response_model=ConsultationRead,
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_SIGN))],
)
def sign_consultation(
    consultation_id: str,
    payload: ConsultationSignRequest,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.CONSULTATIONS_SIGN)),
    session: Session = Depends(get_session),
) -> Consultation:
    return ConsultationRecordService(session).sign_consultation(
        tenant_id=tenant_id,
        consultation_id=consultation_id,
        payload=payload,
        actor=current_user,
    )


@router.post(
    "/{consultation_id}/addendums",
    response_model=ConsultationAddendumRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(
            require_any_permission(
                permissions.CONSULTATIONS_WRITE,
                permissions.CONSULTATIONS_EDIT,
            )
        )
    ],
)
def create_addendum(
    consultation_id: str,
    payload: ConsultationAddendumCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_EDIT,
        )
    ),
    session: Session = Depends(get_session),
) -> ConsultationAddendum:
    return ConsultationRecordService(session).create_addendum(
        tenant_id=tenant_id,
        consultation_id=consultation_id,
        payload=payload,
        actor=current_user,
    )


@router.post(
    "/clinical-templates",
    response_model=ConsultationTemplateRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(
            require_any_permission(
                permissions.CONSULTATIONS_WRITE,
                permissions.CONSULTATIONS_CREATE,
            )
        )
    ],
)
def create_clinical_template(
    payload: ConsultationTemplateCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_CREATE,
        )
    ),
    session: Session = Depends(get_session),
) -> ConsultationTemplateRead:
    return ClinicalTemplateService(session).create_clinical_template(
        tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.patch(
    "/clinical-templates/{template_id}",
    response_model=ConsultationTemplateRead,
)
def update_clinical_template(
    template_id: str,
    payload: ConsultationTemplateUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_EDIT,
        )
    ),
    session: Session = Depends(get_session),
) -> ConsultationTemplateRead:
    return ClinicalTemplateService(session).update_clinical_template(
        tenant_id=tenant_id,
        template_id=template_id,
        payload=payload,
        actor=current_user,
    )


@router.delete(
    "/clinical-templates/{template_id}",
    response_model=ConsultationTemplateRead,
)
def delete_clinical_template(
    template_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(
        require_any_permission(
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_EDIT,
        )
    ),
    session: Session = Depends(get_session),
) -> ConsultationTemplateRead:
    return ClinicalTemplateService(session).delete_clinical_template(
        tenant_id=tenant_id,
        template_id=template_id,
        actor=current_user,
    )
