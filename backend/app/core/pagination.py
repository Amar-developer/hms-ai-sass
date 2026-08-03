from typing import Generic, TypeVar

from pydantic import BaseModel


PageItem = TypeVar("PageItem")


class Page(BaseModel, Generic[PageItem]):
    """Stable response contract for database-backed list pagination."""

    items: list[PageItem]
    total: int
    limit: int
    offset: int
