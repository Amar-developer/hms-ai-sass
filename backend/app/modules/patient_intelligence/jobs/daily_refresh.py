from __future__ import annotations

import argparse
import logging
from collections.abc import Callable

from sqlmodel import Session

from app.core.database import engine
from app.core.logging import configure_logging
from app.modules.notifications.whatsapp_processor import (
    process_due_whatsapp_notifications,
)
from app.modules.patient_intelligence.service import refresh_due_patient_intelligence


logger = logging.getLogger("medizinhub.patient_intelligence.daily_refresh")


def run_daily_refresh(
    *,
    session_factory: Callable[[], Session] | None = None,
    batch_size: int = 500,
    max_batches: int = 20,
    send_whatsapp: bool = True,
) -> int:
    """Refresh stale patient intelligence and process newly due WhatsApp reminders.

    Designed for cron/systemd/Kubernetes CronJob one-shot execution. The
    report worker also calls the same refresh service continuously, so this
    command is useful when a deployment prefers an external scheduler.
    """

    make_session = session_factory or (lambda: Session(engine))
    total = 0
    for _batch in range(max_batches):
        with make_session() as session:
            refreshed = refresh_due_patient_intelligence(session, limit=batch_size)
            session.commit()
        total += refreshed
        if refreshed < batch_size:
            break
    if send_whatsapp:
        with make_session() as session:
            sent = process_due_whatsapp_notifications(session)
            session.commit()
        logger.info(
            "patient_intelligence.daily_refresh_whatsapp_processed",
            extra={"processed_count": sent},
        )
    logger.info(
        "patient_intelligence.daily_refresh_completed",
        extra={"patient_count": total},
    )
    return total


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Refresh Patient Intelligence and process due WhatsApp reminders."
    )
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--max-batches", type=int, default=20)
    parser.add_argument(
        "--no-send-whatsapp",
        action="store_true",
        help="Only create/update engagement actions; do not process WhatsApp sends.",
    )
    args = parser.parse_args()
    configure_logging()
    run_daily_refresh(
        batch_size=max(args.batch_size, 1),
        max_batches=max(args.max_batches, 1),
        send_whatsapp=not args.no_send_whatsapp,
    )


if __name__ == "__main__":
    main()
