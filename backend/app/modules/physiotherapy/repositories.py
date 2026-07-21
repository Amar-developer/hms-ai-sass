from sqlmodel import Session, select
from sqlalchemy import func

from app.modules.appointments.models import Appointment, AppointmentType
from app.modules.billing.models import (
    DoctorFeeRule,
    Invoice,
    InvoiceItem,
    Payment,
    TaxRule,
)
from app.modules.ip.models import IPAdmission
from app.modules.patients.models import Patient
from app.modules.physiotherapy.models import (
    PhysiotherapyCase,
    PhysiotherapyEquipment,
    PhysiotherapySession,
)
from app.modules.practitioners.models import Practitioner, PractitionerType


class PhysiotherapyEquipmentRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, equipment: PhysiotherapyEquipment) -> PhysiotherapyEquipment:
        self.session.add(equipment)
        return equipment

    def get_for_tenant(
        self, tenant_id: str, equipment_id: str
    ) -> PhysiotherapyEquipment | None:
        equipment = self.session.get(PhysiotherapyEquipment, equipment_id)
        if not equipment or equipment.tenant_id != tenant_id:
            return None
        return equipment

    def list_active(
        self, *, tenant_id: str, branch_id: str | None = None
    ) -> list[PhysiotherapyEquipment]:
        statement = select(PhysiotherapyEquipment).where(
            PhysiotherapyEquipment.tenant_id == tenant_id,
            PhysiotherapyEquipment.is_active == True,  # noqa: E712
        )
        if branch_id:
            statement = statement.where(
                (PhysiotherapyEquipment.branch_id == branch_id)
                | (PhysiotherapyEquipment.branch_id.is_(None))
            )
        return list(
            self.session.exec(statement.order_by(PhysiotherapyEquipment.name)).all()
        )


class PhysiotherapyCaseRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, case: PhysiotherapyCase) -> PhysiotherapyCase:
        self.session.add(case)
        return case

    def get_for_tenant(self, tenant_id: str, case_id: str) -> PhysiotherapyCase | None:
        case = self.session.get(PhysiotherapyCase, case_id)
        if not case or case.tenant_id != tenant_id:
            return None
        return case

    def list_for_tenant(
        self,
        *,
        tenant_id: str,
        branch_id: str | None = None,
        patient_id: str | None = None,
        care_context: str | None = None,
    ) -> list[PhysiotherapyCase]:
        statement = select(PhysiotherapyCase).where(
            PhysiotherapyCase.tenant_id == tenant_id
        )
        if branch_id:
            statement = statement.where(PhysiotherapyCase.branch_id == branch_id)
        if patient_id:
            statement = statement.where(PhysiotherapyCase.patient_id == patient_id)
        if care_context:
            statement = statement.where(PhysiotherapyCase.care_context == care_context)
        return list(
            self.session.exec(
                statement.order_by(
                    PhysiotherapyCase.updated_at.desc(),
                    PhysiotherapyCase.created_at.desc(),
                )
            ).all()
        )


class PhysiotherapyReferenceRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_patient_for_tenant(self, tenant_id: str, patient_id: str) -> Patient | None:
        patient = self.session.get(Patient, patient_id)
        if not patient or patient.tenant_id != tenant_id:
            return None
        return patient

    def get_appointment_for_tenant(
        self, tenant_id: str, appointment_id: str
    ) -> Appointment | None:
        appointment = self.session.get(Appointment, appointment_id)
        if not appointment or appointment.tenant_id != tenant_id:
            return None
        return appointment

    def get_ip_admission_for_tenant(
        self, tenant_id: str, admission_id: str
    ) -> IPAdmission | None:
        admission = self.session.get(IPAdmission, admission_id)
        if not admission or admission.tenant_id != tenant_id:
            return None
        return admission

    def get_physiotherapist_for_tenant(
        self, tenant_id: str, practitioner_id: str
    ) -> Practitioner | None:
        practitioner = self.session.get(Practitioner, practitioner_id)
        if (
            not practitioner
            or practitioner.tenant_id != tenant_id
            or practitioner.practitioner_type != PractitionerType.PHYSIOTHERAPIST
        ):
            return None
        return practitioner


class PhysiotherapySessionRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, treatment: PhysiotherapySession) -> PhysiotherapySession:
        self.session.add(treatment)
        return treatment

    def list_for_case(
        self, *, tenant_id: str, case_id: str
    ) -> list[PhysiotherapySession]:
        return list(
            self.session.exec(
                select(PhysiotherapySession)
                .where(
                    PhysiotherapySession.tenant_id == tenant_id,
                    PhysiotherapySession.case_id == case_id,
                )
                .order_by(PhysiotherapySession.session_number)
            ).all()
        )

    def list_billable_for_case(
        self, *, tenant_id: str, case_id: str
    ) -> list[PhysiotherapySession]:
        return list(
            self.session.exec(
                select(PhysiotherapySession).where(
                    PhysiotherapySession.tenant_id == tenant_id,
                    PhysiotherapySession.case_id == case_id,
                    PhysiotherapySession.charge_amount > 0,
                )
            ).all()
        )

    def count_for_case(self, *, tenant_id: str, case_id: str) -> int:
        count = self.session.exec(
            select(func.count())
            .select_from(PhysiotherapySession)
            .where(
                PhysiotherapySession.tenant_id == tenant_id,
                PhysiotherapySession.case_id == case_id,
            )
        ).one()
        return int(count or 0)


class PhysiotherapyBillingRepository:
    def __init__(self, session: Session):
        self.session = session

    def lock_case(self, case_id: str) -> PhysiotherapyCase | None:
        return self.session.exec(
            select(PhysiotherapyCase)
            .where(PhysiotherapyCase.id == case_id)
            .with_for_update()
        ).first()

    def add_invoice(self, invoice: Invoice) -> Invoice:
        self.session.add(invoice)
        return invoice

    def add_invoice_item(self, item: InvoiceItem) -> InvoiceItem:
        self.session.add(item)
        return item

    def get_case_invoice(self, *, tenant_id: str, case_id: str) -> Invoice | None:
        return self.session.exec(
            select(Invoice).where(
                Invoice.tenant_id == tenant_id,
                Invoice.physiotherapy_case_id == case_id,
            )
        ).first()

    def list_invoice_items(self, invoice: Invoice) -> list[InvoiceItem]:
        return list(
            self.session.exec(
                select(InvoiceItem)
                .where(
                    InvoiceItem.tenant_id == invoice.tenant_id,
                    InvoiceItem.invoice_id == invoice.id,
                )
                .order_by(InvoiceItem.created_at)
            ).all()
        )

    def list_invoice_payments(self, invoice: Invoice) -> list[Payment]:
        return list(
            self.session.exec(
                select(Payment)
                .where(
                    Payment.tenant_id == invoice.tenant_id,
                    Payment.invoice_id == invoice.id,
                )
                .order_by(Payment.collected_at)
            ).all()
        )

    def get_active_tax_rule(
        self, *, tenant_id: str, branch_id: str, tax_rule_id: str | None
    ) -> TaxRule | None:
        tax_rule = self.session.get(TaxRule, tax_rule_id) if tax_rule_id else None
        if tax_rule:
            return tax_rule
        return self.session.exec(
            select(TaxRule).where(
                TaxRule.tenant_id == tenant_id,
                TaxRule.is_active == True,  # noqa: E712
                (TaxRule.branch_id == branch_id) | (TaxRule.branch_id.is_(None)),
            )
        ).first()

    def list_physiotherapist_fee_rules(
        self, *, tenant_id: str, physiotherapist_id: str
    ) -> list[DoctorFeeRule]:
        return list(
            self.session.exec(
                select(DoctorFeeRule).where(
                    DoctorFeeRule.tenant_id == tenant_id,
                    DoctorFeeRule.appointment_type == AppointmentType.OP,
                    DoctorFeeRule.is_active == True,  # noqa: E712
                    DoctorFeeRule.practitioner_id == physiotherapist_id,
                )
            ).all()
        )
