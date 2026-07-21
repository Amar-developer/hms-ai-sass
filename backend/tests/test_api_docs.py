import pathlib
import re

from app.main import create_app

# backend/tests/test_api_docs.py -> backend/ -> repo root. Resolved from
# this file's own location (not the CWD) so the test behaves the same
# whether pytest is invoked from the repo root, backend/, or elsewhere —
# a CWD-relative "docs" path here previously made every route look
# undocumented whenever pytest ran from backend/.
REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


def test_api_permission_matrix_lists_all_live_routes():
    actual_routes = set()
    for route in create_app().routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api"):
            continue
        for method in getattr(route, "methods", []) or []:
            if method not in {"HEAD", "OPTIONS"}:
                actual_routes.add((method, path))

    docs_text = "\n".join(
        path.read_text() for path in (REPO_ROOT / "docs").glob("*.md")
    )
    documented_routes = {
        (match.group(1), match.group(2).split("?")[0])
        for match in re.finditer(
            r"`(GET|POST|PUT|PATCH|DELETE)`\s*\|\s*`([^`]+)`", docs_text
        )
    }

    assert actual_routes - documented_routes == set()
    assert documented_routes - actual_routes == set()
