from dataclasses import dataclass

from sqlmodel import Session, select

from app.modules.patients.models import Patient


@dataclass(frozen=True)
class PatientReference:
    id: str
    name: str
    number: str
    mobile: str | None


def patient_reference_map(
    session: Session,
    *,
    tenant_id: str,
    patient_ids: set[str | None],
) -> dict[str, PatientReference]:
    ids = {str(patient_id) for patient_id in patient_ids if patient_id}
    if not ids:
        return {}
    rows = session.exec(
        select(Patient).where(
            Patient.tenant_id == tenant_id,
            Patient.id.in_(ids),
        )
    ).all()
    return {
        row.id: PatientReference(
            id=row.id,
            name=row.full_name,
            number=row.patient_number,
            mobile=row.mobile,
        )
        for row in rows
    }
