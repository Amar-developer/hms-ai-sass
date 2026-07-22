import ast
import re
from pathlib import Path

from app.modules.identity.services.helpers import permission_read as _permission_read
from app.modules.identity.schemas import RoleCreate, RoleUpdate
from app.modules import manifest
from app.modules.identity import permissions


def test_role_payloads_deduplicate_permission_keys_in_request_order():
    create = RoleCreate(
        name="Receptionist",
        key="receptionist",
        permission_keys=["queue.manage", "queue.read", "queue.manage"],
    )
    update = RoleUpdate(
        permission_keys=[
            "consultations.edit",
            "consultations.read",
            "consultations.edit",
        ]
    )

    assert create.permission_keys == ["queue.manage", "queue.read"]
    assert update.permission_keys == ["consultations.edit", "consultations.read"]


def test_permission_catalog_has_unique_keys_and_all_application_modules():
    catalog = permissions.PERMISSION_CATALOG
    assert len(catalog) == len(set(catalog))

    modules = {_permission_read(key).module for key in catalog}
    assert {
        "appointments",
        "audit",
        "billing",
        "branches",
        "consultations",
        "dashboard",
        "departments",
        "discounts",
        "error_logs",
        "files",
        "home_care",
        "identity.roles",
        "identity.users",
        "invoices",
        "ip",
        "lab",
        "notifications",
        "patient_subscriptions",
        "patients",
        "payments",
        "pharmacy",
        "physiotherapy",
        "platform.subscriptions",
        "platform.tenants",
        "practitioners",
        "queue",
        "reports",
        "scheduling",
        "settings",
        "settlements",
        "suppliers",
        "tax",
    }.issubset(modules)
    assert _permission_read("identity.users.edit").model_dump() == {
        "key": "identity.users.edit",
        "module": "identity.users",
        "module_label": "Users",
        "action": "edit",
        "description": "Users Edit",
    }
    assert _permission_read("platform.subscriptions.manage").module == (
        "platform.subscriptions"
    )


def test_every_permission_module_has_a_product_facing_label():
    modules = {_permission_read(key).module for key in permissions.PERMISSION_CATALOG}

    assert modules <= set(permissions.PERMISSION_MODULE_LABELS)
    assert _permission_read("practitioners.read").module_label == (
        "Doctors & Practitioners"
    )
    assert _permission_read("consultations.sign").module_label == (
        "Doctor Workspace & Consultations"
    )


def test_billing_adjustment_request_and_approval_actions_are_discoverable():
    catalog = set(permissions.PERMISSION_CATALOG)

    assert {
        "billing.discounts.request",
        "billing.discounts.approve",
        "billing.refunds.request",
        "billing.refunds.approve",
        "invoices.cancel_request",
        "invoices.cancel_approve",
    } <= catalog


def test_every_backend_permission_reference_is_in_the_catalog():
    app_root = Path(__file__).resolve().parents[1] / "app"
    catalog = set(permissions.PERMISSION_CATALOG)
    referenced: set[str] = set()

    for path in app_root.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Attribute):
                continue
            if not isinstance(node.value, ast.Name) or node.value.id != "permissions":
                continue
            value = getattr(permissions, node.attr, None)
            if isinstance(value, str):
                referenced.add(value)

    assert referenced
    assert referenced <= catalog


def test_every_manifest_permission_is_in_the_catalog():
    catalog = set(permissions.PERMISSION_CATALOG)
    manifest_permissions = {
        permission_key
        for module in manifest.MODULES
        for permission_key in module.get("permissions", [])
    }

    assert manifest_permissions
    assert manifest_permissions <= catalog


def test_frontend_permission_checks_are_in_the_catalog():
    frontend_root = Path(__file__).resolve().parents[2] / "frontend"
    catalog = set(permissions.PERMISSION_CATALOG)
    permission_actions = {key.rsplit(".", 1)[-1] for key in catalog}
    referenced: set[str] = set()

    for pattern in ("*.ts", "*.tsx"):
        for path in frontend_root.rglob(pattern):
            if "node_modules" in path.parts or ".next" in path.parts:
                continue
            source = path.read_text(encoding="utf-8")
            for value in re.findall(
                r'["\']([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)["\']', source
            ):
                if value.rsplit(".", 1)[-1] in permission_actions:
                    referenced.add(value)

    assert referenced <= catalog
