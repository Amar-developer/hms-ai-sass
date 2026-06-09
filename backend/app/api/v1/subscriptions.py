from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.audit.service import record_audit_event
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.manifest import MODULES
from app.modules.subscriptions.models import (
    CreditStatus,
    SubscriptionCredit,
    SubscriptionInvoice,
    SubscriptionInvoiceStatus,
    SubscriptionPlan,
    SubscriptionStatus,
    TenantSubscription,
)
from app.modules.subscriptions.schemas import (
    EntitlementRead,
    SubscriptionAnnouncementRead,
    SubscriptionCreditCreate,
    SubscriptionCreditRead,
    SubscriptionInvoiceFailureCreate,
    SubscriptionInvoiceCreate,
    SubscriptionInvoiceRead,
    SubscriptionInvoiceSettlementCreate,
    SubscriptionPlanCreate,
    SubscriptionPlanRead,
    SubscriptionPlanStatusUpdate,
    SubscriptionPlanUpdate,
    SubscriptionRevenueReport,
    SubscriptionRevenueSummary,
    SubscriptionUsageRead,
    TenantSubscriptionCreate,
    TenantSubscriptionRead,
)
from app.modules.subscriptions.service import (
    CORE_HMS_MODULES,
    active_patient_credits,
    current_patient_count,
    effective_patient_limit,
    ensure_default_plans,
    get_active_subscription,
    modules_from_json,
    modules_to_json,
    next_subscription_invoice_number,
    plan_duration_days,
)
from app.modules.tenants.models import Tenant, now_utc

router = APIRouter(prefix="/subscription-plans")


def _simple_pdf(lines: list[str]) -> bytes:
    text = "\\n".join(lines).replace("(", "[").replace(")", "]")
    stream = f"BT /F1 12 Tf 50 760 Td ({text}) Tj ET"
    return (
        b"%PDF-1.4\n"
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        b"3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >> endobj\n"
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
        + f"5 0 obj << /Length {len(stream)} >> stream\n{stream}\nendstream endobj\n".encode()
        + b"xref\n0 6\n0000000000 65535 f \ntrailer << /Root 1 0 R /Size 6 >>\nstartxref\n0\n%%EOF"
    )


def _invoice_read(invoice: SubscriptionInvoice) -> SubscriptionInvoiceRead:
    if invoice.total_amount == 0 and invoice.amount:
        invoice.taxable_amount = invoice.taxable_amount or invoice.amount
        invoice.total_amount = invoice.total_amount or invoice.amount
        invoice.balance_amount = invoice.balance_amount or max(invoice.total_amount - invoice.paid_amount, 0)
    return SubscriptionInvoiceRead.model_validate(invoice, from_attributes=True)


def _plan_read(plan: SubscriptionPlan) -> SubscriptionPlanRead:
    created_at = plan.created_at or now_utc()
    updated_at = plan.updated_at or created_at
    return SubscriptionPlanRead(
        id=plan.id,
        key=plan.key,
        name=plan.name,
        monthly_patient_limit=plan.monthly_patient_limit,
        included_branches=plan.included_branches,
        included_doctors=plan.included_doctors,
        price_inr_monthly=plan.price_inr_monthly,
        is_active=plan.is_active,
        created_by_user_id=plan.created_by_user_id,
        updated_by_user_id=plan.updated_by_user_id,
        created_at=created_at,
        updated_at=updated_at,
        enabled_modules=modules_from_json(plan.enabled_modules_json),
    )


def _normalize_enabled_modules(raw_modules: list[str] | None) -> list[str]:
    entitlement_modules = {
        str(module["entitlement_key"]): module
        for module in MODULES
        if module.get("entitlement_key")
    }
    module_by_key = {str(module["key"]): module for module in MODULES}
    selected = {str(module).strip() for module in (raw_modules or []) if str(module).strip()}
    if not selected:
        selected = set(CORE_HMS_MODULES)

    changed = True
    while changed:
        changed = False
        for module_key in list(selected):
            module = entitlement_modules.get(module_key)
            if not module:
                continue
            for dependency in module.get("dependencies", []):
                dependency_module = module_by_key.get(str(dependency))
                dependency_key = dependency_module.get("entitlement_key") if dependency_module else dependency
                if dependency_key and dependency_key not in selected:
                    selected.add(str(dependency_key))
                    changed = True

    allowed = set(entitlement_modules)
    return sorted(module for module in selected if module in allowed)


