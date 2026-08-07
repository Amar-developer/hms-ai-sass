from sqlmodel import Session, select

from app.core.pagination import DEFAULT_LIST_LIMIT
from app.modules.appointments.models import Appointment
from app.modules.consultations.models import (
    Consultation,
    ConsultationReferral,
    ConsultationStatus,
)
from app.modules.lab.models import (
    LabOrder,
    LabOrderItem,
    LabOrderStatus,
    LabResult,
    LabResultTemplate,
    LabSample,
    LabTestCatalog,
    LabTestPackage,
    LabTestPackageItem,
)
from app.modules.patients.models import Patient
from app.modules.practitioners.models import Practitioner
from app.modules.queue.models import QueueEntry
from app.modules.tenants.models import Branch


class LabCatalogRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_test(self, test_id: str) -> LabTestCatalog | None:
        return self.session.get(LabTestCatalog, test_id)

    def get_test_for_tenant(
        self, *, tenant_id: str, test_id: str, active_only: bool = False
    ) -> LabTestCatalog | None:
        test = self.get_test(test_id)
        if not test or test.tenant_id != tenant_id:
            return None
        if active_only and not test.is_active:
            return None
        return test

    def tests_for_tenant(
        self, *, tenant_id: str, test_ids: set[str], active_only: bool = False
    ) -> dict[str, LabTestCatalog]:
        """Batch equivalent of get_test_for_tenant, keyed by test id.

        Applies the same tenant and active filters, so a caller can swap a
        per-item lookup for one round-trip without changing which rows it sees.
        """
        if not test_ids:
            return {}
        statement = select(LabTestCatalog).where(
            LabTestCatalog.tenant_id == tenant_id,
            LabTestCatalog.id.in_(test_ids),
        )
        if active_only:
            statement = statement.where(
                LabTestCatalog.is_active == True  # noqa: E712
            )
        return {row.id: row for row in self.session.exec(statement).all()}

    def list_active_tests(
        self, *, tenant_id: str, search: str | None = None
    ) -> list[LabTestCatalog]:
        statement = select(LabTestCatalog).where(
            LabTestCatalog.tenant_id == tenant_id,
            LabTestCatalog.is_active == True,  # noqa: E712
        )
        if search:
            pattern = f"%{search}%"
            statement = statement.where(
                (LabTestCatalog.name.ilike(pattern))
                | (LabTestCatalog.code.ilike(pattern))
            )
        return list(self.session.exec(statement.order_by(LabTestCatalog.name)).all())

    def get_package(self, package_id: str) -> LabTestPackage | None:
        return self.session.get(LabTestPackage, package_id)

    def get_package_for_tenant(
        self, *, tenant_id: str, package_id: str, active_only: bool = False
    ) -> LabTestPackage | None:
        package = self.get_package(package_id)
        if not package or package.tenant_id != tenant_id:
            return None
        if active_only and not package.is_active:
            return None
        return package

    def list_active_packages(
        self, *, tenant_id: str, search: str | None = None
    ) -> list[LabTestPackage]:
        statement = select(LabTestPackage).where(
            LabTestPackage.tenant_id == tenant_id,
            LabTestPackage.is_active == True,  # noqa: E712
        )
        if search:
            pattern = f"%{search}%"
            statement = statement.where(
                (LabTestPackage.name.ilike(pattern))
                | (LabTestPackage.code.ilike(pattern))
            )
        return list(self.session.exec(statement.order_by(LabTestPackage.name)).all())

    def packages_for_tenant(
        self, *, tenant_id: str, package_ids: set[str], active_only: bool = False
    ) -> dict[str, LabTestPackage]:
        """Batch equivalent of get_package_for_tenant, keyed by package id."""
        if not package_ids:
            return {}
        statement = select(LabTestPackage).where(
            LabTestPackage.tenant_id == tenant_id,
            LabTestPackage.id.in_(package_ids),
        )
        if active_only:
            statement = statement.where(
                LabTestPackage.is_active == True  # noqa: E712
            )
        return {row.id: row for row in self.session.exec(statement).all()}

    def package_items_for_packages(
        self, *, tenant_id: str, package_ids: set[str]
    ) -> dict[str, list[LabTestPackageItem]]:
        """Batch equivalent of list_package_items, grouped by package id."""
        if not package_ids:
            return {}
        rows = self.session.exec(
            select(LabTestPackageItem).where(
                LabTestPackageItem.tenant_id == tenant_id,
                LabTestPackageItem.package_id.in_(package_ids),
            )
        ).all()
        grouped: dict[str, list[LabTestPackageItem]] = {}
        for row in rows:
            grouped.setdefault(row.package_id, []).append(row)
        return grouped

    def list_package_items(
        self, *, tenant_id: str, package_id: str
    ) -> list[LabTestPackageItem]:
        return list(
            self.session.exec(
                select(LabTestPackageItem).where(
                    LabTestPackageItem.tenant_id == tenant_id,
                    LabTestPackageItem.package_id == package_id,
                )
            ).all()
        )

    def add_package_item(
        self, *, tenant_id: str, package_id: str, test_id: str
    ) -> LabTestPackageItem:
        item = LabTestPackageItem(
            tenant_id=tenant_id,
            package_id=package_id,
            test_id=test_id,
        )
        self.session.add(item)
        return item

    def replace_package_items(
        self, *, tenant_id: str, package_id: str, test_ids: list[str]
    ) -> None:
        for row in self.list_package_items(tenant_id=tenant_id, package_id=package_id):
            self.session.delete(row)
        for test_id in test_ids:
            self.add_package_item(
                tenant_id=tenant_id,
                package_id=package_id,
                test_id=test_id,
            )


class LabReferenceRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_patient(self, patient_id: str) -> Patient | None:
        return self.session.get(Patient, patient_id)

    def get_branch(self, branch_id: str) -> Branch | None:
        return self.session.get(Branch, branch_id)

    def get_consultation(self, consultation_id: str) -> Consultation | None:
        return self.session.get(Consultation, consultation_id)

    def get_consultation_for_tenant(
        self, *, tenant_id: str, consultation_id: str
    ) -> Consultation | None:
        consultation = self.get_consultation(consultation_id)
        if not consultation or consultation.tenant_id != tenant_id:
            return None
        return consultation

    def list_consultation_referrals(
        self, *, tenant_id: str, branch_id: str | None
    ) -> list[
        tuple[
            Consultation,
            Appointment,
            Patient,
            QueueEntry | None,
            Practitioner | None,
        ]
    ]:
        statement = (
            select(Consultation, Appointment, Patient, QueueEntry, Practitioner)
            .join(Appointment, Appointment.id == Consultation.appointment_id)
            .join(Patient, Patient.id == Consultation.patient_id)
            .outerjoin(
                QueueEntry, QueueEntry.appointment_id == Consultation.appointment_id
            )
            .outerjoin(Practitioner, Practitioner.id == Appointment.practitioner_id)
            .where(
                Consultation.tenant_id == tenant_id,
                Consultation.status == ConsultationStatus.SIGNED,
                Consultation.lab_referral_text.is_not(None),
                Consultation.lab_referral_text != "",
            )
            .order_by(Consultation.created_at.desc())
        )
        if branch_id:
            statement = statement.where(Consultation.branch_id == branch_id)
        return list(self.session.exec(statement).all())

    def list_structured_referrals(
        self, *, tenant_id: str, consultation_ids: list[str]
    ) -> list[ConsultationReferral]:
        if not consultation_ids:
            return []
        return list(
            self.session.exec(
                select(ConsultationReferral).where(
                    ConsultationReferral.tenant_id == tenant_id,
                    ConsultationReferral.consultation_id.in_(consultation_ids),
                    ConsultationReferral.referral_type == "lab",
                )
            ).all()
        )

    def list_popular_referral_names(
        self, *, tenant_id: str, limit: int
    ) -> list[tuple[str, int]]:
        from sqlalchemy import func

        return list(
            self.session.exec(
                select(
                    ConsultationReferral.item_name,
                    func.count().label("usage_count"),
                )
                .where(
                    ConsultationReferral.tenant_id == tenant_id,
                    ConsultationReferral.referral_type == "lab",
                )
                .group_by(ConsultationReferral.item_name)
                .order_by(func.count().desc(), ConsultationReferral.item_name)
                .limit(limit)
            ).all()
        )


class LabOrderRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_order(self, order_id: str) -> LabOrder | None:
        return self.session.get(LabOrder, order_id)

    def get_for_tenant(self, tenant_id: str, order_id: str) -> LabOrder | None:
        order = self.get_order(order_id)
        if not order or order.tenant_id != tenant_id:
            return None
        return order

    def get_by_consultation(
        self, *, tenant_id: str, consultation_id: str
    ) -> LabOrder | None:
        return self.session.exec(
            select(LabOrder).where(
                LabOrder.tenant_id == tenant_id,
                LabOrder.consultation_id == consultation_id,
            )
        ).first()

    def list_orders(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        patient_id: str | None,
        status_filter: LabOrderStatus | None,
        limit: int = DEFAULT_LIST_LIMIT,
        offset: int = 0,
    ) -> list[LabOrder]:
        statement = select(LabOrder).where(LabOrder.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(LabOrder.branch_id == branch_id)
        if patient_id:
            statement = statement.where(LabOrder.patient_id == patient_id)
        if status_filter:
            statement = statement.where(LabOrder.status == status_filter)
        return list(
            self.session.exec(
                statement.order_by(LabOrder.created_at.desc())
                .offset(offset)
                .limit(limit)
            ).all()
        )

    def list_order_items(self, *, tenant_id: str, order_id: str) -> list[LabOrderItem]:
        return list(
            self.session.exec(
                select(LabOrderItem)
                .where(
                    LabOrderItem.tenant_id == tenant_id,
                    LabOrderItem.lab_order_id == order_id,
                )
                .order_by(LabOrderItem.created_at)
            ).all()
        )

    def list_samples(self, *, tenant_id: str, order_id: str) -> list[LabSample]:
        return list(
            self.session.exec(
                select(LabSample)
                .where(
                    LabSample.tenant_id == tenant_id,
                    LabSample.lab_order_id == order_id,
                )
                .order_by(LabSample.collected_at)
            ).all()
        )

    def list_results(self, *, tenant_id: str, order_id: str) -> list[LabResult]:
        return list(
            self.session.exec(
                select(LabResult)
                .where(
                    LabResult.tenant_id == tenant_id,
                    LabResult.lab_order_id == order_id,
                )
                .order_by(LabResult.released_at)
            ).all()
        )


class LabResultTemplateRepository:
    def __init__(self, session: Session):
        self.session = session

    def list_active(
        self, *, tenant_id: str, test_id: str | None = None
    ) -> list[LabResultTemplate]:
        statement = select(LabResultTemplate).where(
            LabResultTemplate.tenant_id == tenant_id,
            LabResultTemplate.is_active == True,  # noqa: E712
        )
        if test_id:
            statement = statement.where(
                (LabResultTemplate.test_id == test_id)
                | (LabResultTemplate.test_id.is_(None))
            )
        return list(self.session.exec(statement.order_by(LabResultTemplate.name)).all())
