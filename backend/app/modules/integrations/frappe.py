import json
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from fastapi import HTTPException, status


def normalize_frappe_item(row: dict) -> dict[str, str]:
    item_name = str(row.get("item_name") or row.get("name") or "").strip()
    name = str(row.get("name") or item_name).strip()
    slug = str(row.get("slug") or name).strip()
    return {
        "id": slug or name or item_name,
        "name": item_name or name,
        "item_name": item_name or name,
        "slug": slug,
        "erpnext_name": name,
        "source": "erpnext",
    }


def normalize_frappe_supplier(row: dict) -> dict[str, str | float]:
    supplier = str(row.get("supplier") or row.get("supplier_name") or "").strip()
    supplier_name = str(row.get("supplier_name") or supplier).strip()
    return {
        "supplier": supplier,
        "supplier_name": supplier_name,
        "buying_price": float(row.get("buying_price") or 0),
    }


def normalize_frappe_item_detail(row: dict) -> dict[str, int | str | float | list[dict[str, str | float]]]:
    item_name = str(row.get("item_name") or row.get("item_code") or row.get("name") or "").strip()
    item_code = str(row.get("item_code") or row.get("name") or item_name).strip()
    slug = str(row.get("slug") or item_code or item_name).strip()
    suppliers = [
        normalize_frappe_supplier(supplier)
        for supplier in row.get("suppliers") or []
        if isinstance(supplier, dict) and (supplier.get("supplier") or supplier.get("supplier_name"))
    ]
    buying_price = row.get("buying_price")
    if buying_price in (None, "") and suppliers:
        buying_price = suppliers[0]["buying_price"]
    return {
        "id": slug or item_code or item_name,
        "name": item_name or item_code,
        "item_name": item_name or item_code,
        "item_code": item_code,
        "slug": slug,
        "mrp_price": float(row.get("mrp_price") or 0),
        "selling_price": float(row.get("selling_price") or 0),
        "buying_price": float(buying_price or 0),
        "suppliers": suppliers,
        "supplier_count": int(row.get("supplier_count") or len(suppliers)),
        "source": "erpnext",
    }


class FrappeCatalogClient:
    def __init__(self, *, base_url: str, token: str, timeout_seconds: int = 10):
        self.base_url = base_url.rstrip("/") + "/"
        self.token = token
        self.timeout_seconds = timeout_seconds

    def get_lab_items(self, search: str | None = None) -> list[dict[str, str]]:
        endpoint = urljoin(
            self.base_url,
            "api/method/healthcare.healthcare.api.lab_items.get_lab_items",
        )
        payload = {"search": search.strip()} if search and search.strip() else None
        return [
            normalize_frappe_item(item)
            for item in self._call_method(endpoint, payload)
            if isinstance(item, dict)
        ]

    def get_lab_item_details(self, slug: str) -> dict[str, int | str | float | list[dict[str, str | float]]]:
        endpoint = urljoin(
            self.base_url,
            "api/method/healthcare.healthcare.api.lab_items.get_lab_item_details",
        )
        detail = self._call_detail_method(endpoint, {"slug": slug})
        return normalize_frappe_item_detail(detail)

    def _request(self, endpoint: str, payload: dict | None) -> dict:
        body = json.dumps(payload).encode("utf-8") if payload else None
        request = Request(
            endpoint,
            data=body,
            method="GET",
            headers={
                "Authorization": self.token,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8")
        except HTTPError as err:
            detail = err.read().decode("utf-8") or f"{err.code} {err.reason}"
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"ERPNext request failed: {detail}",
            ) from err
        except URLError as err:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"ERPNext API is unreachable: {err.reason}",
            ) from err

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as err:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="ERPNext API returned invalid JSON",
            ) from err

        return data

    def _message(self, endpoint: str, payload: dict | None) -> dict:
        data = self._request(endpoint, payload)
        message = data.get("message") if isinstance(data, dict) else {}
        if not isinstance(message, dict) or message.get("success") is False:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=message.get("message") or "ERPNext API failed",
            )
        return message

    def _call_method(self, endpoint: str, payload: dict | None) -> list[dict]:
        message = self._message(endpoint, payload)
        items = message.get("items") or []
        if not isinstance(items, list):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="ERPNext API returned an invalid items list",
            )
        return items

    def _call_detail_method(self, endpoint: str, payload: dict | None) -> dict:
        message = self._message(endpoint, payload)
        if not message.get("item_name") and not message.get("item_code"):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="ERPNext API returned an invalid lab item detail",
            )
        return message
