from sqlmodel import Session

from app.modules.consultations.models import (
    Consultation,
    ConsultationComplaint,
    ConsultationDiagnosis,
    ConsultationMedicine,
    ConsultationReferral,
    ConsultationVital,
)
from app.modules.consultations.repositories import (
    ConsultationDetailRepository,
    ConsultationStructuredRowRepository,
)
from app.modules.consultations.schemas import (
    ConsultationAddendumRead,
    ConsultationCreate,
    ConsultationDetailRead,
    ConsultationRead,
    ConsultationUpdate,
)

STRUCTURED_FIELD_MODELS = [
    ("vitals", ConsultationVital),
    ("complaints", ConsultationComplaint),
    ("diagnoses", ConsultationDiagnosis),
    ("medicines", ConsultationMedicine),
    ("referrals", ConsultationReferral),
]
STRUCTURED_FIELD_NAMES = {name for name, _ in STRUCTURED_FIELD_MODELS}


class StructuredRowWriter:
    """Replaces a consultation's structured rows (vitals, diagnoses, prescriptions,
    referrals) from an incoming create/update payload."""

    def __init__(self, session: Session):
        self.structured_rows = ConsultationStructuredRowRepository(session)

    def replace_from_payload(
        self,
        consultation: Consultation,
        payload: ConsultationCreate | ConsultationUpdate,
    ) -> None:
        for field_name, model in STRUCTURED_FIELD_MODELS:
            if not hasattr(payload, field_name):
                continue
            rows = getattr(payload, field_name)
            if rows is None:
                continue
            self.structured_rows.replace_rows(
                consultation=consultation, model=model, rows=rows
            )


class ConsultationDetailBuilder:
    """Assembles a ConsultationDetailRead from a consultation's clinical notes,
    diagnoses, prescriptions, and lab/service orders."""

    def __init__(self, session: Session):
        self.details = ConsultationDetailRepository(session)

    def build(self, consultation: Consultation) -> ConsultationDetailRead:
        addendums = self.details.list_addendums(consultation)
        vitals = self.details.list_vitals(consultation.id)
        complaints = self.details.list_complaints(consultation.id)
        diagnoses = self.details.list_diagnoses(consultation.id)
        medicines = self.details.list_medicines(consultation.id)
        referrals = self.details.list_referrals(consultation.id)
        lab_orders = self.details.list_lab_orders(consultation)
        return ConsultationDetailRead(
            consultation=ConsultationRead.model_validate(
                consultation, from_attributes=True
            ),
            addendums=[
                ConsultationAddendumRead.model_validate(addendum, from_attributes=True)
                for addendum in addendums
            ],
            vitals=[
                {"name": row.name, "value": row.value, "unit": row.unit}
                for row in vitals
            ],
            complaints=[
                {
                    "complaint": row.complaint,
                    "duration": row.duration,
                    "severity": row.severity,
                }
                for row in complaints
            ],
            diagnoses=[
                {
                    "diagnosis": row.diagnosis,
                    "diagnosis_type": row.diagnosis_type,
                    "notes": row.notes,
                }
                for row in diagnoses
            ],
            medicines=[
                {
                    "medicine_name": row.medicine_name,
                    "dosage": row.dosage,
                    "frequency": row.frequency,
                    "duration": row.duration,
                    "instructions": row.instructions,
                }
                for row in medicines
            ],
            referrals=[
                {
                    "referral_type": row.referral_type,
                    "item_name": row.item_name,
                    "priority": row.priority,
                    "instructions": row.instructions,
                }
                for row in referrals
            ],
            lab_orders=[
                {
                    "id": row.id,
                    "status": row.status.value,
                    "priority": row.priority.value,
                    "tests": row.tests,
                    "source": row.source.value,
                    "result_ready_at": row.result_ready_at,
                    "created_at": row.created_at,
                }
                for row in lab_orders
            ],
        )
