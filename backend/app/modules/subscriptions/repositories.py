from datetime import date

from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.subscriptions.models import (
    SubscriptionCredit,
    SubscriptionInvoice,
    SubscriptionInvoiceStatus,
    SubscriptionPlan,
    SubscriptionStatus,
    TenantSubscription,
)
from app.modules.tenants.models import Tenant


class SubscriptionPlanRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, plan: SubscriptionPlan) -> SubscriptionPlan:
        self.session.add(plan)
        return plan

    def get(self, plan_id: str) -> SubscriptionPlan | None:
        return self.session.get(SubscriptionPlan, plan_id)

    def list_ordered_by_price(self) -> list[SubscriptionPlan]:
        return list(
            self.session.exec(
                select(SubscriptionPlan).order_by(SubscriptionPlan.price_inr_monthly)
            ).all()
        )


class SubscriptionTenantRepository:
    def __init__(self, session: Session):
        self.session = session

    def get(self, tenant_id: str) -> Tenant | None:
        return self.session.get(Tenant, tenant_id)

    def get_primary(self) -> Tenant | None:
        return self.session.exec(
            select(Tenant).where(Tenant.is_primary == True)  # noqa: E712
        ).first()

    def get_first(self) -> Tenant | None:
        return self.session.exec(select(Tenant).order_by(Tenant.created_at)).first()


class TenantSubscriptionRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, subscription: TenantSubscription) -> TenantSubscription:
        self.session.add(subscription)
        return subscription

    def latest_for_tenant(self, tenant_id: str) -> TenantSubscription | None:
        return self.session.exec(
            select(TenantSubscription)
            .where(TenantSubscription.tenant_id == tenant_id)
            .order_by(
                TenantSubscription.ends_on.desc(), TenantSubscription.updated_at.desc()
            )
        ).first()

    def trial_for_tenant(self, tenant_id: str) -> TenantSubscription | None:
        return self.session.exec(
            select(TenantSubscription).where(
                TenantSubscription.tenant_id == tenant_id,
                TenantSubscription.is_trial == True,  # noqa: E712
            )
        ).first()

    def active_for_tenant(self, tenant_id: str) -> list[TenantSubscription]:
        return list(
            self.session.exec(
                select(TenantSubscription).where(
                    TenantSubscription.tenant_id == tenant_id,
                    TenantSubscription.status == SubscriptionStatus.ACTIVE,
                )
            ).all()
        )

    def list_for_tenant(self, tenant_id: str) -> list[TenantSubscription]:
        return list(
            self.session.exec(
                select(TenantSubscription)
                .where(TenantSubscription.tenant_id == tenant_id)
                .order_by(
                    TenantSubscription.starts_on.desc(),
                    TenantSubscription.created_at.desc(),
                )
            ).all()
        )

    def list_all(self) -> list[TenantSubscription]:
        return list(self.session.exec(select(TenantSubscription)).all())


class SubscriptionCreditRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, credit: SubscriptionCredit) -> SubscriptionCredit:
        self.session.add(credit)
        return credit

    def list_for_tenant(self, tenant_id: str) -> list[SubscriptionCredit]:
        return list(
            self.session.exec(
                select(SubscriptionCredit)
                .where(SubscriptionCredit.tenant_id == tenant_id)
                .order_by(SubscriptionCredit.created_at.desc())
            ).all()
        )


class SubscriptionInvoiceRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, invoice: SubscriptionInvoice) -> SubscriptionInvoice:
        self.session.add(invoice)
        return invoice

    def get(self, invoice_id: str) -> SubscriptionInvoice | None:
        return self.session.get(SubscriptionInvoice, invoice_id)

    def list_for_tenant(self, tenant_id: str) -> list[SubscriptionInvoice]:
        return list(
            self.session.exec(
                select(SubscriptionInvoice)
                .where(SubscriptionInvoice.tenant_id == tenant_id)
                .order_by(
                    SubscriptionInvoice.issued_on.desc(),
                    SubscriptionInvoice.created_at.desc(),
                )
            ).all()
        )

    def list_all(self) -> list[SubscriptionInvoice]:
        return list(self.session.exec(select(SubscriptionInvoice)).all())

    def next_invoice_number(self) -> str:
        count = self.session.exec(
            select(func.count()).select_from(SubscriptionInvoice)
        ).one()
        return f"MHDSUB-{count + 1:06d}"


class SubscriptionRevenueRepository:
    def __init__(self, session: Session):
        self.session = session

    def report_rows(
        self,
        *,
        current_user_tenant_id: str | None,
        is_super_admin: bool,
        tenant_id: str | None,
        from_date: date | None,
        to_date: date | None,
        status_filter: SubscriptionInvoiceStatus | None,
        q: str | None,
    ):
        statement = (
            select(SubscriptionInvoice, TenantSubscription, SubscriptionPlan, Tenant)
            .outerjoin(
                TenantSubscription,
                TenantSubscription.id == SubscriptionInvoice.subscription_id,
            )
            .outerjoin(
                SubscriptionPlan, SubscriptionPlan.id == TenantSubscription.plan_id
            )
            .join(Tenant, Tenant.id == SubscriptionInvoice.tenant_id)
        )
        if not is_super_admin:
            statement = statement.where(
                SubscriptionInvoice.tenant_id == current_user_tenant_id
            )
        elif tenant_id:
            statement = statement.where(SubscriptionInvoice.tenant_id == tenant_id)
        if from_date:
            statement = statement.where(SubscriptionInvoice.issued_on >= from_date)
        if to_date:
            statement = statement.where(SubscriptionInvoice.issued_on <= to_date)
        if status_filter:
            statement = statement.where(SubscriptionInvoice.status == status_filter)
        if q:
            like = f"%{q.strip().lower()}%"
            statement = statement.where(
                (func.lower(SubscriptionInvoice.invoice_number).like(like))
                | (func.lower(SubscriptionInvoice.description).like(like))
                | (func.lower(Tenant.name).like(like))
                | (func.lower(SubscriptionPlan.name).like(like))
            )
        return self.session.exec(
            statement.order_by(
                SubscriptionInvoice.issued_on.desc(),
                SubscriptionInvoice.created_at.desc(),
            )
        ).all()

    def active_subscription_plan_rows(self):
        return self.session.exec(
            select(TenantSubscription, SubscriptionPlan)
            .join(SubscriptionPlan)
            .where(TenantSubscription.status == SubscriptionStatus.ACTIVE)
        ).all()
