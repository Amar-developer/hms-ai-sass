from datetime import time

from sqlmodel import Session

from app.core.list_filters import parse_list_filters, parse_list_sort
from app.modules.identity.models import User
from app.modules.practitioners.models import (
    Practitioner,
    PractitionerBranch,
    PractitionerDepartment,
    PractitionerSchedule,
    PractitionerStatus,
    PractitionerType,
)
from app.modules.practitioners.repositories import (
    PractitionerRepository,
    PractitionerScheduleRepository,
)
from app.modules.tenants.models import Branch, Department, Tenant


def _clinic(session: Session):
    tenant = Tenant(name="Practitioner Filter Clinic")
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
    department = Department(
        tenant_id=tenant.id,
        name="General Medicine",
        code="GEN",
    )
    session.add(branch)
    session.add(department)
    session.commit()
    session.refresh(branch)
    session.refresh(department)
    return tenant, branch, department


def test_practitioner_repository_applies_dynamic_filter_before_pagination(test_engine):
    with Session(test_engine) as session:
        tenant, branch, department = _clinic(session)
        cardiology = Practitioner(
            tenant_id=tenant.id,
            full_name="Asha Cardiologist",
            practitioner_type=PractitionerType.DOCTOR,
            primary_specialty="Cardiology",
            status=PractitionerStatus.ACTIVE,
        )
        physiotherapy = Practitioner(
            tenant_id=tenant.id,
            full_name="Bala Physio",
            practitioner_type=PractitionerType.PHYSIOTHERAPIST,
            primary_specialty="Physiotherapy",
            status=PractitionerStatus.ACTIVE,
        )
        session.add(cardiology)
        session.add(physiotherapy)
        session.commit()
        for practitioner in [cardiology, physiotherapy]:
            session.add(
                PractitionerBranch(
                    tenant_id=tenant.id,
                    practitioner_id=practitioner.id,
                    branch_id=branch.id,
                )
            )
            session.add(
                PractitionerDepartment(
                    tenant_id=tenant.id,
                    practitioner_id=practitioner.id,
                    department_id=department.id,
                )
            )
        session.commit()

        rows = PractitionerRepository(session).list_page(
            tenant_id=tenant.id,
            branch_id=branch.id,
            department_ids={department.id},
            list_filters=parse_list_filters(
                '[{"field":"primary_specialty","operator":"like","value":"cardio"}]'
            ),
            limit=1,
            offset=0,
        )
        total = PractitionerRepository(session).count_page(
            tenant_id=tenant.id,
            branch_id=branch.id,
            department_ids={department.id},
            list_filters=parse_list_filters(
                '[{"field":"primary_specialty","operator":"like","value":"cardio"}]'
            ),
        )

    assert total == 1
    assert [row.full_name for row in rows] == ["Asha Cardiologist"]


def test_practitioner_repository_filters_branch_department_and_sorts(test_engine):
    with Session(test_engine) as session:
        tenant, branch, department = _clinic(session)
        first = Practitioner(
            tenant_id=tenant.id,
            full_name="A Doctor",
            practitioner_type=PractitionerType.DOCTOR,
            registration_number="REG-002",
        )
        second = Practitioner(
            tenant_id=tenant.id,
            full_name="B Doctor",
            practitioner_type=PractitionerType.DOCTOR,
            registration_number="REG-001",
        )
        session.add(first)
        session.add(second)
        session.commit()
        session.add(
            PractitionerBranch(
                tenant_id=tenant.id,
                practitioner_id=first.id,
                branch_id=branch.id,
            )
        )
        session.add(
            PractitionerDepartment(
                tenant_id=tenant.id,
                practitioner_id=first.id,
                department_id=department.id,
            )
        )
        session.add(
            PractitionerBranch(
                tenant_id=tenant.id,
                practitioner_id=second.id,
                branch_id=branch.id,
            )
        )
        session.add(
            PractitionerDepartment(
                tenant_id=tenant.id,
                practitioner_id=second.id,
                department_id=department.id,
            )
        )
        session.commit()

        rows = PractitionerRepository(session).list_page(
            tenant_id=tenant.id,
            branch_id=branch.id,
            department_ids={department.id},
            list_sort=parse_list_sort('{"key":"registration_number","dir":"asc"}'),
            limit=1,
            offset=0,
        )

    assert [row.full_name for row in rows] == ["B Doctor"]