def _platform_audit_tenant_id(session: Session, current_user: User) -> str | None:
    if current_user.tenant_id:
        return current_user.tenant_id
    primary = session.exec(select(Tenant).where(Tenant.is_primary == True)).first()  # noqa: E712
    if primary:
        return primary.id
    first = session.exec(select(Tenant).order_by(Tenant.created_at)).first()
    return first.id if first else None


def _record_platform_audit(
    session: Session,
    current_user: User,
    *,
    action: str,
    resource_type: str,
    resource_id: str,
    purpose: str,
) -> None:
    tenant_id = _platform_audit_tenant_id(session, current_user)
    if not tenant_id:
        return
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        purpose=purpose,
    )


def _usage_read(session: Session, tenant_id: str) -> SubscriptionUsageRead:
    subscription, plan = get_active_subscription(session, tenant_id)
    patient_count = current_patient_count(session, tenant_id)
    credits = active_patient_credits(session, tenant_id)
    limit = effective_patient_limit(session, tenant_id, plan)
    remaining = max(limit - patient_count, 0)
    days_to_expiry = (subscription.ends_on - date.today()).days if subscription.ends_on else None
    usage_percentage = round((patient_count / limit) * 100, 2) if limit else 100.0
    alerts = []
    if days_to_expiry is not None and days_to_expiry <= 7:
        alerts.append("Plan expires within 7 days")
    if remaining == 0:
        alerts.append("Patient limit reached")
    elif usage_percentage >= 90:
        alerts.append("Usage is above 90 percent")
    elif usage_percentage >= 75:
        alerts.append("Usage is above 75 percent")
    return SubscriptionUsageRead(
        tenant_id=tenant_id,
        plan_key=plan.key,
        plan_name=plan.name,
        subscription_status=subscription.status,
        starts_on=subscription.starts_on,
        ends_on=subscription.ends_on,
        monthly_patient_limit=plan.monthly_patient_limit,
        additional_patient_credits=credits,
        effective_patient_limit=limit,
        current_patient_count=patient_count,
        remaining_patient_count=remaining,
        usage_percentage=usage_percentage,
        days_to_expiry=days_to_expiry,
        alerts=alerts,
    )


@router.post("", response_model=SubscriptionPlanRead, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: SubscriptionPlanCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)),
) -> SubscriptionPlanRead:
    enabled_modules = _normalize_enabled_modules(payload.enabled_modules)
    plan = SubscriptionPlan.model_validate(
        payload.model_dump(exclude={"enabled_modules"}),
        update={
            "enabled_modules_json": modules_to_json(enabled_modules),
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    session.add(plan)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Subscription plan key already exists",
        ) from exc
    session.refresh(plan)
    _record_platform_audit(
        session,
        current_user,
        action="subscription_plan.created",
        resource_type="subscription_plan",
        resource_id=plan.id,
        purpose="saas_subscription_management",
    )
    return _plan_read(plan)


@router.get("", response_model=list[SubscriptionPlanRead])
def list_plans(
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)),
) -> list[SubscriptionPlanRead]:
    ensure_default_plans(session)
    plans = list(session.exec(select(SubscriptionPlan).order_by(SubscriptionPlan.price_inr_monthly)).all())
    return [_plan_read(plan) for plan in plans]


