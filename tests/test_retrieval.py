import pytest

from app.knowledge.retrieval import normalize_query, search_knowledge
from app.knowledge.service import create_knowledge_item


async def test_normalize_query_lowercases_and_splits() -> None:
    assert normalize_query("  How Many SETS? ") == ["how", "many", "sets?"]


async def test_normalize_query_drops_short_words() -> None:
    assert normalize_query("a squat") == ["squat"]


async def test_search_finds_published_items_and_ranks_title_higher(
    session, trainers
) -> None:
    await create_knowledge_item(
        session, 1, "training", "Squat guide", "keep the chest up", status="published"
    )
    await create_knowledge_item(
        session, 1, "nutrition", "Protein basics", "squat needs protein too", status="published"
    )
    results = await search_knowledge(session, 1, "squat")
    assert [item.title for item in results] == ["Squat guide", "Protein basics"]


async def test_search_matches_every_term(session, trainers) -> None:
    await create_knowledge_item(
        session, 1, "training", "Squat guide", "depth below parallel", status="published"
    )
    await create_knowledge_item(
        session, 1, "training", "Bench guide", "pause on the chest", status="published"
    )
    results = await search_knowledge(session, 1, "squat depth")
    assert [item.title for item in results] == ["Squat guide"]


async def test_search_excludes_draft_items(session, trainers) -> None:
    await create_knowledge_item(session, 1, "training", "Draft plan", "squat", status="draft")
    assert await search_knowledge(session, 1, "squat") == []


async def test_search_excludes_archived_items(session, trainers) -> None:
    await create_knowledge_item(
        session, 1, "training", "Old plan", "squat", status="archived"
    )
    assert await search_knowledge(session, 1, "squat") == []


async def test_search_filters_by_category(session, trainers) -> None:
    await create_knowledge_item(
        session, 1, "training", "Squat guide", "squat", status="published"
    )
    await create_knowledge_item(
        session, 1, "nutrition", "Squat fuel", "squat", status="published"
    )
    results = await search_knowledge(session, 1, "squat", category="nutrition")
    assert [item.title for item in results] == ["Squat fuel"]


async def test_search_rejects_unknown_category(session, trainers) -> None:
    with pytest.raises(ValueError, match="unsupported category"):
        await search_knowledge(session, 1, "squat", category="magic")


async def test_search_is_scoped_to_trainer(session, trainers) -> None:
    await create_knowledge_item(
        session, 2, "training", "Other trainer plan", "squat", status="published"
    )
    assert await search_knowledge(session, 1, "squat") == []
    results = await search_knowledge(session, 2, "squat")
    assert [item.title for item in results] == ["Other trainer plan"]


async def test_search_respects_limit(session, trainers) -> None:
    for index in range(3):
        await create_knowledge_item(
            session, 1, "training", f"Plan {index}", "squat", status="published"
        )
    results = await search_knowledge(session, 1, "squat", limit=2)
    assert len(results) == 2


async def test_search_returns_empty_for_blank_or_short_query(session, trainers) -> None:
    await create_knowledge_item(
        session, 1, "training", "Squat guide", "squat", status="published"
    )
    assert await search_knowledge(session, 1, "   ") == []
    assert await search_knowledge(session, 1, "a") == []


async def test_search_returns_empty_when_nothing_matches(session, trainers) -> None:
    await create_knowledge_item(
        session, 1, "training", "Squat guide", "squat", status="published"
    )
    assert await search_knowledge(session, 1, "deadlift") == []


async def test_search_returns_empty_list_for_zero_limit(session, trainers) -> None:
    await create_knowledge_item(
        session, 1, "training", "Squat guide", "squat", status="published"
    )
    assert await search_knowledge(session, 1, "squat", limit=0) == []