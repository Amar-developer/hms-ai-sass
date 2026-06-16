import json
import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from app.core.access_control import require_user_branch_access, scoped_branch_id
from app.core.auth import require_any_permission, require_permission
from app.core.config import get_settings
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.audit.service import record_audit_event
from app.modules.consultations.models import Consultation, ConsultationReferral
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.lab.models import (
    LabOrder,
    LabOrderItem,
    LabOrderSource,
    LabOrderStatus,
    LabResult,
    LabResultTemplate,
    LabSample,
    LabTestCatalog,
    LabTestPackage,
    LabTestPackageItem,
)
from app.modules.lab.schemas import (
    LabOrderItemRead,
    LabOrderCreate,
    LabOrderDetailRead,
    LabOrderFromConsultation,
    LabOrderRead,
    LabOrderStatusUpdate,
    LabResultCreate,
    LabResultRead,
    LabResultTemplateCreate,
    LabResultTemplateRead,
    LabSampleCreate,
    LabSampleRead,
    LabTestCatalogCreate,
    LabTestCatalogRead,
    LabTestCatalogUpdate,
    LabTestPackageCreate,
    LabTestPackageRead,
    LabTestPackageUpdate,
)
from app.modules.files.service import record_file_document
from app.modules.integrations.frappe import FrappeCatalogClient
from app.modules.settings.numbering import next_document_number
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.notifications.models import NotificationEventType, NotificationProvider
from app.modules.notifications.service import queue_notification_if_allowed
from app.modules.patients.models import Patient
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import Branch, now_utc

router = APIRouter(prefix="/lab")

logger = logging.getLogger(__name__)


def _catalog_key(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def _slugify(value: str | None) -> str:
    """Kebab-case slug, matching ERPNext lab item slugs (e.g. 'random-blood-sugar')."""
    return re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")


def _find_lab_test(session: Session, tenant_id: str, branch_id: str, test_name: str) -> LabTestCatalog | None:
    requested = _catalog_key(test_name)
    if not requested:
        return None
    tests = list(
        session.exec(
            select(LabTestCatalog).where(
                LabTestCatalog.tenant_id == tenant_id,
                LabTestCatalog.is_active == True,  # noqa: E712
            )
        ).all()
    )

    def score(row: LabTestCatalog) -> int:
        # Catalog items are tenant-scoped, so match purely on name/code within
        # the tenant. Branch must never influence the match, otherwise an
        # unrelated test (e.g. "HEMOGLOBIN") gets returned for "BP" just because
        # it carries the order's branch_id.
        keys = [_catalog_key(row.name), _catalog_key(row.code)]
        value = 0
        for key in keys:
            if not key:
                continue
            if key == requested:
                value = max(value, 100)
            elif requested in key or key in requested:
                value = max(value, 70)
        return value

    matches = sorted(((score(row), row) for row in tests), key=lambda item: item[0], reverse=True)
    return matches[0][1] if matches and matches[0][0] > 0 else None


def _fallback_lab_referrals(text: str | None) -> list[dict[str, str | None]]:
    rows = []
    for line in re.split(r"\n|,(?=\s*[A-Za-z0-9])", text or ""):
        parts = [part.strip() for part in line.split("|")]
        if not parts:
            continue
        if parts[0].lower() in {"lab", "scan"} and len(parts) > 1:
            item_name = parts[1]
            priority = parts[2] if len(parts) > 2 else "routine"
            instructions = parts[3] if len(parts) > 3 else None
        else:
            item_name = parts[0]
            priority = "routine"
            instructions = None
        if item_name:
            rows.append({"item_name": item_name, "priority": priority, "instructions": instructions})
    return rows


def _simple_pdf(lines: list[str]) -> bytes:
    escaped_lines = [line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in lines]
    text_commands = ["BT", "/F1 12 Tf", "50 780 Td"]
    for index, line in enumerate(escaped_lines):
        if index:
            text_commands.append("0 -18 Td")
        text_commands.append(f"({line}) Tj")
    text_commands.append("ET")
    stream = "\n".join(text_commands).encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{number} 0 obj\n".encode())
        output.extend(obj)
        output.extend(b"\nendobj\n")
    xref_at = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode())
    output.extend(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF".encode())
    return bytes(output)


def _validate_patient_branch(session: Session, tenant_id: str, patient_id: str, branch_id: str) -> None:
    patient = session.get(Patient, patient_id)
    branch = session.get(Branch, branch_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid patient")
    if not branch or branch.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid branch")


def _get_order_or_404(session: Session, tenant_id: str, order_id: str) -> LabOrder:
    order = session.get(LabOrder, order_id)
    if not order or order.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab order not found")
    return order


def _external_lab_items_enabled(session: Session, tenant_id: str) -> bool:
    settings = get_settings()
    value, scope, _scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="integrations",
        key=SettingKey.CATALOG_INTEGRATIONS,
    )
    lab_items = value.get("lab_items") if isinstance(value, dict) else {}
    if isinstance(lab_items, dict) and "enabled" in lab_items:
        if scope is None and settings.maha_clinic_url and settings.maha_clinic_token:
            return lab_items.get("provider") != "local" or not lab_items.get("enabled")
        return bool(lab_items.get("enabled")) and lab_items.get("provider") != "local"
    return bool(settings.external_lab_items_enabled)


def _frappe_catalog_client() -> FrappeCatalogClient:
    settings = get_settings()
    if not settings.maha_clinic_url or not settings.maha_clinic_token:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="ERPNext catalog plugin is not configured")
    return FrappeCatalogClient(
        base_url=settings.maha_clinic_url,
        token=settings.maha_clinic_token,
        timeout_seconds=settings.maha_clinic_timeout_seconds,
    )


