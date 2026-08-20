from datetime import date, datetime, time, timedelta

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
from app.modules.consultations.models import Consultation, ConsultationMedicine
from app.modules.identity.models import User
from app.modules.patients.models import Patient
from app.modules.pharmacy.listing import MEDICINE_CATALOG_LIST_SPEC
from app.modules.pharmacy.listing import PHARMACY_ISSUE_LIST_SPEC
from app.modules.pharmacy.listing import PHARMACY_SUPPLIER_LIST_SPEC
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

    def medicines_for_tenant(
        self, *, tenant_id: str, medicine_ids: set[str]
    ) -> dict[str, MedicineCatalog]:
        """Batch equivalent of get_medicine_for_tenant, keyed by medicine id."""
        if not medicine_ids:
            return {}
        rows = self.session.exec(
            select(MedicineCatalog).where(
                MedicineCatalog.tenant_id == tenant_id,
                MedicineCatalog.id.in_(medicine_ids),
            )
        ).all()
        return {row.id: row for row in rows}

    def list_active_medicines(
        self,
        *,
        tenant_id: str,
        branch_id: str | None = None,
        search: str | None = None,
        limit: int | None = None,
        offset: int = 0,
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
        statement = statement.order_by(MedicineCatalog.name)
        if offset:
            statement = statement.offset(offset)
        if limit is not None:
            statement = statement.limit(limit)
        return list(self.session.exec(statement).all())

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
    ) -> list[MedicineCatalog]:
        statement = self._list_statement(
            tenant_id=tenant_id,
            branch_id=branch_id,
            include_inactive=include_inactive,
            q=q,
            list_filters=list_filters,
        )
        statement = apply_list_sort(
            statement,
            MEDICINE_CATALOG_LIST_SPEC,
            list_sort,
            default_order=[
                MedicineCatalog.updated_at.desc(),
                MedicineCatalog.created_at.desc(),
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
        forms = (
            select(MedicineCatalog.form)
            .where(MedicineCatalog.tenant_id == tenant_id)
            .distinct()
            .order_by(MedicineCatalog.form)
        )
        manufacturers = (
            select(MedicineCatalog.manufacturer)
            .where(MedicineCatalog.tenant_id == tenant_id)
            .distinct()
            .order_by(MedicineCatalog.manufacturer)
        )
        return {
            "branch_id": labeled_filter_options(
                list(self.session.exec(branches).all())
            ),
            "supplier_id": labeled_filter_options(
                list(self.session.exec(suppliers).all())
            ),
            "form": list_filter_options(list(self.session.exec(forms).all())),
            "manufacturer": list_filter_options(
                list(self.session.exec(manufacturers).all())
            ),
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
            select(MedicineCatalog)
            .outerjoin(Branch, MedicineCatalog.branch_id == Branch.id)
            .outerjoin(
                PharmacySupplier, MedicineCatalog.supplier_id == PharmacySupplier.id
            )
            .where(MedicineCatalog.tenant_id == tenant_id)
        )
        if branch_id:
            statement = statement.where(
                (MedicineCatalog.branch_id == branch_id)
                | (MedicineCatalog.branch_id.is_(None))
            )
        if not include_inactive:
            statement = statement.where(MedicineCatalog.is_active == True)  # noqa: E712
        if q:
            term = q.strip().lower()
            statement = statement.where(
                or_(
                    func.lower(MedicineCatalog.code).contains(term, autoescape=True),
                    func.lower(MedicineCatalog.name).contains(term, autoescape=True),
                    func.lower(MedicineCatalog.generic_name).contains(
                        term,
                        autoescape=True,
                    ),
                    func.lower(MedicineCatalog.form).contains(term, autoescape=True),
                    func.lower(MedicineCatalog.strength).contains(
                        term,
                        autoescape=True,
                    ),
                    func.lower(MedicineCatalog.manufacturer).contains(
                        term,
                        autoescape=True,
                    ),
                    func.lower(PharmacySupplier.name).contains(term, autoescape=True),
                )
            )
        if list_filters:
            statement = apply_list_filters(
                statement,
                MEDICINE_CATALOG_LIST_SPEC,
                list_filters,
            )
        return statement

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

    def list_page(
        self,
        *,
        tenant_id: str,
        include_inactive: bool,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
        list_sort: ListSort | None = None,
        limit: int = DEFAULT_LIST_LIMIT,
        offset: int = 0,
    ) -> list[PharmacySupplier]:
        statement = self._list_statement(
            tenant_id=tenant_id,
            include_inactive=include_inactive,
            q=q,
            list_filters=list_filters,
        )
        statement = apply_list_sort(
            statement,
            PHARMACY_SUPPLIER_LIST_SPEC,
            list_sort,
            default_order=[
                PharmacySupplier.updated_at.desc(),
                PharmacySupplier.created_at.desc(),
            ],
        )
        return list(self.session.exec(statement.offset(offset).limit(limit)).all())

    def count_page(
        self,
        *,
        tenant_id: str,
        include_inactive: bool,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
    ) -> int:
        filtered = self._list_statement(
            tenant_id=tenant_id,
            include_inactive=include_inactive,
            q=q,
            list_filters=list_filters,
        ).subquery()
        return int(self.session.exec(select(func.count()).select_from(filtered)).one())

    def filter_options(self, *, tenant_id: str) -> dict[str, list[ListFilterOption]]:
        return {
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
        include_inactive: bool,
        q: str | None,
        list_filters: list[ListFilter] | None,
    ):
        statement = select(PharmacySupplier).where(
            PharmacySupplier.tenant_id == tenant_id
        )
        if not include_inactive:
            statement = statement.where(PharmacySupplier.is_active == True)  # noqa: E712
        if q:
            term = q.strip().lower()
            statement = statement.where(
                or_(
                    func.lower(PharmacySupplier.supplier_number).contains(
                        term,
                        autoescape=True,
                    ),
                    func.lower(PharmacySupplier.name).contains(term, autoescape=True),
                    func.lower(PharmacySupplier.gstin).contains(term, autoescape=True),
                    func.lower(PharmacySupplier.phone).contains(term, autoescape=True),
                    func.lower(PharmacySupplier.email).contains(term, autoescape=True),
                    func.lower(PharmacySupplier.address).contains(
                        term,
                        autoescape=True,
                    ),
                )
            )
        if list_filters:
            statement = apply_list_filters(
                statement,
                PHARMACY_SUPPLIER_LIST_SPEC,
                list_filters,
            )
        return statement


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
        q: str | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        list_filters: list[ListFilter] | None = None,
        list_sort: ListSort | None = None,
        limit: int = DEFAULT_LIST_LIMIT,
        offset: int = 0,
    ) -> list[PharmacyIssue]:
        statement = self._issue_list_statement(
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id=patient_id,
            status_filter=status_filter,
            q=q,
            from_date=from_date,
            to_date=to_date,
            list_filters=list_filters,
        )
        statement = apply_list_sort(
            statement,
            PHARMACY_ISSUE_LIST_SPEC,
            list_sort,
            default_order=[PharmacyIssue.created_at.desc()],
        )
        return list(self.session.exec(statement.offset(offset).limit(limit)).all())

    def count_issues(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        patient_id: str | None,
        status_filter: PharmacyIssueStatus | None,
        q: str | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        list_filters: list[ListFilter] | None = None,
    ) -> int:
        filtered = self._issue_list_statement(
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id=patient_id,
            status_filter=status_filter,
            q=q,
            from_date=from_date,
            to_date=to_date,
            list_filters=list_filters,
        ).subquery()
        return int(self.session.exec(select(func.count()).select_from(filtered)).one())

    def filter_options(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        patient_id: str | None = None,
    ) -> dict[str, list[ListFilterOption]]:
        scope = (
            select(
                PharmacyIssue.id,
                PharmacyIssue.branch_id,
                PharmacyIssue.patient_id,
                PharmacyIssue.source,
                PharmacyIssue.status,
                PharmacyIssue.issued_by_user_id,
                PharmacyIssue.dispensed_by_user_id,
            )
            .where(PharmacyIssue.tenant_id == tenant_id)
            .subquery()
        )
        if branch_id or patient_id:
            scoped_statement = select(scope).select_from(scope)
            if branch_id:
                scoped_statement = scoped_statement.where(
                    scope.c.branch_id == branch_id
                )
            if patient_id:
                scoped_statement = scoped_statement.where(
                    scope.c.patient_id == patient_id
                )
            scope = scoped_statement.subquery()

        return {
            "source": list_filter_options(
                list(
                    self.session.exec(
                        select(scope.c.source)
                        .distinct()
                        .order_by(scope.c.source)
                        .limit(100)
                    ).all()
                )
            ),
            "status": list_filter_options(
                list(
                    self.session.exec(
                        select(scope.c.status)
                        .distinct()
                        .order_by(scope.c.status)
                        .limit(100)
                    ).all()
                )
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
            "dispensed_by_user_id": tenant_user_filter_options(
                self.session,
                User,
                tenant_id=tenant_id,
            ),
        }

    def _issue_list_statement(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        patient_id: str | None,
        status_filter: PharmacyIssueStatus | None,
        q: str | None,
        from_date: date | None,
        to_date: date | None,
        list_filters: list[ListFilter] | None = None,
    ):
        statement = (
            select(PharmacyIssue)
            .join(Patient, Patient.id == PharmacyIssue.patient_id)
            .where(PharmacyIssue.tenant_id == tenant_id)
        )
        if branch_id:
            statement = statement.where(PharmacyIssue.branch_id == branch_id)
        if patient_id:
            statement = statement.where(PharmacyIssue.patient_id == patient_id)
        if status_filter:
            statement = statement.where(PharmacyIssue.status == status_filter)
        if from_date:
            statement = statement.where(
                PharmacyIssue.created_at >= datetime.combine(from_date, time.min)
            )
        if to_date:
            statement = statement.where(
                PharmacyIssue.created_at
                < datetime.combine(to_date + timedelta(days=1), time.min)
            )
        if q:
            term = q.strip().lower()
            statement = statement.where(
                or_(
                    func.lower(PharmacyIssue.issue_number).contains(
                        term, autoescape=True
                    ),
                    func.lower(PharmacyIssue.medicine_text).contains(
                        term, autoescape=True
                    ),
                    func.lower(Patient.patient_number).contains(term, autoescape=True),
                    func.lower(Patient.full_name).contains(term, autoescape=True),
                    func.lower(Patient.mobile).contains(term, autoescape=True),
                )
            )
        if list_filters:
            statement = apply_list_filters(
                statement,
                PHARMACY_ISSUE_LIST_SPEC,
                list_filters,
            )
        return statement


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
        limit: int = DEFAULT_LIST_LIMIT,
        offset: int = 0,
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
                .offset(offset)
                .limit(limit)
            ).all()
        )
