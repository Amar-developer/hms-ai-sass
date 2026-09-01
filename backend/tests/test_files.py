from io import BytesIO
import hashlib

from PIL import Image
from sqlmodel import Session, select

from app.modules.audit.models import AuditEvent
from app.modules.settings.models import AdminSetting, SettingKey
from app.modules.settings.service import decode_value
from app.modules.tenants.models import Tenant


def _png(payload: bytes = b"fake") -> BytesIO:
    """Return a decodable PNG; image optimization validates the full payload."""
    digest = hashlib.sha256(payload).digest()
    image = Image.new("RGB", (8, 8), tuple(digest[:3]))
    output = BytesIO()
    image.save(output, format="PNG")
    output.seek(0)
    return output


def _assert_decodable_image(content: bytes) -> None:
    with Image.open(BytesIO(content)) as image:
        image.verify()


def create_file_tenant_and_branch(client):
    tenant = client.post("/api/v1/tenants", json={"name": "Files Clinic"}).json()
    branch = client.post(
        f"/api/v1/tenants/{tenant['id']}/branches",
        json={"name": "Main Branch", "code": "MAIN"},
    ).json()
    return tenant, branch


def test_file_upload_list_update_delete_and_audit(client, test_engine):
    tenant, branch = create_file_tenant_and_branch(client)
    headers = {"X-Tenant-ID": tenant["id"]}

    upload = client.post(
        "/api/v1/files",
        headers=headers,
        data={
            "branch_id": branch["id"],
            "category": "clinical",
            "source_module": "patients",
            "attached_to_doctype": "Patient",
            "attached_to_name": "PAT-001",
            "attached_to_field": "photo_url",
            "attached_to_label": "Patient Photo",
            "folder": "Patients",
            "notes": "Initial document",
            "is_private": "true",
        },
        files={"file": ("patient-photo.png", _png(), "image/png")},
    )
    assert upload.status_code == 201
    uploaded = upload.json()
    assert uploaded["tenant_id"] == tenant["id"]
    assert uploaded["branch_id"] == branch["id"]
    assert uploaded["file_name"] == "patient-photo.png"
    assert uploaded["category"] == "clinical"
    assert uploaded["is_private"] is True

    static_file = client.get(uploaded["file_url"])
    authorized_download = client.get(
        f"/api/v1/files/{uploaded['id']}/download", headers=headers
    )
    assert static_file.status_code == 200
    _assert_decodable_image(static_file.content)
    assert authorized_download.status_code == 200
    assert authorized_download.content == static_file.content
    assert "patient-photo.png" in authorized_download.headers["content-disposition"]

    listed = client.get(
        "/api/v1/files?category=clinical&q=patient-photo", headers=headers
    )
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [uploaded["id"]]

    updated = client.patch(
        f"/api/v1/files/{uploaded['id']}",
        headers=headers,
        json={"notes": "Reviewed by admin", "folder": "Reviewed"},
    )
    assert updated.status_code == 200
    assert updated.json()["notes"] == "Reviewed by admin"
    assert updated.json()["folder"] == "Reviewed"

    deleted = client.delete(f"/api/v1/files/{uploaded['id']}", headers=headers)
    listed_after_delete = client.get("/api/v1/files?category=clinical", headers=headers)

    assert deleted.status_code == 200
    assert deleted.json()["is_active"] is False
    assert listed_after_delete.status_code == 200
    assert listed_after_delete.json() == []

    with Session(test_engine) as db:
        actions = {
            row.action
            for row in db.exec(
                select(AuditEvent).where(AuditEvent.tenant_id == tenant["id"])
            ).all()
        }
        assert {"file.uploaded", "file.updated", "file.deleted"}.issubset(actions)


