import json

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.modules.audit.service import record_audit_event
from app.modules.files.models import FileDocument
from app.modules.notifications.models import (
    DocumentDelivery,
    DocumentDeliveryChannel,
)


def queue_document_delivery(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    channel: DocumentDeliveryChannel,
    resource_type: str,
    resource_id: str,
    artifact_file_id: str,
    artifact_version: int,
    recipient: str,
    idempotency_key: str,
    subject: str | None = None,
    message: str | None = None,
    artifact_file_ids: list[str] | None = None,
    notification_event_id: str | None = None,
    queued_by_user_id: str | None = None,
    max_attempts: int = 5,
) -> DocumentDelivery:
    existing = session.exec(
        select(DocumentDelivery).where(
            DocumentDelivery.tenant_id == tenant_id,
            DocumentDelivery.channel == channel,
            DocumentDelivery.idempotency_key == idempotency_key,
        )
    ).first()
    if existing:
        if (
            existing.resource_type != resource_type
            or existing.resource_id != resource_id
            or existing.artifact_file_id != artifact_file_id
            or existing.recipient != recipient
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The idempotency key is already used by another delivery",
            )
        return existing
    file_ids = list(dict.fromkeys([artifact_file_id, *(artifact_file_ids or [])]))
    files = [session.get(FileDocument, file_id) for file_id in file_ids]
    if any(
        not row or row.tenant_id != tenant_id or row.document_status != "ready"
        for row in files
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A delivery artifact is missing or not ready",
        )
    primary = files[0]
    if primary.document_version != artifact_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The requested artifact version does not match the stored file",
        )
    delivery = DocumentDelivery(
        tenant_id=tenant_id,
        branch_id=branch_id,
        channel=channel,
        resource_type=resource_type,
        resource_id=resource_id,
        artifact_file_id=artifact_file_id,
        artifact_version=artifact_version,
        artifact_file_ids_json=json.dumps(file_ids),
        recipient=recipient,
        subject=subject,
        message=message,
        idempotency_key=idempotency_key,
        notification_event_id=notification_event_id,
        queued_by_user_id=queued_by_user_id,
        max_attempts=max_attempts,
    )
    session.add(delivery)
    session.commit()
    session.refresh(delivery)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        actor_user_id=queued_by_user_id,
        action="document_delivery.queued",
        resource_type=resource_type,
        resource_id=resource_id,
        purpose="document_delivery",
        metadata_json=json.dumps(
            {
                "delivery_id": delivery.id,
                "channel": channel.value,
                "artifact_file_id": artifact_file_id,
                "artifact_version": artifact_version,
            }
        ),
    )
    return delivery


def list_document_deliveries(
    session: Session, *, tenant_id: str, resource_type: str, resource_id: str
) -> list[DocumentDelivery]:
    return list(
        session.exec(
            select(DocumentDelivery)
            .where(
                DocumentDelivery.tenant_id == tenant_id,
                DocumentDelivery.resource_type == resource_type,
                DocumentDelivery.resource_id == resource_id,
            )
            .order_by(DocumentDelivery.created_at.desc())
        ).all()
    )
