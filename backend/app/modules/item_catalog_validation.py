from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.modules.home_care.models import HomeCareService
from app.modules.lab.models import LabTestCatalog, LabTestPackage
from app.modules.pharmacy.models import MedicineCatalog
from app.modules.physiotherapy.models import PhysiotherapyEquipment


ITEM_NAME_MODELS = (
    MedicineCatalog,
    LabTestCatalog,
    LabTestPackage,
    PhysiotherapyEquipment,
    HomeCareService,
)


def validate_unique_item_name(
    session: Session,
    *,
    tenant_id: str,
    name: str,
    exclude_model: type[Any] | None = None,
    exclude_id: str | None = None,
) -> str:
    """Return a cleaned item name or raise when an active tenant item uses it."""
    cleaned_name = " ".join(name.split())
    normalized_name = cleaned_name.lower()

    for model in ITEM_NAME_MODELS:
        statement = select(model.id).where(
            model.tenant_id == tenant_id,
            model.is_active == True,  # noqa: E712
            func.lower(func.trim(model.name)) == normalized_name,
        )
        if model is exclude_model and exclude_id:
            statement = statement.where(model.id != exclude_id)
        if session.exec(statement).first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f'An item named "{cleaned_name}" already exists.',
            )

    return cleaned_name
