from datetime import date, datetime

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


class SmsProviderReconciliation(SQLModel, table=True):
    """One admin-entered comparison of SMSCountry's own invoice against what
    this system counted as sent for the same billing period.

    SMSCountry does not expose a reconciliation API, so `provider_billed_*`
    is read off the provider's invoice by hand; `internal_segments` is
    computed from NotificationEvent at record time and frozen here so a
    later re-run of this period doesn't silently change history.
    """

    id: str = Field(default_factory=lambda: new_id("smsrecon"), primary_key=True)
    tenant_id: str = Field(index=True, foreign_key="tenant.id")
    period_start: date = Field(index=True)
    period_end: date = Field(index=True)
    provider_billed_segments: int = Field(ge=0)
    provider_amount_paise: int = Field(default=0, ge=0)
    internal_segments: int = Field(ge=0)
    variance_segments: int = Field(default=0)
    notes: str = Field(default="", max_length=1000)
    recorded_by_user_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=now_utc, index=True)
