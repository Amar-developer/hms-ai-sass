import json
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.core.auth import (
    is_tenant_admin_user,
    user_permission_keys,
)
from app.modules.audit.service import record_audit_event
from app.modules.identity.models import (
    Permission,
    Role,
    RolePermission,
    User,
    UserRole,
)
from app.modules.notifications.models import (
    InAppNotification,
    InAppNotificationCategory,
    InAppNotificationPriority,
    ProductAnnouncement,
)
from app.modules.notifications.schemas import (
    InAppNotificationList,
    InAppNotificationRead,
    InAppNotificationUpdate,
    ProductAnnouncementCreate,
    ProductAnnouncementRead,
)
from app.modules.practitioners.models import Practitioner
from app.modules.subscriptions.services.serialization import modules_from_json
from app.modules.subscriptions.services.tenant_subscriptions import (
    get_active_subscription,
)


def _active_notification_filter():
    now = datetime.now(timezone.utc)
    return or_(
        InAppNotification.expires_at.is_(None),
        InAppNotification.expires_at > now,
    )


def _users_with_permission(
    session: Session,
    *,
    tenant_id: str,
    permission_keys: tuple[str, ...],
    branch_id: str | None = None,
    exclude_user_ids: set[str] | None = None,
) -> list[User]:
    """Resolve current role grants plus tenant-admin implicit authority."""

    statement = (
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .outerjoin(RolePermission, RolePermission.role_id == Role.id)
        .outerjoin(Permission, Permission.id == RolePermission.permission_id)
        .where(
            User.tenant_id == tenant_id,
            User.is_active == True,  # noqa: E712
            Role.is_active == True,  # noqa: E712
            or_(
                Permission.key.in_(permission_keys),
                Role.key == "tenant_admin",
                User.user_type == "tenant_admin",
            ),
        )
    )
    if branch_id:
        statement = statement.where(
            or_(User.branch_id.is_(None), User.branch_id == branch_id)
        )
    excluded = exclude_user_ids or set()
    if excluded:
        statement = statement.where(User.id.notin_(excluded))
    return list(session.exec(statement.distinct()).all())


def create_for_users(
    session: Session,
    *,
    users: list[User],
    tenant_id: str | None,
    category: InAppNotificationCategory,
    event_type: str,
    title: str,
    message: str,
    priority: InAppNotificationPriority = InAppNotificationPriority.NORMAL,
    branch_id: str | None = None,
    department_id: str | None = None,
    action_module: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    metadata: dict | None = None,
    dedupe_key: str | None = None,
    created_by_user_id: str | None = None,
    expires_at: datetime | None = None,
    commit: bool = True,
) -> list[InAppNotification]:
    created: list[InAppNotification] = []
    for user in users:
        if dedupe_key:
            existing = session.exec(
                select(InAppNotification.id).where(
                    InAppNotification.recipient_user_id == user.id,
                    InAppNotification.dedupe_key == dedupe_key,
                )
            ).first()
            if existing:
                continue
        row = InAppNotification(
            tenant_id=tenant_id,
            branch_id=branch_id,
            department_id=department_id,
            recipient_user_id=user.id,
            category=category,
            event_type=event_type,
            priority=priority,
            title=title,
            message=message,
            action_module=action_module,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata_json=json.dumps(metadata or {}, default=str),
            dedupe_key=dedupe_key,
            created_by_user_id=created_by_user_id,
            expires_at=expires_at,
        )
        session.add(row)
        created.append(row)
    if commit and created:
        session.commit()
        for row in created:
            session.refresh(row)
    return created