def _normalize_local_lab_test(row: LabTestCatalog) -> dict[str, str]:
    return {
        "id": row.id,
        "name": row.name,
        "item_name": row.name,
        "slug": row.code or row.id,
        "source": "local",
    }


def _round_price(value: object) -> int:
    return max(round(float(value or 0)), 0)


def _price_payload(
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


def _local_lab_price(test: LabTestCatalog | None) -> dict[str, int | str | None]:
    if not test:
        return _price_payload(price=0)
    return _price_payload(
        price=test.default_price,
        mrp_price=test.default_price,
        selling_price=test.default_price,
        buying_price=test.purchase_price,
        supplier_id=test.supplier_id,
    )


def _external_lab_price(
    client: FrappeCatalogClient,
    item_name: str,
    external_item_code: str | None = None,
    external_slug: str | None = None,
) -> dict[str, int | str | None]:
    requested = _catalog_key(item_name)
    requested_code = _catalog_key(external_item_code)
    try:
        matches = client.get_lab_items(item_name)
    except Exception:
        logger.warning("External lab search failed for %r", item_name, exc_info=True)
        matches = []
    exact = next(
        (
            item
            for item in matches
            if _catalog_key(str(item.get("item_name") or item.get("name") or "")) == requested
            or _catalog_key(str(item.get("erpnext_name") or "")) == requested
        ),
        matches[0] if matches else None,
    )
    # Build slug candidates: whatever the search returned, plus the kebab-case
    # name (ERPNext lab item slugs look like "random-blood-sugar"). This lets
    # pricing work even when the name search misses or omits a usable slug.
    candidate_slugs: list[str] = []
    for value in (external_item_code, external_slug):
        value = str(value or "").strip()
        if value and value not in candidate_slugs:
            candidate_slugs.append(value)
    for source in (exact or {}, {}):
        for key in ("item_code", "erpnext_name", "slug", "id"):
            value = str(source.get(key) or "").strip()
            if value and value not in candidate_slugs:
                candidate_slugs.append(value)
    for guess in (_slugify(item_name), item_name.strip()):
        if guess and guess not in candidate_slugs:
            candidate_slugs.append(guess)

    for slug in candidate_slugs:
        try:
            detail = client.get_lab_item_details(slug)
        except Exception:
            continue
        detail_code = _catalog_key(str(detail.get("item_code") or detail.get("erpnext_name") or ""))
        detail_name = _catalog_key(str(detail.get("item_name") or detail.get("name") or ""))
        if requested_code:
            if detail_code != requested_code:
                continue
        elif requested and requested not in {detail_name, detail_code}:
            continue
        selling_price = _round_price(detail.get("selling_price"))
        if selling_price <= 0:
            continue
        return _price_payload(
            price=selling_price,
            mrp_price=_round_price(detail.get("mrp_price")),
            selling_price=selling_price,
            buying_price=_round_price(detail.get("buying_price")),
            external_source="erpnext",
            external_slug=str(detail.get("slug") or slug or ""),
            external_item_code=str(detail.get("item_code") or detail.get("name") or ""),
        )
    return _price_payload(price=0)


def _resolve_lab_price(
    frappe_client: FrappeCatalogClient | None,
    test: LabTestCatalog | None,
    item_name: str,
    external_item_code: str | None = None,
    external_slug: str | None = None,
) -> dict[str, int | str | None]:
    """Price a lab item, falling back to the local catalog when the external
    catalog lookup fails or returns no price, so order creation is never blocked
    or silently zero-priced by the integration."""
    if frappe_client is not None:
        try:
            pricing = _external_lab_price(
                frappe_client,
                item_name,
                external_item_code=external_item_code,
                external_slug=external_slug,
            )
        except Exception:
            logger.warning(
                "External lab pricing failed for %r; using local catalog price",
                item_name,
                exc_info=True,
            )
        else:
            if int(pricing.get("price") or 0) > 0:
                return pricing
            logger.warning(
                "External lab pricing returned no price for %r; using local catalog price",
                item_name,
            )
    return _local_lab_price(test)


def _add_priced_order_items_from_names(
    session: Session,
    *,
    order: LabOrder,
    item_names: list[str | dict[str, str | None]],
    seen_keys: set[str] | None = None,
) -> int:
    """Create LabOrderItem rows for external/manual test names and return total price."""
    seen_keys = seen_keys or set()
    frappe_client = _frappe_catalog_client() if _external_lab_items_enabled(session, order.tenant_id) else None
    total = 0
    for raw_item in item_names:
        if isinstance(raw_item, dict):
            item_name = str(raw_item.get("item_name") or raw_item.get("name") or "").strip()
            external_item_code = str(raw_item.get("external_item_code") or "").strip() or None
            external_slug = str(raw_item.get("external_slug") or "").strip() or None
        else:
            item_name = str(raw_item or "").strip()
            external_item_code = None
            external_slug = None
        item_key = _catalog_key(item_name)
        if not item_name or not item_key or item_key in seen_keys:
            continue
        test = _find_lab_test(session, order.tenant_id, order.branch_id, item_name)
        pricing = _resolve_lab_price(
            frappe_client,
            test,
            item_name,
            external_item_code=external_item_code,
            external_slug=external_slug,
        )
        price = int(pricing.get("price") or 0)
        if price <= 0:
            continue
        seen_keys.add(item_key)
        total += price
        session.add(
            LabOrderItem(
                tenant_id=order.tenant_id,
                branch_id=order.branch_id,
                lab_order_id=order.id,
                test_id=test.id if test else None,
                test_name=test.name if test else item_name,
                sample_type=test.sample_type if test else None,
                **pricing,
            )
        )
    return total


def _reprice_zero_order_items(session: Session, order: LabOrder) -> bool:
    """Fill zero-priced lab order items from the active external/local catalog."""
    items = list(
        session.exec(
            select(LabOrderItem).where(
                LabOrderItem.tenant_id == order.tenant_id,
                LabOrderItem.lab_order_id == order.id,
            )
        ).all()
    )
    if not items:
        total = _add_priced_order_items_from_names(
            session,
            order=order,
            item_names=[str(row["item_name"] or "") for row in _fallback_lab_referrals(order.tests)],
        )
        if total > 0:
            order.amount = total
            order.updated_at = now_utc()
            session.add(order)
            session.commit()
            session.refresh(order)
            return True
        return False
    zero_items = [item for item in items if int(item.price or 0) <= 0]
    if not zero_items:
        return False
    frappe_client = _frappe_catalog_client() if _external_lab_items_enabled(session, order.tenant_id) else None
    changed = False
    for item in zero_items:
        test = session.get(LabTestCatalog, item.test_id) if item.test_id else None
        if test is None:
            test = _find_lab_test(session, order.tenant_id, order.branch_id, item.test_name)
        pricing = _resolve_lab_price(frappe_client, test, item.test_name)
        new_price = int(pricing.get("price") or 0)
        if new_price <= 0:
            continue
        item.price = new_price
        item.mrp_price = int(pricing.get("mrp_price") or item.mrp_price or 0)
        item.selling_price = int(pricing.get("selling_price") or new_price)
        item.buying_price = int(pricing.get("buying_price") or item.buying_price or 0)
        item.supplier_id = str(pricing.get("supplier_id") or item.supplier_id or "") or None
        item.external_source = str(pricing.get("external_source") or item.external_source or "") or None
        item.external_slug = str(pricing.get("external_slug") or item.external_slug or "") or None
        item.external_item_code = str(pricing.get("external_item_code") or item.external_item_code or "") or None
        session.add(item)
        changed = True
    if changed:
        order.amount = sum(
            int(item.price or 0)
            for item in session.exec(
                select(LabOrderItem).where(
                    LabOrderItem.tenant_id == order.tenant_id,
                    LabOrderItem.lab_order_id == order.id,
                )
            ).all()
        )
        order.updated_at = now_utc()
        session.add(order)
        session.commit()
        session.refresh(order)
    return changed


@router.get("/external/items")
def list_external_lab_items(
    tenant_id: str = Depends(require_tenant_id),
    search: str | None = None,
    _current_user: User = Depends(
        require_any_permission(
            permissions.CONSULTATIONS_READ,
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_SIGN,
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
        )
    ),
) -> list[dict[str, str]]:
    return _frappe_catalog_client().get_lab_items(search)


@router.get("/external/items/{slug}/details")
def get_external_lab_item_details(
    slug: str,
    _tenant_id: str = Depends(require_tenant_id),
    _current_user: User = Depends(
        require_any_permission(
            permissions.CONSULTATIONS_READ,
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_SIGN,
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
            permissions.BILLING_MANAGE,
        )
    ),
) -> dict[str, int | str | float]:
    return _frappe_catalog_client().get_lab_item_details(slug)


@router.get("/catalog/available-tests")
def list_available_lab_tests(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    search: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.CONSULTATIONS_READ,
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_SIGN,
            permissions.LAB_MANAGE,
            permissions.LAB_READ,
            permissions.PATIENT_SUBSCRIPTIONS_READ,
            permissions.SETTINGS_MANAGE,
        )
    ),
) -> list[dict[str, str]]:
    enforce_module_enabled(session, tenant_id, "lab")
    if _external_lab_items_enabled(session, tenant_id):
        try:
            return _frappe_catalog_client().get_lab_items(search)
        except HTTPException:
            # External ERPNext catalog is unreachable or not configured —
            # fall back to the local MedizinHub lab catalog so the picker keeps working.
            pass

    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(LabTestCatalog).where(LabTestCatalog.tenant_id == tenant_id, LabTestCatalog.is_active == True)  # noqa: E712
    if branch_id:
        statement = statement.where((LabTestCatalog.branch_id == branch_id) | (LabTestCatalog.branch_id.is_(None)))
    if search:
        pattern = f"%{search}%"
        statement = statement.where((LabTestCatalog.name.ilike(pattern)) | (LabTestCatalog.code.ilike(pattern)))
    return [_normalize_local_lab_test(row) for row in session.exec(statement.order_by(LabTestCatalog.name)).all()]


