from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


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

    assert scripts.get_heads() == ["20260727_0097"]
    assert len(scripts.get_bases()) == 1
    assert len(revisions) == len(migration_files)
    assert len(revision_ids) == len(revisions)

    for revision in revisions:
        assert callable(revision.module.upgrade)
        assert callable(revision.module.downgrade)
        assert not isinstance(revision.down_revision, tuple)
        if revision.down_revision:
            assert revision.down_revision in revision_ids

    visited: set[str] = set()
    current = scripts.get_revision(scripts.get_heads()[0])
    while current:
        assert current.revision not in visited
        visited.add(current.revision)
        current = (
            scripts.get_revision(current.down_revision)
            if current.down_revision
            else None
        )

    assert visited == revision_ids
