from fastapi import HTTPException
from sqlmodel import Session, select

from app.core.access_control import require_user_branch_access
from app.modules.files.models import FileDocument
from app.modules.files.repositories import FileDocumentRepository
from app.modules.identity.models import User
from app.modules.lab.models import LabOrder, LabOrderStatus
from app.modules.notifications.models import DocumentDeliveryChannel
from app.modules.notifications.schemas import DocumentDeliveryRequest
from app.modules.notifications.service import queue_whatsapp_template_if_allowed
from app.modules.notifications.services.document_delivery import queue_document_delivery
from app.modules.patients.models import Patient


def queue_lab_report_delivery(
    session: Session,
    *,
    tenant_id: str,
    order_id: str,
    payload: DocumentDeliveryRequest,
    actor: User,
):
    order = session.get(LabOrder, order_id)
    if not order or order.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Lab order not found")
    require_user_branch_access(actor, order.branch_id)
    if order.status not in {
        LabOrderStatus.RESULT_READY,
        LabOrderStatus.REPORT_DELIVERED,
    }:
        raise HTTPException(status_code=409, detail="Lab report is not ready")
    if payload.artifact_file_id:
        original = session.get(FileDocument, payload.artifact_file_id)
    else:
        original = session.exec(
            select(FileDocument)
            .where(
                FileDocument.tenant_id == tenant_id,
                FileDocument.attached_to_doctype == "LabOrder",
                FileDocument.attached_to_name == order.id,
                FileDocument.category == "lab_report",
                FileDocument.is_active == True,  # noqa: E712
            )
            .order_by(FileDocument.created_at.desc())
        ).first()
    if not (
        original
        and original.tenant_id == tenant_id
        and original.attached_to_doctype == "LabOrder"
        and original.attached_to_name == order.id
        and original.document_status == "ready"
    ):
        raise HTTPException(status_code=409, detail="No ready lab report is available")
    rendition = FileDocumentRepository(session).find_ready_rendition(
        tenant_id=tenant_id, original_file_id=original.id
    )
    artifact = rendition or original
    patient = session.get(Patient, order.patient_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(status_code=409, detail="Lab patient is not available")

    notification_event_id = None
    if payload.channel == DocumentDeliveryChannel.WHATSAPP:
        event = queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant_id,
            branch_id=order.branch_id,
            flow_key="lab_report_ready_patient",
            recipient=patient.mobile,
            resource_type="lab_order",
            resource_id=order.id,
            dedupe_key=f"whatsapp:lab:{order.id}:send:{payload.idempotency_key}",
            queued_by_user_id=actor.id,
            artifact_file_id=artifact.id,
            artifact_version=artifact.document_version,
        )
        if not event:
            raise HTTPException(
                status_code=409,
                detail="Lab report WhatsApp delivery could not be queued",
            )
        recipient = event.recipient
        notification_event_id = event.id
    else:
        if not patient.email:
            raise HTTPException(status_code=409, detail="Patient email is missing")
        recipient = patient.email

    delivery = queue_document_delivery(
        session,
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        channel=payload.channel,
        resource_type="lab_order",
        resource_id=order.id,
        artifact_file_id=artifact.id,
        artifact_version=artifact.document_version,
        recipient=recipient,
        subject=f"Lab report {order.lab_order_number or order.id}",
        message="Your finalized lab report is attached.",
        idempotency_key=f"lab-order:{order.id}:{payload.idempotency_key}",
        notification_event_id=notification_event_id,
        queued_by_user_id=actor.id,
    )
    return delivery
