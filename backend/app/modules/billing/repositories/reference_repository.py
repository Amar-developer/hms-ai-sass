from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.billing.models import (
    DiscountApproval,
    DiscountOffer,
    DoctorFeeRule,
    TaxRule,
)
from app.modules.lab.models import LabTestCatalog, LabTestPackage
from app.modules.pharmacy.models import PharmacySupplier
from app.modules.practitioners.models import Practitioner, PractitionerDepartment


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

    def get_discount_offer(self, offer_id: str) -> DiscountOffer | None:
        return self.session.get(DiscountOffer, offer_id)

    def get_discount_approval(self, approval_id: str) -> DiscountApproval | None:
        return self.session.get(DiscountApproval, approval_id)

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
