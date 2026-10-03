import json
from pathlib import Path
from typing import Any

DATA_USERS_DIR = Path("webapp/users")

def save_profile_to_json_file(client_id: int, profile: dict[str, Any], telegram_user_id: int | None = None) -> None:
    try:
        DATA_USERS_DIR.mkdir(parents=True, exist_ok=True)
        file_path = DATA_USERS_DIR / f"user_{client_id}.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(profile, f, ensure_ascii=False, indent=2)
        if telegram_user_id:
            tg_path = DATA_USERS_DIR / f"user_tg_{telegram_user_id}.json"
            with open(tg_path, "w", encoding="utf-8") as f:
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

def load_all_json_users() -> list[dict[str, Any]]:
    users = []
    try:
        if DATA_USERS_DIR.exists():
            for p in DATA_USERS_DIR.glob("user_*.json"):
                if "tg_" in p.name:
                    continue
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, dict):
                            users.append(data)
                except Exception:
                    continue
    except Exception:
        pass
    return users