@router.patch("/{plan_id}", response_model=SubscriptionPlanRead)
def update_plan(
    plan_id: str,
    payload: SubscriptionPlanUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)),
) -> SubscriptionPlanRead:
    plan = session.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription plan not found")
    updates = payload.model_dump(exclude_unset=True)
    enabled_modules = updates.pop("enabled_modules", None)
    for key, value in updates.items():
        setattr(plan, key, value)
    if enabled_modules is not None:
        plan.enabled_modules_json = modules_to_json(_normalize_enabled_modules(enabled_modules))
    plan.updated_by_user_id = current_user.id
    plan.updated_at = now_utc()
    session.add(plan)
    session.commit()
    session.refresh(plan)
    _record_platform_audit(
        session,
        current_user,
        action="subscription_plan.updated",
        resource_type="subscription_plan",
        resource_id=plan.id,
        purpose="saas_subscription_management",
    )
    return _plan_read(plan)


@router.post("/{plan_id}/status", response_model=SubscriptionPlanRead)
def change_plan_status(
    plan_id: str,
    payload: SubscriptionPlanStatusUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)),
) -> SubscriptionPlanRead:
    plan = session.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription plan not found")
    plan.is_active = payload.is_active
    plan.updated_by_user_id = current_user.id
    plan.updated_at = now_utc()
    session.add(plan)
    session.commit()
    session.refresh(plan)
    _record_platform_audit(
        session,
        current_user,
        action="subscription_plan.status_changed",
        resource_type="subscription_plan",
        resource_id=plan.id,
        purpose="saas_subscription_management",
    )
    return _plan_read(plan)


@router.post("/tenant-subscriptions", response_model=TenantSubscriptionRead, status_code=status.HTTP_201_CREATED)
def create_tenant_subscription(
    payload: TenantSubscriptionCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)),
) -> TenantSubscription:
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    if tenant.is_primary:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Primary platform tenant does not need a customer subscription",
        )
    plan = session.get(SubscriptionPlan, payload.plan_id)
    if not plan or not plan.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid subscription plan")
    if plan.key == "free_trial":
        existing_trial = session.exec(
            select(TenantSubscription).where(
                TenantSubscription.tenant_id == tenant_id,
                TenantSubscription.is_trial == True,  # noqa: E712
            )
        ).first()
        if existing_trial:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Free Trial can only be used once for this tenant",
            )
    ends_on = payload.ends_on
    if ends_on is None:
        duration_days = plan_duration_days(plan.key)
        if duration_days:
            ends_on = payload.starts_on + timedelta(days=duration_days)
    starts_today = payload.starts_on <= date.today()
    if starts_today:
        existing = list(
            session.exec(
                select(TenantSubscription).where(
                    TenantSubscription.tenant_id == tenant_id,
                    TenantSubscription.status == SubscriptionStatus.ACTIVE,
                )
            ).all()
        )
        for subscription in existing:
            subscription.is_active = False
            subscription.status = SubscriptionStatus.EXPIRED
            subscription.updated_by_user_id = current_user.id
            subscription.updated_at = now_utc()
            session.add(subscription)
    tenant_subscription = TenantSubscription.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "ends_on": ends_on,
            "is_active": starts_today,
            "is_trial": plan.key == "free_trial",
            "status": SubscriptionStatus.ACTIVE if starts_today else SubscriptionStatus.SCHEDULED,
            "billing_amount": payload.billing_amount if payload.billing_amount is not None else plan.price_inr_monthly,
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    session.add(tenant_subscription)
    session.commit()
    session.refresh(tenant_subscription)
    invoice = SubscriptionInvoice(
        tenant_id=tenant_id,
        subscription_id=tenant_subscription.id,
        invoice_number=next_subscription_invoice_number(session),
        description=f"Subscription: {plan.name}",
        amount=tenant_subscription.billing_amount,
        taxable_amount=tenant_subscription.billing_amount,
        total_amount=tenant_subscription.billing_amount,
        balance_amount=tenant_subscription.billing_amount,
        due_on=tenant_subscription.starts_on,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )
    session.add(invoice)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=current_user.id,
        action="tenant_subscription.assigned",
        resource_type="tenant_subscription",
        resource_id=tenant_subscription.id,
        purpose="saas_subscription_management",
        metadata_json=f'{{"status": "{tenant_subscription.status.value}", "plan_id": "{plan.id}"}}',
    )
    return tenant_subscription


