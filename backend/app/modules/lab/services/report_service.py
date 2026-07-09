from typing import Protocol

from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.identity.models import User
from app.modules.lab.models import LabOrder
from app.modules.lab.schemas import LabOrderDetailRead
from app.modules.lab.services.detail_builder import read_order_detail
from app.modules.lab.services.documents import simple_pdf
from app.modules.lab.services.validation import _get_order_or_404
from app.modules.subscriptions.service import enforce_module_enabled


class LabReportRenderer(Protocol):
    """Adapts a lab order's clinical detail into a downloadable report format."""

    def render(self, order: LabOrder, detail: LabOrderDetailRead) -> bytes: ...


class PdfLabReportRenderer:
    """Adapts the plain-text PDF writer to the LabReportRenderer interface."""

    def render(self, order: LabOrder, detail: LabOrderDetailRead) -> bytes:
        lines = [
            "MedizinHub HMS Lab Report",
            f"Order: {order.id}",
            f"Patient: {order.patient_id}",
            f"Tests: {order.tests}",
            f"Status: {order.status.value}",
            "",
        ]
        for result in detail.results:
            lines.extend(
                [
                    f"Result: {result.result_summary}",
                    f"Abnormal: {'Yes' if result.abnormal_flag else 'No'}",
                    f"Released: {result.released_at.isoformat()}",
                ]
            )
        if not detail.results:
            lines.append("No released result yet.")
        return simple_pdf(lines)


def render_lab_report_pdf(
    session: Session,
    *,
    tenant_id: str,
    order_id: str,
    current_user: User,
    renderer: LabReportRenderer | None = None,
) -> bytes:
    enforce_module_enabled(session, tenant_id, "lab")
    order = _get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    detail = read_order_detail(session, order)
    return (renderer or PdfLabReportRenderer()).render(order, detail)
