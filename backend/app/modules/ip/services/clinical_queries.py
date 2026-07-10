from sqlmodel import Session

from app.modules.identity.models import User
from app.modules.ip.models import (
    IPMedicationAdministration,
    IPMedicationOrder,
    IPTreatment,
)
from app.modules.ip.repositories import IPClinicalRepository
from app.modules.ip.services.validation import assert_ip_enabled, get_admission


def list_ip_treatments(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    current_user: User,
) -> list[IPTreatment]:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    return IPClinicalRepository(session).list_treatments(
        tenant_id=tenant_id,
        admission_id=admission.id,
    )


def list_ip_medication_orders(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    current_user: User,
) -> list[IPMedicationOrder]:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    return IPClinicalRepository(session).list_medication_orders(
        tenant_id=tenant_id,
        admission_id=admission.id,
    )


def list_ip_medication_administrations(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    current_user: User,
) -> list[IPMedicationAdministration]:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    return IPClinicalRepository(session).list_medication_administrations(
        tenant_id=tenant_id,
        admission_id=admission.id,
    )
