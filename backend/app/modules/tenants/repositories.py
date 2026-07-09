from sqlmodel import Session, select

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
