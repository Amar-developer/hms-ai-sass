from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.lab.models import LabOrder
from app.modules.lab.repositories import LabOrderRepository, LabReferenceRepository


def validate_patient_branch(
    session: Session, tenant_id: str, patient_id: str, branch_id: str
) -> None:
    reference_repo = LabReferenceRepository(session)
    patient = reference_repo.get_patient(patient_id)
    branch = reference_repo.get_branch(branch_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid patient"
        )
    if not branch or branch.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid branch"
        )


def get_order_or_404(session: Session, tenant_id: str, order_id: str) -> LabOrder:
    order = LabOrderRepository(session).get_for_tenant(tenant_id, order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lab order not found"
        )
    return order


_validate_patient_branch = validate_patient_branch
_get_order_or_404 = get_order_or_404
