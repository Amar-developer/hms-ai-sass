import pytest
from fastapi import HTTPException
from sqlmodel import Session

from app.modules.patients.models import Patient
from app.modules.patients.services.patient_service import PatientService


def test_mobile_validation_blocks_normalized_duplicate_primary(test_engine):
    with Session(test_engine) as session:
        existing = Patient(
            tenant_id="tenant_one",
            patient_number="PAT-001",
            full_name="Existing Patient",
            mobile="98765 43210",
        )
        session.add(existing)
        session.commit()

        with pytest.raises(HTTPException) as blocked:
            PatientService(session)._validate_mobile_numbers(
                tenant_id="tenant_one",
                mobile="9876543210",
                alternate_mobile=None,
            )

    assert blocked.value.status_code == 409
    assert "Alternate Phone Number" in blocked.value.detail


def test_mobile_validation_allows_shared_alternate_and_tenant_reuse(test_engine):
    with Session(test_engine) as session:
        session.add(
            Patient(
                tenant_id="tenant_one",
                patient_number="PAT-001",
                full_name="Existing Patient",
                mobile="9876543210",
            )
        )
        session.commit()

        service = PatientService(session)
        service._validate_mobile_numbers(
            tenant_id="tenant_one",
            mobile=None,
            alternate_mobile="9876543210",
        )
        service._validate_mobile_numbers(
            tenant_id="tenant_two",
            mobile="9876543210",
            alternate_mobile=None,
        )


def test_mobile_validation_blocks_same_number_on_one_patient(test_engine):
    with Session(test_engine) as session:
        with pytest.raises(HTTPException) as blocked:
            PatientService(session)._validate_mobile_numbers(
                tenant_id="tenant_one",
                mobile="90000-00001",
                alternate_mobile="9000000001",
            )

    assert blocked.value.status_code == 422
    assert blocked.value.detail == (
        "Primary mobile number and alternate phone number must be different."
    )


def test_mobile_validation_excludes_current_patient_on_update(test_engine):
    with Session(test_engine) as session:
        existing = Patient(
            tenant_id="tenant_one",
            patient_number="PAT-001",
            full_name="Existing Patient",
            mobile="9876543210",
        )
        session.add(existing)
        session.commit()
        session.refresh(existing)

        PatientService(session)._validate_mobile_numbers(
            tenant_id="tenant_one",
            mobile=existing.mobile,
            alternate_mobile=None,
            exclude_patient_id=existing.id,
        )
