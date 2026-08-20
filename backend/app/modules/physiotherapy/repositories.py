from sqlalchemy import func, or_
from sqlmodel import Session, select

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
from app.core.pagination import DEFAULT_LIST_LIMIT
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
from app.modules.pharmacy.models import PharmacySupplier
from app.modules.physiotherapy.listing import PHYSIOTHERAPY_EQUIPMENT_LIST_SPEC
from app.modules.physiotherapy.models import (
    PhysiotherapyCase,
    PhysiotherapyEquipment,
    PhysiotherapySession,
)
from app.modules.practitioners.models import Practitioner, PractitionerType
from app.modules.identity.models import User
from app.modules.tenants.models import Branch


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

    def list_page(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        include_inactive: bool,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
        list_sort: ListSort | None = None,
        limit: int = DEFAULT_LIST_LIMIT,
        offset: int = 0,
    ) -> list[PhysiotherapyEquipment]:
        statement = self._list_statement(
            tenant_id=tenant_id,
            branch_id=branch_id,
            include_inactive=include_inactive,
            q=q,
            list_filters=list_filters,
        )
        statement = apply_list_sort(
            statement,
            PHYSIOTHERAPY_EQUIPMENT_LIST_SPEC,
            list_sort,
            default_order=[
                PhysiotherapyEquipment.updated_at.desc(),
                PhysiotherapyEquipment.created_at.desc(),
            ],
        )
        return list(self.session.exec(statement.offset(offset).limit(limit)).all())

    def count_page(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        include_inactive: bool,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
    ) -> int:
        filtered = self._list_statement(
            tenant_id=tenant_id,
            branch_id=branch_id,
            include_inactive=include_inactive,
            q=q,
            list_filters=list_filters,
        ).subquery()
        return int(self.session.exec(select(func.count()).select_from(filtered)).one())

    def filter_options(self, *, tenant_id: str) -> dict[str, list[ListFilterOption]]:
        branches = (
            select(Branch.id, Branch.name)
            .where(Branch.tenant_id == tenant_id)
            .order_by(Branch.name)
        )
        suppliers = (
            select(PharmacySupplier.id, PharmacySupplier.name)
            .where(PharmacySupplier.tenant_id == tenant_id)
            .order_by(PharmacySupplier.name)
        )
        modality_types = (
            select(PhysiotherapyEquipment.modality_type)
            .where(PhysiotherapyEquipment.tenant_id == tenant_id)
            .distinct()
            .order_by(PhysiotherapyEquipment.modality_type)
        )
        manufacturers = (
            select(PhysiotherapyEquipment.manufacturer)
            .where(PhysiotherapyEquipment.tenant_id == tenant_id)
            .distinct()
            .order_by(PhysiotherapyEquipment.manufacturer)
        )
        return {
            "branch_id": labeled_filter_options(
                list(self.session.exec(branches).all())
            ),
            "supplier_id": labeled_filter_options(
                list(self.session.exec(suppliers).all())
            ),
            "modality_type": list_filter_options(
                list(self.session.exec(modality_types).all())
            ),
            "manufacturer": list_filter_options(
                list(self.session.exec(manufacturers).all())
            ),
            "is_portable": [
                ListFilterOption(value="true", label="Portable"),
                ListFilterOption(value="false", label="Fixed"),
            ],
            "is_active": [
                ListFilterOption(value="true", label="Active"),
                ListFilterOption(value="false", label="Inactive"),
            ],
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
        }

    def _list_statement(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        include_inactive: bool,
        q: str | None,
        list_filters: list[ListFilter] | None,
    ):
        statement = (
            select(PhysiotherapyEquipment)
            .outerjoin(Branch, PhysiotherapyEquipment.branch_id == Branch.id)
            .outerjoin(
                PharmacySupplier,
                PhysiotherapyEquipment.supplier_id == PharmacySupplier.id,
            )
            .where(PhysiotherapyEquipment.tenant_id == tenant_id)
        )
        if branch_id:
            statement = statement.where(
                (PhysiotherapyEquipment.branch_id == branch_id)
                | (PhysiotherapyEquipment.branch_id.is_(None))
            )
        if not include_inactive:
            statement = statement.where(
                PhysiotherapyEquipment.is_active == True  # noqa: E712
            )
        if q:
            term = q.strip().lower()
            statement = statement.where(
                or_(
                    func.lower(PhysiotherapyEquipment.name).contains(
                        term,
                        autoescape=True,
                    ),
                    func.lower(PhysiotherapyEquipment.modality_type).contains(
                        term,
                        autoescape=True,
                    ),
                    func.lower(PhysiotherapyEquipment.manufacturer).contains(
                        term,
                        autoescape=True,
                    ),
                    func.lower(PhysiotherapyEquipment.model_number).contains(
                        term,
                        autoescape=True,
                    ),
                    func.lower(PhysiotherapyEquipment.serial_number).contains(
                        term,
                        autoescape=True,
                    ),
                    func.lower(PharmacySupplier.name).contains(term, autoescape=True),
                )
            )
        if list_filters:
            statement = apply_list_filters(
                statement,
                PHYSIOTHERAPY_EQUIPMENT_LIST_SPEC,
                list_filters,
            )
        return statement


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
