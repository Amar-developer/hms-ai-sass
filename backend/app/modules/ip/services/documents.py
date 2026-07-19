from fastapi import HTTPException, UploadFile, status
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlmodel import Session

from app.core.schema_repair import ensure_upload_schema
from app.core.uploads import save_upload
from app.modules.audit.service import record_audit_event
from app.modules.files.service import record_file_document
from app.modules.identity.models import User
from app.modules.ip.models import IPAdmission, IPDocument
from app.modules.ip.repositories import (
    IPAdmissionRepository,
    IPClinicalRepository,
    IPReferenceRepository,
)
from app.modules.ip.services.validation import (
    assert_ip_enabled,
    ensure_admission_open,
    get_admission,
)
from app.modules.tenants.models import now_utc


def simple_pdf(lines: list[str]) -> bytes:
    text = "\\n".join(lines).replace("(", "[").replace(")", "]")
    stream = f"BT /F1 12 Tf 50 760 Td ({text}) Tj ET"
    return (
        b"%PDF-1.4\n"
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        b"3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >> endobj\n"
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
        + f"5 0 obj << /Length {len(stream)} >> stream\n{stream}\nendstream endobj\n".encode()
        + b"xref\n0 6\n0000000000 65535 f \ntrailer << /Root 1 0 R /Size 6 >>\nstartxref\n0\n%%EOF"
    )


async def upload_admission_document_file(
    session: Session,
    *,
    admission: IPAdmission,
    admission_id: str,
    file: UploadFile,
    current_user: User,
) -> IPAdmission:
    saved_filename, url_path, verified_content_type = await save_upload(
        file, f"ip_admission_{admission_id[:12]}"
    )
    admission.admission_document_url = url_path
    admission.admission_document_name = file.filename or saved_filename
    admission.admission_document_uploaded_at = now_utc()
    admission.updated_at = now_utc()
    admission.updated_by_user_id = current_user.id
    session.add(admission)
    record_file_document(
        session,
        tenant_id=admission.tenant_id,
        branch_id=admission.branch_id,
        patient_id=admission.patient_id,
        file_name=admission.admission_document_name or saved_filename,
        file_url=url_path,
        content_type=verified_content_type,
        category="admission",
        source_module="ip",
        attached_to_doctype="IPAdmission",
        attached_to_name=admission.id,
        attached_to_field="admission_document_url",
        attached_to_label="Admission Document",
        uploaded_by_user_id=current_user.id,
    )
    return admission


async def upload_admission_document_file_by_id(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    file: UploadFile,
    current_user: User,
) -> IPAdmission:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    admission = await upload_admission_document_file(
        session,
        admission=admission,
        admission_id=admission_id,
        file=file,
        current_user=current_user,
    )
    session.commit()
    session.refresh(admission)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_admission.document_uploaded",
        resource_type="ip_admission",
        resource_id=admission.id,
        purpose="ip_management",
    )
    return admission


async def upload_admission_document_rows(
    session: Session,
    *,
    admission: IPAdmission,
    admission_id: str,
    document_type: str,
    files: list[UploadFile],
    current_user: User,
) -> list[IPDocument]:
    normalized_type = (document_type or "admission").strip().lower()[:80]
    if normalized_type not in {
        "admission",
        "aadhaar",
        "consent",
        "discharge",
        "clinical",
    }:
        normalized_type = "clinical"
    rows: list[IPDocument] = []
    for file in files:
        if not file.filename:
            continue
        saved_filename, url_path, verified_content_type = await save_upload(
            file, f"ip_{normalized_type}_{admission_id[:12]}"
        )
        row = IPDocument(
            tenant_id=admission.tenant_id,
            branch_id=admission.branch_id,
            admission_id=admission.id,
            document_type=normalized_type,
            file_name=file.filename or saved_filename,
            file_url=url_path,
            content_type=verified_content_type,
            uploaded_by_user_id=current_user.id,
        )
        session.add(row)
        record_file_document(
            session,
            tenant_id=admission.tenant_id,
            branch_id=admission.branch_id,
            patient_id=admission.patient_id,
            file_name=file.filename or saved_filename,
            file_url=url_path,
            content_type=verified_content_type,
            category=normalized_type,
            source_module="ip",
            attached_to_doctype="IPAdmission",
            attached_to_name=admission.id,
            attached_to_field=normalized_type,
            attached_to_label=normalized_type.replace("_", " ").title(),
            uploaded_by_user_id=current_user.id,
        )
        rows.append(row)
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Upload at least one file"
        )
    return rows


async def upload_admission_document_rows_by_id(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    document_type: str,
    files: list[UploadFile],
    current_user: User,
) -> list[IPDocument]:
    assert_ip_enabled(session, tenant_id)
    ensure_upload_schema(session)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    rows = await upload_admission_document_rows(
        session,
        admission=admission,
        admission_id=admission_id,
        document_type=document_type,
        files=files,
        current_user=current_user,
    )
    session.commit()
    for row in rows:
        session.refresh(row)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_document.uploaded",
        resource_type="ip_admission",
        resource_id=admission.id,
        purpose="ip_management",
    )
    return rows


def list_admission_documents_safe(
    session: Session, *, tenant_id: str, admission_id: str
) -> list[IPDocument]:
    ensure_upload_schema(session)
    try:
        return IPAdmissionRepository(session).list_documents(
            tenant_id=tenant_id,
            admission_id=admission_id,
        )
    except (OperationalError, ProgrammingError):
        session.rollback()
        ensure_upload_schema(session)
        return []


def render_discharge_summary_pdf(
    session: Session,
    *,
    tenant_id: str,
    summary_id: str,
    current_user: User,
) -> bytes:
    summary = IPClinicalRepository(session).get_discharge_summary(
        tenant_id=tenant_id,
        summary_id=summary_id,
    )
    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Discharge summary not found"
        )
    admission = get_admission(session, tenant_id, summary.admission_id, current_user)
    patient = IPReferenceRepository(session).get_patient(admission.patient_id)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_discharge_summary.exported",
        resource_type="ip_discharge_summary",
        resource_id=summary.id,
        purpose="discharge_pdf",
    )
    return simple_pdf(
        [
            "MedizinHub HMS - Discharge Summary",
            f"Admission: {admission.admission_number}",
            f"Patient: {patient.full_name if patient else admission.patient_id}",
            f"Discharge Date: {summary.discharge_date}",
            f"Diagnosis: {summary.final_diagnosis}",
            f"Course: {summary.course_in_hospital or ''}",
            f"Advice: {summary.follow_up_advice or ''}",
        ]
    )
