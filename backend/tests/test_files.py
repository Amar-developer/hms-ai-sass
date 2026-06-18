from io import BytesIO

from sqlmodel import Session, select

from app.modules.audit.models import AuditEvent


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
        files={"file": ("patient-photo.png", BytesIO(b"fake-png"), "image/png")},
    )
    assert upload.status_code == 201
    uploaded = upload.json()
    assert uploaded["tenant_id"] == tenant["id"]
    assert uploaded["branch_id"] == branch["id"]
    assert uploaded["file_name"] == "patient-photo.png"
    assert uploaded["category"] == "clinical"
    assert uploaded["is_private"] is True

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
        files={"file": ("tenant-file.png", BytesIO(b"tenant only"), "image/png")},
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
