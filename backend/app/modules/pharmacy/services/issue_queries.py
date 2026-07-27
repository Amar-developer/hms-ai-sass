from sqlmodel import Session

from app.core.access_control import require_user_branch_access, scoped_branch_id
from app.modules.identity.models import User
from app.modules.pharmacy.models import PharmacyIssue, PharmacyIssueStatus
from app.modules.pharmacy.repositories import PharmacyIssueRepository
from app.modules.pharmacy.schemas import (
    PharmacyIssueDetailRead,
    PharmacyIssueItemRead,
    PharmacyIssueRead,
)
from app.modules.pharmacy.services.validation import get_issue_or_404
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.patients.services.references import patient_reference_map


def issue_detail(session: Session, issue: PharmacyIssue) -> PharmacyIssueDetailRead:
    items = PharmacyIssueRepository(session).list_items(
        tenant_id=issue.tenant_id,
        issue_id=issue.id,
    )
    issue_read = PharmacyIssueRead.model_validate(issue, from_attributes=True)
    patient = patient_reference_map(
        session,
        tenant_id=issue.tenant_id,
        patient_ids={issue.patient_id},
    ).get(issue.patient_id)
    if patient:
        issue_read.patient_name = patient.name
        issue_read.patient_number = patient.number
    return PharmacyIssueDetailRead(
        issue=issue_read,
        items=[
            PharmacyIssueItemRead.model_validate(item, from_attributes=True)
            for item in items
        ],
    )


def list_pharmacy_issues_service(
    session: Session,
    *,
    tenant_id: str,
    patient_id: str | None,
    status_filter: PharmacyIssueStatus | None,
    branch_id: str | None,
    actor: User,
) -> list[PharmacyIssueRead]:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    branch_id = scoped_branch_id(actor, branch_id)
    rows = PharmacyIssueRepository(session).list_issues(
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        status_filter=status_filter,
    )
    patients = patient_reference_map(
        session,
        tenant_id=tenant_id,
        patient_ids={issue.patient_id for issue in rows},
    )
    result: list[PharmacyIssueRead] = []
    for issue in rows:
        read = PharmacyIssueRead.model_validate(issue, from_attributes=True)
        patient = patients.get(issue.patient_id)
        if patient:
            read.patient_name = patient.name
            read.patient_number = patient.number
        result.append(read)
    return result


def get_pharmacy_issue_service(
    session: Session, *, tenant_id: str, issue_id: str, actor: User
) -> PharmacyIssueDetailRead:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    issue = get_issue_or_404(session, tenant_id, issue_id)
    require_user_branch_access(actor, issue.branch_id)
    return issue_detail(session, issue)
