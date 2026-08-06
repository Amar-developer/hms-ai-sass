from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session

from app.core import auth_cache
from app.core.uploads import UPLOADS_DIR, save_upload
from app.modules.audit.models import AuditEvent
from app.modules.audit.repositories import AuditEventRepository
from app.modules.files.service import record_file_document
from app.modules.identity.models import User
from app.modules.settings.models import SettingKey, SettingScope
from app.modules.settings.service import upsert_setting
from app.modules.subscriptions.service import create_default_trial_subscription
from app.modules.tenants.models import Tenant, TenantStatus, TenantType, now_utc
from app.modules.tenants.repositories import TenantRepository
from app.modules.tenants.schemas import TenantCreate, TenantUpdate
from app.modules.tenants.services.helpers import (
    PRIMARY_TENANT_NAME,
    assert_unique_tenant_values,
    normal_key,
)


def create_tenant(
    session: Session, *, payload: TenantCreate, current_user: User
) -> Tenant:
    tenants = TenantRepository(session)
    audit_events = AuditEventRepository(session)
    if payload.is_primary:
        existing_primary = tenants.get_primary()
        if existing_primary:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Primary tenant already exists",
            )
    assert_unique_tenant_values(
        session, name=payload.name, email=payload.email, phone=payload.phone
    )
    tenant = Tenant.model_validate(
        payload,
        update={
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    tenants.add(tenant)
    session.commit()
    session.refresh(tenant)
    audit_events.add(
        AuditEvent(
            tenant_id=tenant.id,
            actor_user_id=current_user.id,
            action="tenant.created",
            resource_type="tenant",
            resource_id=tenant.id,
            purpose="platform_setup",
        )
    )
    session.commit()
    create_default_trial_subscription(session, tenant.id)
    return tenant


def list_tenants(session: Session) -> list[Tenant]:
    return TenantRepository(session).list_ordered()


def get_tenant_or_404(session: Session, tenant_id: str | None) -> Tenant:
    tenant = TenantRepository(session).get(tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found"
        )
    return tenant


def update_tenant(
    session: Session,
    *,
    tenant_id: str,
    payload: TenantUpdate,
    current_user: User,
) -> Tenant:
    tenants = TenantRepository(session)
    audit_events = AuditEventRepository(session)
    tenant = get_tenant_or_404(session, tenant_id)
    updates = payload.model_dump(exclude_unset=True)
    for required_key in ("name", "tenant_type", "status", "country"):
        if updates.get(required_key) is None:
            updates.pop(required_key, None)
    if tenant.is_primary:
        if updates.get("name") not in (None, PRIMARY_TENANT_NAME):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Primary tenant name is fixed",
            )
        if updates.get("tenant_type") not in (
            None,
            TenantType.PRIMARY,
            TenantType.PRIMARY.value,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Primary tenant type is fixed",
            )
        if updates.get("status") not in (None, TenantStatus.ACTIVE):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Primary tenant must remain active",
            )
    changed_name = (
        updates.get("name")
        if "name" in updates
        and normal_key(updates.get("name")) != normal_key(tenant.name)
        else None
    )
    changed_email = (
        updates.get("email")
        if "email" in updates
        and normal_key(updates.get("email")) != normal_key(tenant.email)
        else None
    )
    changed_phone = (
        updates.get("phone")
        if "phone" in updates
        and normal_key(updates.get("phone")) != normal_key(tenant.phone)
        else None
    )
    assert_unique_tenant_values(
        session,
        name=changed_name,
        email=changed_email,
        phone=changed_phone,
        current_tenant_id=tenant.id,
    )
    for key, value in updates.items():
        if isinstance(value, TenantType):
            value = value.value
        setattr(tenant, key, value)
    tenant.updated_by_user_id = current_user.id
    tenant.updated_at = now_utc()
    tenants.add(tenant)
    audit_events.add(
        AuditEvent(
            tenant_id=tenant.id,
            actor_user_id=current_user.id,
            action="tenant.updated",
            resource_type="tenant",
            resource_id=tenant.id,
            purpose="platform_management",
        )
    )
    session.commit()
    session.refresh(tenant)
    if "status" in updates:
        auth_cache.invalidate_tenant(tenant.id)
    return tenant


async def upload_tenant_logo(
    session: Session,
    *,
    tenant_id: str,
    file: UploadFile,
    current_user: User,
) -> Tenant:
    tenants = TenantRepository(session)
    audit_events = AuditEventRepository(session)
    tenant = get_tenant_or_404(session, tenant_id)
    filename, url_path, verified_content_type = await save_upload(
        file, f"tenant_logo_{tenant.id}"
    )
    if verified_content_type not in {"image/png", "image/jpeg"}:
        (UPLOADS_DIR / filename).unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant logo must be a PNG or JPEG image",
        )
    tenant.logo_url = url_path
    tenant.updated_by_user_id = current_user.id
    tenant.updated_at = now_utc()
    tenants.add(tenant)
    upsert_setting(
        session,
        tenant_id=tenant.id,
        scope=SettingScope.TENANT,
        scope_id=tenant.id,
        module="invoice",
        key=SettingKey.INVOICE_LOGO_URL,
        value=url_path,
        actor_user_id=current_user.id,
    )
    record_file_document(
        session,
        tenant_id=tenant.id,
        file_name=file.filename or filename,
        file_url=url_path,
        content_type=verified_content_type,
        category="logo",
        source_module="tenants",
        attached_to_doctype="Tenant",
        attached_to_name=tenant.id,
        attached_to_field="logo_url",
        attached_to_label="Tenant Logo",
        uploaded_by_user_id=current_user.id,
    )
    audit_events.add(
        AuditEvent(
            tenant_id=tenant.id,
            actor_user_id=current_user.id,
            action="tenant.logo_uploaded",
            resource_type="tenant",
            resource_id=tenant.id,
            purpose="platform_management",
        )
    )
    session.commit()
    session.refresh(tenant)
    return tenant


def delete_tenant(
    session: Session, *, tenant_id: str, current_user: User
) -> dict[str, str | bool]:
    tenants = TenantRepository(session)
    audit_events = AuditEventRepository(session)
    tenant = get_tenant_or_404(session, tenant_id)
    if tenant.is_primary:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Primary tenant cannot be deleted",
        )
    tenant.status = TenantStatus.SUSPENDED
    tenant.updated_by_user_id = current_user.id
    tenant.updated_at = now_utc()
    tenants.add(tenant)
    audit_events.add(
        AuditEvent(
            tenant_id=tenant.id,
            actor_user_id=current_user.id,
            action="tenant.deactivated",
            resource_type="tenant",
            resource_id=tenant.id,
            purpose="platform_management_soft_delete",
        )
    )
    session.commit()
    auth_cache.invalidate_tenant(tenant.id)
    return {
        "deleted": False,
        "deactivated": True,
        "mode": "deactivated",
        "tenant_id": tenant.id,
    }
