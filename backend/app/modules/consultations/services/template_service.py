import json

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import enforce_entitlement
from app.modules.audit.service import record_audit_event
from app.modules.consultations.models import ClinicalTemplate
from app.modules.consultations.repositories import ClinicalTemplateRepository
from app.modules.consultations.schemas import (
    ConsultationTemplateCreate,
    ConsultationTemplateRead,
    ConsultationTemplateUpdate,
)
from app.modules.identity.models import User
from app.modules.tenants.models import now_utc


def template_read(template: ClinicalTemplate) -> ConsultationTemplateRead:
    try:
        content = json.loads(template.content_json or "{}")
    except json.JSONDecodeError:
        content = {}
    content = normalize_template_content(content)
    return ConsultationTemplateRead(
        id=template.id,
        tenant_id=template.tenant_id,
        department_id=template.department_id,
        name=template.name,
        template_type=template.template_type,
        content=content,
        is_active=template.is_active,
        created_by_user_id=template.created_by_user_id,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def normalize_template_content(content: dict | None) -> dict:
    normalized = dict(content or {})
    normalized.pop("doctor_id", None)
    return normalized


class ClinicalTemplateService:
    """Manages reusable clinical note templates, independent of any single
    consultation."""

    def __init__(self, session: Session):
        self.session = session
        self.templates = ClinicalTemplateRepository(session)

    def create_clinical_template(
        self, *, tenant_id: str, payload: ConsultationTemplateCreate, actor: User
    ) -> ConsultationTemplateRead:
        enforce_entitlement(self.session, tenant_id, "consultations")
        template = ClinicalTemplate(
            tenant_id=tenant_id,
            department_id=payload.department_id,
            name=payload.name,
            template_type=payload.template_type,
            content_json=json.dumps(normalize_template_content(payload.content)),
            created_by_user_id=actor.id,
        )
        self.templates.add(template)
        self.session.commit()
        self.session.refresh(template)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            actor_user_id=template.created_by_user_id,
            action="consultation.template.created",
            resource_type="clinical_template",
            resource_id=template.id,
            purpose="clinical_template_management",
        )
        return template_read(template)

    def list_clinical_templates(
        self, *, tenant_id: str, department_id: str | None
    ) -> list[ConsultationTemplateRead]:
        enforce_entitlement(self.session, tenant_id, "consultations")
        rows = self.templates.list_active(
            tenant_id=tenant_id, department_id=department_id
        )
        return [template_read(row) for row in rows]

    def update_clinical_template(
        self,
        *,
        tenant_id: str,
        template_id: str,
        payload: ConsultationTemplateUpdate,
        actor: User,
    ) -> ConsultationTemplateRead:
        enforce_entitlement(self.session, tenant_id, "consultations")
        template = self.templates.get_for_tenant(
            tenant_id=tenant_id, template_id=template_id
        )
        if not template or not template.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Clinical template not found",
            )
        data = payload.model_dump(exclude_unset=True)
        if "content" in data:
            template.content_json = json.dumps(
                normalize_template_content(data.pop("content"))
            )
        for key, value in data.items():
            setattr(template, key, value)
        template.updated_at = now_utc()
        self.session.add(template)
        self.session.commit()
        self.session.refresh(template)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            actor_user_id=actor.id,
            action="consultation.template.updated",
            resource_type="clinical_template",
            resource_id=template.id,
            purpose="clinical_template_management",
        )
        return template_read(template)

    def delete_clinical_template(
        self, *, tenant_id: str, template_id: str, actor: User
    ) -> ConsultationTemplateRead:
        enforce_entitlement(self.session, tenant_id, "consultations")
        template = self.templates.get_for_tenant(
            tenant_id=tenant_id, template_id=template_id
        )
        if not template or not template.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Clinical template not found",
            )
        template.is_active = False
        template.updated_at = now_utc()
        self.session.add(template)
        self.session.commit()
        self.session.refresh(template)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            actor_user_id=actor.id,
            action="consultation.template.deleted",
            resource_type="clinical_template",
            resource_id=template.id,
            purpose="clinical_template_management",
        )
        return template_read(template)

    def list_department_clinical_templates(
        self, *, tenant_id: str, department_id: str
    ) -> list[ConsultationTemplateRead]:
        enforce_entitlement(self.session, tenant_id, "consultations")
        rows = self.templates.list_active_for_department(
            tenant_id=tenant_id, department_id=department_id
        )
        return [template_read(row) for row in rows]
