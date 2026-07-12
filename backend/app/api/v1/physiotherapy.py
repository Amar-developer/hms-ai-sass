from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlmodel import Session

from app.core.auth import require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.billing.schemas import InvoiceDetailRead
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.physiotherapy.models import (
    PhysiotherapyCase,
    PhysiotherapyEquipment,
    PhysiotherapySession,
)
from app.modules.physiotherapy.schemas import (
    PhysiotherapyCaseCreate,
    PhysiotherapyCaseRead,
    PhysiotherapyCaseUpdate,
    PhysiotherapyEquipmentCreate,
    PhysiotherapyEquipmentRead,
    PhysiotherapyEquipmentUpdate,
    PhysiotherapyInvoiceCreate,
    PhysiotherapySessionCreate,
    PhysiotherapySessionRead,
)
from app.modules.physiotherapy.services.billing_service import (
    PhysiotherapyBillingService,
)
from app.modules.physiotherapy.services.case_service import PhysiotherapyCaseService
from app.modules.physiotherapy.services.equipment_service import (
    PhysiotherapyEquipmentService,
)
from app.modules.physiotherapy.services.session_service import (
    PhysiotherapySessionService,
)

router = APIRouter(prefix="/physiotherapy")


@router.get("/equipment", response_model=list[PhysiotherapyEquipmentRead])
def list_equipment(
    branch_id: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_READ)),
) -> list[PhysiotherapyEquipment]:
    return PhysiotherapyEquipmentService(session).list_equipment(
        tenant_id=tenant_id, branch_id=branch_id, actor=current_user
    )


@router.post(
    "/equipment",
    response_model=PhysiotherapyEquipmentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_equipment(
    payload: PhysiotherapyEquipmentCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_CREATE)),
) -> PhysiotherapyEquipment:
    return PhysiotherapyEquipmentService(session).create_equipment(
        tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.patch("/equipment/{equipment_id}", response_model=PhysiotherapyEquipmentRead)
def update_equipment(
    equipment_id: str,
    payload: PhysiotherapyEquipmentUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_EDIT)),
) -> PhysiotherapyEquipment:
    return PhysiotherapyEquipmentService(session).update_equipment(
        tenant_id=tenant_id,
        equipment_id=equipment_id,
        payload=payload,
        actor=current_user,
    )


@router.delete("/equipment/{equipment_id}", response_model=PhysiotherapyEquipmentRead)
def delete_equipment(
    equipment_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_DELETE)),
) -> PhysiotherapyEquipment:
    return PhysiotherapyEquipmentService(session).delete_equipment(
        tenant_id=tenant_id, equipment_id=equipment_id, actor=current_user
    )


@router.get("/cases", response_model=list[PhysiotherapyCaseRead])
def list_cases(
    branch_id: str | None = None,
    patient_id: str | None = None,
    care_context: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_READ)),
) -> list[PhysiotherapyCase]:
    return PhysiotherapyCaseService(session).list_cases(
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        care_context=care_context,
        actor=current_user,
    )


@router.post(
    "/cases", response_model=PhysiotherapyCaseRead, status_code=status.HTTP_201_CREATED
)
def create_case(
    payload: PhysiotherapyCaseCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_CREATE)),
) -> PhysiotherapyCase:
    return PhysiotherapyCaseService(session).create_case(
        tenant_id=tenant_id, payload=payload, actor=current_user
    )


@router.patch("/cases/{case_id}", response_model=PhysiotherapyCaseRead)
def update_case(
    case_id: str,
    payload: PhysiotherapyCaseUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_EDIT)),
) -> PhysiotherapyCase:
    return PhysiotherapyCaseService(session).update_case(
        tenant_id=tenant_id, case_id=case_id, payload=payload, actor=current_user
    )


@router.post("/cases/{case_id}/consent", response_model=PhysiotherapyCaseRead)
async def upload_consent_form(
    case_id: str,
    files: list[UploadFile] = File(..., min_length=1),
    notes: str | None = Form(default=None),
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_EDIT)),
) -> PhysiotherapyCase:
    return await PhysiotherapyCaseService(session).upload_consent_form(
        tenant_id=tenant_id,
        case_id=case_id,
        files=files,
        notes=notes,
        actor=current_user,
    )


@router.get("/cases/{case_id}/sessions", response_model=list[PhysiotherapySessionRead])
def list_sessions(
    case_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_READ)),
) -> list[PhysiotherapySession]:
    return PhysiotherapySessionService(session).list_sessions(
        tenant_id=tenant_id, case_id=case_id, actor=current_user
    )


@router.post(
    "/cases/{case_id}/sessions",
    response_model=PhysiotherapySessionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_session(
    case_id: str,
    payload: PhysiotherapySessionCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_EDIT)),
) -> PhysiotherapySession:
    return PhysiotherapySessionService(session).create_session(
        tenant_id=tenant_id, case_id=case_id, payload=payload, actor=current_user
    )


@router.get("/cases/{case_id}/invoice", response_model=InvoiceDetailRead | None)
def get_case_invoice(
    case_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead | None:
    return PhysiotherapyBillingService(session).get_case_invoice(
        tenant_id=tenant_id, case_id=case_id, actor=current_user
    )


@router.post(
    "/cases/{case_id}/invoice",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def generate_invoice(
    case_id: str,
    payload: PhysiotherapyInvoiceCreate | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    return PhysiotherapyBillingService(session).generate_invoice(
        tenant_id=tenant_id, case_id=case_id, payload=payload, actor=current_user
    )
