from sqlmodel import Session

from app.modules.patients.repositories import PatientRepository
from app.modules.patients.schemas import PatientCreate, PatientDuplicateCandidate
from app.modules.patients.services.mappers import (
    normalize_mobile,
    patient_search_result,
)


class PatientDuplicateService:
    def __init__(self, session: Session):
        self.repository = PatientRepository(session)

    def candidates(
        self, *, tenant_id: str, payload: PatientCreate
    ) -> list[PatientDuplicateCandidate]:
        normalized_mobile = normalize_mobile(payload.mobile)
        normalized_guardian_mobile = normalize_mobile(payload.guardian_mobile)
        normalized_name = payload.full_name.strip().lower()
        rows = self.repository.duplicate_candidate_rows(
            tenant_id=tenant_id,
            normalized_name=normalized_name,
            mobile=payload.mobile if normalized_mobile else None,
            guardian_mobile=payload.guardian_mobile
            if normalized_guardian_mobile
            else None,
        )
        candidates: list[PatientDuplicateCandidate] = []
        for patient in rows:
            patient_mobile = normalize_mobile(patient.mobile)
            patient_guardian_mobile = normalize_mobile(patient.guardian_mobile)
            same_name = patient.full_name.strip().lower() == normalized_name
            same_mobile = bool(
                normalized_mobile
                and normalized_mobile in {patient_mobile, patient_guardian_mobile}
            )
            same_guardian_mobile = bool(
                normalized_guardian_mobile
                and normalized_guardian_mobile
                in {patient_mobile, patient_guardian_mobile}
            )
            same_date_of_birth = bool(
                payload.date_of_birth and patient.date_of_birth == payload.date_of_birth
            )
            if (
                same_name
                and same_date_of_birth
                and (same_mobile or same_guardian_mobile)
            ):
                reason = "Same patient name, date of birth, and mobile"
                confidence = "high"
            elif same_name and same_date_of_birth:
                reason = "Same patient name and date of birth"
                confidence = "high"
            elif same_name and same_mobile and not payload.date_of_birth:
                reason = "Same patient name and mobile"
                confidence = "high"
            elif same_name and same_guardian_mobile and not payload.date_of_birth:
                reason = "Same patient name and guardian mobile"
                confidence = "high"
            elif same_name and (same_mobile or same_guardian_mobile):
                reason = "Same patient name and mobile, but date of birth differs"
                confidence = "medium"
            elif same_date_of_birth and (same_mobile or same_guardian_mobile):
                reason = "Same date of birth and mobile"
                confidence = "medium"
            elif same_mobile or same_guardian_mobile:
                reason = "Same mobile number"
                confidence = "medium"
            else:
                reason = "Similar patient name"
                confidence = "low"
            base = patient_search_result(patient)
            candidates.append(
                PatientDuplicateCandidate(
                    **base.model_dump(), match_reason=reason, confidence=confidence
                )
            )
        return candidates
