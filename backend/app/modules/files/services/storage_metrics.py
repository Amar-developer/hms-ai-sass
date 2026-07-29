from collections import defaultdict

from sqlmodel import Session, select

from app.modules.files.models import FileDocument
from app.modules.notifications.models import NotificationEvent


def read_storage_metrics(session: Session, *, tenant_id: str) -> dict[str, object]:
    """Return metadata-only storage metrics without listing or reading S3."""
    rows = session.exec(
        select(FileDocument).where(FileDocument.tenant_id == tenant_id)
    ).all()
    active_rows = [row for row in rows if row.is_active]

    def size(row: FileDocument) -> int:
        return int(row.stored_size_bytes or row.file_size or 0)

    grouped: dict[str, dict[str, dict[str, int]]] = {
        "category": defaultdict(lambda: {"documents": 0, "stored_bytes": 0}),
        "artifact_type": defaultdict(lambda: {"documents": 0, "stored_bytes": 0}),
        "storage_backend": defaultdict(lambda: {"documents": 0, "stored_bytes": 0}),
    }
    for row in rows:
        for group, key in (
            ("category", row.category or "general"),
            ("artifact_type", row.artifact_type or "original"),
            ("storage_backend", row.storage_backend or "local"),
        ):
            grouped[group][key]["documents"] += 1
            grouped[group][key]["stored_bytes"] += size(row)

    deliveries = session.exec(
        select(NotificationEvent).where(
            NotificationEvent.tenant_id == tenant_id,
            NotificationEvent.resource_type == "invoice",
            NotificationEvent.template_key == "invoice_paid_patient",
        )
    ).all()
    active_final_keys: dict[tuple[str | None, str | None], int] = defaultdict(int)
    for row in active_rows:
        if row.artifact_type == "final" and row.attached_to_doctype == "Invoice":
            active_final_keys[(row.attached_to_name, row.attached_to_field)] += 1

    original_bytes = sum(int(row.original_size_bytes or size(row)) for row in rows)
    stored_bytes = sum(size(row) for row in rows)
    return {
        "total_documents": len(rows),
        "active_documents": len(active_rows),
        "total_stored_bytes": stored_bytes,
        "active_stored_bytes": sum(size(row) for row in active_rows),
        "original_bytes": original_bytes,
        "optimization_saved_bytes": max(original_bytes - stored_bytes, 0),
        "invoice_deliveries": len(deliveries),
        "pinned_invoice_deliveries": sum(
            1 for event in deliveries if event.artifact_file_id
        ),
        "legacy_unpinned_invoice_deliveries": sum(
            1 for event in deliveries if not event.artifact_file_id
        ),
        "duplicate_active_invoice_artifacts": sum(
            1 for count in active_final_keys.values() if count > 1
        ),
        "by_category": dict(grouped["category"]),
        "by_artifact_type": dict(grouped["artifact_type"]),
        "by_storage_backend": dict(grouped["storage_backend"]),
    }
