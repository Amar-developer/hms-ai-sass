from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


# Where the From address comes from.
#   tenant_admin - the tenant's own admin address, resolved at send time so it
#                  follows a change of admin without reconfiguration.
#   custom       - the address typed on the settings page.
#   smtp_default - whatever the deployment's SMTP identity is, for tenants that
#                  send through the shared platform mailbox.
EmailSenderMode = Literal["tenant_admin", "custom", "smtp_default"]

SECRET_FIELDS = {"smtp_password"}


class EmailSettingsUpdate(BaseModel):
    """Per-tenant SMTP configuration.

    A tenant that leaves this disabled falls back to the deployment-wide SMTP
    settings in the environment, so an existing single-mailbox install keeps
    working untouched.
    """

    enabled: bool = False
    smtp_host: str = Field(default="", max_length=255)
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_use_tls: bool = True
    smtp_username: str = Field(default="", max_length=255)
    smtp_password: str | None = Field(default=None, min_length=1, max_length=500)
    sender_mode: EmailSenderMode = "tenant_admin"
    from_email: str = Field(default="", max_length=255)
    from_name: str = Field(default="", max_length=120)
    reply_to: str = Field(default="", max_length=255)

    @field_validator("smtp_password", mode="before")
    @classmethod
    def normalize_secret(cls, value):
        normalized = str(value or "").strip()
        return normalized or None

    @field_validator(
        "smtp_host",
        "smtp_username",
        "from_email",
        "from_name",
        "reply_to",
        mode="before",
    )
    @classmethod
    def normalize_text(cls, value) -> str:
        return str(value or "").strip()

    @model_validator(mode="after")
    def validate_settings(self):
        if self.enabled and not self.smtp_host:
            raise ValueError("SMTP host is required when email sending is enabled")
        if self.sender_mode == "custom" and not self.from_email:
            raise ValueError(
                "A sender address is required when the sender is set to a "
                "custom address"
            )
        for field_name in ("from_email", "reply_to"):
            value = getattr(self, field_name)
            if value and "@" not in value:
                raise ValueError(f"{field_name} must be a valid email address")
        return self


class EmailSettingsRead(BaseModel):
    enabled: bool
    smtp_host: str
    smtp_port: int
    smtp_use_tls: bool
    smtp_username: str
    has_password: bool
    password_last_four: str | None
    sender_mode: EmailSenderMode
    from_email: str
    from_name: str
    reply_to: str
    # What the tenant's mail will actually be sent as, after resolving
    # sender_mode - so the page can show the effective address without the
    # operator having to work it out.
    effective_from_email: str
    effective_from_name: str
    uses_platform_smtp: bool
    updated_at: str | None = None


class EmailTestRequest(BaseModel):
    recipient: str = Field(min_length=3, max_length=255)

    @field_validator("recipient", mode="before")
    @classmethod
    def validate_recipient(cls, value) -> str:
        normalized = str(value or "").strip()
        if "@" not in normalized or normalized.startswith("@"):
            raise ValueError("Enter a valid email address")
        return normalized


class EmailTestRead(BaseModel):
    success: bool
    message: str
    provider_message_id: str | None = None
    sent_from: str
