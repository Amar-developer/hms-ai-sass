from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import (
    require_branch_in_tenant,
    require_user_branch_access,
    scoped_branch_id,
)
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.identity.models import User
from app.modules.item_catalog_validation import validate_unique_item_name
from app.modules.physiotherapy.models import PhysiotherapyEquipment
from app.modules.physiotherapy.repositories import PhysiotherapyEquipmentRepository
from app.modules.physiotherapy.schemas import (
    PhysiotherapyEquipmentCreate,
    PhysiotherapyEquipmentUpdate,
)
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


class PhysiotherapyEquipmentService:
    def __init__(self, session: Session):
        self.session = session
        self.equipment = PhysiotherapyEquipmentRepository(session)

    def list_equipment(
        self, *, tenant_id: str, branch_id: str | None, actor: User
    ) -> list[PhysiotherapyEquipment]:
        enforce_module_enabled(self.session, tenant_id, "physiotherapy")
        branch_scope = scoped_branch_id(actor, branch_id)
        return self.equipment.list_active(tenant_id=tenant_id, branch_id=branch_scope)

    def create_equipment(
        self, *, tenant_id: str, payload: PhysiotherapyEquipmentCreate, actor: User
    ) -> PhysiotherapyEquipment:
        enforce_module_enabled(self.session, tenant_id, "physiotherapy")
        require_branch_in_tenant(self.session, tenant_id, payload.branch_id)
        require_user_branch_access(actor, payload.branch_id)
        data = payload.model_dump()
        data["name"] = validate_unique_item_name(
            self.session, tenant_id=tenant_id, name=payload.name
        )
        equipment = PhysiotherapyEquipment.model_validate(
            data,
            update={
                "tenant_id": tenant_id,
                "created_by_user_id": actor.id,
                "updated_by_user_id": actor.id,
            },
        )
        self.equipment.add(equipment)
        self.session.commit()
        self.session.refresh(equipment)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=equipment.branch_id,
            actor_user_id=actor.id,
            action="physiotherapy_equipment.created",
            resource_type="physiotherapy_equipment",
            resource_id=equipment.id,
            purpose="physiotherapy",
        )
        return equipment

    def update_equipment(
        self,
        *,
        tenant_id: str,
        equipment_id: str,
        payload: PhysiotherapyEquipmentUpdate,
        actor: User,
    ) -> PhysiotherapyEquipment:
        enforce_module_enabled(self.session, tenant_id, "physiotherapy")
        equipment = self.equipment.get_for_tenant(tenant_id, equipment_id)
        if not equipment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Physiotherapy equipment not found",
            )
        require_user_branch_access(actor, equipment.branch_id)
        data = payload.model_dump(exclude_unset=True)
        if data.get("name"):
            data["name"] = validate_unique_item_name(
                self.session,
                tenant_id=tenant_id,
                name=data["name"],
                exclude_model=PhysiotherapyEquipment,
                exclude_id=equipment.id,
            )
        next_branch_id = data.get("branch_id", equipment.branch_id)
        require_branch_in_tenant(self.session, tenant_id, next_branch_id)
        require_user_branch_access(actor, next_branch_id)
        before = {key: getattr(equipment, key) for key in data}
        for key, value in data.items():
            setattr(equipment, key, value)
        equipment.updated_at = now_utc()
        equipment.updated_by_user_id = actor.id
        self.equipment.add(equipment)
        self.session.commit()
        self.session.refresh(equipment)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=equipment.branch_id,
            actor_user_id=actor.id,
            action="physiotherapy_equipment.updated",
            resource_type="physiotherapy_equipment",
            resource_id=equipment.id,
            purpose="physiotherapy",
            changes=diff_changes(before, data),
        )
        return equipment

    def delete_equipment(
        self, *, tenant_id: str, equipment_id: str, actor: User
    ) -> PhysiotherapyEquipment:
        enforce_module_enabled(self.session, tenant_id, "physiotherapy")
        equipment = self.equipment.get_for_tenant(tenant_id, equipment_id)
        if not equipment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Physiotherapy equipment not found",
            )
        require_user_branch_access(actor, equipment.branch_id)
        equipment.is_active = False
        equipment.updated_at = now_utc()
        equipment.updated_by_user_id = actor.id
        self.equipment.add(equipment)
        self.session.commit()
        self.session.refresh(equipment)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=equipment.branch_id,
            actor_user_id=actor.id,
            action="physiotherapy_equipment.deleted",
            resource_type="physiotherapy_equipment",
            resource_id=equipment.id,
            purpose="physiotherapy",
        )
        return equipment
