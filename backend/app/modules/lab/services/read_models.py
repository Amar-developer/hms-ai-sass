import json

from sqlmodel import Session

from app.modules.lab.models import LabResultTemplate, LabTestPackage
from app.modules.lab.repositories import LabCatalogRepository
from app.modules.lab.schemas import LabResultTemplateRead, LabTestPackageRead


def template_read(template: LabResultTemplate) -> LabResultTemplateRead:
    try:
        content = json.loads(template.content_json or "{}")
    except json.JSONDecodeError:
        content = {}
    return LabResultTemplateRead(
        id=template.id,
        tenant_id=template.tenant_id,
        test_id=template.test_id,
        name=template.name,
        content=content,
        is_active=template.is_active,
        created_by_user_id=template.created_by_user_id,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def package_read(session: Session, package: LabTestPackage) -> LabTestPackageRead:
    item_rows = LabCatalogRepository(session).list_package_items(
        tenant_id=package.tenant_id,
        package_id=package.id,
    )
    return LabTestPackageRead(
        id=package.id,
        tenant_id=package.tenant_id,
        branch_id=package.branch_id,
        code=package.code,
        name=package.name,
        description=package.description,
        mrp_price=package.mrp_price,
        package_price=package.package_price,
        supplier_id=package.supplier_id,
        purchase_price=package.purchase_price,
        test_ids=[item.test_id for item in item_rows],
        is_active=package.is_active,
        created_by_user_id=package.created_by_user_id,
        updated_by_user_id=package.updated_by_user_id,
        created_at=package.created_at,
        updated_at=package.updated_at,
    )


_template_read = template_read
_package_read = package_read
