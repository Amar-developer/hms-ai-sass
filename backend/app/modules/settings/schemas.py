from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.modules.settings.models import SettingKey, SettingScope


class AdminSettingUpsert(BaseModel):
    scope: SettingScope = SettingScope.TENANT
    scope_id: str | None = None
    module: str = Field(min_length=2, max_length=80)
    key: SettingKey
    value: Any
    actor_user_id: str | None = None


class AdminSettingRead(BaseModel):
    id: str
    tenant_id: str
    scope: SettingScope
    scope_id: str
    module: str
    key: SettingKey
    value: Any
    created_by_user_id: str | None
    updated_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class ResolvedSettingRead(BaseModel):
    tenant_id: str
    branch_id: str | None
    module: str
    key: SettingKey
    value: Any
    source_scope: SettingScope | None
    source_scope_id: str | None


class AdminSettingsBundle(BaseModel):
    settings: list[ResolvedSettingRead]
