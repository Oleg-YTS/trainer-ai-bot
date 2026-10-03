import pytest

from app.clients.profile import MAX_PROFILE_BYTES, get_profile, parse_profile, update_profile


def test_parse_profile_returns_empty_object_for_blank_value() -> None:
    assert parse_profile("") == {}


def test_parse_profile_rejects_invalid_json() -> None:
    with pytest.raises(ValueError, match="valid JSON"):
        parse_profile("{not json")


def test_parse_profile_rejects_non_object_json() -> None:
    with pytest.raises(TypeError, match="JSON object"):
        parse_profile('["a", "b"]')


async def test_get_profile_returns_stored_data(session, client_id) -> None:
    await update_profile(session, client_id, '{"goal": "weight_loss"}')
    assert await get_profile(session, client_id) == {"goal": "weight_loss"}


async def test_update_profile_persists_data(session, client_id) -> None:
    await update_profile(session, client_id, '{"training_days": 3}')
    assert await get_profile(session, client_id) == {"training_days": 3}


async def test_update_profile_overwrites_previous_data(session, client_id) -> None:
    await update_profile(session, client_id, '{"goal": "muscle_gain"}')
    await update_profile(session, client_id, '{"goal": "recovery"}')
    assert await get_profile(session, client_id) == {"goal": "recovery"}


async def test_update_profile_rejects_invalid_json(session, client_id) -> None:
    with pytest.raises(ValueError, match="valid JSON"):
        await update_profile(session, client_id, "{oops}")
    assert await get_profile(session, client_id) == {}


async def test_update_profile_rejects_oversized_payload(session, client_id) -> None:
    oversized = '{"note": "' + "a" * MAX_PROFILE_BYTES + '"}'
    with pytest.raises(ValueError, match="too large"):
        await update_profile(session, client_id, oversized)


async def test_get_profile_rejects_unknown_client(session) -> None:
    with pytest.raises(ValueError, match="is not available"):
        await get_profile(session, 999999)


async def test_update_profile_rejects_unknown_client(session) -> None:
    with pytest.raises(ValueError, match="is not available"):
        await update_profile(session, 999999, '{"goal": "weight_loss"}')
