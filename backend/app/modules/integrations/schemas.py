from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class IntegrationPluginRead(BaseModel):
    key: str
    name: str
    category: str
    module_key: str
    provider: str
    description: str
    requires: list[str] = Field(default_factory=list)
    enabled: bool = False
    configured: bool = False
    config: dict[str, Any] = Field(default_factory=dict)
    updated_at: datetime | None = None


class IntegrationPluginUpdate(BaseModel):
    enabled: bool
    config: dict[str, Any] = Field(default_factory=dict)
    actor_user_id: str | None = None