def _read_detail(session: Session, order: LabOrder) -> LabOrderDetailRead:
    if int(order.amount or 0) <= 0:
        _reprice_zero_order_items(session, order)
    items = list(
        session.exec(
            select(LabOrderItem)
            .where(LabOrderItem.tenant_id == order.tenant_id, LabOrderItem.lab_order_id == order.id)
            .order_by(LabOrderItem.created_at)
        ).all()
    )
    samples = list(
        session.exec(
            select(LabSample)
            .where(LabSample.tenant_id == order.tenant_id, LabSample.lab_order_id == order.id)
            .order_by(LabSample.collected_at)
        ).all()
    )
    results = list(
        session.exec(
            select(LabResult)
            .where(LabResult.tenant_id == order.tenant_id, LabResult.lab_order_id == order.id)
            .order_by(LabResult.released_at)
        ).all()
    )
    return LabOrderDetailRead(
        order=LabOrderRead.model_validate(order, from_attributes=True),
        items=[LabOrderItemRead.model_validate(item, from_attributes=True) for item in items],
        samples=[LabSampleRead.model_validate(sample, from_attributes=True) for sample in samples],
        results=[LabResultRead.model_validate(result, from_attributes=True) for result in results],
    )


def _template_read(template: LabResultTemplate) -> LabResultTemplateRead:
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


