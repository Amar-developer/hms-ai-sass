import httpx
import pytest

from helpers import AuthContext, assert_status, audit_actions, create_clinical_context


pytestmark = pytest.mark.e2e


def test_queue_call_not_available_requeue_and_start_consultation(
    api_client: httpx.Client,
    super_admin: AuthContext,
) -> None:
    clinical = create_clinical_context(
        api_client,
        super_admin,
        name_prefix="E2E Queue",
        sign_consultation=False,
    )
    headers = clinical.tenant.admin.headers()
    entry_id = clinical.queue_entry_id
    called = assert_status(
        api_client.post(
            f"/queue/{entry_id}/call",
            headers=headers,
            json={"reason": "Token announced"},
        ),
        200,
    ).json()
    assert called["status"] == "called"
    unavailable = assert_status(
        api_client.post(
            f"/queue/{entry_id}/mark-not-available",
            headers=headers,
            json={"reason": "Patient away from waiting area"},
        ),
        200,
    ).json()
    assert unavailable["status"] == "patient_not_available"
    requeued = assert_status(
        api_client.post(
            f"/queue/{entry_id}/requeue",
            headers=headers,
            json={"reason": "Patient returned", "place_at_end": True},
        ),
        200,
    ).json()
    assert requeued["status"] == "requeued"
    started = assert_status(
        api_client.post(
            f"/queue/{entry_id}/start-consultation",
            headers=headers,
            json={"reason": "Doctor accepted patient"},
        ),
        200,
    ).json()
    assert started["status"] == "in_consultation"
    actions = audit_actions(api_client, clinical.tenant)
    assert {
        "queue.token_called",
        "queue.patient_not_available",
        "queue.patient_requeued",
        "consultation.started",
    }.issubset(actions)
