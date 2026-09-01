from database.schema_summary import (
    CURRENT_MAIN_ALEMBIC_HEAD,
    build_schema_summary,
)
import app.models  # noqa: F401
from scripts.reset_super_admin import (
    SUPER_ADMIN_EMAIL_ENV,
    SUPER_ADMIN_PASSWORD_ENV,
    resolve_super_admin_credentials,
)
from scripts.seed_demo import seed_demo_data
from sqlmodel import SQLModel, Session, create_engine


def test_database_schema_summary_tracks_main_head():
    summary = build_schema_summary()

    assert summary["alembic_head"] == "20260806_0106"
    assert summary["alembic_head"] == CURRENT_MAIN_ALEMBIC_HEAD
    assert summary["table_count"] >= 90
    assert {table["name"] for table in summary["tables"]} >= {
        "tenant",
        "user",
        "patient",
        "appointment",
        "invoice",
        "notificationevent",
    }


def test_reset_super_admin_requires_runtime_credentials(monkeypatch):
    monkeypatch.setenv(SUPER_ADMIN_EMAIL_ENV, "Admin@Example.COM")
    monkeypatch.setenv(SUPER_ADMIN_PASSWORD_ENV, "RuntimeSecret@123")

    credentials = resolve_super_admin_credentials()

    assert credentials.email == "admin@example.com"
    assert credentials.password == "RuntimeSecret@123"


def test_seed_demo_data_matches_current_model_schema():
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        first = seed_demo_data(session)
        second = seed_demo_data(session)

    assert first["tenant_id"] == second["tenant_id"]
    assert first["patient_number"] == "DEMO-0001"
    assert first["notification_count"] >= 5
