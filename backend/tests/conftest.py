import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.core.database import get_session
from app.main import create_app
from app.modules.identity.models import User
from app.modules.identity.security import create_access_session, hash_password
from app.modules.subscriptions.service import ensure_default_plans


@pytest.fixture()
def test_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        ensure_default_plans(session)
    return engine


@pytest.fixture()
def unauthenticated_client(test_engine):
    def override_get_session():
        with Session(test_engine) as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = override_get_session

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture()
def client(test_engine):
    with Session(test_engine) as session:
        user = User(
            name="Test Super Admin",
            email="test.superadmin@medizinhub.local",
            password_hash=hash_password("TestPass123"),
            is_super_admin=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        token, _auth_session = create_access_session(session, user)

    def override_get_session():
        with Session(test_engine) as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = override_get_session

    with TestClient(app) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {token}"})
        yield test_client

    app.dependency_overrides.clear()
