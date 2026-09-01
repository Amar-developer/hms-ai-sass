from decimal import Decimal

from sqlmodel import Session

from app.core.list_filters import parse_list_filters, parse_list_sort
from app.modules.billing.models import DiscountOffer, DiscountType, TaxRule
from app.modules.billing.repositories.reference_repository import (
    BillingReferenceRepository,
)
from app.modules.billing.schemas import DiscountOfferUpdate, TaxRuleUpdate
from app.modules.billing.services.configuration import (
    update_discount_offer,
    update_tax_rule,
)
from app.modules.identity.models import User
from app.modules.home_care.models import HomeCareService
from app.modules.home_care.repositories import HomeCareServiceRepository
from app.modules.lab.models import LabTestCatalog, LabTestPackage
from app.modules.lab.repositories import LabCatalogRepository
from app.modules.lab.schemas import (
    LabTestCatalogCreate,
    LabTestCatalogUpdate,
    LabTestPackageCreate,
    LabTestPackageUpdate,
)
from app.modules.lab.services.catalog_service import (
    create_lab_package_record,
    create_lab_test_record,
    update_lab_package_record,
    update_lab_test_record,
)
from app.modules.pharmacy.models import MedicineCatalog, PharmacySupplier
from app.modules.pharmacy.repositories import (
    PharmacyCatalogRepository,
    PharmacySupplierRepository,
)
from app.modules.pharmacy.schemas import MedicineCreate, MedicineUpdate, SupplierUpdate
from app.modules.pharmacy.services.catalog_service import (
    create_medicine_record,
    update_medicine_record,
    update_supplier_record,
)
from app.modules.physiotherapy.models import PhysiotherapyEquipment
from app.modules.physiotherapy.repositories import PhysiotherapyEquipmentRepository
from app.modules.tenants.models import Branch, Tenant


def _tenant_branch_user(session: Session):
    tenant = Tenant(name="Settings Catalog Clinic")
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
    user = User(
        tenant_id=tenant.id,
        branch_id=branch.id,
        name="Catalog Admin",
        email="catalog-admin@example.test",
    )
    session.add(branch)
    session.add(user)
    session.commit()
    session.refresh(branch)
    session.refresh(user)
    return tenant, branch, user


