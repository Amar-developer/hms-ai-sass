import os
from pathlib import Path
import subprocess
import sys

import sqlalchemy as sa
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.dialects import postgresql


BACKEND_ROOT = Path(__file__).parents[1]
VERSIONS_DIR = BACKEND_ROOT / "alembic" / "versions"


def _migration_scripts() -> ScriptDirectory:
    config = Config(str(BACKEND_ROOT / "alembic" / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    return ScriptDirectory.from_config(config)


def test_alembic_revision_chain_is_complete_and_linear():
    scripts = _migration_scripts()
    revisions = list(scripts.walk_revisions(base="base", head="heads"))
    revision_ids = {revision.revision for revision in revisions}
    migration_files = {
        path for path in VERSIONS_DIR.glob("*.py") if path.name != "__init__.py"
    }

    assert len(scripts.get_heads()) == 1
    assert len(scripts.get_bases()) == 1
    assert len(revisions) == len(migration_files)
    assert len(revision_ids) == len(revisions)

    for revision in revisions:
        assert callable(revision.module.upgrade)
        assert callable(revision.module.downgrade)
        down_revisions = (
            revision.down_revision
            if isinstance(revision.down_revision, tuple)
            else (revision.down_revision,)
        )
        for down_revision in [item for item in down_revisions if item]:
            assert down_revision in revision_ids

    visited: set[str] = set()
    current = scripts.get_revision(scripts.get_heads()[0])
    while current:
        assert current.revision not in visited
        visited.add(current.revision)
        down_revision = current.down_revision
        if isinstance(down_revision, tuple):
            for item in down_revision:
                assert item in revision_ids
            down_revision = down_revision[0] if down_revision else None
        current = scripts.get_revision(down_revision) if down_revision else None

    assert visited.issubset(revision_ids)


def test_documented_alembic_cli_can_discover_revisions_without_pythonpath():
    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    completed = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic/alembic.ini", "heads"],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    assert "(head)" in completed.stdout


def test_patient_intelligence_enum_repair_casts_comparisons_and_values():
    scripts = _migration_scripts()
    migration = scripts.get_revision("20260824_0124").module
    category_type = postgresql.ENUM(
        "VALUE",
        "RECURRING",
        "LOYALTY",
        "ENGAGEMENT",
        "CARE_OPERATIONAL",
        "MEMBERSHIP",
        name="intelligenceflagcategory",
    )
    table = sa.table(
        "patientintelligencerule",
        sa.column("category", category_type),
    )
    statement = migration._repair_statement(table, "value", "VALUE")

    sql = str(statement.compile(dialect=postgresql.dialect()))

    assert "CAST(patientintelligencerule.category AS VARCHAR)" in sql
    assert "CAST(%(param_1)s AS intelligenceflagcategory)" in sql
