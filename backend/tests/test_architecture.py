import ast
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1] / "app"
ADAPTER_ROOT = APP_ROOT / "infrastructure" / "integrations" / "adapters"
PORT_ROOT = APP_ROOT / "infrastructure" / "integrations" / "ports"
PROVIDER_PACKAGES = {"boto3", "redis", "smtplib"}


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0])
    return imported


def test_external_provider_packages_are_isolated_to_adapters():
    violations: list[str] = []
    for path in APP_ROOT.rglob("*.py"):
        if path.is_relative_to(ADAPTER_ROOT):
            continue
        packages = _imports(path) & PROVIDER_PACKAGES
        if packages:
            violations.append(
                f"{path.relative_to(APP_ROOT)} imports {', '.join(sorted(packages))}"
            )
    assert violations == []


def test_integration_ports_do_not_depend_on_modules_or_adapters():
    violations: list[str] = []
    for path in PORT_ROOT.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        if "app.modules" in source or "integrations.adapters" in source:
            violations.append(str(path.relative_to(APP_ROOT)))
    assert violations == []
