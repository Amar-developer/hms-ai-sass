import re

from sqlmodel import Session

from app.modules.lab.models import LabTestCatalog, LabTestPackage
from app.modules.lab.repositories import LabCatalogRepository


def catalog_key(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def find_lab_test(
    session: Session, tenant_id: str, branch_id: str, test_name: str
) -> LabTestCatalog | None:
    requested = catalog_key(test_name)
    if not requested:
        return None
    tests = LabCatalogRepository(session).list_active_tests(tenant_id=tenant_id)

    def score(row: LabTestCatalog) -> int:
        # Catalog items are tenant-scoped, so match purely on name/code within
        # the tenant. Branch must never influence the match, otherwise an
        # unrelated test gets returned just because it carries the order branch.
        keys = [catalog_key(row.name), catalog_key(row.code)]
        value = 0
        for key in keys:
            if not key:
                continue
            if key == requested:
                value = max(value, 100)
            elif requested in key or key in requested:
                value = max(value, 70)
        return value

    matches = sorted(
        ((score(row), row) for row in tests), key=lambda item: item[0], reverse=True
    )
    return matches[0][1] if matches and matches[0][0] > 0 else None


def find_lab_package(
    session: Session, tenant_id: str, branch_id: str, package_name: str
) -> LabTestPackage | None:
    requested = catalog_key(package_name)
    if not requested:
        return None
    packages = LabCatalogRepository(session).list_active_packages(tenant_id=tenant_id)

    def score(row: LabTestPackage) -> int:
        keys = [catalog_key(row.name), catalog_key(row.code)]
        value = 0
        for key in keys:
            if not key:
                continue
            if key == requested:
                value = max(value, 100)
            elif requested in key or key in requested:
                value = max(value, 70)
        return value

    matches = sorted(
        ((score(row), row) for row in packages), key=lambda item: item[0], reverse=True
    )
    return matches[0][1] if matches and matches[0][0] > 0 else None


def normalize_local_lab_test(row: LabTestCatalog) -> dict[str, object]:
    return {
        "id": row.id,
        "name": row.name,
        "item_name": row.name,
        "slug": row.code or row.id,
        "code": row.code,
        "source": "local",
        "item_type": "lab_test",
        "kind": "Lab Test",
        "category": "Lab Test",
        "sample_type": row.sample_type,
        "mrp_price": row.mrp_price,
        "selling_price": row.default_price,
        "price": row.default_price,
        "buying_price": row.purchase_price,
        "supplier_id": row.supplier_id,
    }


def normalize_local_lab_package(row: LabTestPackage) -> dict[str, object]:
    return {
        "id": row.id,
        "name": row.name,
        "item_name": row.name,
        "slug": row.code or row.id,
        "code": row.code,
        "source": "local",
        "item_type": "lab_package",
        "kind": "Service",
        "category": "Service",
        "description": row.description,
        "mrp_price": row.mrp_price,
        "selling_price": row.package_price,
        "price": row.package_price,
        "buying_price": row.purchase_price,
        "supplier_id": row.supplier_id,
        "package_id": row.id,
    }


def price_payload(
    *,
    price: int,
    mrp_price: int = 0,
    selling_price: int = 0,
    buying_price: int = 0,
    supplier_id: str | None = None,
    external_source: str | None = None,
    external_slug: str | None = None,
    external_item_code: str | None = None,
) -> dict[str, int | str | None]:
    selling = selling_price or price
    return {
        "price": selling,
        "mrp_price": mrp_price,
        "selling_price": selling,
        "buying_price": buying_price,
        "supplier_id": supplier_id,
        "external_source": external_source,
        "external_slug": external_slug,
        "external_item_code": external_item_code,
    }


def local_lab_price(test: LabTestCatalog | None) -> dict[str, int | str | None]:
    if not test:
        return price_payload(price=0)
    return price_payload(
        price=test.default_price,
        mrp_price=test.mrp_price or test.default_price,
        selling_price=test.default_price,
        buying_price=test.purchase_price,
        supplier_id=test.supplier_id,
    )


def resolve_lab_price(
    test: LabTestCatalog | None,
    item_name: str,
    external_item_code: str | None = None,
    external_slug: str | None = None,
) -> dict[str, int | str | None]:
    """Price a lab item from the tenant local catalog only."""
    return local_lab_price(test)


_catalog_key = catalog_key
_find_lab_test = find_lab_test
_find_lab_package = find_lab_package
_normalize_local_lab_test = normalize_local_lab_test
_normalize_local_lab_package = normalize_local_lab_package
_price_payload = price_payload
_local_lab_price = local_lab_price
_resolve_lab_price = resolve_lab_price
