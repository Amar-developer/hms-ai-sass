from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.consultations.models import Consultation, ConsultationMedicine
from app.modules.patients.models import Patient
from app.modules.pharmacy.models import (
    MedicineBatch,
    MedicineCatalog,
    PharmacyIssue,
    PharmacyIssueItem,
    PharmacyIssueStatus,
    PharmacyStockLedger,
    PharmacySupplier,
)
from app.modules.tenants.models import Branch


class PharmacyCatalogRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_medicine(self, medicine_id: str) -> MedicineCatalog | None:
        return self.session.get(MedicineCatalog, medicine_id)

    def get_medicine_for_tenant(
        self, *, tenant_id: str, medicine_id: str
    ) -> MedicineCatalog | None:
        medicine = self.get_medicine(medicine_id)
        if not medicine or medicine.tenant_id != tenant_id:
            return None
        return medicine

    def list_active_medicines(
        self,
        *,
        tenant_id: str,
        branch_id: str | None = None,
        search: str | None = None,
    ) -> list[MedicineCatalog]:
        statement = select(MedicineCatalog).where(
            MedicineCatalog.tenant_id == tenant_id,
            MedicineCatalog.is_active == True,  # noqa: E712
        )
        if branch_id:
            statement = statement.where(
                (MedicineCatalog.branch_id == branch_id)
                | (MedicineCatalog.branch_id.is_(None))
            )
        if search:
            pattern = f"%{search}%"
            statement = statement.where(
                (MedicineCatalog.name.ilike(pattern))
                | (MedicineCatalog.generic_name.ilike(pattern))
                | (MedicineCatalog.code.ilike(pattern))
            )
        return list(self.session.exec(statement.order_by(MedicineCatalog.name)).all())

    def list_popular_prescribed_names(
        self, *, tenant_id: str, limit: int
    ) -> list[tuple[str, int]]:
        return list(
            self.session.exec(
                select(
                    ConsultationMedicine.medicine_name,
                    func.count().label("usage_count"),
                )
                .where(ConsultationMedicine.tenant_id == tenant_id)
                .group_by(ConsultationMedicine.medicine_name)
                .order_by(func.count().desc(), ConsultationMedicine.medicine_name)
                .limit(limit)
            ).all()
        )


class PharmacyReferenceRepository:
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

    def list_consultation_medicines(
        self, *, consultation_id: str
    ) -> list[ConsultationMedicine]:
        return list(
            self.session.exec(
                select(ConsultationMedicine).where(
                    ConsultationMedicine.consultation_id == consultation_id
                )
            ).all()
        )


class PharmacySupplierRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_for_tenant(
        self, *, tenant_id: str, supplier_id: str
    ) -> PharmacySupplier | None:
        supplier = self.session.get(PharmacySupplier, supplier_id)
        if not supplier or supplier.tenant_id != tenant_id:
            return None
        return supplier

    def list_for_tenant(
        self, *, tenant_id: str, include_inactive: bool
    ) -> list[PharmacySupplier]:
        statement = select(PharmacySupplier).where(
            PharmacySupplier.tenant_id == tenant_id
        )
        if not include_inactive:
            statement = statement.where(PharmacySupplier.is_active == True)  # noqa: E712
        return list(self.session.exec(statement.order_by(PharmacySupplier.name)).all())


class PharmacyIssueRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_issue(self, issue_id: str) -> PharmacyIssue | None:
        return self.session.get(PharmacyIssue, issue_id)

    def get_for_tenant(self, tenant_id: str, issue_id: str) -> PharmacyIssue | None:
        issue = self.get_issue(issue_id)
        if not issue or issue.tenant_id != tenant_id:
            return None
        return issue

    def get_by_consultation(
        self, *, tenant_id: str, consultation_id: str
    ) -> PharmacyIssue | None:
        return self.session.exec(
            select(PharmacyIssue).where(
                PharmacyIssue.tenant_id == tenant_id,
                PharmacyIssue.consultation_id == consultation_id,
            )
        ).first()

    def list_items(self, *, tenant_id: str, issue_id: str) -> list[PharmacyIssueItem]:
        return list(
            self.session.exec(
                select(PharmacyIssueItem)
                .where(
                    PharmacyIssueItem.tenant_id == tenant_id,
                    PharmacyIssueItem.pharmacy_issue_id == issue_id,
                )
                .order_by(PharmacyIssueItem.created_at)
            ).all()
        )

    def list_items_by_issue_id(self, issue_id: str) -> list[PharmacyIssueItem]:
        return list(
            self.session.exec(
                select(PharmacyIssueItem).where(
                    PharmacyIssueItem.pharmacy_issue_id == issue_id
                )
            ).all()
        )

    def list_issues(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        patient_id: str | None,
        status_filter: PharmacyIssueStatus | None,
    ) -> list[PharmacyIssue]:
        statement = select(PharmacyIssue).where(PharmacyIssue.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(PharmacyIssue.branch_id == branch_id)
        if patient_id:
            statement = statement.where(PharmacyIssue.patient_id == patient_id)
        if status_filter:
            statement = statement.where(PharmacyIssue.status == status_filter)
        return list(
            self.session.exec(statement.order_by(PharmacyIssue.created_at.desc())).all()
        )


class PharmacyStockRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_batch(self, batch_id: str) -> MedicineBatch | None:
        return self.session.get(MedicineBatch, batch_id)

    def get_batch_for_issue(
        self, *, tenant_id: str, branch_id: str, batch_id: str
    ) -> MedicineBatch | None:
        batch = self.get_batch(batch_id)
        if not batch or batch.tenant_id != tenant_id or batch.branch_id != branch_id:
            return None
        return batch

    def get_batch_for_update(self, batch_id: str) -> MedicineBatch | None:
        return self.session.exec(
            select(MedicineBatch).where(MedicineBatch.id == batch_id).with_for_update()
        ).first()

    def find_available_batch_for_update(
        self,
        *,
        tenant_id: str,
        branch_id: str,
        medicine_id: str,
        quantity: int,
        expiry_floor,
    ) -> MedicineBatch | None:
        return self.session.exec(
            select(MedicineBatch)
            .where(
                MedicineBatch.tenant_id == tenant_id,
                MedicineBatch.branch_id == branch_id,
                MedicineBatch.medicine_id == medicine_id,
                MedicineBatch.quantity_on_hand >= quantity,
                (MedicineBatch.expiry_date.is_(None))
                | (MedicineBatch.expiry_date >= expiry_floor),
            )
            .order_by(MedicineBatch.expiry_date)
            .with_for_update()
        ).first()

    def list_batches(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        medicine_id: str | None,
    ) -> list[MedicineBatch]:
        statement = select(MedicineBatch).where(MedicineBatch.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(MedicineBatch.branch_id == branch_id)
        if medicine_id:
            statement = statement.where(MedicineBatch.medicine_id == medicine_id)
        return list(
            self.session.exec(statement.order_by(MedicineBatch.expiry_date)).all()
        )

    def stock_balance(self, *, tenant_id: str, branch_id: str, medicine_id: str) -> int:
        batches = self.session.exec(
            select(MedicineBatch).where(
                MedicineBatch.tenant_id == tenant_id,
                MedicineBatch.branch_id == branch_id,
                MedicineBatch.medicine_id == medicine_id,
            )
        ).all()
        return sum(batch.quantity_on_hand for batch in batches)

    def list_stock_ledger(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        medicine_id: str | None,
    ) -> list[PharmacyStockLedger]:
        statement = select(PharmacyStockLedger).where(
            PharmacyStockLedger.tenant_id == tenant_id
        )
        if branch_id:
            statement = statement.where(PharmacyStockLedger.branch_id == branch_id)
        if medicine_id:
            statement = statement.where(PharmacyStockLedger.medicine_id == medicine_id)
        return list(
            self.session.exec(
                statement.order_by(PharmacyStockLedger.created_at.desc())
            ).all()
        )
