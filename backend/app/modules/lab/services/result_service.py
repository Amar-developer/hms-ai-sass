from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.files.service import record_file_document
from app.modules.identity.models import User
from app.modules.lab.models import LabOrderStatus, LabResult
from app.modules.lab.repositories import LabOrderRepository, LabReferenceRepository
from app.modules.lab.schemas import LabOrderDetailRead, LabResultCreate
from app.modules.lab.services.detail_builder import read_order_detail
from app.modules.lab.services.validation import _get_order_or_404
from app.modules.notifications.models import NotificationEventType, NotificationProvider
from app.modules.notifications.service import (
    queue_notification_if_allowed,
    queue_sms_template_if_allowed,
    queue_whatsapp_template_if_allowed,
    whatsapp_template_integration_enabled,
)
from app.modules.subscriptions.service import enforce_module_enabled


def add_lab_result_record(
    session: Session,
    *,
    tenant_id: str,
    order_id: str,
    payload: LabResultCreate,
    current_user: User,
) -> LabOrderDetailRead:
    enforce_module_enabled(session, tenant_id, "lab")
    order = _get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    if order.status == LabOrderStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot add result to cancelled order",
        )
    before = {"status": order.status}
    now = datetime.now(timezone.utc)
    result = LabResult.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": order.branch_id,
            "lab_order_id": order.id,
            # The releasing user is the authenticated caller, not a client value.
            "released_by_user_id": current_user.id,
        },
    )
    order.status = LabOrderStatus.RESULT_READY
    order.result_ready_at = now
    order.updated_at = now
    item_rows = LabOrderRepository(session).list_order_items(
        tenant_id=tenant_id,
        order_id=order.id,
    )
    for item in item_rows:
        item.status = LabOrderStatus.RESULT_READY
        item.updated_at = now
        session.add(item)
    session.add(result)
    report_document = None
    if payload.report_url:
        report_document = record_file_document(
            session,
            tenant_id=tenant_id,
            branch_id=order.branch_id,
            patient_id=order.patient_id,
            file_name=payload.report_file_name or "Lab Report",
            file_url=payload.report_url,
            category="lab_report",
            source_module="lab",
            attached_to_doctype="LabOrder",
            attached_to_name=order.id,
            attached_to_field="report_url",
            attached_to_label="Lab Report",
            uploaded_by_user_id=payload.released_by_user_id or current_user.id,
        )
    session.add(order)
    session.commit()
    session.refresh(order)
    patient = LabReferenceRepository(session).get_patient(order.patient_id)
    if patient:
        queue_sms_template_if_allowed(
            session,
            tenant_id=tenant_id,
            branch_id=order.branch_id,
            flow_key="lab_report_ready_patient",
            patient=patient,
            resource_type="lab_order",
            resource_id=order.id,
            dedupe_key=f"sms:lab:{order.id}:result-ready",
            variables={
                "patient_name": patient.full_name,
                "tests": order.tests,
            },
            queued_by_user_id=current_user.id,
        )
        template_event = queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant_id,
            branch_id=order.branch_id,
            flow_key="lab_report_ready_patient",
            recipient=patient.mobile,
            resource_type="lab_order",
            resource_id=order.id,
            dedupe_key=f"whatsapp:lab:{order.id}:result-ready",
            queued_by_user_id=current_user.id,
            artifact_file_id=report_document.id if report_document else None,
            artifact_version=(
                report_document.document_version if report_document else None
            ),
        )
        if not template_event and not whatsapp_template_integration_enabled(
            session, tenant_id
        ):
            queue_notification_if_allowed(
                session,
                tenant_id=tenant_id,
                branch_id=order.branch_id,
                provider=NotificationProvider.WHATSAPP,
                event_type=NotificationEventType.LAB_REPORT_READY,
                recipient=patient.mobile,
                subject="Lab report ready",
                message=f"Your lab report for {order.tests} is ready.",
                resource_type="lab_order",
                resource_id=order.id,
                queued_by_user_id=current_user.id,
            )
    after = {"status": order.status}
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        actor_user_id=current_user.id,
        action="lab_result.released",
        resource_type="lab_order",
        resource_id=order.id,
        purpose="diagnostics",
        changes=diff_changes(before, after),
    )
    return read_order_detail(session, order)
