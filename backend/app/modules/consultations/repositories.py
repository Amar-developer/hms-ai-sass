from typing import Any

from sqlalchemy import func, or_
from sqlmodel import Session, SQLModel, select

from app.modules.appointments.models import Appointment
from app.core.list_filters import (
    ListFilter,
    ListFilterOption,
    ListSort,
    apply_list_filters,
    apply_list_sort,
    labeled_filter_options,
    list_filter_options,
    tenant_user_filter_options,
)
from app.modules.consultations.listing import CONSULTATION_LIST_SPEC
from app.modules.consultations.models import (
    ClinicalTemplate,
    Consultation,
    ConsultationAddendum,
    ConsultationComplaint,
    ConsultationDiagnosis,
    ConsultationMedicine,
    ConsultationReferral,
    ConsultationStatus,
    ConsultationVital,
)
from app.modules.identity.models import User
from app.modules.lab.models import LabOrder
from app.modules.patients.models import Patient
from app.modules.practitioners.models import Practitioner
from app.modules.queue.models import QueueEntry
from app.modules.tenants.models import Branch


StructuredConsultationRow = (
    ConsultationVital
    | ConsultationComplaint
    | ConsultationDiagnosis
    | ConsultationMedicine
    | ConsultationReferral
)


class ConsultationRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, consultation: Consultation) -> Consultation:
        self.session.add(consultation)
        return consultation

    def add_addendum(self, addendum: ConsultationAddendum) -> ConsultationAddendum:
        self.session.add(addendum)
        return addendum

    def get_for_tenant(
        self, tenant_id: str, consultation_id: str
    ) -> Consultation | None:
        consultation = self.session.get(Consultation, consultation_id)
        if not consultation or consultation.tenant_id != tenant_id:
            return None
        return consultation

    def list_for_tenant(
        self,
        *,
        tenant_id: str,
        patient_id: str | None = None,
        appointment_id: str | None = None,
        branch_id: str | None = None,
        practitioner_id: str | None = None,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
        list_sort: ListSort | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[Consultation]:
        statement = self._list_statement(
            tenant_id=tenant_id,
            patient_id=patient_id,
            appointment_id=appointment_id,
            branch_id=branch_id,
            practitioner_id=practitioner_id,
            q=q,
            list_filters=list_filters,
        )
        statement = apply_list_sort(
            statement,
            CONSULTATION_LIST_SPEC,
            list_sort,
            default_order=[Consultation.created_at.desc()],
        )
        if offset:
            statement = statement.offset(offset)
        if limit is not None:
            statement = statement.limit(limit)
        return list(self.session.exec(statement).all())

    def count_for_tenant(
        self,
        *,
        tenant_id: str,
        patient_id: str | None = None,
        appointment_id: str | None = None,
        branch_id: str | None = None,
        practitioner_id: str | None = None,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
    ) -> int:
        filtered = self._list_statement(
            tenant_id=tenant_id,
            patient_id=patient_id,
            appointment_id=appointment_id,
            branch_id=branch_id,
            practitioner_id=practitioner_id,
            q=q,
            list_filters=list_filters,
        ).subquery()
        return int(self.session.exec(select(func.count()).select_from(filtered)).one())

    def list_diagnoses_for_patient(
        self, *, tenant_id: str, patient_id: str
    ) -> list[tuple[ConsultationDiagnosis, Consultation]]:
        statement = (
            select(ConsultationDiagnosis, Consultation)
            .join(
                Consultation,
                Consultation.id == ConsultationDiagnosis.consultation_id,
            )
            .where(
                ConsultationDiagnosis.tenant_id == tenant_id,
                Consultation.patient_id == patient_id,
            )
            .order_by(Consultation.created_at.desc())
        )
        return list(self.session.exec(statement).all())

    def filter_options(self, *, tenant_id: str) -> dict[str, list[ListFilterOption]]:
        branches = (
            select(Branch.id, Branch.name)
            .where(Branch.tenant_id == tenant_id)
            .order_by(Branch.name)
        )
        practitioners = (
            select(Practitioner.id, Practitioner.full_name)
            .where(Practitioner.tenant_id == tenant_id)
            .order_by(Practitioner.full_name)
        )
        treatment_types = (
            select(Consultation.treatment_type)
            .where(Consultation.tenant_id == tenant_id)
            .distinct()
            .order_by(Consultation.treatment_type)
        )
        return {
            "branch_id": labeled_filter_options(
                list(self.session.exec(branches).all())
            ),
            "practitioner_id": labeled_filter_options(
                list(self.session.exec(practitioners).all())
            ),
            "status": list_filter_options(list(ConsultationStatus)),
            "treatment_type": list_filter_options(
                list(self.session.exec(treatment_types).all())
            ),
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
            "signed_by_user_id": tenant_user_filter_options(
                self.session,
                User,
                tenant_id=tenant_id,
            ),
        }

    def _list_statement(
        self,
        *,
        tenant_id: str,
        patient_id: str | None,
        appointment_id: str | None,
        branch_id: str | None,
        practitioner_id: str | None,
        q: str | None,
        list_filters: list[ListFilter] | None,
    ):
        statement = (
            select(Consultation)
            .join(Appointment, Appointment.id == Consultation.appointment_id)
            .join(Patient, Patient.id == Consultation.patient_id)
            .join(Branch, Branch.id == Consultation.branch_id)
            .outerjoin(Practitioner, Practitioner.id == Consultation.practitioner_id)
            .where(Consultation.tenant_id == tenant_id)
        )
        if branch_id:
            statement = statement.where(Consultation.branch_id == branch_id)
        if practitioner_id:
            statement = statement.where(Consultation.practitioner_id == practitioner_id)
        if patient_id:
            statement = statement.where(Consultation.patient_id == patient_id)
        if appointment_id:
            statement = statement.where(Consultation.appointment_id == appointment_id)
        if q:
            pattern = f"%{q.strip().lower()}%"
            statement = statement.where(
                or_(
                    func.lower(Appointment.appointment_number).like(pattern),
                    func.lower(Patient.patient_number).like(pattern),
                    func.lower(Patient.full_name).like(pattern),
                    func.lower(Patient.mobile).like(pattern),
                    func.lower(Practitioner.full_name).like(pattern),
                    func.lower(Consultation.chief_complaint).like(pattern),
                    func.lower(Consultation.diagnosis).like(pattern),
                    func.lower(Consultation.clinical_notes).like(pattern),
                    func.lower(Consultation.prescription_text).like(pattern),
                    func.lower(Consultation.lab_referral_text).like(pattern),
                )
            )
        if list_filters:
            statement = apply_list_filters(
                statement,
                CONSULTATION_LIST_SPEC,
                list_filters,
            )
        return statement


class ConsultationReferenceRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_appointment_for_tenant(
        self, tenant_id: str, appointment_id: str
    ) -> Appointment | None:
        appointment = self.session.get(Appointment, appointment_id)
        if not appointment or appointment.tenant_id != tenant_id:
            return None
        return appointment

    def add_appointment(self, appointment: Appointment) -> Appointment:
        self.session.add(appointment)
        return appointment

    def get_patient_for_tenant(self, tenant_id: str, patient_id: str) -> Patient | None:
        patient = self.session.get(Patient, patient_id)
        if not patient or patient.tenant_id != tenant_id:
            return None
        return patient

    def get_queue_entry_for_appointment(
        self, tenant_id: str, appointment_id: str
    ) -> QueueEntry | None:
        return self.session.exec(
            select(QueueEntry).where(
                QueueEntry.tenant_id == tenant_id,
                QueueEntry.appointment_id == appointment_id,
            )
        ).first()

    def add_queue_entry(self, queue_entry: QueueEntry) -> QueueEntry:
        self.session.add(queue_entry)
        return queue_entry


class ConsultationDetailRepository:
    def __init__(self, session: Session):
        self.session = session

    def list_addendums(self, consultation: Consultation) -> list[ConsultationAddendum]:
        return list(
            self.session.exec(
                select(ConsultationAddendum)
                .where(
                    ConsultationAddendum.tenant_id == consultation.tenant_id,
                    ConsultationAddendum.consultation_id == consultation.id,
                )
                .order_by(ConsultationAddendum.created_at)
            ).all()
        )

    def list_vitals(self, consultation_id: str) -> list[ConsultationVital]:
        return self._list_structured_rows(ConsultationVital, consultation_id)

    def list_complaints(self, consultation_id: str) -> list[ConsultationComplaint]:
        return self._list_structured_rows(ConsultationComplaint, consultation_id)

    def list_diagnoses(self, consultation_id: str) -> list[ConsultationDiagnosis]:
        return self._list_structured_rows(ConsultationDiagnosis, consultation_id)

    def list_medicines(self, consultation_id: str) -> list[ConsultationMedicine]:
        return self._list_structured_rows(ConsultationMedicine, consultation_id)

    def list_referrals(self, consultation_id: str) -> list[ConsultationReferral]:
        return self._list_structured_rows(ConsultationReferral, consultation_id)

    def list_lab_orders(self, consultation: Consultation) -> list[LabOrder]:
        return list(
            self.session.exec(
                select(LabOrder)
                .where(
                    LabOrder.tenant_id == consultation.tenant_id,
                    LabOrder.consultation_id == consultation.id,
                )
                .order_by(LabOrder.created_at.desc())
            ).all()
        )

    def _list_structured_rows(
        self, model: type[StructuredConsultationRow], consultation_id: str
    ) -> list[StructuredConsultationRow]:
        return list(
            self.session.exec(
                select(model)
                .where(model.consultation_id == consultation_id)
                .order_by(model.created_at)
            ).all()
        )


class ConsultationStructuredRowRepository:
    def __init__(self, session: Session):
        self.session = session

    def replace_rows(
        self,
        *,
        consultation: Consultation,
        model: type[SQLModel],
        rows: list[Any],
    ) -> None:
        existing = list(
            self.session.exec(
                select(model).where(model.consultation_id == consultation.id)
            ).all()
        )
        for row in existing:
            self.session.delete(row)
        for row in rows:
            self.session.add(
                model(
                    tenant_id=consultation.tenant_id,
                    consultation_id=consultation.id,
                    **row.model_dump(),
                )
            )


class ClinicalTemplateRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, template: ClinicalTemplate) -> ClinicalTemplate:
        self.session.add(template)
        return template

    def get_for_tenant(
        self, *, tenant_id: str, template_id: str
    ) -> ClinicalTemplate | None:
        template = self.session.get(ClinicalTemplate, template_id)
        if not template or template.tenant_id != tenant_id:
            return None
        return template

    def list_active_for_department(
        self, *, tenant_id: str, department_id: str
    ) -> list[ClinicalTemplate]:
        return list(
            self.session.exec(
                select(ClinicalTemplate)
                .where(
                    ClinicalTemplate.tenant_id == tenant_id,
                    ClinicalTemplate.department_id == department_id,
                    ClinicalTemplate.is_active == True,  # noqa: E712
                )
                .order_by(ClinicalTemplate.name)
            ).all()
        )

    def list_active(
        self, *, tenant_id: str, department_id: str | None = None
    ) -> list[ClinicalTemplate]:
        statement = select(ClinicalTemplate).where(
            ClinicalTemplate.tenant_id == tenant_id,
            ClinicalTemplate.is_active == True,  # noqa: E712
        )
        if department_id:
            statement = statement.where(ClinicalTemplate.department_id == department_id)
        return list(self.session.exec(statement.order_by(ClinicalTemplate.name)).all())


class ConsultationBillingReferenceRepository:
    def __init__(self, session: Session):
        self.session = session

    def lock_consultation(self, consultation_id: str) -> Consultation | None:
        return self.session.exec(
            select(Consultation)
            .where(Consultation.id == consultation_id)
            .with_for_update()
        ).first()

    def has_existing_consultation_invoice(
        self, *, tenant_id: str, consultation_id: str
    ) -> bool:
        from app.modules.billing.models import Invoice

        existing = self.session.exec(
            select(Invoice).where(
                Invoice.tenant_id == tenant_id,
                Invoice.consultation_id == consultation_id,
                Invoice.lab_order_id.is_(None),
                Invoice.pharmacy_issue_id.is_(None),
                Invoice.ip_admission_id.is_(None),
                Invoice.physiotherapy_case_id.is_(None),
            )
        ).first()
        return existing is not None