def notify_appointment_booked(
    session: Session,
    *,
    appointment,
    patient_name: str,
    token_number: str,
    actor_user_id: str | None,
) -> list[InAppNotification]:
    recipients = _users_with_permission(
        session,
        tenant_id=appointment.tenant_id,
        branch_id=appointment.branch_id,
        permission_keys=("appointments.manage", "appointments.read"),
        exclude_user_ids={actor_user_id} if actor_user_id else set(),
    )
    if appointment.practitioner_id:
        practitioner = session.get(Practitioner, appointment.practitioner_id)
        if practitioner and practitioner.user_id:
            doctor = session.get(User, practitioner.user_id)
            if (
                doctor
                and doctor.is_active
                and all(row.id != doctor.id for row in recipients)
            ):
                recipients.append(doctor)
    appointment_type = str(appointment.appointment_type.value)
    is_emergency = appointment_type == "emergency"
    title = (
        "Emergency appointment assigned" if is_emergency else "New appointment assigned"
    )
    message = (
        f"{patient_name} · Token {token_number} · "
        f"{appointment.appointment_date.isoformat()}"
    )
    if appointment.appointment_time:
        message += f" at {appointment.appointment_time.strftime('%H:%M')}"
    return create_for_users(
        session,
        users=recipients,
        tenant_id=appointment.tenant_id,
        branch_id=appointment.branch_id,
        department_id=appointment.department_id,
        category=InAppNotificationCategory.APPOINTMENT,
        event_type="appointment.emergency_booked"
        if is_emergency
        else "appointment.booked",
        priority=(
            InAppNotificationPriority.URGENT
            if is_emergency
            else InAppNotificationPriority.NORMAL
        ),
        title=title,
        message=message,
        action_module="appointments",
        resource_type="appointment",
        resource_id=appointment.id,
        metadata={
            "patient_id": appointment.patient_id,
            "practitioner_id": appointment.practitioner_id,
            "token_number": token_number,
        },
        dedupe_key=f"appointment.booked:{appointment.id}",
        created_by_user_id=actor_user_id,
    )


def notify_appointment_status(
    session: Session,
    *,
    appointment,
    token_number: str,
    status_value: str,
    actor_user_id: str | None,
    reason: str | None = None,
) -> list[InAppNotification]:
    recipients = _users_with_permission(
        session,
        tenant_id=appointment.tenant_id,
        branch_id=appointment.branch_id,
        permission_keys=("appointments.manage", "appointments.read"),
        exclude_user_ids={actor_user_id} if actor_user_id else set(),
    )
    if appointment.practitioner_id:
        practitioner = session.get(Practitioner, appointment.practitioner_id)
        doctor = (
            session.get(User, practitioner.user_id)
            if practitioner and practitioner.user_id
            else None
        )
        if (
            doctor
            and doctor.is_active
            and all(row.id != doctor.id for row in recipients)
        ):
            recipients.append(doctor)
    label = status_value.replace("_", " ")
    message = f"Token {token_number} was {label}."
    if reason:
        message += f" Reason: {reason}"
    return create_for_users(
        session,
        users=recipients,
        tenant_id=appointment.tenant_id,
        branch_id=appointment.branch_id,
        department_id=appointment.department_id,
        category=InAppNotificationCategory.QUEUE,
        event_type=f"appointment.{status_value}",
        priority=(
            InAppNotificationPriority.HIGH
            if status_value in {"cancelled", "no_show"}
            else InAppNotificationPriority.NORMAL
        ),
        title=f"Appointment {label}",
        message=message,
        action_module="queue",
        resource_type="appointment",
        resource_id=appointment.id,
        metadata={"token_number": token_number, "reason": reason},
        dedupe_key=f"appointment.{status_value}:{appointment.id}",
        created_by_user_id=actor_user_id,
    )


