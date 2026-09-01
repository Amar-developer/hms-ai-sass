from datetime import date, time
from decimal import Decimal

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
from app.modules.expenses.models import Expense, ExpenseCategory, ExpenseStatus
from app.modules.expenses.repositories.expense_repository import ExpenseRepository
from app.modules.identity.models import User
from app.modules.patients.models import Patient
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
from app.modules.queue.models import QueueEntry
from app.modules.tenants.models import Branch, Department, Tenant
from app.modules.tenants.repositories import BranchRepository, DepartmentRepository


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


def _tenant(session: Session, name: str = "Reference Filter Clinic") -> Tenant:
    tenant = Tenant(name=name)
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant


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
        filters = parse_list_filters(
            '[{"field":"status","operator":"equals","value":"waiting"}]'
        )
        rows = repository.list_for_tenant(
            tenant_id=tenant.id,
            list_filters=filters,
            skip=0,
            limit=1,
        ).all()
        total = repository.count_for_tenant(
            tenant_id=tenant.id,
            list_filters=filters,
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
        filters = parse_list_filters(
            '[{"field":"status","operator":"equals","value":"signed"}]'
        )
        rows = repository.list_for_tenant(
            tenant_id=tenant.id,
            list_filters=filters,
            limit=1,
        )
        total = repository.count_for_tenant(
            tenant_id=tenant.id,
            list_filters=filters,
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


def test_branch_repository_applies_dynamic_filter_before_pagination(test_engine):
    with Session(test_engine) as session:
        tenant = _tenant(session)
        session.add(
            Branch(
                tenant_id=tenant.id,
                name="Main Branch",
                code="MAIN",
                city="Chennai",
                is_active=True,
            )
        )
        session.add(
            Branch(
                tenant_id=tenant.id,
                name="Old Branch",
                code="OLD",
                city="Madurai",
                is_active=False,
            )
        )
        session.commit()

        filters = parse_list_filters(
            '[{"field":"is_active","operator":"equals","value":"true"}]'
        )
        rows = BranchRepository(session).list_page(
            tenant_id=tenant.id,
            list_filters=filters,
            limit=1,
            offset=0,
        )
        total = BranchRepository(session).count_page(
            tenant_id=tenant.id,
            list_filters=filters,
        )

    assert total == 1
    assert [row.name for row in rows] == ["Main Branch"]


def test_branch_repository_applies_dynamic_sort_before_pagination(test_engine):
    with Session(test_engine) as session:
        tenant = _tenant(session)
        session.add(Branch(tenant_id=tenant.id, name="Beta Branch", code="BETA"))
        session.add(Branch(tenant_id=tenant.id, name="Alpha Branch", code="ALPHA"))
        session.commit()

        rows = BranchRepository(session).list_page(
            tenant_id=tenant.id,
            list_sort=parse_list_sort('{"key":"name","dir":"asc"}'),
            limit=1,
            offset=0,
        )

    assert [row.name for row in rows] == ["Alpha Branch"]


def test_department_repository_applies_dynamic_filter_and_sort(test_engine):
    with Session(test_engine) as session:
        tenant = _tenant(session)
        session.add(
            Department(
                tenant_id=tenant.id,
                name="Cardiology",
                code="CARD",
                description="Heart care",
            )
        )
        session.add(
            Department(
                tenant_id=tenant.id,
                name="Dermatology",
                code="DERM",
                description="Skin care",
            )
        )
        session.commit()

        filters = parse_list_filters(
            '[{"field":"description","operator":"like","value":"skin"}]'
        )
        rows = DepartmentRepository(session).list_page(
            tenant_id=tenant.id,
            list_filters=filters,
            list_sort=parse_list_sort('{"key":"name","dir":"desc"}'),
            limit=1,
            offset=0,
        )
        total = DepartmentRepository(session).count_page(
            tenant_id=tenant.id,
            list_filters=filters,
        )

    assert total == 1
    assert [row.name for row in rows] == ["Dermatology"]


def test_branch_and_department_filter_options_include_tenant_users(test_engine):
    with Session(test_engine) as session:
        tenant = _tenant(session)
        user = User(
            tenant_id=tenant.id,
            name="Settings Admin",
            email="settings-admin@example.test",
        )
        branch = Branch(
            tenant_id=tenant.id,
            name="Main Branch",
            code="MAIN",
            created_by_user_id="placeholder",
        )
        session.add(user)
        session.add(branch)
        session.commit()
        session.refresh(user)
        session.refresh(branch)
        user_id = user.id
        branch_id = branch.id
        branch.created_by_user_id = user_id
        branch.updated_by_user_id = user_id
        department = Department(
            tenant_id=tenant.id,
            branch_id=branch_id,
            name="Cardiology",
            code="CARD",
            created_by_user_id=user_id,
            updated_by_user_id=user_id,
        )
        session.add(branch)
        session.add(department)
        session.commit()

        branch_options = BranchRepository(session).filter_options(tenant_id=tenant.id)
        department_options = DepartmentRepository(session).filter_options(
            tenant_id=tenant.id
        )

    assert {"value": user_id, "label": "Settings Admin"} in [
        row.model_dump() for row in branch_options["created_by_user_id"]
    ]
    assert {"value": user_id, "label": "Settings Admin"} in [
        row.model_dump() for row in department_options["updated_by_user_id"]
    ]
    assert {"value": branch_id, "label": "Main Branch"} in [
        row.model_dump() for row in department_options["branch_id"]
    ]


def test_expense_repository_applies_dynamic_filter_before_pagination(test_engine):
    with Session(test_engine) as session:
        tenant = _tenant(session, "Expense Filter Clinic")
        branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
        session.add(branch)
        session.commit()
        session.refresh(branch)
        session.add(
            Expense(
                tenant_id=tenant.id,
                branch_id=branch.id,
                category=ExpenseCategory.RENT,
                subcategory="Clinic Rent",
                amount=Decimal("1000.00"),
                incurred_on=date(2026, 8, 1),
                description="Monthly rent",
                submitted_by="user_one",
            )
        )
        session.add(
            Expense(
                tenant_id=tenant.id,
                branch_id=branch.id,
                category=ExpenseCategory.SUPPLIES,
                subcategory="Syringes",
                amount=Decimal("250.00"),
                incurred_on=date(2026, 8, 2),
                description="Medical supplies",
                submitted_by="user_two",
            )
        )
        session.commit()

        rows, total = ExpenseRepository(session).list_for_tenant(
            tenant_id=tenant.id,
            branch_id=None,
            list_filters=parse_list_filters(
                '[{"field":"subcategory","operator":"like","value":"rent"}]'
            ),
            limit=1,
            offset=0,
        )

    assert total == 1
    assert [row.description for row in rows] == ["Monthly rent"]


def test_expense_repository_applies_dynamic_sort_before_pagination(test_engine):
    with Session(test_engine) as session:
        tenant = _tenant(session, "Expense Sort Clinic")
        branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
        session.add(branch)
        session.commit()
        session.refresh(branch)
        session.add(
            Expense(
                tenant_id=tenant.id,
                branch_id=branch.id,
                category=ExpenseCategory.RENT,
                subcategory="Clinic Rent",
                amount=Decimal("1000.00"),
                incurred_on=date(2026, 8, 1),
                description="Large",
                submitted_by="user_one",
            )
        )
        session.add(
            Expense(
                tenant_id=tenant.id,
                branch_id=branch.id,
                category=ExpenseCategory.SUPPLIES,
                subcategory="Syringes",
                amount=Decimal("250.00"),
                incurred_on=date(2026, 8, 2),
                description="Small",
                submitted_by="user_two",
            )
        )
        session.commit()

        rows, _total = ExpenseRepository(session).list_for_tenant(
            tenant_id=tenant.id,
            branch_id=None,
            list_sort=parse_list_sort('{"key":"amount","dir":"asc"}'),
            limit=1,
            offset=0,
        )

    assert [row.description for row in rows] == ["Small"]


def test_expense_filter_options_are_user_and_branch_backed(test_engine):
    with Session(test_engine) as session:
        tenant = _tenant(session, "Expense Options Clinic")
        branch = Branch(tenant_id=tenant.id, name="Main Branch", code="MAIN")
        session.add(branch)
        session.commit()
        session.refresh(branch)
        user = User(
            tenant_id=tenant.id,
            branch_id=branch.id,
            name="Expense User",
            email="expense@example.test",
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        user_id = user.id
        session.add(
            Expense(
                tenant_id=tenant.id,
                branch_id=branch.id,
                category=ExpenseCategory.RENT,
                subcategory="Clinic Rent",
                amount=Decimal("1000.00"),
                incurred_on=date(2026, 8, 1),
                description="Monthly rent",
                status=ExpenseStatus.PENDING,
                submitted_by=user_id,
                created_by_user_id=user_id,
            )
        )
        session.commit()

        options = ExpenseRepository(session).filter_options(
            tenant_id=tenant.id,
            branch_id=branch.id,
        )

    assert [row.model_dump() for row in options["branch_id"]] == [
        {"value": branch.id, "label": "Main Branch"}
    ]
    assert [row.value for row in options["category"]] == ["rent"]
    assert {"value": user_id, "label": "Expense User"} in [
        row.model_dump() for row in options["created_by_user_id"]
    ]


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
