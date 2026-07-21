import pytest
from pydantic import ValidationError

from app.main import create_app
from app.modules.settings.schemas import AdminSettingUpsert


def test_sidebar_role_module_setting_and_endpoint_are_removed():
    paths = {route.path for route in create_app().routes}

    assert "/api/v1/settings/sidebar-modules" not in paths
    with pytest.raises(ValidationError):
        AdminSettingUpsert(
            module="navigation",
            key="navigation.role_modules",
            value={"receptionist": ["appointments"]},
        )
