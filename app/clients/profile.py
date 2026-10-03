import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Client

MAX_PROFILE_BYTES = 4096
EMPTY_PROFILE = "{}"


def parse_profile(raw: str) -> dict:
    try:
        data = json.loads(raw or EMPTY_PROFILE)
    except ValueError:
        raise ValueError("profile must be valid JSON") from None
    if not isinstance(data, dict):
        raise TypeError("profile must be a JSON object")
    return data


async def get_profile(session: AsyncSession, client_id: int) -> dict:
    client = await session.get(Client, client_id)
    if client is None:
        raise ValueError(f"client {client_id} is not available")
    return parse_profile(client.profile_json)


async def update_profile(session: AsyncSession, client_id: int, raw_json: str) -> dict:
    if len(raw_json.encode("utf-8")) > MAX_PROFILE_BYTES:
        raise ValueError("profile is too large")
    data = parse_profile(raw_json)
    client = await session.get(Client, client_id)
    if client is None:
        raise ValueError(f"client {client_id} is not available")
    client.profile_json = json.dumps(data, ensure_ascii=False)
    await session.commit()
    return data
