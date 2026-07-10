from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.identity.models import User
from app.modules.lab.models import LabOrder, LabOrderStatus
from app.modules.lab.repositories import LabOrderRepository
from app.modules.lab.schemas import LabOrderDetailRead
from app.modules.lab.services.detail_builder import read_order_detail
from app.modules.lab.services.pricing import reprice_zero_order_items
from app.modules.lab.services.validation import get_order_or_404
from app.modules.subscriptions.service import enforce_module_enabled


def list_lab_orders_records(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    patient_id: str | None,
    status_filter: LabOrderStatus | None,
) -> list[LabOrder]:
    enforce_module_enabled(session, tenant_id, "lab")
    rows = LabOrderRepository(session).list_orders(
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        status_filter=status_filter,
    )
    for order in rows:
        if int(order.amount or 0) <= 0:
            reprice_zero_order_items(session, order)
    return rows


def get_lab_order_detail(
    session: Session, *, tenant_id: str, order_id: str, current_user: User
) -> LabOrderDetailRead:
    enforce_module_enabled(session, tenant_id, "lab")
    order = get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    return read_order_detail(session, order)
