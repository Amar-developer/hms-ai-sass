from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.billing import payments as payment_routes
from app.modules.billing.models import BillingAdjustmentType
from app.modules.identity.models import User


class FakeAdjustmentRepository:
    request_type = BillingAdjustmentType.FULL_REFUND

    def __init__(self, _session):
        pass

    def get_adjustment_request_for_tenant(self, **_kwargs):
        return SimpleNamespace(request_type=self.request_type)


def require_decision(monkeypatch, *, request_type, permission_keys, user_type="staff"):
    FakeAdjustmentRepository.request_type = request_type
    monkeypatch.setattr(
        payment_routes, "BillingAdjustmentRepository", FakeAdjustmentRepository
    )
    monkeypatch.setattr(
        payment_routes,
        "user_permission_keys",
        lambda _session, _user: set(permission_keys),
    )
    monkeypatch.setattr(
        payment_routes,
        "is_tenant_admin_user",
        lambda _session, user: user.user_type == "tenant_admin",
    )
    payment_routes._require_billing_adjustment_decision_permission(
        None,
        User(
            id="user_permission_test",
            tenant_id="tenant_permission_test",
            name="Permission Tester",
            email="permission@test.local",
            user_type=user_type,
        ),
        tenant_id="tenant_permission_test",
        request_id="request_permission_test",
    )


def test_broad_billing_and_request_permissions_cannot_approve_refund(monkeypatch):
    with pytest.raises(HTTPException) as caught:
        require_decision(
            monkeypatch,
            request_type=BillingAdjustmentType.FULL_REFUND,
            permission_keys={"billing.manage", "billing.refunds.request"},
        )

    assert caught.value.status_code == 403


def test_refund_approver_can_approve_refund(monkeypatch):
    require_decision(
        monkeypatch,
        request_type=BillingAdjustmentType.PARTIAL_REFUND,
        permission_keys={"billing.refunds.approve"},
    )


def test_legacy_refund_manager_can_still_approve_refund(monkeypatch):
    require_decision(
        monkeypatch,
        request_type=BillingAdjustmentType.PARTIAL_REFUND,
        permission_keys={"billing.refunds.manage"},
    )


def test_discount_approver_cannot_approve_refund(monkeypatch):
    with pytest.raises(HTTPException) as caught:
        require_decision(
            monkeypatch,
            request_type=BillingAdjustmentType.FULL_REFUND,
            permission_keys={"billing.discounts.approve"},
        )

    assert caught.value.status_code == 403


def test_discount_approver_can_approve_discount(monkeypatch):
    require_decision(
        monkeypatch,
        request_type=BillingAdjustmentType.DISCOUNT,
        permission_keys={"billing.discounts.approve"},
    )


def test_cancellation_approver_can_approve_cancellation(monkeypatch):
    require_decision(
        monkeypatch,
        request_type=BillingAdjustmentType.CANCEL,
        permission_keys={"invoices.cancel_approve"},
    )


def test_refund_approver_cannot_approve_cancellation(monkeypatch):
    with pytest.raises(HTTPException) as caught:
        require_decision(
            monkeypatch,
            request_type=BillingAdjustmentType.CANCEL,
            permission_keys={"billing.refunds.approve"},
        )

    assert caught.value.status_code == 403


def test_tenant_admin_can_decide_without_specific_permission(monkeypatch):
    require_decision(
        monkeypatch,
        request_type=BillingAdjustmentType.FULL_REFUND,
        permission_keys=set(),
        user_type="tenant_admin",
    )


def test_broad_billing_permission_does_not_replace_refund_request_permission(
    monkeypatch,
):
    monkeypatch.setattr(
        payment_routes, "is_tenant_admin_user", lambda _session, _user: False
    )
    monkeypatch.setattr(
        payment_routes,
        "user_permission_keys",
        lambda _session, _user: {"billing.manage"},
    )
    user = User(
        tenant_id="tenant_permission_test",
        name="Receptionist",
        email="receptionist@test.local",
    )

    with pytest.raises(HTTPException) as caught:
        payment_routes._require_billing_adjustment_request_permission(
            None, user, BillingAdjustmentType.FULL_REFUND
        )

    assert caught.value.status_code == 403


def test_explicit_refund_request_permission_allows_request(monkeypatch):
    monkeypatch.setattr(
        payment_routes, "is_tenant_admin_user", lambda _session, _user: False
    )
    monkeypatch.setattr(
        payment_routes,
        "user_permission_keys",
        lambda _session, _user: {"billing.refunds.request"},
    )
    payment_routes._require_billing_adjustment_request_permission(
        None,
        User(
            tenant_id="tenant_permission_test",
            name="Receptionist",
            email="receptionist@test.local",
        ),
        BillingAdjustmentType.PARTIAL_REFUND,
    )


def test_tenant_admin_can_request_without_specific_permission(monkeypatch):
    monkeypatch.setattr(
        payment_routes,
        "is_tenant_admin_user",
        lambda _session, user: user.user_type == "tenant_admin",
    )
    payment_routes._require_billing_adjustment_request_permission(
        None,
        User(
            tenant_id="tenant_permission_test",
            name="Tenant Administrator",
            email="tenant.admin@test.local",
            user_type="tenant_admin",
        ),
        BillingAdjustmentType.FULL_REFUND,
    )
