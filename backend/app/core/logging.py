import json
import logging
from contextvars import ContextVar
from datetime import datetime, timezone

from app.core.config import get_settings


request_id_context: ContextVar[str | None] = ContextVar(
    "request_id_context", default=None
)
tenant_id_context: ContextVar[str | None] = ContextVar(
    "tenant_id_context", default=None
)


STANDARD_LOG_FIELDS = {
    "name",
    "msg",
    "args",
    "levelname",
    "levelno",
    "pathname",
    "filename",
    "module",
    "exc_info",
    "exc_text",
    "stack_info",
    "lineno",
    "funcName",
    "created",
    "msecs",
    "relativeCreated",
    "thread",
    "threadName",
    "processName",
    "process",
    "taskName",
}


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in STANDARD_LOG_FIELDS and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, separators=(",", ":"))


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = request_id_context.get()
        if not hasattr(record, "tenant_id"):
            record.tenant_id = tenant_id_context.get()
        return True


def configure_logging() -> None:
    settings = get_settings()
    app_logger = logging.getLogger("medizinhub")
    app_logger.setLevel(settings.log_level.upper())
    app_logger.propagate = False
    if not app_logger.handlers:
        handler = logging.StreamHandler()
        handler.addFilter(RequestContextFilter())
        handler.setFormatter(JsonLogFormatter())
        app_logger.addHandler(handler)