@router.get("/tenant-subscriptions", response_model=list[TenantSubscriptionRead])
def list_tenant_subscriptions(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)),
) -> list[TenantSubscription]:
    return list(
        session.exec(
            select(TenantSubscription)
            .where(TenantSubscription.tenant_id == tenant_id)
            .order_by(TenantSubscription.starts_on.desc(), TenantSubscription.created_at.desc())
        ).all()
    )


@router.get("/tenant-subscriptions/active", response_model=TenantSubscriptionRead)
def get_active_tenant_subscription(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
) -> TenantSubscription:
    subscription, _plan = get_active_subscription(session, tenant_id)
    return subscription


@router.get("/entitlements", response_model=EntitlementRead)
def get_entitlements(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(
        require_any_permission(
            permissions.REPORTS_READ,
            permissions.SETTINGS_MANAGE,
            permissions.IDENTITY_USERS_MANAGE,
            permissions.IDENTITY_USERS_READ,
            permissions.IDENTITY_ROLES_MANAGE,
            permissions.BRANCHES_MANAGE,
            permissions.DEPARTMENTS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_MANAGE,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.PATIENT_SUBSCRIPTIONS_CREATE,
            permissions.HOME_CARE_MANAGE,
            permissions.HOME_CARE_READ,
            permissions.HOME_CARE_CREATE,
        )
    ),
) -> EntitlementRead:
    subscription, plan = get_active_subscription(session, tenant_id)
    patient_count = current_patient_count(session, tenant_id)
    credits = active_patient_credits(session, tenant_id)
    limit = effective_patient_limit(session, tenant_id, plan)
    return EntitlementRead(
        tenant_id=tenant_id,
        plan_key=plan.key,
        plan_name=plan.name,
        is_trial=subscription.is_trial,
        starts_on=subscription.starts_on,
        ends_on=subscription.ends_on,
        monthly_patient_limit=plan.monthly_patient_limit,
        additional_patient_credits=credits,
        effective_patient_limit=limit,
        current_patient_count=patient_count,
        remaining_patient_count=max(limit - patient_count, 0),
        is_expired=False,
        enabled_modules=modules_from_json(plan.enabled_modules_json),
    )


