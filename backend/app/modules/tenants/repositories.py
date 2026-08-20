from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.core.list_filters import (
    ListFilter,
    ListFilterOption,
    ListSort,
    apply_list_filters,
    apply_list_sort,
    labeled_filter_options,
    tenant_user_filter_options,
)
from app.core.pagination import DEFAULT_LIST_LIMIT
from app.modules.identity.models import User
from app.modules.tenants.listing import BRANCH_LIST_SPEC, DEPARTMENT_LIST_SPEC
from app.modules.tenants.models import Branch, Department, Tenant


class TenantRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, tenant: Tenant) -> Tenant:
        self.session.add(tenant)
        return tenant

    def get(self, tenant_id: str | None) -> Tenant | None:
        if not tenant_id:
            return None
        return self.session.get(Tenant, tenant_id)

    def get_primary(self) -> Tenant | None:
        return self.session.exec(
            select(Tenant).where(Tenant.is_primary == True)  # noqa: E712
        ).first()

    def list_all(self) -> list[Tenant]:
        return list(self.session.exec(select(Tenant)).all())

    def list_ordered(self) -> list[Tenant]:
        return list(
            self.session.exec(
                select(Tenant).order_by(
                    Tenant.updated_at.desc(), Tenant.created_at.desc()
                )
            ).all()
        )


class BranchRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, branch: Branch) -> Branch:
        self.session.add(branch)
        return branch

    def get(self, branch_id: str | None) -> Branch | None:
        if not branch_id:
            return None
        return self.session.get(Branch, branch_id)

    def get_for_tenant(self, tenant_id: str, branch_id: str) -> Branch | None:
        branch = self.get(branch_id)
        if not branch or branch.tenant_id != tenant_id:
            return None
        return branch

    def get_by_code_for_tenant(self, tenant_id: str, code: str) -> Branch | None:
        return self.session.exec(
            select(Branch).where(Branch.tenant_id == tenant_id, Branch.code == code)
        ).first()

    def list_for_tenant(self, tenant_id: str) -> list[Branch]:
        return list(
            self.session.exec(
                select(Branch)
                .where(Branch.tenant_id == tenant_id)
                .order_by(Branch.created_at.desc(), Branch.name.asc())
            ).all()
        )

    def list_page(
        self,
        *,
        tenant_id: str,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
        list_sort: ListSort | None = None,
        limit: int = DEFAULT_LIST_LIMIT,
        offset: int = 0,
    ) -> list[Branch]:
        statement = self._list_statement(
            tenant_id=tenant_id,
            q=q,
            list_filters=list_filters,
        )
        statement = apply_list_sort(
            statement,
            BRANCH_LIST_SPEC,
            list_sort,
            default_order=[Branch.updated_at.desc(), Branch.created_at.desc()],
        )
        return list(self.session.exec(statement.offset(offset).limit(limit)).all())

    def count_page(
        self,
        *,
        tenant_id: str,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
    ) -> int:
        filtered = self._list_statement(
            tenant_id=tenant_id,
            q=q,
            list_filters=list_filters,
        ).subquery()
        return int(self.session.exec(select(func.count()).select_from(filtered)).one())

    def filter_options(self, *, tenant_id: str) -> dict[str, list[ListFilterOption]]:
        return {
            "is_active": [
                ListFilterOption(value="true", label="Active"),
                ListFilterOption(value="false", label="Inactive"),
            ],
            "is_global_template": [
                ListFilterOption(value="true", label="Yes"),
                ListFilterOption(value="false", label="No"),
            ],
            "is_template_locked": [
                ListFilterOption(value="true", label="Yes"),
                ListFilterOption(value="false", label="No"),
            ],
            "created_by_user_id": tenant_user_filter_options(
                self.session,
                User,
                tenant_id=tenant_id,
            ),
            "updated_by_user_id": tenant_user_filter_options(
                self.session,
                User,
                tenant_id=tenant_id,
            ),
        }

    def _list_statement(
        self,
        *,
        tenant_id: str,
        q: str | None,
        list_filters: list[ListFilter] | None,
    ):
        statement = select(Branch).where(Branch.tenant_id == tenant_id)
        if q:
            term = q.strip().lower()
            statement = statement.where(
                or_(
                    func.lower(Branch.name).contains(term, autoescape=True),
                    func.lower(Branch.code).contains(term, autoescape=True),
                    func.lower(Branch.area).contains(term, autoescape=True),
                    func.lower(Branch.address).contains(term, autoescape=True),
                    func.lower(Branch.city).contains(term, autoescape=True),
                    func.lower(Branch.state).contains(term, autoescape=True),
                )
            )
        if list_filters:
            statement = apply_list_filters(statement, BRANCH_LIST_SPEC, list_filters)
        return statement

    def active_count_for_tenant(self, tenant_id: str) -> int:
        return len(
            self.session.exec(
                select(Branch.id).where(
                    Branch.tenant_id == tenant_id,
                    Branch.is_active == True,  # noqa: E712
                )
            ).all()
        )


class DepartmentRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, department: Department) -> Department:
        self.session.add(department)
        return department

    def get(self, department_id: str | None) -> Department | None:
        if not department_id:
            return None
        return self.session.get(Department, department_id)

    def get_for_tenant(self, tenant_id: str, department_id: str) -> Department | None:
        department = self.get(department_id)
        if not department or department.tenant_id != tenant_id:
            return None
        return department

    def get_by_code_for_tenant(self, tenant_id: str, code: str) -> Department | None:
        return self.session.exec(
            select(Department).where(
                Department.tenant_id == tenant_id,
                Department.code == code,
            )
        ).first()

    def list_for_tenant(self, tenant_id: str) -> list[Department]:
        return list(
            self.session.exec(
                select(Department)
                .where(Department.tenant_id == tenant_id)
                .order_by(Department.created_at)
            ).all()
        )

    def list_page(
        self,
        *,
        tenant_id: str,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
        list_sort: ListSort | None = None,
        limit: int = DEFAULT_LIST_LIMIT,
        offset: int = 0,
    ) -> list[Department]:
        statement = self._list_statement(
            tenant_id=tenant_id,
            q=q,
            list_filters=list_filters,
        )
        statement = apply_list_sort(
            statement,
            DEPARTMENT_LIST_SPEC,
            list_sort,
            default_order=[Department.updated_at.desc(), Department.created_at.desc()],
        )
        return list(self.session.exec(statement.offset(offset).limit(limit)).all())

    def count_page(
        self,
        *,
        tenant_id: str,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
    ) -> int:
        filtered = self._list_statement(
            tenant_id=tenant_id,
            q=q,
            list_filters=list_filters,
        ).subquery()
        return int(self.session.exec(select(func.count()).select_from(filtered)).one())

    def filter_options(self, *, tenant_id: str) -> dict[str, list[ListFilterOption]]:
        branches = (
            select(Department.branch_id, Branch.name)
            .join(Branch, Branch.id == Department.branch_id)
            .where(Department.tenant_id == tenant_id)
            .distinct()
            .order_by(Branch.name)
            .limit(100)
        )
        return {
            "branch_id": labeled_filter_options(
                list(self.session.exec(branches).all())
            ),
            "is_active": [
                ListFilterOption(value="true", label="Active"),
                ListFilterOption(value="false", label="Inactive"),
            ],
            "is_global_template": [
                ListFilterOption(value="true", label="Yes"),
                ListFilterOption(value="false", label="No"),
            ],
            "is_template_locked": [
                ListFilterOption(value="true", label="Yes"),
                ListFilterOption(value="false", label="No"),
            ],
            "created_by_user_id": tenant_user_filter_options(
                self.session,
                User,
                tenant_id=tenant_id,
            ),
            "updated_by_user_id": tenant_user_filter_options(
                self.session,
                User,
                tenant_id=tenant_id,
            ),
        }

    def _list_statement(
        self,
        *,
        tenant_id: str,
        q: str | None,
        list_filters: list[ListFilter] | None,
    ):
        statement = select(Department).where(Department.tenant_id == tenant_id)
        if q:
            term = q.strip().lower()
            statement = statement.where(
                or_(
                    func.lower(Department.name).contains(term, autoescape=True),
                    func.lower(Department.code).contains(term, autoescape=True),
                    func.lower(Department.description).contains(term, autoescape=True),
                )
            )
        if list_filters:
            statement = apply_list_filters(
                statement,
                DEPARTMENT_LIST_SPEC,
                list_filters,
            )
        return statement

    def list_active_for_tenant_except(
        self, tenant_id: str, department_id: str
    ) -> list[Department]:
        return list(
            self.session.exec(
                select(Department).where(
                    Department.tenant_id == tenant_id,
                    Department.id != department_id,
                    Department.is_active.is_(True),
                )
            ).all()
        )
