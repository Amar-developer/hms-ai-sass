from sqlmodel import Session

from app.modules.consultations.models import Consultation, ConsultationAddendum
from app.modules.consultations.schemas import (
    ConsultationAddendumCreate,
    ConsultationCreate,
    ConsultationDetailRead,
    ConsultationSignRequest,
    ConsultationTemplateCreate,
    ConsultationTemplateRead,
    ConsultationUpdate,
)
from app.modules.consultations.services.record_service import ConsultationRecordService
from app.modules.consultations.services.template_service import (  # noqa: F401
    ClinicalTemplateService,
    template_read,
)
from app.modules.identity.models import User


class ConsultationService:
    """Facade over consultation record and clinical template services."""

    def __init__(self, session: Session):
        self.session = session
        self.record_service = ConsultationRecordService(session)
        self.template_service = ClinicalTemplateService(session)

    def create_consultation(
        self, *, tenant_id: str, payload: ConsultationCreate, actor: User
    ) -> Consultation:
        return self.record_service.create_consultation(
            tenant_id=tenant_id, payload=payload, actor=actor
        )

    def list_consultations(
        self,
        *,
        tenant_id: str,
        patient_id: str | None,
        appointment_id: str | None,
        branch_id: str | None,
        actor: User,
    ) -> list[Consultation]:
        return self.record_service.list_consultations(
            tenant_id=tenant_id,
            patient_id=patient_id,
            appointment_id=appointment_id,
            branch_id=branch_id,
            actor=actor,
        )

    def get_consultation(
        self, *, tenant_id: str, consultation_id: str, actor: User
    ) -> ConsultationDetailRead:
        return self.record_service.get_consultation(
            tenant_id=tenant_id, consultation_id=consultation_id, actor=actor
        )

    def update_consultation(
        self,
        *,
        tenant_id: str,
        consultation_id: str,
        payload: ConsultationUpdate,
        actor: User,
    ) -> Consultation:
        return self.record_service.update_consultation(
            tenant_id=tenant_id,
            consultation_id=consultation_id,
            payload=payload,
            actor=actor,
        )

    def sign_consultation(
        self,
        *,
        tenant_id: str,
        consultation_id: str,
        payload: ConsultationSignRequest,
        actor: User,
    ) -> Consultation:
        return self.record_service.sign_consultation(
            tenant_id=tenant_id,
            consultation_id=consultation_id,
            payload=payload,
            actor=actor,
        )

    def create_addendum(
        self,
        *,
        tenant_id: str,
        consultation_id: str,
        payload: ConsultationAddendumCreate,
        actor: User,
    ) -> ConsultationAddendum:
        return self.record_service.create_addendum(
            tenant_id=tenant_id,
            consultation_id=consultation_id,
            payload=payload,
            actor=actor,
        )

    def create_clinical_template(
        self, *, tenant_id: str, payload: ConsultationTemplateCreate, actor: User
    ) -> ConsultationTemplateRead:
        return self.template_service.create_clinical_template(
            tenant_id=tenant_id, payload=payload, actor=actor
        )

    def list_clinical_templates(
        self, *, tenant_id: str, department_id: str | None
    ) -> list[ConsultationTemplateRead]:
        return self.template_service.list_clinical_templates(
            tenant_id=tenant_id, department_id=department_id
        )

    def list_department_clinical_templates(
        self, *, tenant_id: str, department_id: str
    ) -> list[ConsultationTemplateRead]:
        return self.template_service.list_department_clinical_templates(
            tenant_id=tenant_id, department_id=department_id
        )
