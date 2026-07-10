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


def issue_detail(session: Session, issue: PharmacyIssue) -> PharmacyIssueDetailRead:
    items = PharmacyIssueRepository(session).list_items(
        tenant_id=issue.tenant_id,
        issue_id=issue.id,
    )
    return PharmacyIssueDetailRead(
        issue=PharmacyIssueRead.model_validate(issue, from_attributes=True),
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
) -> list[PharmacyIssue]:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    branch_id = scoped_branch_id(actor, branch_id)
    return PharmacyIssueRepository(session).list_issues(
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        status_filter=status_filter,
    )


def get_pharmacy_issue_service(
    session: Session, *, tenant_id: str, issue_id: str, actor: User
) -> PharmacyIssueDetailRead:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    issue = get_issue_or_404(session, tenant_id, issue_id)
    require_user_branch_access(actor, issue.branch_id)
    return issue_detail(session, issue)
