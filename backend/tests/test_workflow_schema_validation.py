from datetime import date

import pytest
from pydantic import ValidationError

from app.modules.home_care.schemas import (
    HomeCareBookingCreate,
    HomeCareVisitLogCreate,
)
from app.modules.ip.schemas import IPAdmissionUpdate
from app.modules.physiotherapy.schemas import (
    PhysiotherapyCaseCreate,
    PhysiotherapyCaseUpdate,
)


def test_home_care_workflow_values_are_normalized_and_validated():
    booking = HomeCareBookingCreate(
        branch_id="branch_main",
        patient_id="patient_main",
        booking_type="Home_Care",
        recurrence="Daily",
        start_date=date.today(),
        end_date=date.today(),
        status="Requested",
        location="Patient home",
        services=[
            {
                "description": "Nursing care",
                "quantity": 2,
                "unit_amount": 500,
            }
        ],
    )
    assert booking.booking_type == "home_care"
    assert booking.recurrence == "daily"
    assert booking.status == "requested"

    with pytest.raises(ValidationError):
        HomeCareVisitLogCreate(status="unknown")


def test_ip_and_physio_reject_unknown_workflow_values():
    with pytest.raises(ValidationError):
        IPAdmissionUpdate(status="waiting_for_magic")
    with pytest.raises(ValidationError):
        PhysiotherapyCaseUpdate(status="archived")

    case = PhysiotherapyCaseCreate(
        branch_id="branch_main",
        patient_id="patient_main",
        care_context="OP",
        assessment_date=date.today(),
        body_region="Knee",
        condition="Post-operative stiffness",
        treatment_goal="Improve range of motion",
    )
    assert case.care_context == "op"