def notify_billing_request_created(
    session: Session, *, request, actor: User, invoice_number: str | None = None
) -> list[InAppNotification]:
    recipients = _users_with_permission(
        session,
        tenant_id=request.tenant_id,
        branch_id=request.branch_id,
        permission_keys=(
            "billing.manage",
            "billing.discounts.approve",
            "billing.refunds.approve",
            "billing.refunds.manage",
            "invoices.cancel_approve",
        ),
        exclude_user_ids={actor.id},
    )
    request_label = request.request_type.value.replace("_", " ").title()
    return create_for_users(
        session,
        users=recipients,
        tenant_id=request.tenant_id,
        branch_id=request.branch_id,
        category=InAppNotificationCategory.REQUEST,
        event_type=f"billing.{request.request_type.value}.requested",
        priority=InAppNotificationPriority.HIGH,
        title=f"{request_label} approval requested",
        message=f"{actor.name} requested {request_label.lower()} for {invoice_number or request.invoice_id}.",
        action_module="billing",
        resource_type="invoice",
        resource_id=request.invoice_id,
        metadata={"request_id": request.id, "amount": request.amount},
        dedupe_key=f"billing.request.created:{request.id}",
        created_by_user_id=actor.id,
    )


def notify_billing_request_status(
    session: Session,
    *,
    request,
    actor: User,
    status_value: str,
    invoice_number: str | None = None,
) -> list[InAppNotification]:
    requester = (
        session.get(User, request.requested_by_user_id)
        if request.requested_by_user_id
        else None
    )
    recipients = (
        [requester]
        if requester and requester.is_active and requester.id != actor.id
        else []
    )
    request_label = request.request_type.value.replace("_", " ").title()
    return create_for_users(
        session,
        users=recipients,
        tenant_id=request.tenant_id,
        branch_id=request.branch_id,
        category=InAppNotificationCategory.REQUEST,
        event_type=f"billing.{request.request_type.value}.{status_value}",
        priority=(
            InAppNotificationPriority.HIGH
            if status_value in {"approved", "rejected"}
            else InAppNotificationPriority.NORMAL
        ),
        title=f"{request_label} request {status_value}",
        message=f"Your request for {invoice_number or request.invoice_id} was {status_value} by {actor.name}.",
        action_module="billing",
        resource_type="invoice",
        resource_id=request.invoice_id,
        metadata={"request_id": request.id, "amount": request.amount},
        dedupe_key=f"billing.request.{status_value}:{request.id}",
        created_by_user_id=actor.id,
    )


