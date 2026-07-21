from datetime import date

from sqlmodel import Session, select

from app.modules.patients.models import Patient, PatientStatus
from app.modules.subscriptions.models import (
    CreditStatus,
    SubscriptionCredit,
    SubscriptionPlan,
)


def current_patient_count(session: Session, tenant_id: str) -> int:
    return len(
        session.exec(
            select(Patient.id).where(
                Patient.tenant_id == tenant_id,
                Patient.status != PatientStatus.INACTIVE,
            )
        ).all()
    )


def active_patient_credits(session: Session, tenant_id: str) -> int:
    today = date.today()
    rows = session.exec(
        select(SubscriptionCredit).where(
            SubscriptionCredit.tenant_id == tenant_id,
            SubscriptionCredit.credit_type == "patients",
            SubscriptionCredit.status == CreditStatus.ACTIVE,
            SubscriptionCredit.starts_on <= today,
        )
    ).all()
    return sum(
        max(row.quantity - row.used_quantity, 0)
        for row in rows
        if not row.expires_on or row.expires_on >= today
    )


def effective_patient_limit(
    session: Session, tenant_id: str, plan: SubscriptionPlan
) -> int:
    return plan.monthly_patient_limit + active_patient_credits(session, tenant_id)