@router.post("/credits", response_model=SubscriptionCreditRead, status_code=status.HTTP_201_CREATED)
def purchase_subscription_credit(
    payload: SubscriptionCreditCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)),
) -> SubscriptionCredit:
    target_tenant_id = payload.tenant_id or tenant_id
    if target_tenant_id != tenant_id and not current_user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied")
    tenant = session.get(Tenant, target_tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    credit = SubscriptionCredit.model_validate(
        payload,
        update={
            "tenant_id": target_tenant_id,
            "status": CreditStatus.ACTIVE,
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    session.add(credit)
    session.commit()
    session.refresh(credit)
    invoice = SubscriptionInvoice(
        tenant_id=target_tenant_id,
        credit_id=credit.id,
        invoice_number=next_subscription_invoice_number(session),
        description=f"Additional credit: {credit.quantity} {credit.credit_type}",
        amount=credit.amount,
        taxable_amount=credit.amount,
        total_amount=credit.amount,
        balance_amount=credit.amount,
        due_on=credit.starts_on,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )
    session.add(invoice)
    session.commit()
    record_audit_event(
        session,
        tenant_id=target_tenant_id,
        actor_user_id=current_user.id,
        action="subscription_credit.purchased",
        resource_type="subscription_credit",
        resource_id=credit.id,
        purpose="saas_subscription_management",
    )
    return credit


@router.get("/credits", response_model=list[SubscriptionCreditRead])
def list_subscription_credits(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
) -> list[SubscriptionCredit]:
    return list(
        session.exec(
            select(SubscriptionCredit)
            .where(SubscriptionCredit.tenant_id == tenant_id)
            .order_by(SubscriptionCredit.created_at.desc())
        ).all()
    )


@router.post("/invoices", response_model=SubscriptionInvoiceRead, status_code=status.HTTP_201_CREATED)
def create_subscription_invoice(
    payload: SubscriptionInvoiceCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)),
) -> SubscriptionInvoice:
    target_tenant_id = payload.tenant_id or tenant_id
    total_amount = payload.amount + payload.tax_amount
    invoice = SubscriptionInvoice.model_validate(
        payload,
        update={
            "tenant_id": target_tenant_id,
            "invoice_number": next_subscription_invoice_number(session),
            "taxable_amount": payload.amount,
            "total_amount": total_amount,
            "balance_amount": total_amount,
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    record_audit_event(
        session,
        tenant_id=target_tenant_id,
        actor_user_id=current_user.id,
        action="subscription_invoice.created",
        resource_type="subscription_invoice",
        resource_id=invoice.id,
        purpose="saas_revenue_management",
    )
    return _invoice_read(invoice)


@router.get("/invoices", response_model=list[SubscriptionInvoiceRead])
def list_subscription_invoices(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
) -> list[SubscriptionInvoiceRead]:
    invoices = list(
        session.exec(
            select(SubscriptionInvoice)
            .where(SubscriptionInvoice.tenant_id == tenant_id)
            .order_by(SubscriptionInvoice.issued_on.desc(), SubscriptionInvoice.created_at.desc())
        ).all()
    )
    return [_invoice_read(invoice) for invoice in invoices]


@router.post("/invoices/{invoice_id}/settle", response_model=SubscriptionInvoiceRead)
def settle_subscription_invoice(
    invoice_id: str,
    payload: SubscriptionInvoiceSettlementCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)),
) -> SubscriptionInvoiceRead:
    invoice = session.get(SubscriptionInvoice, invoice_id)
    if not invoice or (invoice.tenant_id != tenant_id and not current_user.is_super_admin):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription invoice not found")
    paid_total = min((invoice.paid_amount or 0) + payload.amount, invoice.total_amount or invoice.amount)
    invoice.paid_amount = paid_total
    invoice.balance_amount = max((invoice.total_amount or invoice.amount) - paid_total, 0)
    invoice.payment_method = payload.payment_method
    invoice.payment_reference = payload.payment_reference
    invoice.gateway_transaction_id = payload.gateway_transaction_id
    invoice.gateway_status = payload.gateway_status
    invoice.last_payment_attempt_at = now_utc()
    if invoice.balance_amount == 0:
        invoice.status = SubscriptionInvoiceStatus.PAID
        invoice.paid_on = date.today()
    invoice.updated_by_user_id = current_user.id
    invoice.updated_at = now_utc()
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    record_audit_event(
        session,
        tenant_id=invoice.tenant_id,
        actor_user_id=current_user.id,
        action="subscription_invoice.payment_settled",
        resource_type="subscription_invoice",
        resource_id=invoice.id,
        purpose="saas_revenue_collection",
    )
    return _invoice_read(invoice)


@router.post("/invoices/{invoice_id}/payment-failed", response_model=SubscriptionInvoiceRead)
def mark_subscription_payment_failed(
    invoice_id: str,
    payload: SubscriptionInvoiceFailureCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)),
) -> SubscriptionInvoiceRead:
    invoice = session.get(SubscriptionInvoice, invoice_id)
    if not invoice or (invoice.tenant_id != tenant_id and not current_user.is_super_admin):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription invoice not found")
    invoice.gateway_transaction_id = payload.gateway_transaction_id
    invoice.gateway_status = payload.gateway_status
    invoice.failed_reason = payload.failed_reason
    invoice.last_payment_attempt_at = now_utc()
    invoice.updated_by_user_id = current_user.id
    invoice.updated_at = now_utc()
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    record_audit_event(
        session,
        tenant_id=invoice.tenant_id,
        actor_user_id=current_user.id,
        action="subscription_invoice.payment_failed",
        resource_type="subscription_invoice",
        resource_id=invoice.id,
        purpose="saas_failed_payment_recovery",
    )
    return _invoice_read(invoice)


