import re

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import scoped_branch_id
from app.core.config import get_settings
from app.modules.identity.models import User
from app.modules.integrations.graphql_catalog import GraphQLCatalogClient
from app.modules.pharmacy.models import MedicineCatalog
from app.modules.pharmacy.repositories import PharmacyCatalogRepository
from app.modules.subscriptions.service import enforce_module_enabled


def catalog_key(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def find_catalog_medicine(
    session: Session, tenant_id: str, branch_id: str, medicine_name: str
) -> MedicineCatalog | None:
    requested = catalog_key(medicine_name)
    if not requested:
        return None
    medicines = PharmacyCatalogRepository(session).list_active_medicines(
        tenant_id=tenant_id
    )

    def score(row: MedicineCatalog) -> int:
        keys = [
            catalog_key(row.name),
            catalog_key(row.generic_name),
            catalog_key(row.strength),
        ]
        value = 0
        for key in keys:
            if not key:
                continue
            if key == requested:
                value = max(value, 100)
            elif requested in key or key in requested:
                value = max(value, 70)
        if row.branch_id == branch_id:
            value += 10
        elif row.branch_id is not None:
            value -= 20
        return value

    matches = sorted(
        ((score(row), row) for row in medicines), key=lambda item: item[0], reverse=True
    )
    return matches[0][1] if matches and matches[0][0] > 0 else None


def external_medicine_items_enabled(session: Session, tenant_id: str) -> bool:
    return True


def medicine_graphql_client() -> GraphQLCatalogClient:
    settings = get_settings()
    if not settings.medicine_graphql_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Medicine catalog plugin is not configured",
        )
    return GraphQLCatalogClient(
        graphql_url=settings.medicine_graphql_url,
        timeout_seconds=settings.medicine_graphql_timeout_seconds,
    )


def normalize_local_medicine(row: MedicineCatalog) -> dict[str, str]:
    return {
        "id": row.id,
        "name": row.name,
        "item_name": row.name,
        "slug": row.code or row.id,
        "generic_name": row.generic_name or "",
        "strength": row.strength or "",
        "source": "local",
    }


def list_medicines_service(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    search: str | None,
    actor: User,
) -> list[MedicineCatalog]:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    branch_id = scoped_branch_id(actor, branch_id)
    return PharmacyCatalogRepository(session).list_active_medicines(
        tenant_id=tenant_id,
        branch_id=branch_id,
        search=search,
    )


def list_available_medicines_service(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    search: str | None,
    page_size: int,
    current_page: int,
    actor: User,
) -> list[dict[str, str]]:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    if external_medicine_items_enabled(session, tenant_id):
        return medicine_graphql_client().get_products(
            search, page_size=page_size, current_page=current_page
        )

    branch_id = scoped_branch_id(actor, branch_id)
    return [
        normalize_local_medicine(row)
        for row in PharmacyCatalogRepository(session).list_active_medicines(
            tenant_id=tenant_id,
            branch_id=branch_id,
            search=search,
        )
    ]


def list_popular_medicines_service(
    session: Session, *, tenant_id: str, limit: int
) -> list[dict[str, object]]:
    """Most frequently prescribed medicines for this tenant.

    Counts are derived from prescription history (ConsultationMedicine), so the
    ranking works regardless of whether the tenant uses the external or local
    medicine catalog — both record the prescribed name here.
    """
    enforce_module_enabled(session, tenant_id, "pharmacy")
    limit = max(1, min(limit, 20))
    rows = PharmacyCatalogRepository(session).list_popular_prescribed_names(
        tenant_id=tenant_id,
        limit=limit,
    )
    return [
        {
            "id": name,
            "name": name,
            "item_name": name,
            "usage_count": int(count),
            "source": "history",
        }
        for name, count in rows
    ]
