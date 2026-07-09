from sqlmodel import Session

from app.modules.lab.models import LabOrder
from app.modules.lab.repositories import LabOrderRepository
from app.modules.lab.schemas import (
    LabOrderDetailRead,
    LabOrderItemRead,
    LabOrderRead,
    LabResultRead,
    LabSampleRead,
)
from app.modules.lab.services.pricing import reprice_zero_order_items


def read_order_detail(session: Session, order: LabOrder) -> LabOrderDetailRead:
    """Assembles a LabOrderDetailRead from an order's items, samples, and results."""
    if int(order.amount or 0) <= 0:
        reprice_zero_order_items(session, order)
    order_repo = LabOrderRepository(session)
    items = order_repo.list_order_items(tenant_id=order.tenant_id, order_id=order.id)
    samples = order_repo.list_samples(tenant_id=order.tenant_id, order_id=order.id)
    results = order_repo.list_results(tenant_id=order.tenant_id, order_id=order.id)
    return LabOrderDetailRead(
        order=LabOrderRead.model_validate(order, from_attributes=True),
        items=[
            LabOrderItemRead.model_validate(item, from_attributes=True)
            for item in items
        ],
        samples=[
            LabSampleRead.model_validate(sample, from_attributes=True)
            for sample in samples
        ],
        results=[
            LabResultRead.model_validate(result, from_attributes=True)
            for result in results
        ],
    )