def test_practitioner_filter_options_include_tenant_users(test_engine):
    with Session(test_engine) as session:
        tenant, branch, _department = _clinic(session)
        user = User(
            tenant_id=tenant.id,
            branch_id=branch.id,
            name="Doctor Admin",
            email="doctor-admin@example.test",
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        user_id = user.id
        session.add(
            Practitioner(
                tenant_id=tenant.id,
                full_name="Asha Doctor",
                practitioner_type=PractitionerType.DOCTOR,
                status=PractitionerStatus.ACTIVE,
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
            )
        )
        session.commit()

        options = PractitionerRepository(session).filter_options(tenant_id=tenant.id)

    assert [row.value for row in options["practitioner_type"]] == ["doctor"]
    assert [row.value for row in options["status"]] == ["active"]
    assert {"value": user_id, "label": "Doctor Admin"} in [
        row.model_dump() for row in options["created_by_user_id"]
    ]
    assert {"value": user_id, "label": "Doctor Admin"} in [
        row.model_dump() for row in options["updated_by_user_id"]
    ]


def test_schedule_repository_applies_dynamic_sort_before_pagination(test_engine):
    with Session(test_engine) as session:
        tenant, branch, department = _clinic(session)
        doctor = Practitioner(
            tenant_id=tenant.id,
            full_name="Asha Doctor",
            practitioner_type=PractitionerType.DOCTOR,
        )
        session.add(doctor)
        session.commit()
        morning = PractitionerSchedule(
            tenant_id=tenant.id,
            practitioner_id=doctor.id,
            branch_id=branch.id,
            department_id=department.id,
            mode="custom",
            weekdays_json="[0, 1]",
            start_time=time(9, 0),
            end_time=time(10, 0),
            slot_minutes=15,
        )
        evening = PractitionerSchedule(
            tenant_id=tenant.id,
            practitioner_id=doctor.id,
            branch_id=branch.id,
            department_id=department.id,
            mode="custom",
            weekdays_json="[0, 1]",
            start_time=time(17, 0),
            end_time=time(18, 0),
            slot_minutes=30,
        )
        session.add(morning)
        session.add(evening)
        session.commit()

        rows = PractitionerScheduleRepository(session).list_page(
            tenant_id=tenant.id,
            list_sort=parse_list_sort('{"key":"slot_minutes","dir":"desc"}'),
            limit=1,
            offset=0,
        )

    assert [row.slot_minutes for row in rows] == [30]


def test_schedule_repository_filters_weekday_and_dynamic_field(test_engine):
    with Session(test_engine) as session:
        tenant, branch, department = _clinic(session)
        doctor = Practitioner(
            tenant_id=tenant.id,
            full_name="Asha Doctor",
            practitioner_type=PractitionerType.DOCTOR,
        )
        session.add(doctor)
        session.commit()
        session.add(
            PractitionerSchedule(
                tenant_id=tenant.id,
                practitioner_id=doctor.id,
                branch_id=branch.id,
                department_id=department.id,
                mode="custom",
                weekdays_json="[0, 2]",
                start_time=time(9, 0),
                end_time=time(10, 0),
                slot_minutes=15,
                is_active=True,
            )
        )
        session.add(
            PractitionerSchedule(
                tenant_id=tenant.id,
                practitioner_id=doctor.id,
                branch_id=branch.id,
                department_id=department.id,
                mode="custom",
                weekdays_json="[4]",
                start_time=time(11, 0),
                end_time=time(12, 0),
                slot_minutes=30,
                is_active=False,
            )
        )
        session.commit()

        rows = PractitionerScheduleRepository(session).list_page(
            tenant_id=tenant.id,
            weekday=2,
            list_filters=parse_list_filters(
                '[{"field":"is_active","operator":"equals","value":"true"}]'
            ),
        )
        total = PractitionerScheduleRepository(session).count_page(
            tenant_id=tenant.id,
            weekday=2,
            list_filters=parse_list_filters(
                '[{"field":"is_active","operator":"equals","value":"true"}]'
            ),
        )

    assert total == 1
    assert [row.slot_minutes for row in rows] == [15]


def test_schedule_filter_options_include_references_and_tenant_users(test_engine):
    with Session(test_engine) as session:
        tenant, branch, department = _clinic(session)
        user = User(
            tenant_id=tenant.id,
            branch_id=branch.id,
            name="Schedule Admin",
            email="schedule-admin@example.test",
        )
        doctor = Practitioner(
            tenant_id=tenant.id,
            full_name="Asha Doctor",
            practitioner_type=PractitionerType.DOCTOR,
        )
        session.add(user)
        session.add(doctor)
        session.commit()
        session.refresh(user)
        session.refresh(doctor)
        user_id = user.id
        doctor_id = doctor.id
        branch_id = branch.id
        department_id = department.id
        session.add(
            PractitionerSchedule(
                tenant_id=tenant.id,
                practitioner_id=doctor_id,
                branch_id=branch_id,
                department_id=department_id,
                mode="custom",
                weekdays_json="[0]",
                start_time=time(9, 0),
                end_time=time(10, 0),
                slot_minutes=15,
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
            )
        )
        session.commit()

        options = PractitionerScheduleRepository(session).filter_options(
            tenant_id=tenant.id
        )

    assert {"value": doctor_id, "label": "Asha Doctor"} in [
        row.model_dump() for row in options["practitioner_id"]
    ]
    assert {"value": branch_id, "label": "Main Branch"} in [
        row.model_dump() for row in options["branch_id"]
    ]
    assert {"value": department_id, "label": "General Medicine"} in [
        row.model_dump() for row in options["department_id"]
    ]
    assert {"value": user_id, "label": "Schedule Admin"} in [
        row.model_dump() for row in options["created_by_user_id"]
    ]
