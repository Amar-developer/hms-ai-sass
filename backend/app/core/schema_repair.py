from sqlalchemy import inspect, text
from sqlmodel import Session


def _add_column(
    session: Session, table_name: str, column_name: str, definition: str
) -> None:
    bind = session.get_bind()
    inspector = inspect(bind)
    if table_name not in inspector.get_table_names():
        return
    if column_name in {column["name"] for column in inspector.get_columns(table_name)}:
        return
    session.exec(
        text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")
    )


def _ensure_table(session: Session, table_name: str, ddl: str) -> None:
    bind = session.get_bind()
    inspector = inspect(bind)
    if table_name in inspector.get_table_names():
        return
    session.exec(text(ddl))


def ensure_settingkey_enum_values(session: Session) -> None:
    """Add missing PostgreSQL settingkey enum values for upgraded deployments."""
    bind = session.get_bind()
    if bind.dialect.name != "postgresql":
        return
    with bind.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.execute(
            text("ALTER TYPE settingkey ADD VALUE IF NOT EXISTS 'SIDEBAR_ROLE_MODULES'")
        )
        connection.execute(
            text(
                "ALTER TYPE settingkey ADD VALUE IF NOT EXISTS 'ACCOUNTS_BANK_DETAILS'"
            )
        )


def ensure_upload_schema(session: Session) -> None:
    """Repair dev databases after hot-reload when Alembic has not rerun yet."""
    if session.get_bind().dialect.name == "postgresql":
        session.exec(text("SET LOCAL lock_timeout = '5s'"))
        session.exec(text("SET LOCAL statement_timeout = '15s'"))
    _ensure_table(
        session,
        "ipdocument",
        """
        CREATE TABLE ipdocument (
            id VARCHAR PRIMARY KEY,
            tenant_id VARCHAR NOT NULL,
            branch_id VARCHAR NOT NULL,
            admission_id VARCHAR NOT NULL,
            document_type VARCHAR(80) NOT NULL,
            file_name VARCHAR(220) NOT NULL,
            file_url VARCHAR(500) NOT NULL,
            content_type VARCHAR(120),
            uploaded_by_user_id VARCHAR,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
        """,
    )
    _ensure_table(
        session,
        "homecareservice",
        """
        CREATE TABLE homecareservice (
            id VARCHAR PRIMARY KEY,
            tenant_id VARCHAR NOT NULL,
            branch_id VARCHAR,
            code VARCHAR(60) NOT NULL,
            name VARCHAR(160) NOT NULL,
            description VARCHAR(500),
            default_price INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_by_user_id VARCHAR,
            updated_by_user_id VARCHAR,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
        """,
    )
    _ensure_table(
        session,
        "homecarebooking",
        """
        CREATE TABLE homecarebooking (
            id VARCHAR PRIMARY KEY,
            tenant_id VARCHAR NOT NULL,
            branch_id VARCHAR NOT NULL,
            patient_id VARCHAR NOT NULL,
            assigned_staff_user_id VARCHAR,
            assigned_staff_name VARCHAR(160),
            staff_type VARCHAR(80),
            booking_number VARCHAR(60) NOT NULL,
            recurrence VARCHAR(40) NOT NULL DEFAULT 'daily',
            start_date DATE NOT NULL,
            end_date DATE,
            status VARCHAR(40) NOT NULL DEFAULT 'requested',
            location VARCHAR(500),
            complaints VARCHAR(2000),
            notes VARCHAR(2000),
            created_by_user_id VARCHAR,
            updated_by_user_id VARCHAR,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
        """,
    )
    _ensure_table(
        session,
        "homecarebookingitem",
        """
        CREATE TABLE homecarebookingitem (
            id VARCHAR PRIMARY KEY,
            tenant_id VARCHAR NOT NULL,
            booking_id VARCHAR NOT NULL,
            service_id VARCHAR,
            service_category VARCHAR(80) NOT NULL DEFAULT 'home_care_service',
            description VARCHAR(260) NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            unit_amount INTEGER NOT NULL DEFAULT 0,
            total_amount INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
        """,
    )
    _ensure_table(
        session,
        "homecarevisitlog",
        """
        CREATE TABLE homecarevisitlog (
            id VARCHAR PRIMARY KEY,
            tenant_id VARCHAR NOT NULL,
            booking_id VARCHAR NOT NULL,
            visit_date DATE NOT NULL,
            assigned_staff_user_id VARCHAR,
            assigned_staff_name VARCHAR(160),
            staff_type VARCHAR(80),
            service_id VARCHAR,
            service_category VARCHAR(80) NOT NULL DEFAULT 'home_care_service',
            description VARCHAR(260) NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            unit_amount INTEGER NOT NULL DEFAULT 0,
            total_amount INTEGER NOT NULL DEFAULT 0,
            status VARCHAR(40) NOT NULL DEFAULT 'completed',
            notes VARCHAR(1000),
            created_by_user_id VARCHAR,
            updated_by_user_id VARCHAR,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
        """,
    )
    _add_column(session, "ipadmission", "aadhaar_number", "VARCHAR(12)")
    _add_column(
        session, "homecarebooking", "recurrence", "VARCHAR(40) NOT NULL DEFAULT 'daily'"
    )
    _add_column(session, "homecarebooking", "assigned_staff_name", "VARCHAR(160)")
    _add_column(session, "homecarebooking", "staff_type", "VARCHAR(80)")
    _add_column(session, "homecarebooking", "location", "VARCHAR(500)")
    _add_column(
        session,
        "homecarebookingitem",
        "service_category",
        "VARCHAR(80) NOT NULL DEFAULT 'home_care_service'",
    )
    _add_column(session, "ipadmission", "admission_document_url", "VARCHAR(500)")
    _add_column(session, "ipadmission", "admission_document_name", "VARCHAR(220)")
    _add_column(
        session,
        "ipadmission",
        "admission_document_uploaded_at",
        "TIMESTAMP WITH TIME ZONE",
    )
    _add_column(session, "physiotherapycase", "consent_form_url", "VARCHAR(500)")
    _add_column(session, "physiotherapycase", "consent_form_name", "VARCHAR(220)")
    _add_column(
        session,
        "physiotherapycase",
        "consent_files_json",
        "VARCHAR(6000) NOT NULL DEFAULT '[]'",
    )
    _add_column(session, "physiotherapycase", "consent_notes", "VARCHAR(1000)")
    _add_column(
        session, "physiotherapycase", "consent_submitted_at", "TIMESTAMP WITH TIME ZONE"
    )
    _add_column(session, "physiotherapysession", "physiotherapist_id", "VARCHAR")
    _add_column(session, "invoice", "home_care_booking_id", "VARCHAR")
    _add_column(session, "patient", "photo_url", "VARCHAR(500)")
    _add_column(session, "patient", "photo_file_name", "VARCHAR(220)")
    _add_column(session, "branch", "area", "VARCHAR(120)")
    _add_column(
        session,
        "doctorfeerule",
        "share_tax_with_doctor",
        "BOOLEAN NOT NULL DEFAULT FALSE",
    )
    _add_column(
        session,
        "patientsubscriptionplan",
        "min_discount_amount",
        "INTEGER NOT NULL DEFAULT 0",
    )
    _add_column(
        session,
        "patientsubscriptionplan",
        "activation_after_days",
        "INTEGER NOT NULL DEFAULT 0",
    )
    _add_column(
        session,
        "patientsubscriptionplan",
        "pharmacy_discount_slabs_json",
        "VARCHAR NOT NULL DEFAULT '[]'",
    )
    _add_column(
        session,
        "patientsubscriptionplan",
        "free_consultation_department_ids_json",
        "VARCHAR NOT NULL DEFAULT '[]'",
    )
    _add_column(
        session,
        "patientsubscriptionenrollment",
        "used_free_lab_json",
        "VARCHAR NOT NULL DEFAULT '{}'",
    )
    _add_column(
        session,
        "patientsubscriptionenrollment",
        "used_free_medicine_json",
        "VARCHAR NOT NULL DEFAULT '{}'",
    )
    session.commit()