def test_supplier_repository_applies_dynamic_filter_before_pagination(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, _user = _tenant_branch_user(session)
        session.add(
            PharmacySupplier(
                tenant_id=tenant.id,
                name="Alpha Pharma",
                gstin="GST-ALPHA",
                is_active=True,
            )
        )
        session.add(
            PharmacySupplier(
                tenant_id=tenant.id,
                name="Beta Pharma",
                gstin="GST-BETA",
                is_active=False,
            )
        )
        session.commit()

        rows = PharmacySupplierRepository(session).list_page(
            tenant_id=tenant.id,
            include_inactive=True,
            list_filters=parse_list_filters(
                '[{"field":"is_active","operator":"equals","value":"true"}]'
            ),
            limit=1,
            offset=0,
        )
        total = PharmacySupplierRepository(session).count_page(
            tenant_id=tenant.id,
            include_inactive=True,
            list_filters=parse_list_filters(
                '[{"field":"is_active","operator":"equals","value":"true"}]'
            ),
        )

    assert total == 1
    assert [row.name for row in rows] == ["Alpha Pharma"]


def test_supplier_repository_applies_dynamic_sort_before_pagination(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, _user = _tenant_branch_user(session)
        session.add(PharmacySupplier(tenant_id=tenant.id, name="Beta Pharma"))
        session.add(PharmacySupplier(tenant_id=tenant.id, name="Alpha Pharma"))
        session.commit()

        rows = PharmacySupplierRepository(session).list_page(
            tenant_id=tenant.id,
            include_inactive=True,
            list_sort=parse_list_sort('{"key":"name","dir":"asc"}'),
            limit=1,
            offset=0,
        )

    assert [row.name for row in rows] == ["Alpha Pharma"]


def test_medicine_catalog_repository_filters_sort_and_options_are_data_backed(
    test_engine,
):
    with Session(test_engine) as session:
        tenant, branch, user = _tenant_branch_user(session)
        user_id = user.id
        branch_id = branch.id
        supplier = PharmacySupplier(
            tenant_id=tenant.id,
            name="Alpha Pharma",
            created_by_user_id=user_id,
            updated_by_user_id=user_id,
        )
        session.add(supplier)
        session.commit()
        session.refresh(supplier)
        supplier_id = supplier.id
        session.add(
            MedicineCatalog(
                tenant_id=tenant.id,
                branch_id=branch_id,
                code="MED-B",
                name="Beta Tablet",
                generic_name="Beta",
                form="Tablet",
                manufacturer="Acme Labs",
                supplier_id=supplier_id,
                default_sale_price=120,
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
            )
        )
        session.add(
            MedicineCatalog(
                tenant_id=tenant.id,
                code="MED-A",
                name="Alpha Syrup",
                generic_name="Alpha",
                form="Syrup",
                manufacturer="Zen Labs",
                default_sale_price=80,
            )
        )
        session.commit()

        repository = PharmacyCatalogRepository(session)
        rows = repository.list_page(
            tenant_id=tenant.id,
            branch_id=None,
            include_inactive=True,
            list_filters=parse_list_filters(
                '[{"field":"manufacturer","operator":"equals","value":"Acme Labs"}]'
            ),
            limit=1,
            offset=0,
        )
        total = repository.count_page(
            tenant_id=tenant.id,
            branch_id=None,
            include_inactive=True,
            list_filters=parse_list_filters(
                '[{"field":"manufacturer","operator":"equals","value":"Acme Labs"}]'
            ),
        )
        sorted_rows = repository.list_page(
            tenant_id=tenant.id,
            branch_id=None,
            include_inactive=True,
            list_sort=parse_list_sort('{"key":"default_sale_price","dir":"asc"}'),
            limit=1,
            offset=0,
        )
        options = repository.filter_options(tenant_id=tenant.id)

    assert total == 1
    assert [row.name for row in rows] == ["Beta Tablet"]
    assert [row.name for row in sorted_rows] == ["Alpha Syrup"]
    assert {"value": branch_id, "label": "Main Branch"} in [
        row.model_dump() for row in options["branch_id"]
    ]
    assert {"value": supplier_id, "label": "Alpha Pharma"} in [
        row.model_dump() for row in options["supplier_id"]
    ]
    assert {"value": "Tablet", "label": "Tablet"} in [
        row.model_dump() for row in options["form"]
    ]
    assert {"value": "Acme Labs", "label": "Acme Labs"} in [
        row.model_dump() for row in options["manufacturer"]
    ]
    assert {"value": user_id, "label": "Catalog Admin"} in [
        row.model_dump() for row in options["created_by_user_id"]
    ]
    assert {"value": user_id, "label": "Catalog Admin"} in [
        row.model_dump() for row in options["updated_by_user_id"]
    ]


def test_tax_rule_repository_filters_and_options_are_data_backed(test_engine):
    with Session(test_engine) as session:
        tenant, branch, user = _tenant_branch_user(session)
        user_id = user.id
        branch_id = branch.id
        session.add(
            TaxRule(
                tenant_id=tenant.id,
                branch_id=branch_id,
                name="GST OPD",
                tax_percentage=Decimal("5.00"),
                tax_label="GST",
                service_scope="opd",
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
            )
        )
        session.add(
            TaxRule(
                tenant_id=tenant.id,
                name="VAT Lab",
                tax_percentage=Decimal("12.00"),
                tax_label="VAT",
                service_scope="lab",
            )
        )
        session.commit()

        repository = BillingReferenceRepository(session)
        rows = repository.list_tax_rule_page(
            tenant_id=tenant.id,
            branch_id=None,
            list_filters=parse_list_filters(
                '[{"field":"service_scope","operator":"equals","value":"opd"}]'
            ),
        )
        options = repository.tax_rule_filter_options(
            tenant_id=tenant.id,
            branch_id=None,
        )

    assert [row.name for row in rows] == ["GST OPD"]
    assert {"value": branch_id, "label": "Main Branch"} in [
        row.model_dump() for row in options["branch_id"]
    ]
    assert {"value": user_id, "label": "Catalog Admin"} in [
        row.model_dump() for row in options["created_by_user_id"]
    ]
    assert {"value": user_id, "label": "Catalog Admin"} in [
        row.model_dump() for row in options["updated_by_user_id"]
    ]


def test_discount_offer_repository_filters_and_options_are_data_backed(test_engine):
    with Session(test_engine) as session:
        tenant, branch, user = _tenant_branch_user(session)
        user_id = user.id
        branch_id = branch.id
        session.add(
            DiscountOffer(
                tenant_id=tenant.id,
                branch_id=branch_id,
                name="Welcome OPD",
                code="WELCOME",
                service_scope="opd",
                discount_type=DiscountType.PERCENTAGE,
                value=Decimal("10.00"),
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
            )
        )
        session.add(
            DiscountOffer(
                tenant_id=tenant.id,
                name="Lab Flat",
                code="LABFLAT",
                service_scope="lab",
                discount_type=DiscountType.FIXED,
                value=Decimal("100.00"),
            )
        )
        session.commit()

        repository = BillingReferenceRepository(session)
        rows = repository.list_discount_offer_page(
            tenant_id=tenant.id,
            branch_id=None,
            list_filters=parse_list_filters(
                '[{"field":"discount_type","operator":"equals","value":"percentage"}]'
            ),
        )
        options = repository.discount_offer_filter_options(
            tenant_id=tenant.id,
            branch_id=None,
        )

    assert [row.name for row in rows] == ["Welcome OPD"]
    assert {"value": branch_id, "label": "Main Branch"} in [
        row.model_dump() for row in options["branch_id"]
    ]
    assert {"value": user_id, "label": "Catalog Admin"} in [
        row.model_dump() for row in options["created_by_user_id"]
    ]
    assert {"value": user_id, "label": "Catalog Admin"} in [
        row.model_dump() for row in options["updated_by_user_id"]
    ]


def test_settings_catalog_update_services_set_updated_by_user(test_engine):
    with Session(test_engine) as session:
        tenant, branch, user = _tenant_branch_user(session)
        tenant.is_primary = True
        session.add(tenant)
        session.commit()
        user_id = user.id
        supplier = PharmacySupplier(
            tenant_id=tenant.id,
            name="Alpha Pharma",
            created_by_user_id=user_id,
        )
        tax_rule = TaxRule(
            tenant_id=tenant.id,
            branch_id=branch.id,
            name="GST OPD",
            tax_percentage=Decimal("5.00"),
            service_scope="opd",
            created_by_user_id=user_id,
        )
        offer = DiscountOffer(
            tenant_id=tenant.id,
            branch_id=branch.id,
            name="Welcome OPD",
            service_scope="opd",
            discount_type=DiscountType.PERCENTAGE,
            value=Decimal("10.00"),
            created_by_user_id=user_id,
        )
        session.add(supplier)
        session.add(tax_rule)
        session.add(offer)
        session.commit()
        session.refresh(supplier)
        session.refresh(tax_rule)
        session.refresh(offer)

        supplier = update_supplier_record(
            session,
            tenant_id=tenant.id,
            supplier_id=supplier.id,
            payload=SupplierUpdate(name="Alpha Pharma Updated"),
            actor=user,
        )
        tax_rule = update_tax_rule(
            session,
            tenant_id=tenant.id,
            rule_id=tax_rule.id,
            payload=TaxRuleUpdate(name="GST OPD Updated"),
            actor=user,
        )
        offer = update_discount_offer(
            session,
            tenant_id=tenant.id,
            offer_id=offer.id,
            payload=DiscountOfferUpdate(name="Welcome OPD Updated"),
            actor=user,
        )
        updated_values = (
            supplier.updated_by_user_id,
            tax_rule.updated_by_user_id,
            offer.updated_by_user_id,
        )

    assert updated_values == (user_id, user_id, user_id)


def test_medicine_create_update_services_set_audit_users(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, user = _tenant_branch_user(session)
        user_id = user.id
        tenant.is_primary = True
        session.add(tenant)
        session.commit()

        medicine = create_medicine_record(
            session,
            tenant_id=tenant.id,
            payload=MedicineCreate(
                code="AUD-001",
                name="Audit Tablet",
            ),
            actor=user,
        )
        medicine = update_medicine_record(
            session,
            tenant_id=tenant.id,
            medicine_id=medicine.id,
            payload=MedicineUpdate(name="Audit Tablet Updated"),
            actor=user,
        )
        audit_values = (medicine.created_by_user_id, medicine.updated_by_user_id)

    assert audit_values == (user_id, user_id)


def test_lab_catalog_repositories_filter_sort_and_options_are_data_backed(
    test_engine,
):
    with Session(test_engine) as session:
        tenant, branch, user = _tenant_branch_user(session)
        user_id = user.id
        branch_id = branch.id
        supplier = PharmacySupplier(
            tenant_id=tenant.id,
            name="Lab Supplier",
            created_by_user_id=user_id,
            updated_by_user_id=user_id,
        )
        session.add(supplier)
        session.commit()
        session.refresh(supplier)
        supplier_id = supplier.id
        session.add(
            LabTestCatalog(
                tenant_id=tenant.id,
                branch_id=branch_id,
                code="LAB-B",
                name="Beta CBC",
                department="Hematology",
                sample_type="Blood",
                supplier_id=supplier_id,
                default_price=200,
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
            )
        )
        session.add(
            LabTestCatalog(
                tenant_id=tenant.id,
                code="LAB-A",
                name="Alpha Urine",
                department="Pathology",
                sample_type="Urine",
                default_price=120,
            )
        )
        session.add(
            LabTestPackage(
                tenant_id=tenant.id,
                branch_id=branch_id,
                code="PKG-B",
                name="Beta Health",
                description="Full body",
                supplier_id=supplier_id,
                package_price=800,
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
            )
        )
        session.add(
            LabTestPackage(
                tenant_id=tenant.id,
                code="PKG-A",
                name="Alpha Basic",
                description="Basic",
                package_price=300,
            )
        )
        session.commit()

        repository = LabCatalogRepository(session)
        test_rows = repository.list_test_page(
            tenant_id=tenant.id,
            branch_id=None,
            include_inactive=True,
            list_filters=parse_list_filters(
                '[{"field":"department","operator":"equals","value":"Hematology"}]'
            ),
            limit=1,
            offset=0,
        )
        test_total = repository.count_test_page(
            tenant_id=tenant.id,
            branch_id=None,
            include_inactive=True,
            list_filters=parse_list_filters(
                '[{"field":"department","operator":"equals","value":"Hematology"}]'
            ),
        )
        package_rows = repository.list_package_page(
            tenant_id=tenant.id,
            branch_id=None,
            include_inactive=True,
            list_sort=parse_list_sort('{"key":"package_price","dir":"asc"}'),
            limit=1,
            offset=0,
        )
        test_options = repository.catalog_filter_options(
            tenant_id=tenant.id,
            catalog="tests",
        )
        package_options = repository.catalog_filter_options(
            tenant_id=tenant.id,
            catalog="packages",
        )

    assert test_total == 1
    assert [row.name for row in test_rows] == ["Beta CBC"]
    assert [row.name for row in package_rows] == ["Alpha Basic"]
    assert {"value": branch_id, "label": "Main Branch"} in [
        row.model_dump() for row in test_options["branch_id"]
    ]
    assert {"value": supplier_id, "label": "Lab Supplier"} in [
        row.model_dump() for row in package_options["supplier_id"]
    ]
    assert {"value": "Hematology", "label": "Hematology"} in [
        row.model_dump() for row in test_options["department"]
    ]
    assert {"value": "Blood", "label": "Blood"} in [
        row.model_dump() for row in test_options["sample_type"]
    ]
    assert {"value": user_id, "label": "Catalog Admin"} in [
        row.model_dump() for row in test_options["created_by_user_id"]
    ]
    assert {"value": user_id, "label": "Catalog Admin"} in [
        row.model_dump() for row in package_options["updated_by_user_id"]
    ]


def test_lab_catalog_create_update_services_set_audit_users(test_engine):
    with Session(test_engine) as session:
        tenant, _branch, user = _tenant_branch_user(session)
        tenant.is_primary = True
        session.add(tenant)
        session.commit()
        user_id = user.id

        lab_test = create_lab_test_record(
            session,
            tenant_id=tenant.id,
            payload=LabTestCatalogCreate(code="AUD-LAB", name="Audit Lab Test"),
            current_user=user,
        )
        lab_test = update_lab_test_record(
            session,
            tenant_id=tenant.id,
            test_id=lab_test.id,
            payload=LabTestCatalogUpdate(name="Audit Lab Test Updated"),
            current_user=user,
        )
        package = create_lab_package_record(
            session,
            tenant_id=tenant.id,
            payload=LabTestPackageCreate(code="AUD-PKG", name="Audit Lab Package"),
            current_user=user,
        )
        package = update_lab_package_record(
            session,
            tenant_id=tenant.id,
            package_id=package.id,
            payload=LabTestPackageUpdate(name="Audit Lab Package Updated"),
            current_user=user,
        )
        audit_values = (
            lab_test.created_by_user_id,
            lab_test.updated_by_user_id,
            package.created_by_user_id,
            package.updated_by_user_id,
        )

    assert audit_values == (user_id, user_id, user_id, user_id)


def test_remaining_item_catalog_repositories_filter_sort_and_options_are_data_backed(
    test_engine,
):
    with Session(test_engine) as session:
        tenant, branch, user = _tenant_branch_user(session)
        user_id = user.id
        branch_id = branch.id
        supplier = PharmacySupplier(
            tenant_id=tenant.id,
            name="Physio Supplier",
            created_by_user_id=user_id,
            updated_by_user_id=user_id,
        )
        session.add(supplier)
        session.commit()
        session.refresh(supplier)
        supplier_id = supplier.id
        session.add(
            PhysiotherapyEquipment(
                tenant_id=tenant.id,
                branch_id=branch_id,
                name="IFT Machine",
                modality_type="ift",
                manufacturer="Acme",
                supplier_id=supplier_id,
                mrp_price=10000,
                is_portable=True,
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
            )
        )
        session.add(
            PhysiotherapyEquipment(
                tenant_id=tenant.id,
                name="TENS Machine",
                modality_type="tens",
                manufacturer="Zen",
                mrp_price=7000,
            )
        )
        session.add(
            HomeCareService(
                tenant_id=tenant.id,
                branch_id=branch_id,
                code="HV-NURSE",
                name="Nurse Visit",
                description="Home visit nursing",
                default_price=600,
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
            )
        )
        session.add(
            HomeCareService(
                tenant_id=tenant.id,
                code="HV-DOCTOR",
                name="Doctor Visit",
                description="Home visit doctor",
                default_price=1200,
            )
        )
        session.commit()

        physio_repository = PhysiotherapyEquipmentRepository(session)
        physio_rows = physio_repository.list_page(
            tenant_id=tenant.id,
            branch_id=None,
            include_inactive=True,
            list_filters=parse_list_filters(
                '[{"field":"modality_type","operator":"equals","value":"ift"}]'
            ),
            limit=1,
            offset=0,
        )
        physio_options = physio_repository.filter_options(tenant_id=tenant.id)
        home_repository = HomeCareServiceRepository(session)
        home_rows = home_repository.list_page(
            tenant_id=tenant.id,
            branch_id=None,
            include_inactive=True,
            list_sort=parse_list_sort('{"key":"default_price","dir":"asc"}'),
            limit=1,
            offset=0,
        )
        home_options = home_repository.filter_options(tenant_id=tenant.id)

    assert [row.name for row in physio_rows] == ["IFT Machine"]
    assert [row.name for row in home_rows] == ["Nurse Visit"]
    assert {"value": supplier_id, "label": "Physio Supplier"} in [
        row.model_dump() for row in physio_options["supplier_id"]
    ]
    assert {"value": "ift", "label": "ift"} in [
        row.model_dump() for row in physio_options["modality_type"]
    ]
    assert {"value": "Acme", "label": "Acme"} in [
        row.model_dump() for row in physio_options["manufacturer"]
    ]
    assert {"value": branch_id, "label": "Main Branch"} in [
        row.model_dump() for row in home_options["branch_id"]
    ]
    assert {"value": user_id, "label": "Catalog Admin"} in [
        row.model_dump() for row in physio_options["created_by_user_id"]
    ]
    assert {"value": user_id, "label": "Catalog Admin"} in [
        row.model_dump() for row in home_options["updated_by_user_id"]
    ]
