from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.core.pagination import DEFAULT_LIST_LIMIT
from app.modules.billing.services.source_references import (
    active_lab_invoice_reference_map,
)
from app.modules.identity.models import User
from app.modules.lab.models import LabOrderStatus
from app.modules.lab.repositories import LabOrderRepository
from app.modules.lab.schemas import LabOrderDetailRead, LabOrderRead
from app.modules.lab.services.detail_builder import read_order_detail
from app.modules.lab.services.validation import get_order_or_404
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.patients.services.references import patient_reference_map


def list_lab_orders_records(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    patient_id: str | None,
    status_filter: LabOrderStatus | None,
    limit: int = DEFAULT_LIST_LIMIT,
    offset: int = 0,
) -> list[LabOrderRead]:
    enforce_module_enabled(session, tenant_id, "lab")
    rows = LabOrderRepository(session).list_orders(
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )
    patients = patient_reference_map(
        session,
        tenant_id=tenant_id,
        patient_ids={order.patient_id for order in rows},
    )
    invoice_references = active_lab_invoice_reference_map(
        session,
        tenant_id=tenant_id,
        lab_order_ids={order.id for order in rows},
    )
    result: list[LabOrderRead] = []
    for order in rows:
        read = LabOrderRead.model_validate(order, from_attributes=True)
        patient = patients.get(order.patient_id)
        if patient:
            read.patient_name = patient.name
            read.patient_number = patient.number
        read.billing_invoice_id = invoice_references.get(order.id)
        result.append(read)
    return result


def get_lab_order_detail(
    session: Session, *, tenant_id: str, order_id: str, current_user: User
) -> LabOrderDetailRead:
    enforce_module_enabled(session, tenant_id, "lab")
    order = get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    return read_order_detail(session, order)
