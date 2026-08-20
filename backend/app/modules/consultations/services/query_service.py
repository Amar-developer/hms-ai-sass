from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import (
    current_doctor_practitioner_id,
    enforce_entitlement,
    require_doctor_practitioner_access,
    require_user_branch_access,
    scoped_branch_id,
)
from app.core.list_filters import ListFilter, ListFilterOption, ListSort
from app.core.pagination import Page
from app.modules.audit.service import record_audit_event
from app.modules.consultations.models import Consultation
from app.modules.consultations.repositories import ConsultationRepository
from app.modules.consultations.schemas import ConsultationDetailRead, ConsultationRead
from app.modules.consultations.services.detail_builder import ConsultationDetailBuilder
from app.modules.identity.models import User


class ConsultationQueryService:
    """Handles consultation list/detail read workflows."""

    def __init__(self, session: Session):
        self.session = session
        self.consultations = ConsultationRepository(session)
        self.detail_builder = ConsultationDetailBuilder(session)

    def _get_or_404(self, tenant_id: str, consultation_id: str) -> Consultation:
        consultation = self.consultations.get_for_tenant(tenant_id, consultation_id)
        if not consultation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found"
            )
        return consultation

    def list_consultations(
        self,
        *,
        tenant_id: str,
        patient_id: str | None,
        appointment_id: str | None,
        branch_id: str | None,
        actor: User,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
        list_sort: ListSort | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[Consultation]:
        enforce_entitlement(self.session, tenant_id, "consultations")
        branch_id = scoped_branch_id(actor, branch_id)
        doctor_practitioner_id = current_doctor_practitioner_id(
            self.session, tenant_id, actor
        )
        return self.consultations.list_for_tenant(
            tenant_id=tenant_id,
            branch_id=branch_id,
            practitioner_id=doctor_practitioner_id,
            patient_id=patient_id,
            appointment_id=appointment_id,
            q=q,
            list_filters=list_filters,
            list_sort=list_sort,
            limit=limit,
            offset=offset,
        )

    def list_consultation_page(
        self,
        *,
        tenant_id: str,
        patient_id: str | None,
        appointment_id: str | None,
        branch_id: str | None,
        q: str | None,
        list_filters: list[ListFilter],
        list_sort: ListSort | None,
        limit: int,
        offset: int,
        actor: User,
    ) -> Page[ConsultationRead]:
        rows = self.list_consultations(
            tenant_id=tenant_id,
            patient_id=patient_id,
            appointment_id=appointment_id,
            branch_id=branch_id,
            actor=actor,
            q=q,
            list_filters=list_filters,
            list_sort=list_sort,
            limit=limit,
            offset=offset,
        )
        branch_id = scoped_branch_id(actor, branch_id)
        doctor_practitioner_id = current_doctor_practitioner_id(
            self.session, tenant_id, actor
        )
        total = self.consultations.count_for_tenant(
            tenant_id=tenant_id,
            branch_id=branch_id,
            practitioner_id=doctor_practitioner_id,
            patient_id=patient_id,
            appointment_id=appointment_id,
            q=q,
            list_filters=list_filters,
        )
        return Page(
            items=[
                ConsultationRead.model_validate(row, from_attributes=True)
                for row in rows
            ],
            total=total,
            limit=limit,
            offset=offset,
        )

    def list_consultation_filter_options(
        self, *, tenant_id: str
    ) -> dict[str, list[ListFilterOption]]:
        enforce_entitlement(self.session, tenant_id, "consultations")
        return self.consultations.filter_options(tenant_id=tenant_id)

    def get_consultation(
        self, *, tenant_id: str, consultation_id: str, actor: User
    ) -> ConsultationDetailRead:
        enforce_entitlement(self.session, tenant_id, "consultations")
        consultation = self._get_or_404(tenant_id, consultation_id)
        require_user_branch_access(actor, consultation.branch_id)
        require_doctor_practitioner_access(
            self.session, tenant_id, actor, consultation.practitioner_id
        )
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=consultation.branch_id,
            action="consultation.viewed",
            resource_type="consultation",
            resource_id=consultation.id,
            purpose="treatment",
        )
        return self.detail_builder.build(consultation)
