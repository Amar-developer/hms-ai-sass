from sqlalchemy import func
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
from app.modules.billing.listing import DISCOUNT_OFFER_LIST_SPEC, TAX_RULE_LIST_SPEC
from app.modules.billing.models import (
    DiscountApproval,
    DiscountOffer,
    DoctorFeeRule,
    TaxRule,
)
from app.modules.identity.models import User
from app.modules.lab.models import LabTestCatalog, LabTestPackage
from app.modules.pharmacy.models import PharmacySupplier
from app.modules.practitioners.models import Practitioner, PractitionerDepartment
from app.modules.tenants.models import Branch


class BillingReferenceRepository:
    """Reads billing rule, catalog, and supplier reference data."""

    def __init__(self, session: Session):
        self.session = session

    def get_practitioner(self, practitioner_id: str) -> Practitioner | None:
        return self.session.get(Practitioner, practitioner_id)

    def get_practitioner_department(
        self, *, practitioner_id: str, department_id: str
    ) -> PractitionerDepartment | None:
        return self.session.get(
            PractitionerDepartment,
            (practitioner_id, department_id),
        )

    def list_active_fee_rules(
        self, *, tenant_id: str, appointment_type
    ) -> list[DoctorFeeRule]:
        return list(
            self.session.exec(
                select(DoctorFeeRule).where(
                    DoctorFeeRule.tenant_id == tenant_id,
                    DoctorFeeRule.appointment_type == appointment_type,
                    DoctorFeeRule.is_active == True,  # noqa: E712
                )
            ).all()
        )

    def list_duplicate_fee_rules(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        department_id: str | None,
        practitioner_id: str | None,
        appointment_type,
        treatment_type: str | None,
    ) -> list[DoctorFeeRule]:
        return list(
            self.session.exec(
                select(DoctorFeeRule).where(
                    DoctorFeeRule.tenant_id == tenant_id,
                    DoctorFeeRule.branch_id == branch_id,
                    DoctorFeeRule.department_id == department_id,
                    DoctorFeeRule.practitioner_id == practitioner_id,
                    DoctorFeeRule.appointment_type == appointment_type,
                    DoctorFeeRule.treatment_type == treatment_type,
                    DoctorFeeRule.is_active == True,  # noqa: E712
                )
            ).all()
        )

    def list_fee_rules(
        self, *, tenant_id: str, branch_id: str | None
    ) -> list[DoctorFeeRule]:
        statement = select(DoctorFeeRule).where(DoctorFeeRule.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(DoctorFeeRule.branch_id == branch_id)
        return list(
            self.session.exec(statement.order_by(DoctorFeeRule.created_at)).all()
        )

    def get_tax_rule(self, tax_rule_id: str) -> TaxRule | None:
        return self.session.get(TaxRule, tax_rule_id)

    def list_active_tax_rules(self, *, tenant_id: str) -> list[TaxRule]:
        return list(
            self.session.exec(
                select(TaxRule).where(
                    TaxRule.tenant_id == tenant_id,
                    TaxRule.is_active == True,  # noqa: E712
                )
            ).all()
        )

    def list_tax_rules(self, *, tenant_id: str, branch_id: str | None) -> list[TaxRule]:
        statement = select(TaxRule).where(TaxRule.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(TaxRule.branch_id == branch_id)
        return list(
            self.session.exec(statement.order_by(TaxRule.created_at.desc())).all()
        )

    def list_tax_rule_page(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
        list_sort: ListSort | None = None,
        limit: int = DEFAULT_LIST_LIMIT,
        offset: int = 0,
    ) -> list[TaxRule]:
        statement = self._tax_rule_statement(
            tenant_id=tenant_id,
            branch_id=branch_id,
            q=q,
            list_filters=list_filters,
        )
        statement = apply_list_sort(
            statement,
            TAX_RULE_LIST_SPEC,
            list_sort,
            default_order=[TaxRule.created_at.desc()],
        )
        return list(self.session.exec(statement.offset(offset).limit(limit)).all())

    def count_tax_rule_page(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
    ) -> int:
        filtered = self._tax_rule_statement(
            tenant_id=tenant_id,
            branch_id=branch_id,
            q=q,
            list_filters=list_filters,
        ).subquery()
        return int(self.session.exec(select(func.count()).select_from(filtered)).one())

    def tax_rule_filter_options(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
    ) -> dict[str, list[ListFilterOption]]:
        scope = (
            select(
                TaxRule.branch_id,
                Branch.name.label("branch_name"),
                TaxRule.service_scope,
                TaxRule.tax_label,
            )
            .outerjoin(Branch, Branch.id == TaxRule.branch_id)
            .where(TaxRule.tenant_id == tenant_id)
        )
        if branch_id:
            scope = scope.where(TaxRule.branch_id == branch_id)
        scoped = scope.subquery()
        return {
            "branch_id": labeled_filter_options(
                list(
                    self.session.exec(
                        select(scoped.c.branch_id, scoped.c.branch_name)
                        .distinct()
                        .order_by(scoped.c.branch_name)
                        .limit(100)
                    ).all()
                )
            ),
            "service_scope": list_filter_options(
                list(
                    self.session.exec(
                        select(scoped.c.service_scope)
                        .distinct()
                        .order_by(scoped.c.service_scope)
                        .limit(100)
                    ).all()
                )
            ),
            "tax_label": list_filter_options(
                list(
                    self.session.exec(
                        select(scoped.c.tax_label)
                        .distinct()
                        .order_by(scoped.c.tax_label)
                        .limit(100)
                    ).all()
                )
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

    def _tax_rule_statement(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        q: str | None,
        list_filters: list[ListFilter] | None,
    ):
        statement = select(TaxRule).where(TaxRule.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(TaxRule.branch_id == branch_id)
        if q:
            term = q.strip().lower()
            statement = statement.where(
                (func.lower(TaxRule.name).contains(term, autoescape=True))
                | (func.lower(TaxRule.tax_label).contains(term, autoescape=True))
                | (func.lower(TaxRule.service_scope).contains(term, autoescape=True))
            )
        if list_filters:
            statement = apply_list_filters(statement, TAX_RULE_LIST_SPEC, list_filters)
        return statement

    def get_discount_approval(self, approval_id: str) -> DiscountApproval | None:
        return self.session.get(DiscountApproval, approval_id)

    def get_discount_offer(self, offer_id: str) -> DiscountOffer | None:
        return self.session.get(DiscountOffer, offer_id)

    def list_active_discount_offers(self, *, tenant_id: str) -> list[DiscountOffer]:
        return list(
            self.session.exec(
                select(DiscountOffer).where(
                    DiscountOffer.tenant_id == tenant_id,
                    DiscountOffer.is_active == True,  # noqa: E712
                )
            ).all()
        )

    def list_discount_offers(
        self, *, tenant_id: str, branch_id: str | None
    ) -> list[DiscountOffer]:
        statement = select(DiscountOffer).where(DiscountOffer.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(
                (DiscountOffer.branch_id == branch_id)
                | (DiscountOffer.branch_id.is_(None))
            )
        return list(
            self.session.exec(statement.order_by(DiscountOffer.created_at.desc())).all()
        )

    def list_discount_offer_page(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
        list_sort: ListSort | None = None,
        limit: int = DEFAULT_LIST_LIMIT,
        offset: int = 0,
    ) -> list[DiscountOffer]:
        statement = self._discount_offer_statement(
            tenant_id=tenant_id,
            branch_id=branch_id,
            q=q,
            list_filters=list_filters,
        )
        statement = apply_list_sort(
            statement,
            DISCOUNT_OFFER_LIST_SPEC,
            list_sort,
            default_order=[DiscountOffer.created_at.desc()],
        )
        return list(self.session.exec(statement.offset(offset).limit(limit)).all())

    def count_discount_offer_page(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
    ) -> int:
        filtered = self._discount_offer_statement(
            tenant_id=tenant_id,
            branch_id=branch_id,
            q=q,
            list_filters=list_filters,
        ).subquery()
        return int(self.session.exec(select(func.count()).select_from(filtered)).one())

    def discount_offer_filter_options(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
    ) -> dict[str, list[ListFilterOption]]:
        scope = (
            select(
                DiscountOffer.branch_id,
                Branch.name.label("branch_name"),
                DiscountOffer.service_scope,
                DiscountOffer.discount_type,
            )
            .outerjoin(Branch, Branch.id == DiscountOffer.branch_id)
            .where(DiscountOffer.tenant_id == tenant_id)
        )
        if branch_id:
            scope = scope.where(
                (DiscountOffer.branch_id == branch_id)
                | (DiscountOffer.branch_id.is_(None))
            )
        scoped = scope.subquery()
        return {
            "branch_id": labeled_filter_options(
                list(
                    self.session.exec(
                        select(scoped.c.branch_id, scoped.c.branch_name)
                        .distinct()
                        .order_by(scoped.c.branch_name)
                        .limit(100)
                    ).all()
                )
            ),
            "service_scope": list_filter_options(
                list(
                    self.session.exec(
                        select(scoped.c.service_scope)
                        .distinct()
                        .order_by(scoped.c.service_scope)
                        .limit(100)
                    ).all()
                )
            ),
            "discount_type": list_filter_options(
                list(
                    self.session.exec(
                        select(scoped.c.discount_type)
                        .distinct()
                        .order_by(scoped.c.discount_type)
                        .limit(100)
                    ).all()
                )
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

    def _discount_offer_statement(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        q: str | None,
        list_filters: list[ListFilter] | None,
    ):
        statement = select(DiscountOffer).where(DiscountOffer.tenant_id == tenant_id)
        if branch_id:
            statement = statement.where(
                (DiscountOffer.branch_id == branch_id)
                | (DiscountOffer.branch_id.is_(None))
            )
        if q:
            term = q.strip().lower()
            statement = statement.where(
                (func.lower(DiscountOffer.name).contains(term, autoescape=True))
                | (func.lower(DiscountOffer.code).contains(term, autoescape=True))
                | (
                    func.lower(DiscountOffer.service_scope).contains(
                        term,
                        autoescape=True,
                    )
                )
            )
        if list_filters:
            statement = apply_list_filters(
                statement,
                DISCOUNT_OFFER_LIST_SPEC,
                list_filters,
            )
        return statement

    def list_lab_catalog_supplier_options(
        self, *, tenant_id: str, item_code: str | None, name: str | None
    ) -> list[LabTestCatalog | LabTestPackage]:
        rows: list[LabTestCatalog | LabTestPackage] = []
        if item_code:
            rows.extend(
                self.session.exec(
                    select(LabTestCatalog).where(
                        LabTestCatalog.tenant_id == tenant_id,
                        LabTestCatalog.id == item_code,
                    )
                ).all()
            )
            rows.extend(
                self.session.exec(
                    select(LabTestPackage).where(
                        LabTestPackage.tenant_id == tenant_id,
                        LabTestPackage.id == item_code,
                    )
                ).all()
            )
        if not rows and name:
            normalized_name = name.strip().lower()
            if normalized_name:
                rows.extend(
                    self.session.exec(
                        select(LabTestCatalog).where(
                            LabTestCatalog.tenant_id == tenant_id,
                            func.lower(LabTestCatalog.name) == normalized_name,
                        )
                    ).all()
                )
                rows.extend(
                    self.session.exec(
                        select(LabTestPackage).where(
                            LabTestPackage.tenant_id == tenant_id,
                            func.lower(LabTestPackage.name) == normalized_name,
                        )
                    ).all()
                )
        return rows

    def supplier_names(
        self, *, tenant_id: str, supplier_ids: list[str]
    ) -> dict[str, str]:
        if not supplier_ids:
            return {}
        suppliers = self.session.exec(
            select(PharmacySupplier).where(
                PharmacySupplier.tenant_id == tenant_id,
                PharmacySupplier.id.in_(supplier_ids),
            )
        ).all()
        return {supplier.id: supplier.name for supplier in suppliers}
