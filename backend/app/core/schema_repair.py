from sqlalchemy import inspect, text
from sqlmodel import Session


def _add_column(session: Session, table_name: str, column_name: str, definition: str) -> None:
    bind = session.get_bind()
    inspector = inspect(bind)
    if table_name not in inspector.get_table_names():
        return
    if column_name in {column["name"] for column in inspector.get_columns(table_name)}:
        return
    session.exec(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"))


def _ensure_table(session: Session, table_name: str, ddl: str) -> None:
    bind = session.get_bind()
    inspector = inspect(bind)
    if table_name in inspector.get_table_names():
        return
    session.exec(text(ddl))


def ensure_upload_schema(session: Session) -> None:
    """Repair dev databases after hot-reload when Alembic has not rerun yet."""
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
    _add_column(session, "ipadmission", "aadhaar_number", "VARCHAR(12)")
    _add_column(session, "ipadmission", "admission_document_url", "VARCHAR(500)")
    _add_column(session, "ipadmission", "admission_document_name", "VARCHAR(220)")
    _add_column(session, "ipadmission", "admission_document_uploaded_at", "TIMESTAMP WITH TIME ZONE")
    _add_column(session, "physiotherapycase", "consent_form_url", "VARCHAR(500)")
    _add_column(session, "physiotherapycase", "consent_form_name", "VARCHAR(220)")
    _add_column(session, "physiotherapycase", "consent_files_json", "VARCHAR(6000) NOT NULL DEFAULT '[]'")
    _add_column(session, "physiotherapycase", "consent_notes", "VARCHAR(1000)")
    _add_column(session, "physiotherapycase", "consent_submitted_at", "TIMESTAMP WITH TIME ZONE")
    _add_column(session, "physiotherapysession", "physiotherapist_id", "VARCHAR")
    _add_column(session, "patient", "photo_url", "VARCHAR(500)")
    _add_column(session, "patient", "photo_file_name", "VARCHAR(220)")
    _add_column(session, "doctorfeerule", "share_tax_with_doctor", "BOOLEAN NOT NULL DEFAULT FALSE")
    session.commit()
