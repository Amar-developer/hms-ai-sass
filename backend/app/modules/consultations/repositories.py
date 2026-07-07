from typing import Any

from sqlmodel import Session, SQLModel, select

from app.modules.appointments.models import Appointment
from app.modules.consultations.models import (
    ClinicalTemplate,
    Consultation,
    ConsultationAddendum,
    ConsultationComplaint,
    ConsultationDiagnosis,
    ConsultationMedicine,
    ConsultationReferral,
    ConsultationVital,
)
from app.modules.lab.models import LabOrder
from app.modules.patients.models import Patient
from app.modules.queue.models import QueueEntry


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
    ) -> list[Consultation]:
        statement = select(Consultation).where(Consultation.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(Consultation.branch_id == branch_id)
        if practitioner_id:
            statement = statement.where(Consultation.practitioner_id == practitioner_id)
        if patient_id:
            statement = statement.where(Consultation.patient_id == patient_id)
        if appointment_id:
            statement = statement.where(Consultation.appointment_id == appointment_id)
        return list(
            self.session.exec(statement.order_by(Consultation.created_at)).all()
        )


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
