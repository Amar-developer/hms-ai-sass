from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.lab.models import LabOrder, LabOrderItem
from app.modules.lab.repositories import LabCatalogRepository, LabOrderRepository
from app.modules.lab.services.catalog import (
    _catalog_key,
    _find_lab_package,
    _find_lab_test,
    _local_lab_price,
    _price_payload,
    _resolve_lab_price,
)
from app.modules.lab.services.referrals import _fallback_lab_referrals
from app.modules.tenants.models import now_utc


def add_priced_order_items_from_names(
    session: Session,
    *,
    order: LabOrder,
    item_names: list[str | dict[str, str | None]],
    seen_keys: set[str] | None = None,
) -> int:
    """Create LabOrderItem rows for local/manual test or service names."""
    seen_keys = seen_keys or set()
    total = 0
    for raw_item in item_names:
        if isinstance(raw_item, dict):
            item_name = str(
                raw_item.get("item_name") or raw_item.get("name") or ""
            ).strip()
            external_item_code = (
                str(raw_item.get("external_item_code") or "").strip() or None
            )
            external_slug = str(raw_item.get("external_slug") or "").strip() or None
        else:
            item_name = str(raw_item or "").strip()
            external_item_code = None
            external_slug = None
        item_key = _catalog_key(item_name)
        if not item_name or not item_key or item_key in seen_keys:
            continue
        test = _find_lab_test(session, order.tenant_id, order.branch_id, item_name)
        package = (
            None
            if test
            else _find_lab_package(session, order.tenant_id, order.branch_id, item_name)
        )
        if test:
            pricing = _resolve_lab_price(
                test,
                item_name,
                external_item_code=external_item_code,
                external_slug=external_slug,
            )
        elif package:
            pricing = _price_payload(
                price=package.package_price,
                mrp_price=package.mrp_price or package.package_price,
                selling_price=package.package_price,
                buying_price=package.purchase_price,
                supplier_id=package.supplier_id,
            )
        else:
            pricing = _price_payload(price=0)
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
                package_id=package.id if package else None,
                test_name=test.name if test else package.name if package else item_name,
                sample_type=test.sample_type if test else None,
                **pricing,
            )
        )
    return total


def reprice_zero_order_items(session: Session, order: LabOrder) -> bool:
    """Fill zero-priced lab order items from the active local catalog."""
    order_repo = LabOrderRepository(session)
    catalog_repo = LabCatalogRepository(session)
    items = order_repo.list_order_items(
        tenant_id=order.tenant_id,
        order_id=order.id,
    )
    if not items:
        total = add_priced_order_items_from_names(
            session,
            order=order,
            item_names=[
                str(row["item_name"] or "")
                for row in _fallback_lab_referrals(order.tests)
            ],
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
    changed = False
    # One round-trip for every catalog test referenced here, rather than one
    # lookup per zero-priced item.
    zero_item_tests = catalog_repo.tests_for_tenant(
        tenant_id=order.tenant_id,
        test_ids={item.test_id for item in zero_items if item.test_id},
    )
    for item in zero_items:
        test = zero_item_tests.get(item.test_id) if item.test_id else None
        if test is None:
            test = _find_lab_test(
                session, order.tenant_id, order.branch_id, item.test_name
            )
        pricing = _resolve_lab_price(test, item.test_name)
        new_price = int(pricing.get("price") or 0)
        if new_price <= 0:
            continue
        item.price = new_price
        item.mrp_price = int(pricing.get("mrp_price") or item.mrp_price or 0)
        item.selling_price = int(pricing.get("selling_price") or new_price)
        item.buying_price = int(pricing.get("buying_price") or item.buying_price or 0)
        item.supplier_id = (
            str(pricing.get("supplier_id") or item.supplier_id or "") or None
        )
        item.external_source = (
            str(pricing.get("external_source") or item.external_source or "") or None
        )
        item.external_slug = (
            str(pricing.get("external_slug") or item.external_slug or "") or None
        )
        item.external_item_code = (
            str(pricing.get("external_item_code") or item.external_item_code or "")
            or None
        )
        session.add(item)
        changed = True
    if changed:
        order.amount = sum(
            int(item.price or 0)
            for item in order_repo.list_order_items(
                tenant_id=order.tenant_id,
                order_id=order.id,
            )
        )
        order.updated_at = now_utc()
        session.add(order)
        session.commit()
        session.refresh(order)
    return changed


def add_order_items(
    session: Session,
    *,
    order: LabOrder,
    test_ids: list[str],
    package_ids: list[str],
    external_items: list[dict[str, str | None]] | None = None,
) -> None:
    catalog_repo = LabCatalogRepository(session)
    total = 0
    names: list[str] = []
    seen_tests: set[str] = set()
    seen_names: set[str] = set()
    # Resolve the packages, their component rows, and the referenced catalog
    # tests in three round-trips instead of three per package/component. The
    # loop below still walks package_ids in order, so an invalid package
    # raises at the same point it did before.
    packages_by_id = catalog_repo.packages_for_tenant(
        tenant_id=order.tenant_id,
        package_ids=set(package_ids),
        active_only=True,
    )
    package_items_by_package = catalog_repo.package_items_for_packages(
        tenant_id=order.tenant_id,
        package_ids={package.id for package in packages_by_id.values()},
    )
    component_tests = catalog_repo.tests_for_tenant(
        tenant_id=order.tenant_id,
        test_ids={
            row.test_id
            for rows in package_items_by_package.values()
            for row in rows
            if row.test_id
        },
        active_only=True,
    )
    for package_id in package_ids:
        package = packages_by_id.get(package_id)
        if not package:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lab package"
            )
        total += package.package_price
        package_items = package_items_by_package.get(package.id, [])
        for package_item in package_items:
            if package_item.test_id in seen_tests:
                continue
            test = component_tests.get(package_item.test_id)
            if not test:
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
                    **_price_payload(
                        price=0,
                        mrp_price=test.default_price,
                        selling_price=0,
                        buying_price=test.purchase_price,
                        supplier_id=test.supplier_id,
                    ),
                )
            )
    standalone_tests = catalog_repo.tests_for_tenant(
        tenant_id=order.tenant_id,
        test_ids={test_id for test_id in test_ids if test_id not in seen_tests},
        active_only=True,
    )
    for test_id in test_ids:
        if test_id in seen_tests:
            continue
        test = standalone_tests.get(test_id)
        if not test:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lab test"
            )
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
            "external_item_code": str(item.get("external_item_code") or "").strip()
            or None,
            "external_slug": str(item.get("external_slug") or "").strip() or None,
        }
        for item in external_items or []
        if str(item.get("name") or item.get("item_name") or "").strip()
    ]
    if selected_external_items:
        external_total = add_priced_order_items_from_names(
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
        manual_total = add_priced_order_items_from_names(
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
