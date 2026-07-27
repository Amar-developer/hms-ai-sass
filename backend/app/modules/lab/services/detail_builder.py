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
from app.modules.patients.services.references import patient_reference_map


def read_order_detail(session: Session, order: LabOrder) -> LabOrderDetailRead:
    """Assembles a LabOrderDetailRead from an order's items, samples, and results."""
    order_repo = LabOrderRepository(session)
    items = order_repo.list_order_items(tenant_id=order.tenant_id, order_id=order.id)
    samples = order_repo.list_samples(tenant_id=order.tenant_id, order_id=order.id)
    results = order_repo.list_results(tenant_id=order.tenant_id, order_id=order.id)
    order_read = LabOrderRead.model_validate(order, from_attributes=True)
    patient = patient_reference_map(
        session,
        tenant_id=order.tenant_id,
        patient_ids={order.patient_id},
    ).get(order.patient_id)
    if patient:
        order_read.patient_name = patient.name
        order_read.patient_number = patient.number
    return LabOrderDetailRead(
        order=order_read,
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
