from collections.abc import Generator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import get_settings
import app.models  # noqa: F401


def _connect_args(database_url: str) -> dict[str, bool]:
    if database_url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


def create_db_engine(database_url: str | None = None):
    settings = get_settings()
    url = database_url or settings.database_url or "sqlite:///./medizinhub_hms.db"
    return create_engine(url, connect_args=_connect_args(url))


engine = create_db_engine()


def init_db() -> None:
    if get_settings().auto_create_tables:
        SQLModel.metadata.create_all(engine)
    ensure_postgres_enum_values()
    migrate_existing_sqlite_schema()


def ensure_postgres_enum_values() -> None:
    if engine.dialect.name != "postgresql":
        return
    enum_values = {
        "appointmenttype": ["DOCTOR_REVIEW", "FITNESS_CERTIFICATE"],
        "settingkey": ["APPOINTMENT_SLOT_INTERVALS_ENABLED", "APPOINTMENT_SLOT_INTERVAL_MINUTES"],
    }
    for enum_name, values in enum_values.items():
        for value in values:
            with engine.begin() as connection:
                connection.execute(text(f"ALTER TYPE {enum_name} ADD VALUE IF NOT EXISTS '{value}'"))


def migrate_existing_sqlite_schema() -> None:
    datetime_type = "DATETIME" if engine.dialect.name == "sqlite" else "TIMESTAMP"
    current_timestamp_default = "DATETIME" if engine.dialect.name == "sqlite" else "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if "subscriptionplan" in table_names:
        columns = {column["name"] for column in inspector.get_columns("subscriptionplan")}
        if "enabled_modules_json" not in columns:
            with engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE subscriptionplan ADD COLUMN enabled_modules_json VARCHAR DEFAULT '[]'")
                )
        plan_columns = {
            "created_by_user_id": "VARCHAR",
            "updated_by_user_id": "VARCHAR",
            "updated_at": datetime_type,
        }
        for column_name, definition in plan_columns.items():
            if column_name not in columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE subscriptionplan ADD COLUMN {column_name} {definition}"))
        with engine.begin() as connection:
            connection.execute(text("UPDATE subscriptionplan SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
            connection.execute(text("UPDATE subscriptionplan SET updated_at = created_at WHERE updated_at IS NULL"))
    if "tenantsubscription" in table_names:
        columns = {column["name"] for column in inspector.get_columns("tenantsubscription")}
        if "is_trial" not in columns:
            with engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE tenantsubscription ADD COLUMN is_trial BOOLEAN DEFAULT false")
                )
        subscription_columns = {
            "status": "VARCHAR DEFAULT 'active'",
            "billing_amount": "INTEGER DEFAULT 0",
            "notes": "VARCHAR",
            "created_by_user_id": "VARCHAR",
            "updated_by_user_id": "VARCHAR",
            "updated_at": datetime_type,
        }
        for column_name, definition in subscription_columns.items():
            if column_name not in columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE tenantsubscription ADD COLUMN {column_name} {definition}"))
    if "subscriptioninvoice" in table_names:
        columns = {column["name"] for column in inspector.get_columns("subscriptioninvoice")}
        subscription_invoice_columns = {
            "taxable_amount": "INTEGER DEFAULT 0",
            "tax_amount": "INTEGER DEFAULT 0",
            "total_amount": "INTEGER DEFAULT 0",
            "paid_amount": "INTEGER DEFAULT 0",
            "balance_amount": "INTEGER DEFAULT 0",
            "payment_method": "VARCHAR",
            "payment_reference": "VARCHAR",
            "gateway_transaction_id": "VARCHAR",
            "gateway_status": "VARCHAR",
            "failed_reason": "VARCHAR",
            "last_payment_attempt_at": datetime_type,
        }
        for column_name, definition in subscription_invoice_columns.items():
            if column_name not in columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE subscriptioninvoice ADD COLUMN {column_name} {definition}"))
    if "user" in table_names:
        columns = {column["name"] for column in inspector.get_columns("user")}
        user_columns = {
            "password_hash": "VARCHAR DEFAULT ''",
            "user_type": "VARCHAR DEFAULT 'staff'",
            "is_super_admin": "BOOLEAN DEFAULT false",
            "must_change_password": "BOOLEAN DEFAULT false",
            "last_login_at": datetime_type,
            "created_by_user_id": "VARCHAR",
            "updated_by_user_id": "VARCHAR",
            "updated_at": current_timestamp_default,
        }
        for column_name, definition in user_columns.items():
            if column_name not in columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE user ADD COLUMN {column_name} {definition}"))
    if "role" in table_names:
        columns = {column["name"] for column in inspector.get_columns("role")}
        role_columns = {
            "is_active": "BOOLEAN DEFAULT true",
            "source_template_role_id": "VARCHAR",
            "is_global_template": "BOOLEAN DEFAULT false",
            "is_template_locked": "BOOLEAN DEFAULT false",
            "created_by_user_id": "VARCHAR",
            "updated_by_user_id": "VARCHAR",
            "updated_at": current_timestamp_default,
        }
        for column_name, definition in role_columns.items():
            if column_name not in columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE role ADD COLUMN {column_name} {definition}"))
    if "doctorfeerule" in table_names:
        columns = {column["name"] for column in inspector.get_columns("doctorfeerule")}
        fee_rule_columns = {
            "department_id": "VARCHAR",
            "treatment_type": "VARCHAR",
        }
        for column_name, definition in fee_rule_columns.items():
            if column_name not in columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE doctorfeerule ADD COLUMN {column_name} {definition}"))
    if "consultation" in table_names:
        columns = {column["name"] for column in inspector.get_columns("consultation")}
        if "treatment_type" not in columns:
            with engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE consultation ADD COLUMN treatment_type VARCHAR DEFAULT 'general_consultation'")
                )
    if "appointment" in table_names:
        columns = {column["name"] for column in inspector.get_columns("appointment")}
        appointment_columns = {
            "visit_purpose": "VARCHAR",
            "source_appointment_id": "VARCHAR",
            "is_billable": "BOOLEAN DEFAULT true",
            "billing_note": "VARCHAR",
        }
        for column_name, definition in appointment_columns.items():
            if column_name not in columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE appointment ADD COLUMN {column_name} {definition}"))
    if "tenant" in table_names:
        columns = {column["name"] for column in inspector.get_columns("tenant")}
        tenant_columns = {
            "created_by_user_id": "VARCHAR",
            "updated_by_user_id": "VARCHAR",
        }
        for column_name, definition in tenant_columns.items():
            if column_name not in columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE tenant ADD COLUMN {column_name} {definition}"))
    if "branch" in table_names:
        columns = {column["name"] for column in inspector.get_columns("branch")}
        branch_columns = {
            "source_template_branch_id": "VARCHAR",
            "is_global_template": "BOOLEAN DEFAULT false",
            "is_template_locked": "BOOLEAN DEFAULT false",
            "created_by_user_id": "VARCHAR",
            "updated_by_user_id": "VARCHAR",
            "updated_at": current_timestamp_default,
        }
        for column_name, definition in branch_columns.items():
            if column_name not in columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE branch ADD COLUMN {column_name} {definition}"))
    if "department" in table_names:
        columns = {column["name"] for column in inspector.get_columns("department")}
        department_columns = {
            "description": "VARCHAR",
            "source_template_department_id": "VARCHAR",
            "created_by_user_id": "VARCHAR",
            "updated_by_user_id": "VARCHAR",
            "is_global_template": "BOOLEAN DEFAULT false",
            "is_template_locked": "BOOLEAN DEFAULT false",
            "updated_at": current_timestamp_default,
        }
        for column_name, definition in department_columns.items():
            if column_name not in columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE department ADD COLUMN {column_name} {definition}"))
    if "invoice" in table_names:
        columns = {column["name"] for column in inspector.get_columns("invoice")}
        invoice_columns = {
            "taxable_amount": "INTEGER DEFAULT 0",
            "tax_amount": "INTEGER DEFAULT 0",
            "tax_rule_id": "VARCHAR",
            "discount_approval_id": "VARCHAR",
        }
        for column_name, definition in invoice_columns.items():
            if column_name not in columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE invoice ADD COLUMN {column_name} {definition}"))
    if "labresult" in table_names:
        columns = {column["name"] for column in inspector.get_columns("labresult")}
        lab_result_columns = {
            "template_id": "VARCHAR",
            "report_file_name": "VARCHAR",
        }
        for column_name, definition in lab_result_columns.items():
            if column_name not in columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE labresult ADD COLUMN {column_name} {definition}"))
    if "pharmacyissue" in table_names:
        columns = {column["name"] for column in inspector.get_columns("pharmacyissue")}
        if "billing_invoice_id" not in columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE pharmacyissue ADD COLUMN billing_invoice_id VARCHAR"))
    if "pharmacypurchase" in table_names:
        columns = {column["name"] for column in inspector.get_columns("pharmacypurchase")}
        purchase_columns = {
            "purchase_order_id": "VARCHAR",
            "purchase_date": datetime_type,
            "discount_percentage": "INTEGER DEFAULT 0",
            "discount_amount": "INTEGER DEFAULT 0",
            "taxable_amount": "INTEGER DEFAULT 0",
            "cgst_amount": "INTEGER DEFAULT 0",
            "sgst_amount": "INTEGER DEFAULT 0",
            "gst_amount": "INTEGER DEFAULT 0",
        }
        for column_name, definition in purchase_columns.items():
            if column_name not in columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE pharmacypurchase ADD COLUMN {column_name} {definition}"))
    if "pharmacypurchaseitem" in table_names:
        columns = {column["name"] for column in inspector.get_columns("pharmacypurchaseitem")}
        purchase_item_columns = {
            "discount_percentage": "INTEGER DEFAULT 0",
            "discount_amount": "INTEGER DEFAULT 0",
            "taxable_amount": "INTEGER DEFAULT 0",
            "cgst_percentage": "INTEGER DEFAULT 0",
            "sgst_percentage": "INTEGER DEFAULT 0",
            "cgst_amount": "INTEGER DEFAULT 0",
            "sgst_amount": "INTEGER DEFAULT 0",
            "gst_amount": "INTEGER DEFAULT 0",
            "line_total": "INTEGER DEFAULT 0",
        }
        for column_name, definition in purchase_item_columns.items():
            if column_name not in columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE pharmacypurchaseitem ADD COLUMN {column_name} {definition}"))


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