def _package_read(session: Session, package: LabTestPackage) -> LabTestPackageRead:
    item_rows = list(
        session.exec(
            select(LabTestPackageItem).where(
                LabTestPackageItem.tenant_id == package.tenant_id,
                LabTestPackageItem.package_id == package.id,
            )
        ).all()
    )
    return LabTestPackageRead(
        id=package.id,
        tenant_id=package.tenant_id,
        branch_id=package.branch_id,
        code=package.code,
        name=package.name,
        description=package.description,
        package_price=package.package_price,
        test_ids=[item.test_id for item in item_rows],
        is_active=package.is_active,
        created_by_user_id=package.created_by_user_id,
        updated_by_user_id=package.updated_by_user_id,
        created_at=package.created_at,
        updated_at=package.updated_at,
    )


def _add_order_items(
    session: Session,
    *,
    order: LabOrder,
    test_ids: list[str],
    package_ids: list[str],
    external_items: list[dict[str, str | None]] | None = None,
) -> None:
    total = 0
    names: list[str] = []
    seen_tests: set[str] = set()
    seen_names: set[str] = set()
    for package_id in package_ids:
        package = session.get(LabTestPackage, package_id)
        if not package or package.tenant_id != order.tenant_id or not package.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lab package")
        total += package.package_price
        package_items = list(
            session.exec(
                select(LabTestPackageItem).where(
                    LabTestPackageItem.tenant_id == order.tenant_id,
                    LabTestPackageItem.package_id == package.id,
                )
            ).all()
        )
        for package_item in package_items:
            if package_item.test_id in seen_tests:
                continue
            test = session.get(LabTestCatalog, package_item.test_id)
            if not test or test.tenant_id != order.tenant_id or not test.is_active:
                continue
            seen_tests.add(test.id)
            seen_names.add(_catalog_key(test.name))
            names.append(test.name)
            session.add(
                LabOrderItem(
                    tenant_id=order.tenant_id,
                    branch_id=order.branch_id,
                    lab_order_id=order.id,
                    test_id=test.id,
                    package_id=package.id,
                    test_name=test.name,
                    sample_type=test.sample_type,
                    **_price_payload(price=0, mrp_price=test.default_price, selling_price=0, buying_price=test.purchase_price, supplier_id=test.supplier_id),
                )
            )
    for test_id in test_ids:
        if test_id in seen_tests:
            continue
        test = session.get(LabTestCatalog, test_id)
        if not test or test.tenant_id != order.tenant_id or not test.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lab test")
        seen_tests.add(test.id)
        seen_names.add(_catalog_key(test.name))
        total += test.default_price
        names.append(test.name)
        session.add(
            LabOrderItem(
                tenant_id=order.tenant_id,
                branch_id=order.branch_id,
                lab_order_id=order.id,
                test_id=test.id,
                test_name=test.name,
                sample_type=test.sample_type,
                **_local_lab_price(test),
            )
        )
    selected_external_items = [
        {
            "item_name": str(item.get("name") or item.get("item_name") or "").strip(),
            "external_item_code": str(item.get("external_item_code") or "").strip() or None,
            "external_slug": str(item.get("external_slug") or "").strip() or None,
        }
        for item in external_items or []
        if str(item.get("name") or item.get("item_name") or "").strip()
    ]
    if selected_external_items:
        external_total = _add_priced_order_items_from_names(
            session,
            order=order,
            item_names=selected_external_items,
            seen_keys=seen_names,
        )
        if external_total > 0:
            total += external_total
            names.extend(str(item["item_name"]) for item in selected_external_items)
    manual_names = []
    if not test_ids and not package_ids and not selected_external_items:
        manual_names = [
            str(row["item_name"] or "")
            for row in _fallback_lab_referrals(order.tests)
            if _catalog_key(str(row["item_name"] or "")) not in seen_names
        ]
    if manual_names:
        manual_total = _add_priced_order_items_from_names(
            session,
            order=order,
            item_names=manual_names,
            seen_keys=seen_names,
        )
        if manual_total > 0:
            total += manual_total
            names.extend(manual_names)
    if names:
        order.tests = ", ".join(names)
        if order.amount == 0:
            order.amount = total


