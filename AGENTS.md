# Coding rules

1. LLM is not the source of truth.
2. Trainer-approved knowledge and explicit client data are authoritative.
3. Never invent trainer decisions, client facts, medical conclusions, or approvals.
4. AI-generated knowledge must remain a draft until trainer approval.
5. Classify before category-specific generation.
6. Retrieval must consider applicability, not only similarity.
7. Escalate uncertain, conflicting, health-related, or program-change requests.
8. Telegram handlers stay thin; business logic belongs in services.
9. Keep the LLM provider behind an abstraction.
10. Do not add unnecessary infrastructure before the MVP requires it.
11. Каждая задача обязана фиксировать выжимку обсуждения, контекста, проблем и принятых решений (в JOURNAL.md), чтобы обеспечивать быстрое обращение к массиву данных из диалогов и точную ориентацию в истории проекта.
12. Любой push в репозиторий выполняется СТРОГО по явной команде пользователя.
