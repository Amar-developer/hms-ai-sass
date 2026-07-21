# In-App Notifications

## Purpose

The in-app notification module is the authenticated staff inbox for operational
events, approval workflows, and MedizinHub product announcements. It is separate
from `NotificationEvent`, which remains the outbound WhatsApp, SMS, and voice
delivery queue.

## User Experience

- The application header bell polls unread state every 30 seconds.
- The compact drawer shows the latest eight items; the full inbox shows up to
  100 and supports category and unread filters.
- Every recipient has independent read and archive state.
- Invoice notifications open the exact invoice. Appointment notifications
  filter the appointment list to the referenced appointment.
- The dashboard shows the five newest unread items as an Action Required card.
- Typing `@` in a document comment searches active users in the current tenant.
  Selected users receive a private unread mention notification linking back to
  the originating module and record.
- SaaS super admins and tenant admins can publish feature, version, maintenance,
  and security notices from the notification center.
- The notification footer displays the customer-facing product release version
  supplied by the repository's root `VERSION` file.

## Targeting and Privacy

Each inbox row belongs to exactly one `recipient_user_id`. Operational rows also
store tenant, branch, and department scope. A user can only list or mutate their
own rows.

Appointment delivery resolves:

1. The user linked to the assigned practitioner.
2. Active same-branch users holding appointment read/manage permission.
3. Tenant admins through their implicit tenant authority.

The present identity model does not contain a general staff-to-department join.
`department_id` is therefore persisted now, while non-doctor staff delivery is
limited by tenant, branch, and permission. Exact department staff filtering can
be enabled later by adding a staff-department mapping without changing inbox
records or APIs.

Billing request delivery is permission-based:

- Submitted cancel, full-refund, partial-refund, and discount requests go to
  same-branch approvers.
- Approved, rejected, and executed decisions go back to the original requester.
- Notification dedupe keys prevent workflow retries from creating duplicates.

Product announcements can target a tenant or the platform, user type,
permission, and enabled subscription module. Expired notifications are omitted
from active inbox queries.

Comment mentions store the selected user ID separately from the visible
`@Name`. The server rejects inactive users, users from another tenant, the
comment author, duplicate IDs, and hidden IDs without a matching visible
mention token.

## API

All inbox endpoints require authentication and `X-Tenant-ID`.

```text
GET   /api/v1/notifications/in-app
PATCH /api/v1/notifications/in-app/{notification_id}
POST  /api/v1/notifications/in-app/read-all
POST  /api/v1/notifications/in-app/announcements
GET   /api/v1/activity/mention-users?q=<name-or-email>
POST  /api/v1/activity/{resource_type}/{resource_id}/comments
```

List query parameters:

```text
limit=1..100
offset=0..
unread_only=true|false
category=<notification category>
include_archived=true|false
```

## Tables

- `inappnotification`: recipient inbox, scope, content, resource link,
  read/archive state, expiration, and dedupe key.
- `productannouncement`: published content plus its original audience criteria.
- `documentcommentmention`: tenant-scoped comment-to-user mention membership.
- `notificationevent`: unchanged outbound provider queue.

Migrations: `20260719_0081_in_app_notifications.py` and
`20260719_0082_comment_mentions.py`.

## Extending the Module

Use `create_for_users()` for a new domain event, or add a small event-specific
helper in `backend/app/modules/notifications/services/in_app.py`. Always:

- resolve recipients server-side;
- apply tenant and branch scope before delivery;
- prefer permission checks over role-name checks;
- provide a stable dedupe key;
- avoid sensitive clinical detail in titles or messages;
- set `action_module`, `resource_type`, and `resource_id` for navigation.