@router.post("/catalog/tests", response_model=LabTestCatalogRead, status_code=status.HTTP_201_CREATED)
def create_lab_test(
    payload: LabTestCatalogCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.LAB_MANAGE, permissions.PATIENT_SUBSCRIPTIONS_MANAGE, permissions.SETTINGS_MANAGE)),
) -> LabTestCatalog:
    enforce_module_enabled(session, tenant_id, "lab")
    if payload.branch_id:
        require_user_branch_access(current_user, payload.branch_id)
    test = LabTestCatalog.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(test)
    session.commit()
    session.refresh(test)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=test.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="lab_test.created",
        resource_type="lab_test_catalog",
        resource_id=test.id,
        purpose="diagnostics",
    )
    return test


@router.get("/catalog/tests", response_model=list[LabTestCatalogRead])
def list_lab_tests(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    search: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.LAB_MANAGE, permissions.PATIENT_SUBSCRIPTIONS_MANAGE, permissions.PATIENT_SUBSCRIPTIONS_READ, permissions.SETTINGS_MANAGE)),
) -> list[LabTestCatalog]:
    enforce_module_enabled(session, tenant_id, "lab")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(LabTestCatalog).where(LabTestCatalog.tenant_id == tenant_id, LabTestCatalog.is_active == True)  # noqa: E712
    if branch_id:
        statement = statement.where((LabTestCatalog.branch_id == branch_id) | (LabTestCatalog.branch_id.is_(None)))
    if search:
        pattern = f"%{search}%"
        statement = statement.where((LabTestCatalog.name.ilike(pattern)) | (LabTestCatalog.code.ilike(pattern)))
    return list(session.exec(statement.order_by(LabTestCatalog.name)).all())


