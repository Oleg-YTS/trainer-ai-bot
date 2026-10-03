import os

os.environ["TELEGRAM_BOT_TOKEN"] = "123456:TEST"
os.environ["WEBHOOK_SECRET_TOKEN"] = "test-secret"
os.environ["WEBHOOK_BASE_URL"] = ""
os.environ.pop("RENDER_EXTERNAL_URL", None)

from fastapi.testclient import TestClient

from app.main import app

SECRET_HEADER = {"X-Telegram-Bot-Api-Secret-Token": "test-secret"}


def test_health() -> None:
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_webhook_rejects_wrong_secret() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/telegram/webhook",
            json={"update_id": 1},
            headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"},
        )
    assert response.status_code == 403


def test_webhook_accepts_update() -> None:
    with TestClient(app) as client:
        response = client.post("/telegram/webhook", json={"update_id": 2}, headers=SECRET_HEADER)
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_webhook_rejects_malformed_payload() -> None:
    with TestClient(app) as client:
        response = client.post("/telegram/webhook", content=b"not json", headers=SECRET_HEADER)
    assert response.status_code == 400

