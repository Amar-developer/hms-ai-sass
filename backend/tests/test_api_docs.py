import pathlib
import re

from app.main import create_app


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
        path.read_text() for path in pathlib.Path("docs").glob("*.md")
    )
    documented_routes = {
        (match.group(1), match.group(2).split("?")[0])
        for match in re.finditer(
            r"`(GET|POST|PUT|PATCH|DELETE)`\s*\|\s*`([^`]+)`", docs_text
        )
    }

    assert actual_routes - documented_routes == set()
    assert documented_routes - actual_routes == set()
