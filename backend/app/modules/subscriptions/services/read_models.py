from app.modules.subscriptions.models import SubscriptionInvoice, SubscriptionPlan
from app.modules.subscriptions.schemas import (
    SubscriptionInvoiceRead,
    SubscriptionPlanRead,
)
from app.modules.subscriptions.services.serialization import modules_from_json
from app.modules.tenants.models import now_utc


def read_invoice(invoice: SubscriptionInvoice) -> SubscriptionInvoiceRead:
    if invoice.total_amount == 0 and invoice.amount:
        invoice.taxable_amount = invoice.taxable_amount or invoice.amount
        invoice.total_amount = invoice.total_amount or invoice.amount
        invoice.balance_amount = invoice.balance_amount or max(
            invoice.total_amount - invoice.paid_amount, 0
        )
    return SubscriptionInvoiceRead.model_validate(invoice, from_attributes=True)


def read_plan(plan: SubscriptionPlan) -> SubscriptionPlanRead:
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
