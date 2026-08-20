from datetime import date, time

from sqlmodel import Session

from app.core.list_filters import parse_list_filters, parse_list_sort
from app.modules.appointments.models import (
    Appointment,
    AppointmentStatus,
    AppointmentType,
)
from app.modules.appointments.repositories import AppointmentGridRepository
from app.modules.consultations.models import Consultation, ConsultationStatus
from app.modules.consultations.repositories import ConsultationRepository
from app.modules.identity.models import User
from app.modules.patients.models import Patient
from app.modules.practitioners.models import Practitioner
from app.modules.queue.models import QueueEntry
from app.modules.tenants.models import Branch, Department, Tenant


def _appointment_context(session: Session):
    tenant = Tenant(name="Appointment Filter Clinic")
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
    department = Department(tenant_id=tenant.id, name="General Medicine", code="GM")
    user = User(
        tenant_id=tenant.id,
        branch_id=branch.id,
        name="Appointment Admin",
        email="appointment-admin@example.test",
    )
    practitioner = Practitioner(
        tenant_id=tenant.id,
        full_name="Dr Filter",
        primary_specialty="General",
    )
    patient = Patient(
        tenant_id=tenant.id,
        branch_id=branch.id,
        full_name="Filter Patient",
        mobile="9000000000",
        patient_number="PAT-FILTER",
        created_by_user_id=user.id,
    )
    session.add(branch)
    session.add(department)
    session.add(user)
    session.add(practitioner)
    session.add(patient)
    session.commit()
    session.refresh(branch)
    session.refresh(department)
    session.refresh(user)
    session.refresh(practitioner)
    session.refresh(patient)
    return tenant, branch, department, user, practitioner, patient


def test_appointment_repository_filters_sort_and_options_are_data_backed(test_engine):
    with Session(test_engine) as session:
        tenant, branch, department, user, practitioner, patient = _appointment_context(
            session
        )
        branch_id = branch.id
        department_id = department.id
        user_id = user.id
        practitioner_id = practitioner.id
        first = Appointment(
            tenant_id=tenant.id,
            branch_id=branch_id,
            patient_id=patient.id,
            appointment_number="APT-002",
            department_id=department_id,
            practitioner_id=practitioner_id,
            appointment_type=AppointmentType.OP,
            status=AppointmentStatus.WAITING,
            appointment_date=date(2026, 8, 20),
            appointment_time=time(10, 0),
            visit_purpose="Consultation",
            created_by_user_id=user_id,
            updated_by_user_id=user_id,
        )
        second = Appointment(
            tenant_id=tenant.id,
            branch_id=branch_id,
            patient_id=patient.id,
            appointment_number="APT-001",
            department_id=department_id,
            practitioner_id=practitioner_id,
            appointment_type=AppointmentType.FOLLOW_UP,
            status=AppointmentStatus.SCHEDULED,
            appointment_date=date(2026, 8, 21),
            appointment_time=time(11, 0),
            visit_purpose="Review",
        )
        session.add(first)
        session.add(second)
        session.commit()
        session.refresh(first)
        session.add(
            QueueEntry(
                tenant_id=tenant.id,
                branch_id=branch_id,
                appointment_id=first.id,
                patient_id=patient.id,
                token_number="TKN-1",
            )
        )
        session.commit()

        repository = AppointmentGridRepository(session)
        rows = repository.list_for_tenant(
            tenant_id=tenant.id,
            list_filters=parse_list_filters(
                '[{"field":"status","operator":"equals","value":"waiting"}]'
            ),
            skip=0,
            limit=1,
        ).all()
        total = repository.count_for_tenant(
            tenant_id=tenant.id,
            list_filters=parse_list_filters(
                '[{"field":"status","operator":"equals","value":"waiting"}]'
            ),
        )
        sorted_rows = repository.list_for_tenant(
            tenant_id=tenant.id,
            list_sort=parse_list_sort('{"key":"appointment_number","dir":"asc"}'),
            skip=0,
            limit=1,
        ).all()
        options = repository.filter_options(tenant_id=tenant.id)

    assert total == 1
    assert rows[0][0].appointment_number == "APT-002"
    assert sorted_rows[0][0].appointment_number == "APT-001"
    assert {"value": branch_id, "label": "Main Branch"} in [
        row.model_dump() for row in options["branch_id"]
    ]
    assert {"value": department_id, "label": "General Medicine"} in [
        row.model_dump() for row in options["department_id"]
    ]
    assert {"value": practitioner_id, "label": "Dr Filter"} in [
        row.model_dump() for row in options["practitioner_id"]
    ]
    assert {"value": user_id, "label": "Appointment Admin"} in [
        row.model_dump() for row in options["created_by_user_id"]
    ]
    assert {"value": user_id, "label": "Appointment Admin"} in [
        row.model_dump() for row in options["updated_by_user_id"]
    ]


def test_consultation_repository_filters_sort_and_options_are_data_backed(test_engine):
    with Session(test_engine) as session:
        tenant, branch, department, user, practitioner, patient = _appointment_context(
            session
        )
        branch_id = branch.id
        user_id = user.id
        practitioner_id = practitioner.id
        appointment = Appointment(
            tenant_id=tenant.id,
            branch_id=branch_id,
            patient_id=patient.id,
            appointment_number="APT-CONSULT",
            department_id=department.id,
            practitioner_id=practitioner_id,
            appointment_type=AppointmentType.OP,
            status=AppointmentStatus.CONSULTATION_COMPLETED,
            appointment_date=date(2026, 8, 20),
            created_by_user_id=user_id,
        )
        session.add(appointment)
        session.commit()
        session.refresh(appointment)
        session.add(
            Consultation(
                tenant_id=tenant.id,
                branch_id=branch_id,
                appointment_id=appointment.id,
                patient_id=patient.id,
                practitioner_id=practitioner_id,
                status=ConsultationStatus.SIGNED,
                treatment_type="general_consultation",
                chief_complaint="Fever",
                diagnosis="Viral fever",
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
                signed_by_user_id=user_id,
            )
        )
        session.add(
            Consultation(
                tenant_id=tenant.id,
                branch_id=branch_id,
                appointment_id="appt_other",
                patient_id=patient.id,
                practitioner_id=practitioner_id,
                status=ConsultationStatus.DRAFT,
                treatment_type="follow_up",
                chief_complaint="Review",
            )
        )
        session.commit()

        repository = ConsultationRepository(session)
        rows = repository.list_for_tenant(
            tenant_id=tenant.id,
            list_filters=parse_list_filters(
                '[{"field":"status","operator":"equals","value":"signed"}]'
            ),
            limit=1,
        )
        total = repository.count_for_tenant(
            tenant_id=tenant.id,
            list_filters=parse_list_filters(
                '[{"field":"status","operator":"equals","value":"signed"}]'
            ),
        )
        options = repository.filter_options(tenant_id=tenant.id)

    assert total == 1
    assert [row.diagnosis for row in rows] == ["Viral fever"]
    assert {"value": branch_id, "label": "Main Branch"} in [
        row.model_dump() for row in options["branch_id"]
    ]
    assert {"value": practitioner_id, "label": "Dr Filter"} in [
        row.model_dump() for row in options["practitioner_id"]
    ]
    assert {"value": user_id, "label": "Appointment Admin"} in [
        row.model_dump() for row in options["created_by_user_id"]
    ]
    assert {"value": user_id, "label": "Appointment Admin"} in [
        row.model_dump() for row in options["updated_by_user_id"]
    ]
    assert {"value": user_id, "label": "Appointment Admin"} in [
        row.model_dump() for row in options["signed_by_user_id"]
    ]
