import json
from pathlib import Path
from typing import Any

DATA_USERS_DIR = Path("data/users")


def save_profile_to_json_file(client_id: int, profile: dict[str, Any]) -> None:
    try:
        DATA_USERS_DIR.mkdir(parents=True, exist_ok=True)
        file_path = DATA_USERS_DIR / f"user_{client_id}.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(profile, f, ensure_ascii=False, indent=2)
    except Exception as exc:
        pass


def load_profile_from_json_file(client_id: int) -> dict[str, Any] | None:
    try:
        file_path = DATA_USERS_DIR / f"user_{client_id}.json"
        if file_path.exists():
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return None
