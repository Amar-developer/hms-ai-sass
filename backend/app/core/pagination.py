from typing import Generic, TypeVar

from pydantic import BaseModel


# Safety bounds for list endpoints that are scoped only by tenant and read from
# append-only tables (stock ledger, lab orders, admissions, notification events,
# billing ledger). Those tables grow without limit, so an uncapped query gets
# permanently slower and can eventually exhaust a worker's memory. The default
# sits well above realistic current volumes, so responses are unchanged today.
DEFAULT_LIST_LIMIT = 500
MAX_LIST_LIMIT = 1000

PageItem = TypeVar("PageItem")


class Page(BaseModel, Generic[PageItem]):
    """Stable response contract for database-backed list pagination."""

    items: list[PageItem]
    total: int
    limit: int
    offset: int
