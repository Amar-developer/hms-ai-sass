from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.identity.models import User
from app.modules.item_catalog_validation import validate_unique_item_name
from app.modules.pharmacy.models import MedicineCatalog, PharmacySupplier
from app.modules.pharmacy.repositories import (
    PharmacyCatalogRepository,
    PharmacySupplierRepository,
)
from app.modules.pharmacy.schemas import (
    MedicineCreate,
    MedicineUpdate,
    SupplierCreate,
    SupplierUpdate,
)
from app.modules.settings.numbering import next_document_number
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


def create_medicine_record(
    session: Session, *, tenant_id: str, payload: MedicineCreate, actor: User
) -> MedicineCatalog:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    if payload.branch_id:
        require_user_branch_access(actor, payload.branch_id)
    data = payload.model_dump()
    data["name"] = validate_unique_item_name(
        session, tenant_id=tenant_id, name=payload.name
    )
    medicine = MedicineCatalog.model_validate(data, update={"tenant_id": tenant_id})
    session.add(medicine)
    session.commit()
    session.refresh(medicine)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=medicine.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="medicine.created",
        resource_type="medicine_catalog",
        resource_id=medicine.id,
        purpose="pharmacy",
    )
    return medicine


def update_medicine_record(
    session: Session,
    *,
    tenant_id: str,
    medicine_id: str,
    payload: MedicineUpdate,
    actor: User,
) -> MedicineCatalog:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    medicine = PharmacyCatalogRepository(session).get_medicine_for_tenant(
        tenant_id=tenant_id,
        medicine_id=medicine_id,
    )
    if not medicine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found"
        )
    require_user_branch_access(actor, medicine.branch_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("name"):
        data["name"] = validate_unique_item_name(
            session,
            tenant_id=tenant_id,
            name=data["name"],
            exclude_model=MedicineCatalog,
            exclude_id=medicine.id,
        )
    next_branch_id = data.get("branch_id", medicine.branch_id)
    if next_branch_id:
        require_user_branch_access(actor, next_branch_id)
    before = {key: getattr(medicine, key) for key in data}
    for key, value in data.items():
        setattr(medicine, key, value)
    medicine.updated_at = now_utc()
    if payload.updated_by_user_id:
        medicine.updated_by_user_id = payload.updated_by_user_id
    session.add(medicine)
    session.commit()
    session.refresh(medicine)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=medicine.branch_id,
        actor_user_id=payload.updated_by_user_id,
        action="medicine.updated",
        resource_type="medicine_catalog",
        resource_id=medicine.id,
        purpose="pharmacy",
        changes=diff_changes(before, data),
    )
    return medicine


def delete_medicine_record(
    session: Session, *, tenant_id: str, medicine_id: str, actor: User
) -> MedicineCatalog:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    medicine = PharmacyCatalogRepository(session).get_medicine_for_tenant(
        tenant_id=tenant_id,
        medicine_id=medicine_id,
    )
    if not medicine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Medicine not found"
        )
    require_user_branch_access(actor, medicine.branch_id)
    medicine.is_active = False
    medicine.updated_at = now_utc()
    medicine.updated_by_user_id = actor.id
    session.add(medicine)
    session.commit()
    session.refresh(medicine)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=medicine.branch_id,
        actor_user_id=actor.id,
        action="medicine.deleted",
        resource_type="medicine_catalog",
        resource_id=medicine.id,
        purpose="pharmacy",
    )
    return medicine


def create_supplier_record(
    session: Session, *, tenant_id: str, payload: SupplierCreate
) -> PharmacySupplier:
    supplier = PharmacySupplier.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "supplier_number": next_document_number(
                session, tenant_id=tenant_id, entity="supplier"
            ),
        },
    )
    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    return supplier


def list_supplier_records(
    session: Session,
    *,
    tenant_id: str,
    include_inactive: bool,
) -> list[PharmacySupplier]:
    return PharmacySupplierRepository(session).list_for_tenant(
        tenant_id=tenant_id,
        include_inactive=include_inactive,
    )


def update_supplier_record(
    session: Session, *, tenant_id: str, supplier_id: str, payload: SupplierUpdate
) -> PharmacySupplier:
    supplier = PharmacySupplierRepository(session).get_for_tenant(
        tenant_id=tenant_id,
        supplier_id=supplier_id,
    )
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found"
        )
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(supplier, key, value)
    supplier.updated_at = datetime.now(timezone.utc)
    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    return supplier


def delete_supplier_record(
    session: Session, *, tenant_id: str, supplier_id: str
) -> PharmacySupplier:
    supplier = PharmacySupplierRepository(session).get_for_tenant(
        tenant_id=tenant_id,
        supplier_id=supplier_id,
    )
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found"
        )
    supplier.is_active = False
    supplier.updated_at = datetime.now(timezone.utc)
    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    return supplier
