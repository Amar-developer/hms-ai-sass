from datetime import date
from decimal import Decimal

from sqlmodel import Session

from app.core.list_filters import parse_list_filters, parse_list_sort
from app.modules.expenses.models import Expense, ExpenseCategory, ExpenseStatus
from app.modules.expenses.repositories.expense_repository import ExpenseRepository
from app.modules.identity.models import User
from app.modules.tenants.models import Branch, Tenant


def test_expense_repository_applies_dynamic_filter_before_pagination(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Expense Filter Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
        session.add(branch)
        session.commit()
        session.refresh(branch)
        session.add(
            Expense(
                tenant_id=tenant.id,
                branch_id=branch.id,
                category=ExpenseCategory.RENT,
                subcategory="Clinic Rent",
                amount=Decimal("1000.00"),
                incurred_on=date(2026, 8, 1),
                description="Monthly rent",
                submitted_by="user_one",
            )
        )
        session.add(
            Expense(
                tenant_id=tenant.id,
                branch_id=branch.id,
                category=ExpenseCategory.SUPPLIES,
                subcategory="Syringes",
                amount=Decimal("250.00"),
                incurred_on=date(2026, 8, 2),
                description="Medical supplies",
                submitted_by="user_two",
            )
        )
        session.commit()

        rows, total = ExpenseRepository(session).list_for_tenant(
            tenant_id=tenant.id,
            branch_id=None,
            list_filters=parse_list_filters(
                '[{"field":"subcategory","operator":"like","value":"rent"}]'
            ),
            limit=1,
            offset=0,
        )

    assert total == 1
    assert [row.description for row in rows] == ["Monthly rent"]


def test_expense_repository_applies_dynamic_sort_before_pagination(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Expense Sort Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
        session.add(branch)
        session.commit()
        session.refresh(branch)
        session.add(
            Expense(
                tenant_id=tenant.id,
                branch_id=branch.id,
                category=ExpenseCategory.RENT,
                subcategory="Clinic Rent",
                amount=Decimal("1000.00"),
                incurred_on=date(2026, 8, 1),
                description="Large",
                submitted_by="user_one",
            )
        )
        session.add(
            Expense(
                tenant_id=tenant.id,
                branch_id=branch.id,
                category=ExpenseCategory.SUPPLIES,
                subcategory="Syringes",
                amount=Decimal("250.00"),
                incurred_on=date(2026, 8, 2),
                description="Small",
                submitted_by="user_two",
            )
        )
        session.commit()

        rows, _total = ExpenseRepository(session).list_for_tenant(
            tenant_id=tenant.id,
            branch_id=None,
            list_sort=parse_list_sort('{"key":"amount","dir":"asc"}'),
            limit=1,
            offset=0,
        )

    assert [row.description for row in rows] == ["Small"]


def test_expense_filter_options_are_user_and_branch_backed(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Expense Options Clinic")
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
        session.add(branch)
        session.commit()
        session.refresh(branch)
        user = User(
            tenant_id=tenant.id,
            branch_id=branch.id,
            name="Expense User",
            email="expense@example.test",
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        user_id = user.id
        session.add(
            Expense(
                tenant_id=tenant.id,
                branch_id=branch.id,
                category=ExpenseCategory.RENT,
                subcategory="Clinic Rent",
                amount=Decimal("1000.00"),
                incurred_on=date(2026, 8, 1),
                description="Monthly rent",
                status=ExpenseStatus.PENDING,
                submitted_by=user_id,
                created_by_user_id=user_id,
            )
        )
        session.commit()

        options = ExpenseRepository(session).filter_options(
            tenant_id=tenant.id,
            branch_id=branch.id,
        )

    assert [row.model_dump() for row in options["branch_id"]] == [
        {"value": branch.id, "label": "Main Branch"}
    ]
    assert [row.value for row in options["category"]] == ["rent"]
    assert {"value": user_id, "label": "Expense User"} in [
        row.model_dump() for row in options["created_by_user_id"]
    ]