@router.get("/usage", response_model=SubscriptionUsageRead)
def get_subscription_usage(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
) -> SubscriptionUsageRead:
    return _usage_read(session, tenant_id)


@router.get("/announcements", response_model=list[SubscriptionAnnouncementRead])
def get_subscription_announcements(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
) -> list[SubscriptionAnnouncementRead]:
    usage = _usage_read(session, tenant_id)
    messages = []
    if usage.days_to_expiry is not None and usage.days_to_expiry <= 7:
        messages.append(
            SubscriptionAnnouncementRead(
                tenant_id=tenant_id,
                severity="warning",
                message=f"Your {usage.plan_name} subscription expires in {usage.days_to_expiry} day(s). Renew or schedule the next plan to avoid service interruption.",
                action="renew_subscription",
            )
        )
    if usage.remaining_patient_count <= 10 or usage.usage_percentage >= 90:
        messages.append(
            SubscriptionAnnouncementRead(
                tenant_id=tenant_id,
                severity="critical" if usage.remaining_patient_count == 0 else "warning",
                message=f"Patient usage is {usage.current_patient_count}/{usage.effective_patient_limit}. Purchase credits or upgrade your plan.",
                action="upgrade_or_buy_credits",
            )
        )
    return messages


def _subscription_report_rows(
    session: Session,
    *,
    current_user: User,
    tenant_id: str | None,
    from_date: date | None,
    to_date: date | None,
    status_filter: SubscriptionInvoiceStatus | None,
    q: str | None,
) -> list[dict]:
    statement = (
        select(SubscriptionInvoice, TenantSubscription, SubscriptionPlan, Tenant)
        .outerjoin(TenantSubscription, TenantSubscription.id == SubscriptionInvoice.subscription_id)
        .outerjoin(SubscriptionPlan, SubscriptionPlan.id == TenantSubscription.plan_id)
        .join(Tenant, Tenant.id == SubscriptionInvoice.tenant_id)
    )
    if not current_user.is_super_admin:
        statement = statement.where(SubscriptionInvoice.tenant_id == current_user.tenant_id)
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
    rows = session.exec(statement.order_by(SubscriptionInvoice.issued_on.desc(), SubscriptionInvoice.created_at.desc())).all()
    return [
        {
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "tenant_id": invoice.tenant_id,
            "tenant_name": tenant.name,
            "plan_id": plan.id if plan else None,
            "plan_name": plan.name if plan else "Credits/Manual",
            "description": invoice.description,
            "status": invoice.status.value,
            "issued_on": invoice.issued_on.isoformat(),
            "due_on": invoice.due_on.isoformat() if invoice.due_on else None,
            "paid_on": invoice.paid_on.isoformat() if invoice.paid_on else None,
            "taxable_amount": invoice.taxable_amount or invoice.amount,
            "tax_amount": invoice.tax_amount,
            "total_amount": invoice.total_amount or invoice.amount,
            "paid_amount": invoice.paid_amount,
            "balance_amount": invoice.balance_amount if invoice.total_amount else max(invoice.amount - invoice.paid_amount, 0),
            "payment_method": invoice.payment_method,
            "payment_reference": invoice.payment_reference,
            "gateway_status": invoice.gateway_status,
            "failed_reason": invoice.failed_reason,
        }
        for invoice, _subscription, plan, tenant in rows
    ]


def _export_rows(rows: list[dict], export: str) -> Response:
    headers = [
        "invoice_number",
        "tenant_name",
        "plan_name",
        "description",
        "status",
        "issued_on",
        "due_on",
        "paid_on",
        "taxable_amount",
        "tax_amount",
        "total_amount",
        "paid_amount",
        "balance_amount",
        "gateway_status",
    ]
    if export == "pdf":
        lines = ["MedizinHub HMS SaaS Revenue Report"] + [
            f"{row['invoice_number']} {row['tenant_name']} {row['status']} Rs.{row['total_amount']}" for row in rows[:28]
        ]
        return Response(content=_simple_pdf(lines), media_type="application/pdf")
    separator = "\t" if export == "xls" else ","
    content = separator.join(headers) + "\n"
    content += "\n".join(separator.join(str(row.get(header) or "") for header in headers) for row in rows)
    media_type = "application/vnd.ms-excel" if export == "xls" else "text/csv"
    extension = "xls" if export == "xls" else "csv"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="saas-revenue-report.{extension}"'},
    )


