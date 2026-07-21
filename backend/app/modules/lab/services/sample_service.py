from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.identity.models import User
from app.modules.lab.models import LabOrderStatus, LabSample
from app.modules.lab.repositories import LabOrderRepository
from app.modules.lab.schemas import LabOrderDetailRead, LabSampleCreate
from app.modules.lab.services.detail_builder import read_order_detail
from app.modules.lab.services.validation import _get_order_or_404
from app.modules.subscriptions.service import enforce_module_enabled


def collect_lab_sample_record(
    session: Session,
    *,
    tenant_id: str,
    order_id: str,
    payload: LabSampleCreate,
    current_user: User,
) -> LabOrderDetailRead:
    enforce_module_enabled(session, tenant_id, "lab")
    order = _get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    if order.status == LabOrderStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot collect sample for cancelled order",
        )
    before = {"status": order.status}
    now = datetime.now(timezone.utc)
    sample = LabSample(
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        lab_order_id=order.id,
        barcode=payload.barcode or f"{order.id}-{len(order.id)}",
        sample_type=payload.sample_type,
        collected_by_user_id=payload.collected_by_user_id,
        collected_at=now,
        notes=payload.notes,
    )
    order.status = LabOrderStatus.SAMPLE_COLLECTED
    order.sample_collected_at = now
    order.updated_at = now
    item_rows = LabOrderRepository(session).list_order_items(
        tenant_id=tenant_id,
        order_id=order.id,
    )
    for item in item_rows:
        item.status = LabOrderStatus.SAMPLE_COLLECTED
        item.updated_at = now
        session.add(item)
    session.add(sample)
    session.add(order)
    session.commit()
    after = {"status": order.status}
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        actor_user_id=payload.collected_by_user_id,
        action="lab_sample.collected",
        resource_type="lab_order",
        resource_id=order.id,
        purpose="diagnostics",
        changes=diff_changes(before, after),
    )
    return read_order_detail(session, order)
