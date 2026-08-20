from sqlmodel import Session

from app.core.list_filters import parse_list_filters, parse_list_sort
from app.modules.identity.models import User
from app.modules.tenants.models import Branch, Department, Tenant
from app.modules.tenants.repositories import BranchRepository, DepartmentRepository


def _tenant(session: Session) -> Tenant:
    tenant = Tenant(name="Reference Filter Clinic")
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant


def test_branch_repository_applies_dynamic_filter_before_pagination(test_engine):
    with Session(test_engine) as session:
        tenant = _tenant(session)
        session.add(
            Branch(
                tenant_id=tenant.id,
                name="Main Branch",
                code="MAIN",
                city="Chennai",
                is_active=True,
            )
        )
        session.add(
            Branch(
                tenant_id=tenant.id,
                name="Old Branch",
                code="OLD",
                city="Madurai",
                is_active=False,
            )
        )
        session.commit()

        rows = BranchRepository(session).list_page(
            tenant_id=tenant.id,
            list_filters=parse_list_filters(
                '[{"field":"is_active","operator":"equals","value":"true"}]'
            ),
            limit=1,
            offset=0,
        )
        total = BranchRepository(session).count_page(
            tenant_id=tenant.id,
            list_filters=parse_list_filters(
                '[{"field":"is_active","operator":"equals","value":"true"}]'
            ),
        )

    assert total == 1
    assert [row.name for row in rows] == ["Main Branch"]


def test_branch_repository_applies_dynamic_sort_before_pagination(test_engine):
    with Session(test_engine) as session:
        tenant = _tenant(session)
        session.add(Branch(tenant_id=tenant.id, name="Beta Branch", code="BETA"))
        session.add(Branch(tenant_id=tenant.id, name="Alpha Branch", code="ALPHA"))
        session.commit()

        rows = BranchRepository(session).list_page(
            tenant_id=tenant.id,
            list_sort=parse_list_sort('{"key":"name","dir":"asc"}'),
            limit=1,
            offset=0,
        )

    assert [row.name for row in rows] == ["Alpha Branch"]


def test_department_repository_applies_dynamic_filter_and_sort(test_engine):
    with Session(test_engine) as session:
        tenant = _tenant(session)
        session.add(
            Department(
                tenant_id=tenant.id,
                name="Cardiology",
                code="CARD",
                description="Heart care",
            )
        )
        session.add(
            Department(
                tenant_id=tenant.id,
                name="Dermatology",
                code="DERM",
                description="Skin care",
            )
        )
        session.commit()

        rows = DepartmentRepository(session).list_page(
            tenant_id=tenant.id,
            list_filters=parse_list_filters(
                '[{"field":"description","operator":"like","value":"skin"}]'
            ),
            list_sort=parse_list_sort('{"key":"name","dir":"desc"}'),
            limit=1,
            offset=0,
        )
        total = DepartmentRepository(session).count_page(
            tenant_id=tenant.id,
            list_filters=parse_list_filters(
                '[{"field":"description","operator":"like","value":"skin"}]'
            ),
        )

    assert total == 1
    assert [row.name for row in rows] == ["Dermatology"]


def test_branch_and_department_filter_options_include_tenant_users(test_engine):
    with Session(test_engine) as session:
        tenant = _tenant(session)
        user = User(
            tenant_id=tenant.id,
            name="Settings Admin",
            email="settings-admin@example.test",
        )
        branch = Branch(
            tenant_id=tenant.id,
            name="Main Branch",
            code="MAIN",
            created_by_user_id="placeholder",
        )
        session.add(user)
        session.add(branch)
        session.commit()
        session.refresh(user)
        session.refresh(branch)
        user_id = user.id
        branch_id = branch.id
        branch.created_by_user_id = user_id
        branch.updated_by_user_id = user_id
        department = Department(
            tenant_id=tenant.id,
            branch_id=branch_id,
            name="Cardiology",
            code="CARD",
            created_by_user_id=user_id,
            updated_by_user_id=user_id,
        )
        session.add(branch)
        session.add(department)
        session.commit()

        branch_options = BranchRepository(session).filter_options(tenant_id=tenant.id)
        department_options = DepartmentRepository(session).filter_options(
            tenant_id=tenant.id
        )

    assert {"value": user_id, "label": "Settings Admin"} in [
        row.model_dump() for row in branch_options["created_by_user_id"]
    ]
    assert {"value": user_id, "label": "Settings Admin"} in [
        row.model_dump() for row in department_options["updated_by_user_id"]
    ]
    assert {"value": branch_id, "label": "Main Branch"} in [
        row.model_dump() for row in department_options["branch_id"]
    ]
