from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel

from app.modules.tenants.models import new_id, now_utc


class TenantIntegrationPlugin(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "plugin_key", name="uq_tenant_integration_plugin"
        ),
    )

    id: str = Field(default_factory=lambda: new_id("plugin"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    plugin_key: str = Field(index=True, min_length=2, max_length=120)
    enabled: bool = Field(default=False, index=True)
    config_json: str = Field(default="{}")
    secret_ciphertext: str | None = Field(default=None, max_length=4096)
    secret_last_four: str | None = Field(default=None, max_length=4)
    created_by_user_id: str | None = Field(default=None, index=True)
    updated_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
    updated_at: datetime = Field(default_factory=now_utc)
