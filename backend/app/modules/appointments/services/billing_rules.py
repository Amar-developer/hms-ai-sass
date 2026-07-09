from sqlmodel import Session

from app.modules.appointments.models import AppointmentType
from app.modules.appointments.repositories import AppointmentRepository
from app.modules.appointments.schemas import AppointmentCreate
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting


class AppointmentBillingResolver:
    """Resolves billing defaults (chargeable vs. free review) for a booking."""

    def __init__(self, session: Session):
        self.session = session
        self.appointments = AppointmentRepository(session)

    def resolve_billing_defaults(
        self,
        *,
        tenant_id: str,
        branch_id: str,
        payload: AppointmentCreate,
    ) -> tuple[bool, str | None]:
        if payload.is_billable is not None:
            return payload.is_billable, payload.billing_note
        if payload.appointment_type not in {
            AppointmentType.FOLLOW_UP,
            AppointmentType.DOCTOR_REVIEW,
        }:
            return True, payload.billing_note
        if not payload.source_appointment_id:
            return True, payload.billing_note
        source = self.appointments.get_for_tenant(
            tenant_id, payload.source_appointment_id
        )
        if not source or source.tenant_id != tenant_id:
            return True, payload.billing_note
        validity_days, _scope, _scope_id = resolve_setting(
            self.session,
            tenant_id=tenant_id,
            module="follow_up",
            key=SettingKey.FOLLOW_UP_VALIDITY_DAYS,
            branch_id=branch_id,
        )
        try:
            valid_days = int(validity_days or 0)
        except (TypeError, ValueError):
            valid_days = 0
        if (
            valid_days >= 0
            and 0
            <= (payload.appointment_date - source.appointment_date).days
            <= valid_days
        ):
            return (
                False,
                payload.billing_note or f"Auto free review within {valid_days} days",
            )
        return True, payload.billing_note

    def resolve_custom_fee_amount(
        self, *, is_billable: bool, payload: AppointmentCreate
    ) -> int | None:
        # Custom price applies only to chargeable, non-OP visits. OP uses the fee
        # rule; free visits carry no price.
        return (
            payload.custom_fee_amount
            if is_billable and payload.appointment_type != AppointmentType.OP
            else None
        )
