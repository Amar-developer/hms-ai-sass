"""Replace a literal SMSCountry auth key in the stored API URL with a placeholder.

SMSCountry's REST path names the account, and tenants configured before the
placeholder was enforced pasted the auth key straight into it. That leaves a
live credential in plaintext config_json, returned by every settings read and
present in any URL logging. Rewrite the account segment to {auth_key}; the
adapter substitutes the encrypted key at send time, so sending is unaffected.

The segment is replaced whatever its value: it is only ever the account key,
and a URL already using the placeholder is left alone.
"""

from collections.abc import Sequence
import json
import re

from alembic import op
import sqlalchemy as sa


revision: str = "20260831_0134"
down_revision: str | None = "20260831_0133"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PLUGIN_TABLE = "tenantintegrationplugin"
ACCOUNT_SEGMENT = re.compile(r"(/Accounts/)([^/?]+)")
PLACEHOLDER = "{auth_key}"


def _rewrite(url: str) -> str:
    def _sub(match: re.Match[str]) -> str:
        return f"{match.group(1)}{PLACEHOLDER}"

    return ACCOUNT_SEGMENT.sub(_sub, url, count=1)


def upgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table(PLUGIN_TABLE):
        return
    rows = bind.execute(
        sa.text(f"SELECT id, config_json FROM {PLUGIN_TABLE} WHERE plugin_key = 'sms'")
    ).fetchall()
    for row_id, config_json in rows:
        try:
            config = json.loads(config_json or "{}")
        except json.JSONDecodeError:
            continue
        url = str(config.get("api_url") or "")
        if not url or PLACEHOLDER in url or "/Accounts/" not in url:
            continue
        config["api_url"] = _rewrite(url)
        bind.execute(
            sa.text(f"UPDATE {PLUGIN_TABLE} SET config_json = :cfg WHERE id = :id"),
            {"cfg": json.dumps(config), "id": row_id},
        )


def downgrade() -> None:
    # The literal key is not recoverable from config alone (it lives in the
    # encrypted secret bundle), and the placeholder form is what the adapter
    # expects, so there is nothing to undo.
    pass