@router.get("/reports/revenue", response_model=SubscriptionRevenueReport)
def subscription_revenue_report(
    tenant_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    status_filter: SubscriptionInvoiceStatus | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    export: str | None = Query(default=None, pattern="^(csv|xls|pdf)$"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.REPORTS_READ)),
):
    rows = _subscription_report_rows(
        session,
        current_user=current_user,
        tenant_id=tenant_id,
        from_date=from_date,
        to_date=to_date,
        status_filter=status_filter,
        q=q,
    )
    if export:
        return _export_rows(rows, export)
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    active_subscriptions = list(
        session.exec(select(TenantSubscription, SubscriptionPlan).join(SubscriptionPlan).where(TenantSubscription.status == SubscriptionStatus.ACTIVE)).all()
    )
    if not current_user.is_super_admin:
        active_subscriptions = [row for row in active_subscriptions if row[0].tenant_id == current_user.tenant_id]
    mrr_by_plan: dict[str, dict] = {}
    for subscription, plan in active_subscriptions:
        bucket = mrr_by_plan.setdefault(plan.id, {"plan_id": plan.id, "plan_name": plan.name, "tenant_count": 0, "mrr": 0})
        bucket["tenant_count"] += 1
        bucket["mrr"] += subscription.billing_amount
    return SubscriptionRevenueReport(
        rows=page_rows,
        total_invoice_amount=sum(row["total_amount"] for row in rows),
        total_paid_amount=sum(row["paid_amount"] for row in rows),
        total_pending_amount=sum(row["balance_amount"] for row in rows if row["status"] != SubscriptionInvoiceStatus.CANCELLED.value),
        total_tax_amount=sum(row["tax_amount"] for row in rows),
        total_failed_amount=sum(row["total_amount"] for row in rows if row["gateway_status"] == "failed"),
        mrr_by_plan=list(mrr_by_plan.values()),
        page=page,
        page_size=page_size,
        total_rows=len(rows),
    )


@router.get("/platform/revenue-summary", response_model=SubscriptionRevenueSummary)
def get_platform_revenue_summary(
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.PLATFORM_SUBSCRIPTIONS_MANAGE)),
) -> SubscriptionRevenueSummary:
    subscriptions = list(session.exec(select(TenantSubscription)).all())
    invoices = list(session.exec(select(SubscriptionInvoice)).all())
    active_subscriptions = [row for row in subscriptions if row.status == SubscriptionStatus.ACTIVE]
    scheduled_subscriptions = [row for row in subscriptions if row.status == SubscriptionStatus.SCHEDULED]
    today = date.today()
    expiring = [row for row in active_subscriptions if row.ends_on and 0 <= (row.ends_on - today).days <= 7]
    return SubscriptionRevenueSummary(
        total_active_subscriptions=len(active_subscriptions),
        scheduled_subscriptions=len(scheduled_subscriptions),
        expiring_in_7_days=len(expiring),
        estimated_monthly_recurring_revenue=sum(row.billing_amount for row in active_subscriptions),
        issued_invoice_amount=sum((row.total_amount or row.amount) for row in invoices if row.status != SubscriptionInvoiceStatus.CANCELLED),
        paid_invoice_amount=sum(row.paid_amount or (row.amount if row.status == SubscriptionInvoiceStatus.PAID else 0) for row in invoices),
        pending_invoice_amount=sum((row.balance_amount if row.total_amount else row.amount) for row in invoices if row.status == SubscriptionInvoiceStatus.ISSUED),
        credit_revenue_amount=sum((row.total_amount or row.amount) for row in invoices if row.credit_id),
        failed_invoice_amount=sum((row.total_amount or row.amount) for row in invoices if row.gateway_status == "failed"),
    )
