# Trainer AI Proxy Bot

MVP scaffold for a Telegram AI assistant acting as a proxy between a fitness trainer and clients.

The AI is not the trainer and is not the source of truth. Authoritative sources are trainer-approved knowledge, explicit client profile data, and system rules.

Stack: Python 3.12, FastAPI, aiogram 3, PostgreSQL + pgvector, SQLAlchemy 2, Alembic, Pydantic Settings, OpenAI API, Docker/Render.

See `AGENTS.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md`.

## Run locally (long polling)

```bash
cp .env.example .env   # fill TELEGRAM_BOT_TOKEN
python -m app.bot.polling
```

Long polling removes any webhook first. If a deployed instance uses the same bot token, stop it: two processes polling one token cause `TelegramConflictError`.

## Deploy (webhook on Render)

`render.yaml` describes a free Docker web service: `healthCheckPath: /health`, webhook path `/telegram/webhook`, port from `$PORT`.

```bash
python -m app.main     # HTTP server: GET /health, POST /telegram/webhook
```

The webhook is registered on startup from `WEBHOOK_BASE_URL` or Render's `RENDER_EXTERNAL_URL`. `WEBHOOK_SECRET_TOKEN` (characters `A-Za-z0-9_-` only) is verified against the `X-Telegram-Bot-Api-Secret-Token` header.

Free Render instances spin down after 15 minutes without inbound traffic and take about a minute to wake up, so updates arriving while idle can be lost.

## Current status

The bot answers `/start` and any message. Until `OPENAI_API_KEY` and `OPENAI_MODEL` are configured, replies use the escalation stub instead of the model.

