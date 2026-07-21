from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.pharmacy.models import PharmacyIssue
from app.modules.pharmacy.repositories import (
    PharmacyIssueRepository,
    PharmacyReferenceRepository,
)


def validate_patient_branch(
    session: Session, tenant_id: str, patient_id: str, branch_id: str
) -> None:
    reference_repo = PharmacyReferenceRepository(session)
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


def get_issue_or_404(session: Session, tenant_id: str, issue_id: str) -> PharmacyIssue:
    issue = PharmacyIssueRepository(session).get_for_tenant(tenant_id, issue_id)
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy issue not found"
        )
    return issue
