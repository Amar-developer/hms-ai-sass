from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access, scoped_branch_id
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.home_care.models import HomeCareService
from app.modules.home_care.repositories import HomeCareServiceRepository
from app.modules.home_care.schemas import (
    HomeCareServiceCreate,
    HomeCareServiceRead,
    HomeCareServiceUpdate,
)
from app.modules.identity.models import User
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


def _service_code(name: str) -> str:
    compact = "".join(ch for ch in name.upper() if ch.isalnum())[:6] or "ITEM"
    return f"HC-{compact}-{now_utc().strftime('%H%M%S')}"


class HomeCareCatalogService:
    """Manages the tenant's catalog of billable home care service types."""

    def __init__(self, session: Session):
        self.session = session
        self.services = HomeCareServiceRepository(session)

    def list_services(
        self, *, tenant_id: str, branch_id: str | None, actor: User
    ) -> list[HomeCareService]:
        enforce_module_enabled(self.session, tenant_id, "home_care")
        scoped_branch_id(actor, branch_id)
        return self.services.list_active(tenant_id)

    def create_service(
        self, *, tenant_id: str, payload: HomeCareServiceCreate, actor: User
    ) -> HomeCareServiceRead:
        enforce_module_enabled(self.session, tenant_id, "home_care")
        data = payload.model_dump()
        data["branch_id"] = None
        service = HomeCareService.model_validate(
            data,
            update={
                "tenant_id": tenant_id,
                "code": payload.code or _service_code(payload.name),
                "created_by_user_id": actor.id,
                "updated_by_user_id": actor.id,
            },
        )
        self.services.add(service)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=service.branch_id,
            actor_user_id=actor.id,
            action="home_care_service.created",
            resource_type="home_care_service",
            resource_id=service.id,
            purpose="home_care",
            commit=False,
        )
        self.session.commit()
        self.session.refresh(service)
        return HomeCareServiceRead.model_validate(service, from_attributes=True)

    def update_service(
        self,
        *,
        tenant_id: str,
        service_id: str,
        payload: HomeCareServiceUpdate,
        actor: User,
    ) -> HomeCareServiceRead:
        enforce_module_enabled(self.session, tenant_id, "home_care")
        service = self.services.get_for_tenant(tenant_id, service_id)
        if not service:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Home care service not found",
            )
        data = payload.model_dump(exclude_unset=True)
        if "branch_id" in data:
            data["branch_id"] = None
        before = {key: getattr(service, key) for key in data}
        for key, value in data.items():
            if key == "code" and not value:
                continue
            setattr(service, key, value)
        service.updated_by_user_id = actor.id
        service.updated_at = now_utc()
        self.services.add(service)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=service.branch_id,
            actor_user_id=actor.id,
            action="home_care_service.updated",
            resource_type="home_care_service",
            resource_id=service.id,
            purpose="home_care",
            commit=False,
            changes=diff_changes(before, {key: getattr(service, key) for key in data}),
        )
        self.session.commit()
        self.session.refresh(service)
        return HomeCareServiceRead.model_validate(service, from_attributes=True)

    def delete_service(
        self, *, tenant_id: str, service_id: str, actor: User
    ) -> HomeCareServiceRead:
        enforce_module_enabled(self.session, tenant_id, "home_care")
        service = self.services.get_for_tenant(tenant_id, service_id)
        if not service:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Home care service not found",
            )
        require_user_branch_access(actor, service.branch_id)
        service.is_active = False
        service.updated_by_user_id = actor.id
        service.updated_at = now_utc()
        self.services.add(service)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=service.branch_id,
            actor_user_id=actor.id,
            action="home_care_service.deleted",
            resource_type="home_care_service",
            resource_id=service.id,
            purpose="home_care",
            commit=False,
        )
        self.session.commit()
        self.session.refresh(service)
        return HomeCareServiceRead.model_validate(service, from_attributes=True)
