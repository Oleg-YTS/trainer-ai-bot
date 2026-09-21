# Architecture

Telegram -> aiogram -> AI Orchestrator -> classification -> client context -> knowledge retrieval -> grounded generation -> validation/escalation -> Telegram.

PostgreSQL stores clients, conversations, trainer knowledge and escalations. pgvector can store knowledge embeddings.

The runtime does not query GitHub. GitHub is source control/build input; Render runs the deployed application.
