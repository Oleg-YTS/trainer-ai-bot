# Architecture

Telegram -> HTTPS POST (webhook + secret token) -> FastAPI -> aiogram -> AI Orchestrator -> classification -> client context -> knowledge retrieval -> grounded generation -> validation/escalation -> Telegram.

Runtime entrypoint: `app.main` (FastAPI + uvicorn, binds `0.0.0.0:$PORT`, webhook path `/telegram/webhook`, health check `/health`). Local development uses long polling: `python -m app.bot.polling`.

OpenAI and PostgreSQL are optional at startup: while they are not configured, the bot answers with an escalation message instead of calling the model.

PostgreSQL stores clients, conversations, trainer knowledge and escalations. pgvector can store knowledge embeddings.

The runtime does not query GitHub. GitHub is source control/build input; Render runs the deployed application.