@router.patch("/catalog/tests/{test_id}", response_model=LabTestCatalogRead)
def update_lab_test(
    test_id: str,
    payload: LabTestCatalogUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabTestCatalog:
    enforce_module_enabled(session, tenant_id, "lab")
    test = session.get(LabTestCatalog, test_id)
    if not test or test.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab test not found")
    require_user_branch_access(current_user, test.branch_id)
    data = payload.model_dump(exclude_unset=True)
    next_branch_id = data.get("branch_id", test.branch_id)
    if next_branch_id:
        require_user_branch_access(current_user, next_branch_id)
    for key, value in data.items():
        setattr(test, key, value)
    test.updated_at = now_utc()
    session.add(test)
    session.commit()
    session.refresh(test)
    record_audit_event(session, tenant_id=tenant_id, branch_id=test.branch_id, actor_user_id=payload.updated_by_user_id, action="lab_test.updated", resource_type="lab_test_catalog", resource_id=test.id, purpose="diagnostics")
    return test


@router.delete("/catalog/tests/{test_id}", response_model=LabTestCatalogRead)
def delete_lab_test(
    test_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabTestCatalog:
    enforce_module_enabled(session, tenant_id, "lab")
    test = session.get(LabTestCatalog, test_id)
    if not test or test.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab test not found")
    require_user_branch_access(current_user, test.branch_id)
    test.is_active = False
    test.updated_at = now_utc()
    test.updated_by_user_id = current_user.id
    session.add(test)
    session.commit()
    session.refresh(test)
    record_audit_event(session, tenant_id=tenant_id, branch_id=test.branch_id, actor_user_id=current_user.id, action="lab_test.deleted", resource_type="lab_test_catalog", resource_id=test.id, purpose="diagnostics")
    return test


@router.post("/catalog/packages", response_model=LabTestPackageRead, status_code=status.HTTP_201_CREATED)
def create_lab_package(
    payload: LabTestPackageCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabTestPackageRead:
    enforce_module_enabled(session, tenant_id, "lab")
    if payload.branch_id:
        require_user_branch_access(current_user, payload.branch_id)
    package = LabTestPackage.model_validate(payload.model_dump(exclude={"test_ids"}), update={"tenant_id": tenant_id})
    session.add(package)
    session.commit()
    session.refresh(package)
    for test_id in payload.test_ids:
        test = session.get(LabTestCatalog, test_id)
        if not test or test.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid package test")
        session.add(LabTestPackageItem(tenant_id=tenant_id, package_id=package.id, test_id=test.id))
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=package.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="lab_package.created",
        resource_type="lab_test_package",
        resource_id=package.id,
        purpose="diagnostics",
    )
    return _package_read(session, package)


@router.get("/catalog/packages", response_model=list[LabTestPackageRead])
def list_lab_packages(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> list[LabTestPackageRead]:
    enforce_module_enabled(session, tenant_id, "lab")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(LabTestPackage).where(LabTestPackage.tenant_id == tenant_id, LabTestPackage.is_active == True)  # noqa: E712
    if branch_id:
        statement = statement.where((LabTestPackage.branch_id == branch_id) | (LabTestPackage.branch_id.is_(None)))
    packages = list(session.exec(statement.order_by(LabTestPackage.name)).all())
    return [_package_read(session, package) for package in packages]


@router.patch("/catalog/packages/{package_id}", response_model=LabTestPackageRead)
def update_lab_package(
    package_id: str,
    payload: LabTestPackageUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabTestPackageRead:
    enforce_module_enabled(session, tenant_id, "lab")
    package = session.get(LabTestPackage, package_id)
    if not package or package.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab package not found")
    require_user_branch_access(current_user, package.branch_id)
    data = payload.model_dump(exclude_unset=True, exclude={"test_ids"})
    next_branch_id = data.get("branch_id", package.branch_id)
    if next_branch_id:
        require_user_branch_access(current_user, next_branch_id)
    for key, value in data.items():
        setattr(package, key, value)
    package.updated_at = now_utc()
    if payload.updated_by_user_id:
        package.updated_by_user_id = payload.updated_by_user_id
    if payload.test_ids is not None:
        existing = list(session.exec(select(LabTestPackageItem).where(LabTestPackageItem.tenant_id == tenant_id, LabTestPackageItem.package_id == package.id)).all())
        for row in existing:
            session.delete(row)
        for test_id in payload.test_ids:
            test = session.get(LabTestCatalog, test_id)
            if not test or test.tenant_id != tenant_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid package test")
            session.add(LabTestPackageItem(tenant_id=tenant_id, package_id=package.id, test_id=test.id))
    session.add(package)
    session.commit()
    session.refresh(package)
    record_audit_event(session, tenant_id=tenant_id, branch_id=package.branch_id, actor_user_id=payload.updated_by_user_id, action="lab_package.updated", resource_type="lab_test_package", resource_id=package.id, purpose="diagnostics")
    return _package_read(session, package)


@router.delete("/catalog/packages/{package_id}", response_model=LabTestPackageRead)
def delete_lab_package(
    package_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabTestPackageRead:
    enforce_module_enabled(session, tenant_id, "lab")
    package = session.get(LabTestPackage, package_id)
    if not package or package.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab package not found")
    require_user_branch_access(current_user, package.branch_id)
    package.is_active = False
    package.updated_at = now_utc()
    package.updated_by_user_id = current_user.id
    session.add(package)
    session.commit()
    session.refresh(package)
    record_audit_event(session, tenant_id=tenant_id, branch_id=package.branch_id, actor_user_id=current_user.id, action="lab_package.deleted", resource_type="lab_test_package", resource_id=package.id, purpose="diagnostics")
    return _package_read(session, package)


@router.post("/result-templates", response_model=LabResultTemplateRead, status_code=status.HTTP_201_CREATED)
def create_result_template(
    payload: LabResultTemplateCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabResultTemplateRead:
    enforce_module_enabled(session, tenant_id, "lab")
    if payload.test_id:
        test = session.get(LabTestCatalog, payload.test_id)
        if not test or test.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lab test")
    template = LabResultTemplate(
        tenant_id=tenant_id,
        test_id=payload.test_id,
        name=payload.name,
        content_json=json.dumps(payload.content),
        created_by_user_id=payload.created_by_user_id,
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return _template_read(template)


@router.get("/result-templates", response_model=list[LabResultTemplateRead])
def list_result_templates(
    tenant_id: str = Depends(require_tenant_id),
    test_id: str | None = None,
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> list[LabResultTemplateRead]:
    enforce_module_enabled(session, tenant_id, "lab")
    statement = select(LabResultTemplate).where(
        LabResultTemplate.tenant_id == tenant_id,
        LabResultTemplate.is_active == True,  # noqa: E712
    )
    if test_id:
        statement = statement.where((LabResultTemplate.test_id == test_id) | (LabResultTemplate.test_id.is_(None)))
    rows = list(session.exec(statement.order_by(LabResultTemplate.name)).all())
    return [_template_read(row) for row in rows]


@router.post(
    "/orders",
    response_model=LabOrderRead,
    status_code=status.HTTP_201_CREATED,
)
def create_lab_order(
    payload: LabOrderCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabOrder:
    enforce_module_enabled(session, tenant_id, "lab")
    _validate_patient_branch(session, tenant_id, payload.patient_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    if payload.consultation_id:
        consultation = session.get(Consultation, payload.consultation_id)
        if not consultation or consultation.tenant_id != tenant_id or consultation.patient_id != payload.patient_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid consultation")

    order = LabOrder.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "lab_order_number": next_document_number(session, tenant_id=tenant_id, branch_id=payload.branch_id, entity="lab_order"),
        },
    )
    session.add(order)
    session.commit()
    session.refresh(order)
    _add_order_items(
        session,
        order=order,
        test_ids=payload.test_ids,
        package_ids=payload.package_ids,
        external_items=[item.model_dump() for item in payload.external_items],
    )
    if order.amount == 0:
        _reprice_zero_order_items(session, order)
    session.add(order)
    session.commit()
    session.refresh(order)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        actor_user_id=payload.ordered_by_user_id,
        action="lab_order.created",
        resource_type="lab_order",
        resource_id=order.id,
        purpose="diagnostics",
    )
    return order


@router.post(
    "/orders/from-consultation/{consultation_id}",
    response_model=LabOrderRead,
    status_code=status.HTTP_201_CREATED,
)
def create_lab_order_from_consultation(
    consultation_id: str,
    payload: LabOrderFromConsultation,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabOrder:
    enforce_module_enabled(session, tenant_id, "lab")
    consultation = session.get(Consultation, consultation_id)
    if not consultation or consultation.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found")
    if not consultation.lab_referral_text:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Consultation has no lab referral")
    require_user_branch_access(current_user, consultation.branch_id)
    existing = session.exec(
        select(LabOrder).where(LabOrder.tenant_id == tenant_id, LabOrder.consultation_id == consultation.id)
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Lab order already exists")
    order = LabOrder(
        tenant_id=tenant_id,
        branch_id=consultation.branch_id,
        patient_id=consultation.patient_id,
        consultation_id=consultation.id,
        lab_order_number=next_document_number(session, tenant_id=tenant_id, branch_id=consultation.branch_id, entity="lab_order"),
        source=LabOrderSource.CONSULTATION,
        priority=payload.priority,
        tests=consultation.lab_referral_text,
        amount=payload.amount,
        ordered_by_user_id=payload.ordered_by_user_id,
    )
    session.add(order)
    session.commit()
    session.refresh(order)
    structured_referrals = list(
        session.exec(
            select(ConsultationReferral).where(
                ConsultationReferral.tenant_id == tenant_id,
                ConsultationReferral.consultation_id == consultation.id,
                ConsultationReferral.referral_type == "lab",
            )
        ).all()
    )
    referrals = [
        {"item_name": row.item_name, "priority": row.priority, "instructions": row.instructions}
        for row in structured_referrals
    ] or _fallback_lab_referrals(consultation.lab_referral_text)
    total = 0
    frappe_client = _frappe_catalog_client() if _external_lab_items_enabled(session, tenant_id) else None
    for referral in referrals:
        item_name = str(referral["item_name"] or "").strip()
        if not item_name:
            continue
        test = _find_lab_test(session, tenant_id, consultation.branch_id, item_name)
        pricing = _resolve_lab_price(frappe_client, test, item_name)
        total += int(pricing.get("price") or 0)
        session.add(
            LabOrderItem(
                tenant_id=tenant_id,
                branch_id=order.branch_id,
                lab_order_id=order.id,
                test_id=test.id if test else None,
                test_name=test.name if test else item_name,
                sample_type=test.sample_type if test else None,
                **pricing,
            )
        )
    if referrals and order.amount == 0:
        order.amount = total
    session.add(order)
    session.commit()
    session.refresh(order)
    if order.amount == 0:
        _reprice_zero_order_items(session, order)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        actor_user_id=payload.ordered_by_user_id,
        action="lab_order.created_from_consultation",
        resource_type="lab_order",
        resource_id=order.id,
        purpose="diagnostics",
    )
    return order


@router.get("/orders", response_model=list[LabOrderRead])
def list_lab_orders(
    tenant_id: str = Depends(require_tenant_id),
    patient_id: str | None = None,
    status_filter: LabOrderStatus | None = None,
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> list[LabOrder]:
    enforce_module_enabled(session, tenant_id, "lab")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(LabOrder).where(LabOrder.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(LabOrder.branch_id == branch_id)
    if patient_id:
        statement = statement.where(LabOrder.patient_id == patient_id)
    if status_filter:
        statement = statement.where(LabOrder.status == status_filter)
    rows = list(session.exec(statement.order_by(LabOrder.created_at.desc())).all())
    for order in rows:
        if int(order.amount or 0) <= 0:
            _reprice_zero_order_items(session, order)
    return rows


@router.get("/orders/{order_id}", response_model=LabOrderDetailRead)
def get_lab_order(
    order_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabOrderDetailRead:
    enforce_module_enabled(session, tenant_id, "lab")
    order = _get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    return _read_detail(session, order)


@router.patch("/orders/{order_id}/status", response_model=LabOrderRead)
def update_lab_order_status(
    order_id: str,
    payload: LabOrderStatusUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabOrder:
    enforce_module_enabled(session, tenant_id, "lab")
    order = _get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    now = datetime.now(timezone.utc)
    order.status = payload.status
    order.updated_at = now
    if payload.notes is not None:
        order.notes = payload.notes
    if payload.status == LabOrderStatus.SAMPLE_COLLECTED:
        order.sample_collected_at = now
    if payload.status == LabOrderStatus.RESULT_READY:
        order.result_ready_at = now
    if payload.status == LabOrderStatus.CANCELLED:
        if not payload.reason:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cancellation reason is required")
        order.cancelled_reason = payload.reason
    session.add(order)
    session.commit()
    session.refresh(order)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        actor_user_id=payload.actor_user_id,
        action=f"lab_order.{payload.status.value}",
        resource_type="lab_order",
        resource_id=order.id,
        purpose="diagnostics",
    )
    return order


@router.post("/orders/{order_id}/samples", response_model=LabOrderDetailRead, status_code=status.HTTP_201_CREATED)
def collect_lab_sample(
    order_id: str,
    payload: LabSampleCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabOrderDetailRead:
    enforce_module_enabled(session, tenant_id, "lab")
    order = _get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    if order.status == LabOrderStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot collect sample for cancelled order")
    now = datetime.now(timezone.utc)
    sample = LabSample(
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        lab_order_id=order.id,
        barcode=payload.barcode or f"{order.id}-{len(order.id)}",
        sample_type=payload.sample_type,
        collected_by_user_id=payload.collected_by_user_id,
        collected_at=now,
        notes=payload.notes,
    )
    order.status = LabOrderStatus.SAMPLE_COLLECTED
    order.sample_collected_at = now
    order.updated_at = now
    item_rows = list(session.exec(select(LabOrderItem).where(LabOrderItem.lab_order_id == order.id)).all())
    for item in item_rows:
        item.status = LabOrderStatus.SAMPLE_COLLECTED
        item.updated_at = now
        session.add(item)
    session.add(sample)
    session.add(order)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        actor_user_id=payload.collected_by_user_id,
        action="lab_sample.collected",
        resource_type="lab_order",
        resource_id=order.id,
        purpose="diagnostics",
    )
    return _read_detail(session, order)


@router.post(
    "/orders/{order_id}/results",
    response_model=LabOrderDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def add_lab_result(
    order_id: str,
    payload: LabResultCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> LabOrderDetailRead:
    enforce_module_enabled(session, tenant_id, "lab")
    order = _get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    if order.status == LabOrderStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot add result to cancelled order")
    now = datetime.now(timezone.utc)
    result = LabResult.model_validate(
        payload,
        update={"tenant_id": tenant_id, "branch_id": order.branch_id, "lab_order_id": order.id},
    )
    order.status = LabOrderStatus.RESULT_READY
    order.result_ready_at = now
    order.updated_at = now
    item_rows = list(session.exec(select(LabOrderItem).where(LabOrderItem.lab_order_id == order.id)).all())
    for item in item_rows:
        item.status = LabOrderStatus.RESULT_READY
        item.updated_at = now
        session.add(item)
    session.add(result)
    if payload.report_url:
        record_file_document(
            session,
            tenant_id=tenant_id,
            branch_id=order.branch_id,
            patient_id=order.patient_id,
            file_name=payload.report_file_name or "Lab Report",
            file_url=payload.report_url,
            category="lab_report",
            source_module="lab",
            attached_to_doctype="LabOrder",
            attached_to_name=order.id,
            attached_to_field="report_url",
            attached_to_label="Lab Report",
            uploaded_by_user_id=payload.released_by_user_id or current_user.id,
        )
    session.add(order)
    session.commit()
    session.refresh(order)
    patient = session.get(Patient, order.patient_id)
    if patient:
        for provider in (NotificationProvider.WHATSAPP, NotificationProvider.SMS):
            queue_notification_if_allowed(
                session,
                tenant_id=tenant_id,
                branch_id=order.branch_id,
                provider=provider,
                event_type=NotificationEventType.LAB_REPORT_READY,
                recipient=patient.mobile,
                subject="Lab report ready",
                message=f"Your lab report for {order.tests} is ready.",
                resource_type="lab_order",
                resource_id=order.id,
                queued_by_user_id=payload.released_by_user_id,
            )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        actor_user_id=payload.released_by_user_id,
        action="lab_result.released",
        resource_type="lab_order",
        resource_id=order.id,
        purpose="diagnostics",
    )
    return _read_detail(session, order)


@router.get("/orders/{order_id}/report.pdf")
def lab_report_pdf(
    order_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.LAB_MANAGE)),
) -> Response:
    enforce_module_enabled(session, tenant_id, "lab")
    order = _get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    detail = _read_detail(session, order)
    lines = [
        "MedizinHub HMS Lab Report",
        f"Order: {order.id}",
        f"Patient: {order.patient_id}",
        f"Tests: {order.tests}",
        f"Status: {order.status.value}",
        "",
    ]
    for result in detail.results:
        lines.extend(
            [
                f"Result: {result.result_summary}",
                f"Abnormal: {'Yes' if result.abnormal_flag else 'No'}",
                f"Released: {result.released_at.isoformat()}",
            ]
        )
    if not detail.results:
        lines.append("No released result yet.")
    return Response(content=_simple_pdf(lines), media_type="application/pdf")
