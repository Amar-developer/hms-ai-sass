import ast
from pathlib import Path

from app.api.v1.identity import _permission_read
from app.modules.identity import permissions


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
        "departments",
        "discounts",
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
        "action": "edit",
        "description": "Identity Users Edit",
    }
    assert _permission_read("platform.subscriptions.manage").module == (
        "platform.subscriptions"
    )


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
