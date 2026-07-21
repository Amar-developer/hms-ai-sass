from sqlmodel import Session, select

from app.modules.audit.models import DocumentCommentMention
from app.modules.audit.service import add_comment, comment_read, list_mention_users
from app.modules.identity.models import User
from app.modules.notifications.models import InAppNotification
from app.modules.tenants.models import Tenant, TenantStatus


def test_comment_mentions_are_tenant_scoped_and_create_notifications(test_engine):
    with Session(test_engine) as session:
        tenant = Tenant(name="Mention Clinic", status=TenantStatus.ACTIVE)
        other_tenant = Tenant(name="Other Clinic", status=TenantStatus.ACTIVE)
        session.add(tenant)
        session.add(other_tenant)
        session.commit()
        session.refresh(tenant)
        session.refresh(other_tenant)

        author = User(
            tenant_id=tenant.id,
            name="Comment Author",
            email="comment.author@test.local",
        )
        recipient = User(
            tenant_id=tenant.id,
            name="Prakash Kumar",
            email="prakash.mention@test.local",
            user_type="doctor",
        )
        inactive = User(
            tenant_id=tenant.id,
            name="Inactive User",
            email="inactive.mention@test.local",
            is_active=False,
        )
        outsider = User(
            tenant_id=other_tenant.id,
            name="Outside User",
            email="outside.mention@test.local",
        )
        session.add(author)
        session.add(recipient)
        session.add(inactive)
        session.add(outsider)
        session.commit()
        for user in (author, recipient, inactive, outsider):
            session.refresh(user)

        candidates = list_mention_users(
            session,
            tenant_id=tenant.id,
            current_user_id=author.id,
            query="prak",
        )
        assert [user.id for user in candidates] == [recipient.id]

        comment = add_comment(
            session,
            tenant_id=tenant.id,
            resource_type="appointment",
            resource_id="appointment_mention_test",
            author=author,
            body="@Prakash Kumar please review this appointment.",
            mentioned_user_ids=[recipient.id, recipient.id, inactive.id, outsider.id],
        )

        mentions = list(
            session.exec(
                select(DocumentCommentMention).where(
                    DocumentCommentMention.comment_id == comment.id
                )
            ).all()
        )
        assert len(mentions) == 1
        assert mentions[0].mentioned_user_id == recipient.id

        notifications = list(
            session.exec(
                select(InAppNotification).where(
                    InAppNotification.recipient_user_id == recipient.id
                )
            ).all()
        )
        assert len(notifications) == 1
        assert notifications[0].event_type == "comment.mentioned"
        assert notifications[0].action_module == "appointments"
        assert notifications[0].resource_id == "appointment_mention_test"
        assert notifications[0].is_read is False

        consultation_comment = add_comment(
            session,
            tenant_id=tenant.id,
            resource_type="consultation",
            resource_id="consultation_mention_test",
            author=author,
            body="@Prakash Kumar please review this consultation.",
            mentioned_user_ids=[recipient.id],
        )
        consultation_notification = session.exec(
            select(InAppNotification).where(
                InAppNotification.recipient_user_id == recipient.id,
                InAppNotification.resource_id == "consultation_mention_test",
            )
        ).one()
        assert consultation_notification.action_module == "consultation"
        assert consultation_notification.resource_type == "consultation"

        rendered = comment_read(session, comment)
        assert [user.id for user in rendered.mentions] == [recipient.id]
        assert consultation_comment.id
