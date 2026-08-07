from sqlmodel import Session, delete, select

from app.core.pagination import DEFAULT_LIST_LIMIT
from app.modules.appointments.models import Appointment
from app.modules.billing.models import Invoice, InvoiceItem
from app.modules.ip.models import (
    IPAdmission,
    IPBillingItem,
    IPCharge,
    IPConsentForm,
    IPConsultation,
    IPDischargeSummary,
    IPDocument,
    IPMedicationAdministration,
    IPMedicationOrder,
    IPRoom,
    IPTreatment,
)
from app.modules.lab.models import LabTestCatalog
from app.modules.patients.models import Patient
from app.modules.pharmacy.models import MedicineCatalog


class IPAdmissionRepository:
    def __init__(self, session: Session):
        self.session = session

    def get(self, admission_id: str) -> IPAdmission | None:
        return self.session.get(IPAdmission, admission_id)

    def get_for_tenant(
        self, *, tenant_id: str, admission_id: str
    ) -> IPAdmission | None:
        admission = self.get(admission_id)
        if not admission or admission.tenant_id != tenant_id:
            return None
        return admission

    def list_admissions(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        patient_id: str | None,
        status_filter: str | None,
        limit: int = DEFAULT_LIST_LIMIT,
        offset: int = 0,
    ) -> list[IPAdmission]:
        statement = select(IPAdmission).where(IPAdmission.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(IPAdmission.branch_id == branch_id)
        if patient_id:
            statement = statement.where(IPAdmission.patient_id == patient_id)
        if status_filter:
            statement = statement.where(IPAdmission.status == status_filter)
        return list(
            self.session.exec(
                statement.order_by(
                    IPAdmission.updated_at.desc(), IPAdmission.created_at.desc()
                )
                .offset(offset)
                .limit(limit)
            ).all()
        )

    def latest_discharge_summary(
        self, *, tenant_id: str, admission_id: str
    ) -> IPDischargeSummary | None:
        return self.session.exec(
            select(IPDischargeSummary)
            .where(
                IPDischargeSummary.tenant_id == tenant_id,
                IPDischargeSummary.admission_id == admission_id,
            )
            .order_by(
                IPDischargeSummary.updated_at.desc(),
                IPDischargeSummary.created_at.desc(),
            )
        ).first()

    def list_active_room_admissions(
        self, *, tenant_id: str, room_id: str, active_statuses: set[str]
    ) -> list[IPAdmission]:
        return list(
            self.session.exec(
                select(IPAdmission).where(
                    IPAdmission.tenant_id == tenant_id,
                    IPAdmission.room_id == room_id,
                    IPAdmission.status.in_(active_statuses),
                )
            ).all()
        )

    def list_documents(self, *, tenant_id: str, admission_id: str) -> list[IPDocument]:
        return list(
            self.session.exec(
                select(IPDocument)
                .where(
                    IPDocument.tenant_id == tenant_id,
                    IPDocument.admission_id == admission_id,
                )
                .order_by(IPDocument.created_at.desc())
            ).all()
        )


class IPRoomRepository:
    def __init__(self, session: Session):
        self.session = session

    def get(self, room_id: str) -> IPRoom | None:
        return self.session.get(IPRoom, room_id)

    def get_for_tenant(self, *, tenant_id: str, room_id: str) -> IPRoom | None:
        room = self.get(room_id)
        if not room or room.tenant_id != tenant_id:
            return None
        return room

    def get_for_update(self, room_id: str) -> IPRoom | None:
        return self.session.exec(
            select(IPRoom).where(IPRoom.id == room_id).with_for_update()
        ).first()

    def find_duplicate_bed(
        self, *, tenant_id: str, branch_id: str, room_number: str, bed_number: str
    ) -> IPRoom | None:
        return self.session.exec(
            select(IPRoom).where(
                IPRoom.tenant_id == tenant_id,
                IPRoom.branch_id == branch_id,
                IPRoom.room_number == room_number,
                IPRoom.bed_number == bed_number,
            )
        ).first()

    def list_rooms(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        ward_type: str | None,
        room_type: str | None,
    ) -> list[IPRoom]:
        statement = select(IPRoom).where(IPRoom.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(IPRoom.branch_id == branch_id)
        if ward_type:
            statement = statement.where(IPRoom.ward_type == ward_type)
        if room_type:
            statement = statement.where(IPRoom.room_type == room_type)
        return list(
            self.session.exec(
                statement.order_by(
                    IPRoom.ward_name, IPRoom.room_number, IPRoom.bed_number
                )
            ).all()
        )


class IPReferenceRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_patient(self, patient_id: str) -> Patient | None:
        return self.session.get(Patient, patient_id)

    def get_appointment(self, appointment_id: str) -> Appointment | None:
        return self.session.get(Appointment, appointment_id)


class IPBillingRepository:
    def __init__(self, session: Session):
        self.session = session

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

    def delete_invoice_items(self, *, tenant_id: str, invoice_id: str) -> None:
        self.session.exec(
            delete(InvoiceItem).where(
                InvoiceItem.tenant_id == tenant_id,
                InvoiceItem.invoice_id == invoice_id,
            )
        )

    def get_invoice_for_admission(
        self, *, tenant_id: str, admission_id: str
    ) -> Invoice | None:
        return self.session.exec(
            select(Invoice).where(
                Invoice.tenant_id == tenant_id,
                Invoice.ip_admission_id == admission_id,
            )
        ).first()

    def list_charges(self, *, tenant_id: str, admission_id: str) -> list[IPCharge]:
        return list(
            self.session.exec(
                select(IPCharge)
                .where(
                    IPCharge.tenant_id == tenant_id,
                    IPCharge.admission_id == admission_id,
                )
                .order_by(IPCharge.created_at)
            ).all()
        )

    def list_billing_items(
        self,
        *,
        tenant_id: str,
        admission_id: str,
        status_filter: str | None = None,
    ) -> list[IPBillingItem]:
        statement = select(IPBillingItem).where(
            IPBillingItem.tenant_id == tenant_id,
            IPBillingItem.admission_id == admission_id,
        )
        if status_filter:
            statement = statement.where(IPBillingItem.status == status_filter)
        return list(
            self.session.exec(statement.order_by(IPBillingItem.created_at)).all()
        )

    def get_existing_item(
        self, *, tenant_id: str, admission_id: str, source_type: str, source_id: str
    ) -> IPBillingItem | None:
        return self.session.exec(
            select(IPBillingItem).where(
                IPBillingItem.tenant_id == tenant_id,
                IPBillingItem.admission_id == admission_id,
                IPBillingItem.source_type == source_type,
                IPBillingItem.source_id == source_id,
            )
        ).first()

    def list_given_medication_administrations(
        self, *, tenant_id: str, admission_id: str
    ) -> list[tuple[IPMedicationAdministration, IPMedicationOrder]]:
        return list(
            self.session.exec(
                select(IPMedicationAdministration, IPMedicationOrder)
                .join(
                    IPMedicationOrder,
                    IPMedicationAdministration.medication_order_id
                    == IPMedicationOrder.id,
                )
                .where(
                    IPMedicationAdministration.tenant_id == tenant_id,
                    IPMedicationAdministration.admission_id == admission_id,
                    IPMedicationAdministration.status == "given",
                )
                .order_by(IPMedicationAdministration.administered_at)
            ).all()
        )

    def list_treatments(
        self, *, tenant_id: str, admission_id: str
    ) -> list[IPTreatment]:
        return list(
            self.session.exec(
                select(IPTreatment)
                .where(
                    IPTreatment.tenant_id == tenant_id,
                    IPTreatment.admission_id == admission_id,
                )
                .order_by(IPTreatment.treatment_date, IPTreatment.created_at)
            ).all()
        )


class IPClinicalRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_consultation(
        self, *, tenant_id: str, consultation_id: str
    ) -> IPConsultation | None:
        consultation = self.session.get(IPConsultation, consultation_id)
        if not consultation or consultation.tenant_id != tenant_id:
            return None
        return consultation

    def get_consent(self, *, tenant_id: str, consent_id: str) -> IPConsentForm | None:
        consent = self.session.get(IPConsentForm, consent_id)
        if not consent or consent.tenant_id != tenant_id:
            return None
        return consent

    def get_discharge_summary(
        self, *, tenant_id: str, summary_id: str
    ) -> IPDischargeSummary | None:
        summary = self.session.get(IPDischargeSummary, summary_id)
        if not summary or summary.tenant_id != tenant_id:
            return None
        return summary

    def list_treatments(
        self, *, tenant_id: str, admission_id: str
    ) -> list[IPTreatment]:
        return list(
            self.session.exec(
                select(IPTreatment)
                .where(
                    IPTreatment.tenant_id == tenant_id,
                    IPTreatment.admission_id == admission_id,
                )
                .order_by(IPTreatment.created_at.desc())
            ).all()
        )

    def get_medication_order(
        self, *, tenant_id: str, admission_id: str, order_id: str
    ) -> IPMedicationOrder | None:
        order = self.session.get(IPMedicationOrder, order_id)
        if (
            not order
            or order.tenant_id != tenant_id
            or order.admission_id != admission_id
        ):
            return None
        return order

    def list_medication_orders(
        self, *, tenant_id: str, admission_id: str
    ) -> list[IPMedicationOrder]:
        return list(
            self.session.exec(
                select(IPMedicationOrder)
                .where(
                    IPMedicationOrder.tenant_id == tenant_id,
                    IPMedicationOrder.admission_id == admission_id,
                )
                .order_by(IPMedicationOrder.created_at.desc())
            ).all()
        )

    def list_medication_administrations(
        self, *, tenant_id: str, admission_id: str
    ) -> list[IPMedicationAdministration]:
        return list(
            self.session.exec(
                select(IPMedicationAdministration)
                .where(
                    IPMedicationAdministration.tenant_id == tenant_id,
                    IPMedicationAdministration.admission_id == admission_id,
                )
                .order_by(IPMedicationAdministration.administered_at.desc())
            ).all()
        )


class IPCatalogRepository:
    def __init__(self, session: Session):
        self.session = session

    def list_medicines(self, *, tenant_id: str) -> list[MedicineCatalog]:
        return list(
            self.session.exec(
                select(MedicineCatalog).where(MedicineCatalog.tenant_id == tenant_id)
            ).all()
        )

    def list_lab_tests(self, *, tenant_id: str) -> list[LabTestCatalog]:
        return list(
            self.session.exec(
                select(LabTestCatalog).where(LabTestCatalog.tenant_id == tenant_id)
            ).all()
        )