def list_for_user(
    session: Session,
    *,
    user: User,
    limit: int,
    offset: int,
    unread_only: bool,
    category: InAppNotificationCategory | None,
    include_archived: bool,
) -> InAppNotificationList:
    filters = [
        InAppNotification.recipient_user_id == user.id,
        _active_notification_filter(),
    ]
    if unread_only:
        filters.append(InAppNotification.is_read == False)  # noqa: E712
    if category:
        filters.append(InAppNotification.category == category)
    if not include_archived:
        filters.append(InAppNotification.archived_at.is_(None))
    total = int(
        session.exec(select(func.count(InAppNotification.id)).where(*filters)).one()
        or 0
    )
    unread_count = int(
        session.exec(
            select(func.count(InAppNotification.id)).where(
                InAppNotification.recipient_user_id == user.id,
                InAppNotification.is_read == False,  # noqa: E712
                InAppNotification.archived_at.is_(None),
                _active_notification_filter(),
            )
        ).one()
        or 0
    )
    rows = list(
        session.exec(
            select(InAppNotification)
            .where(*filters)
            .order_by(InAppNotification.created_at.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    )
    return InAppNotificationList(
        items=[
            InAppNotificationRead.model_validate(row, from_attributes=True)
            for row in rows
        ],
        total=total,
        unread_count=unread_count,
    )


def update_for_user(
    session: Session,
    *,
    notification_id: str,
    user: User,
    payload: InAppNotificationUpdate,
) -> InAppNotification:
    row = session.get(InAppNotification, notification_id)
    if not row or row.recipient_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found"
        )
    now = datetime.now(timezone.utc)
    if payload.is_read is not None:
        row.is_read = payload.is_read
        row.read_at = now if payload.is_read else None
    if payload.archived is not None:
        row.archived_at = now if payload.archived else None
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def mark_all_read(session: Session, *, user: User) -> int:
    rows = list(
        session.exec(
            select(InAppNotification).where(
                InAppNotification.recipient_user_id == user.id,
                InAppNotification.is_read == False,  # noqa: E712
                InAppNotification.archived_at.is_(None),
            )
        ).all()
    )
    now = datetime.now(timezone.utc)
    for row in rows:
        row.is_read = True
        row.read_at = now
        session.add(row)
    if rows:
        session.commit()
    return len(rows)


def publish_announcement(
    session: Session,
    *,
    current_tenant_id: str,
    payload: ProductAnnouncementCreate,
    actor: User,
) -> ProductAnnouncementRead:
    target_tenant_id = payload.target_tenant_id
    if not actor.is_super_admin:
        if not is_tenant_admin_user(session, actor):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant admin access required",
            )
        if target_tenant_id and target_tenant_id != actor.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Tenant access denied"
            )
        target_tenant_id = actor.tenant_id or current_tenant_id

    announcement = ProductAnnouncement(
        tenant_id=target_tenant_id,
        category=payload.category,
        priority=payload.priority,
        title=payload.title,
        message=payload.message,
        version=payload.version,
        module_key=payload.module_key,
        target_user_type=payload.target_user_type,
        target_permission=payload.target_permission,
        action_module=payload.action_module,
        published_by_user_id=actor.id,
        expires_at=payload.expires_at,
    )
    session.add(announcement)
    session.commit()
    session.refresh(announcement)

    statement = select(User).where(User.is_active == True)  # noqa: E712
    if target_tenant_id:
        statement = statement.where(User.tenant_id == target_tenant_id)
    if payload.target_user_type:
        statement = statement.where(User.user_type == payload.target_user_type)
    users = list(session.exec(statement).all())
    if payload.target_permission:
        users = [
            row
            for row in users
            if row.is_super_admin
            or is_tenant_admin_user(session, row)
            or payload.target_permission in user_permission_keys(session, row)
        ]
    if payload.module_key:
        eligible_users: list[User] = []
        enabled_by_tenant: dict[str, bool] = {}
        for row in users:
            if row.is_super_admin:
                eligible_users.append(row)
                continue
            if not row.tenant_id:
                continue
            if row.tenant_id not in enabled_by_tenant:
                try:
                    _subscription, plan = get_active_subscription(
                        session, row.tenant_id
                    )
                    enabled_by_tenant[row.tenant_id] = (
                        payload.module_key
                        in modules_from_json(plan.enabled_modules_json)
                    )
                except HTTPException:
                    enabled_by_tenant[row.tenant_id] = False
            if enabled_by_tenant[row.tenant_id]:
                eligible_users.append(row)
        users = eligible_users
    delivered = create_for_users(
        session,
        users=users,
        tenant_id=target_tenant_id,
        category=payload.category,
        event_type=f"announcement.{payload.category.value}",
        priority=payload.priority,
        title=payload.title,
        message=payload.message,
        action_module=payload.action_module,
        resource_type="product_announcement",
        resource_id=announcement.id,
        metadata={"version": payload.version, "module_key": payload.module_key},
        dedupe_key=f"announcement:{announcement.id}",
        created_by_user_id=actor.id,
        expires_at=payload.expires_at,
    )
    record_audit_event(
        session,
        tenant_id=target_tenant_id or current_tenant_id,
        actor_user_id=actor.id,
        action="product_announcement.published",
        resource_type="product_announcement",
        resource_id=announcement.id,
        purpose="product_communication",
        metadata_json=json.dumps(
            {
                "category": payload.category.value,
                "target_tenant_id": target_tenant_id,
                "delivered_count": len(delivered),
                "version": payload.version,
                "module_key": payload.module_key,
            }
        ),
    )
    return ProductAnnouncementRead.model_validate(
        announcement, from_attributes=True
    ).model_copy(update={"delivered_count": len(delivered)})
