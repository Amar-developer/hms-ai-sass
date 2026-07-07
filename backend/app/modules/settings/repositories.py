from sqlalchemy import text
from sqlmodel import Session, select

from app.modules.settings.models import (
    AdminSetting,
    DocumentSequence,
    SettingKey,
    SettingScope,
)
from app.modules.tenants.models import Branch


class AdminSettingRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_branch(self, branch_id: str) -> Branch | None:
        return self.session.get(Branch, branch_id)

    def find_setting(
        self,
        *,
        tenant_id: str,
        scope: SettingScope,
        scope_id: str,
        module: str,
        key: SettingKey,
    ) -> AdminSetting | None:
        return self.session.exec(
            select(AdminSetting).where(
                AdminSetting.tenant_id == tenant_id,
                AdminSetting.scope == scope,
                AdminSetting.scope_id == scope_id,
                AdminSetting.module == module,
                AdminSetting.key == key,
            )
        ).first()

    def list_settings(
        self,
        *,
        tenant_id: str,
        module: str | None = None,
        scope_ids: list[str] | None = None,
    ) -> list[AdminSetting]:
        statement = select(AdminSetting).where(AdminSetting.tenant_id == tenant_id)
        if scope_ids:
            statement = statement.where(AdminSetting.scope_id.in_(scope_ids))
        if module:
            statement = statement.where(AdminSetting.module == module)
        return list(
            self.session.exec(statement.order_by(AdminSetting.created_at)).all()
        )


class DocumentSequenceRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_for_update(
        self,
        *,
        tenant_id: str,
        branch_id: str,
        entity: str,
    ) -> DocumentSequence | None:
        return self.session.exec(
            select(DocumentSequence)
            .where(
                DocumentSequence.tenant_id == tenant_id,
                DocumentSequence.branch_id == branch_id,
                DocumentSequence.entity == entity,
            )
            .with_for_update()
        ).first()

    def max_existing_number(
        self,
        *,
        tenant_id: str,
        branch_id: str,
        table_name: str,
        column_name: str,
        branch_scoped: bool,
    ) -> list:
        sql = f'select "{column_name}" from "{table_name}" where tenant_id = :tenant_id and "{column_name}" is not null'
        params: dict[str, str] = {"tenant_id": tenant_id}
        if branch_scoped and branch_id:
            sql += ' and "branch_id" = :branch_id'
            params["branch_id"] = branch_id
        return self.session.exec(text(sql), params=params).all()
