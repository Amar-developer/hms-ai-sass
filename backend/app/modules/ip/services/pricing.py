from sqlmodel import Session

from app.modules.ip.repositories import IPCatalogRepository


def _catalog_key(value: str | None) -> str:
    return "".join(ch for ch in (value or "").lower() if ch.isalnum())


def medicine_catalog_price(session: Session, tenant_id: str, medicine_name: str) -> int:
    requested = _catalog_key(medicine_name)
    if not requested:
        return 0
    medicines = IPCatalogRepository(session).list_medicines(tenant_id=tenant_id)
    for medicine in medicines:
        keys = [
            _catalog_key(medicine.name),
            _catalog_key(medicine.code),
            _catalog_key(medicine.generic_name),
        ]
        if requested in keys or any(
            requested and (requested in key or key in requested) for key in keys
        ):
            return int(medicine.default_sale_price or 0)
    return 0


def lab_catalog_price(session: Session, tenant_id: str, test_name: str) -> int:
    requested = _catalog_key(test_name)
    if not requested:
        return 0
    tests = IPCatalogRepository(session).list_lab_tests(tenant_id=tenant_id)
    for test in tests:
        keys = [_catalog_key(test.name), _catalog_key(test.code)]
        if requested in keys or any(
            requested and (requested in key or key in requested) for key in keys
        ):
            return int(test.default_price or 0)
    return 0
