import pytest
from fastapi import HTTPException
from sqlmodel import Session

from app.modules.item_catalog_validation import validate_unique_item_name
from app.modules.pharmacy.models import MedicineCatalog
from app.modules.tenants.models import Tenant, TenantStatus


def test_item_names_are_unique_across_tenant_catalogs(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Item Validation Clinic", status=TenantStatus.ACTIVE)
        other_tenant = Tenant(name="Other Item Clinic", status=TenantStatus.ACTIVE)
        session.add(tenant)
        session.add(other_tenant)
        session.commit()
        session.refresh(tenant)
        session.refresh(other_tenant)

        medicine = MedicineCatalog(
            tenant_id=tenant.id,
            code="MED-VITC",
            name="Vitamin C",
        )
        session.add(medicine)
        session.commit()
        session.refresh(medicine)

        with pytest.raises(HTTPException) as duplicate:
            validate_unique_item_name(
                session,
                tenant_id=tenant.id,
                name="  vitamin c  ",
            )

        assert duplicate.value.status_code == 409
        assert duplicate.value.detail == 'An item named "vitamin c" already exists.'
        assert (
            validate_unique_item_name(
                session,
                tenant_id=tenant.id,
                name="Vitamin C",
                exclude_model=MedicineCatalog,
                exclude_id=medicine.id,
            )
            == "Vitamin C"
        )
        assert (
            validate_unique_item_name(
                session,
                tenant_id=other_tenant.id,
                name="Vitamin C",
            )
            == "Vitamin C"
        )