def test_file_page_reports_filtered_total(client):
    tenant, _branch = create_file_tenant_and_branch(client)
    headers = {"X-Tenant-ID": tenant["id"]}
    for name in ("first.png", "second.png"):
        response = client.post(
            "/api/v1/files",
            headers=headers,
            data={"category": "clinical"},
            files={"file": (name, _png(), "image/png")},
        )
        assert response.status_code == 201

    response = client.get(
        "/api/v1/files/page?category=clinical&limit=1&offset=1",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert len(response.json()["items"]) == 1
    assert response.json()["offset"] == 1


def test_lab_report_upload_replaces_same_order_attachment(client):
    tenant, branch = create_file_tenant_and_branch(client)
    headers = {"X-Tenant-ID": tenant["id"]}
    attachment = {
        "branch_id": branch["id"],
        "category": "lab_report",
        "source_module": "lab",
        "attached_to_doctype": "LabOrder",
        "attached_to_name": "laborder-report-test",
        "attached_to_field": "report_url",
        "attached_to_label": "Lab Report",
    }
    first = client.post(
        "/api/v1/files",
        headers=headers,
        data=attachment,
        files={"file": ("first-report.png", _png(b"first"), "image/png")},
    )
    second = client.post(
        "/api/v1/files",
        headers=headers,
        data=attachment,
        files={"file": ("final-report.png", _png(b"final"), "image/png")},
    )
    listed = client.get(
        "/api/v1/files?category=lab_report&attached_to_name=laborder-report-test",
        headers=headers,
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["id"] != first.json()["id"]
    assert second.json()["document_version"] == 2
    assert second.json()["file_name"] == "final-report.png"
    assert len(listed.json()) == 1


def test_files_are_tenant_isolated(client):
    tenant, branch = create_file_tenant_and_branch(client)
    other_tenant = client.post(
        "/api/v1/tenants", json={"name": "Other Files Clinic"}
    ).json()
    headers = {"X-Tenant-ID": tenant["id"]}

    upload = client.post(
        "/api/v1/files",
        headers=headers,
        data={"branch_id": branch["id"], "category": "clinical"},
        files={"file": ("tenant-file.png", _png(b"tenant only"), "image/png")},
    )
    assert upload.status_code == 201

    cross_tenant_list = client.get(
        "/api/v1/files", headers={"X-Tenant-ID": other_tenant["id"]}
    )
    cross_tenant_update = client.patch(
        f"/api/v1/files/{upload.json()['id']}",
        headers={"X-Tenant-ID": other_tenant["id"]},
        json={"notes": "Cross tenant update"},
    )

    assert cross_tenant_list.status_code == 200
    assert cross_tenant_list.json() == []
    assert cross_tenant_update.status_code == 404


def test_tenant_logo_upload_persists_invoice_logo_setting(client, test_engine):
    tenant, _branch = create_file_tenant_and_branch(client)

    upload = client.post(
        f"/api/v1/tenants/{tenant['id']}/logo",
        files={"file": ("clinic-logo.png", _png(), "image/png")},
    )

    assert upload.status_code == 200
    logo_url = upload.json()["logo_url"]
    assert logo_url
    with Session(test_engine) as db:
        setting = db.exec(
            select(AdminSetting).where(
                AdminSetting.tenant_id == tenant["id"],
                AdminSetting.key == SettingKey.INVOICE_LOGO_URL,
            )
        ).first()
        assert setting is not None
        assert decode_value(setting.value_json) == logo_url


def test_tenant_logo_rejects_spoofed_non_image_content(client):
    tenant, _branch = create_file_tenant_and_branch(client)

    upload = client.post(
        f"/api/v1/tenants/{tenant['id']}/logo",
        files={"file": ("fake-logo.png", BytesIO(b"%PDF-1.4\nfake"), "image/png")},
    )

    assert upload.status_code == 400
    assert upload.json()["detail"] == "Tenant logo must be a PNG or JPEG image"


def test_file_registry_invoice_logo_attachment_updates_invoice_logo_setting(
    client, test_engine
):
    tenant, _branch = create_file_tenant_and_branch(client)
    headers = {"X-Tenant-ID": tenant["id"]}

    upload = client.post(
        "/api/v1/files",
        headers=headers,
        data={
            "category": "logo",
            "source_module": "settings",
            "attached_to_doctype": "Tenant",
            "attached_to_name": tenant["id"],
            "attached_to_field": "invoice.logo_url",
            "attached_to_label": "Invoice Logo",
        },
        files={"file": ("invoice-logo.png", _png(), "image/png")},
    )

    assert upload.status_code == 201
    file_url = upload.json()["file_url"]
    with Session(test_engine) as db:
        tenant_row = db.get(Tenant, tenant["id"])
        setting = db.exec(
            select(AdminSetting).where(
                AdminSetting.tenant_id == tenant["id"],
                AdminSetting.key == SettingKey.INVOICE_LOGO_URL,
            )
        ).first()
        assert tenant_row.logo_url in (None, "")
        assert setting is not None
        assert decode_value(setting.value_json) == file_url

    logo = client.get("/api/v1/files/invoice-logo", headers=headers)
    assert logo.status_code == 200
    assert logo.headers["content-type"] == "image/png"
    _assert_decodable_image(logo.content)

    # A stale saved URL must fall back to the active registered invoice logo.
    with Session(test_engine) as db:
        setting = db.exec(
            select(AdminSetting).where(
                AdminSetting.tenant_id == tenant["id"],
                AdminSetting.key == SettingKey.INVOICE_LOGO_URL,
            )
        ).one()
        setting.value_json = '"/uploads/missing-logo.png"'
        db.add(setting)
        db.commit()

    fallback_logo = client.get("/api/v1/files/invoice-logo", headers=headers)
    assert fallback_logo.status_code == 200
    _assert_decodable_image(fallback_logo.content)
