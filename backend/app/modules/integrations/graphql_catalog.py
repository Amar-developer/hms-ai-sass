import json
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException, status


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def normalize_graphql_product(row: dict) -> dict[str, str]:
    name = str(row.get("name") or "").strip()
    slug = _slug(name)
    return {
        "id": slug or name,
        "name": name,
        "item_name": name,
        "slug": slug,
        "source": "graphql",
    }


class GraphQLCatalogClient:
    def __init__(self, *, graphql_url: str, timeout_seconds: int = 10):
        self.graphql_url = graphql_url
        self.timeout_seconds = timeout_seconds

    def get_products(self, search: str | None = None, page_size: int = 10, current_page: int = 1) -> list[dict[str, str]]:
        query = """
        query MedizinHubProducts($search: String, $pageSize: Int, $currentPage: Int) {
          products(search: $search, pageSize: $pageSize, currentPage: $currentPage) {
            items {
              name
            }
          }
        }
        """
        payload = {
            "query": query,
            "variables": {
                "search": search or "",
                "pageSize": page_size,
                "currentPage": current_page,
            },
        }
        data = self._call(payload)
        products = data.get("data", {}).get("products", {}) if isinstance(data, dict) else {}
        items = products.get("items") or []
        if not isinstance(items, list):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Medicine GraphQL API returned an invalid products list",
            )
        return [
            normalize_graphql_product(item)
            for item in items
            if isinstance(item, dict) and str(item.get("name") or "").strip()
        ]

    def _call(self, payload: dict) -> dict:
        request = Request(
            self.graphql_url,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "MedizinHub-HMS/1.0",
            },
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8")
        except HTTPError as err:
            detail = err.read().decode("utf-8") or f"{err.code} {err.reason}"
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Medicine GraphQL request failed: {detail}",
            ) from err
        except URLError as err:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Medicine GraphQL API is unreachable: {err.reason}",
            ) from err

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as err:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Medicine GraphQL API returned invalid JSON",
            ) from err
        if data.get("errors"):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Medicine GraphQL API failed: {json.dumps(data['errors'])}",
            )
        return data
