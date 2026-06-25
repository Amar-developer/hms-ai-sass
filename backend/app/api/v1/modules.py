from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.modules.manifest import MODULES

router = APIRouter()


class ModuleManifestItem(BaseModel):
    key: str
    name: str
    category: str = "core"
    status: str
    minimum_plan: str
    entitlement_key: str | None = None
    default_enabled: bool = False
    is_core: bool = False
    dependencies: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    settings: list[str] = Field(default_factory=list)
    routes: list[str] = Field(default_factory=list)
    reports: list[str] = Field(default_factory=list)
    description: str


@router.get("/modules", response_model=list[ModuleManifestItem])
def list_modules() -> list[ModuleManifestItem]:
    return [ModuleManifestItem(**module) for module in MODULES]
