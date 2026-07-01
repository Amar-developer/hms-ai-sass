import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.core.tenant_context import require_tenant_id
from app.modules.identity.models import User


router = APIRouter(prefix="/client-logs")
client_logger = logging.getLogger("medizinhub.frontend")


class ClientLogCreate(BaseModel):
    level: str = Field(default="error", pattern="^(warning|error)$")
    event: str = Field(min_length=3, max_length=120)
    message: str = Field(min_length=1, max_length=1000)
    module: str | None = Field(default=None, max_length=100)
    route: str | None = Field(default=None, max_length=300)
    request_id: str | None = Field(default=None, max_length=100)
    stack: str | None = Field(default=None, max_length=4000)


@router.post("", status_code=status.HTTP_202_ACCEPTED)
def create_client_log(
    payload: ClientLogCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(get_current_user),
) -> dict[str, bool]:
    if not current_user.is_super_admin and current_user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied"
        )
    log = client_logger.error if payload.level == "error" else client_logger.warning
    log(
        payload.event,
        extra={
            "tenant_id": tenant_id,
            "user_id": current_user.id,
            "client_module": payload.module,
            "client_route": payload.route,
            "client_request_id": payload.request_id,
            "client_message": payload.message,
            "client_stack": payload.stack,
        },
    )
    return {"accepted": True}
