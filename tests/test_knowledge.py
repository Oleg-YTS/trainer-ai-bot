import pytest

from app.knowledge.service import (
    MAX_TITLE_LENGTH,
    archive_knowledge_item,
    create_knowledge_item,
    get_knowledge_item,
    list_knowledge_items,
    update_knowledge_item,
)


async def test_create_knowledge_item_stores_draft_by_default(session, trainers) -> None:
    item = await create_knowledge_item(session, 1, "training", "Push plan", "3 sets of 10")
    assert item.id is not None
    assert item.trainer_id == 1
    assert item.category == "training"
    assert item.status == "draft"
    assert item.created_at is not None


async def test_create_knowledge_item_rejects_unknown_category(session, trainers) -> None:
    with pytest.raises(ValueError, match="unsupported category"):
        await create_knowledge_item(session, 1, "magic", "Title", "Content")


async def test_create_knowledge_item_rejects_unknown_status(session, trainers) -> None:
    with pytest.raises(ValueError, match="unsupported status"):
        await create_knowledge_item(session, 1, "training", "Title", "Content", status="approved")


async def test_create_knowledge_item_rejects_empty_title_and_content(session, trainers) -> None:
    with pytest.raises(ValueError, match="title is empty"):
        await create_knowledge_item(session, 1, "training", "   ", "Content")
    with pytest.raises(ValueError, match="content is empty"):
        await create_knowledge_item(session, 1, "training", "Title", "  ")


async def test_create_knowledge_item_truncates_long_title(session, trainers) -> None:
    item = await create_knowledge_item(
        session, 1, "training", "t" * (MAX_TITLE_LENGTH + 10), "Content"
    )
    assert len(item.title) == MAX_TITLE_LENGTH


async def test_get_knowledge_item_returns_own_item(session, trainers) -> None:
    created = await create_knowledge_item(session, 1, "nutrition", "Protein", "1.6 g per kg")
    found = await get_knowledge_item(session, 1, created.id)
    assert found is not None
    assert found.title == "Protein"


async def test_get_knowledge_item_is_scoped_to_trainer(session, trainers) -> None:
    created = await create_knowledge_item(session, 1, "nutrition", "Protein", "1.6 g per kg")
    assert await get_knowledge_item(session, 2, created.id) is None


async def test_get_knowledge_item_returns_none_for_unknown_id(session, trainers) -> None:
    assert await get_knowledge_item(session, 1, 999999) is None


async def test_list_knowledge_items_returns_only_own_items(session, trainers) -> None:
    await create_knowledge_item(session, 1, "training", "A", "a")
    await create_knowledge_item(session, 2, "training", "B", "b")
    items = await list_knowledge_items(session, 1)
    assert [item.title for item in items] == ["A"]


async def test_list_knowledge_items_filters_by_category_and_status(session, trainers) -> None:
    await create_knowledge_item(session, 1, "training", "T1", "a")
    await create_knowledge_item(session, 1, "nutrition", "N1", "b", status="published")
    items = await list_knowledge_items(session, 1, category="nutrition")
    assert [item.title for item in items] == ["N1"]
    items = await list_knowledge_items(session, 1, status="draft")
    assert [item.title for item in items] == ["T1"]


async def test_list_knowledge_items_returns_empty_list_for_zero_limit(
    session, trainers
) -> None:
    await create_knowledge_item(session, 1, "training", "A", "a")
    assert await list_knowledge_items(session, 1, limit=0) == []


async def test_update_knowledge_item_changes_fields(session, trainers) -> None:
    created = await create_knowledge_item(session, 1, "training", "Old", "Old text")
    updated = await update_knowledge_item(
        session,
        1,
        created.id,
        category="nutrition",
        title="New",
        content="New text",
        status="published",
    )
    assert (updated.category, updated.title, updated.content, updated.status) == (
        "nutrition",
        "New",
        "New text",
        "published",
    )


async def test_update_knowledge_item_rejects_invalid_values(session, trainers) -> None:
    created = await create_knowledge_item(session, 1, "training", "Title", "Text")
    with pytest.raises(ValueError, match="unsupported status"):
        await update_knowledge_item(session, 1, created.id, status="approved")
    item = await get_knowledge_item(session, 1, created.id)
    assert item.status == "draft"


async def test_update_knowledge_item_is_scoped_to_trainer(session, trainers) -> None:
    created = await create_knowledge_item(session, 1, "training", "Title", "Text")
    assert await update_knowledge_item(session, 2, created.id, title="Hacked") is None
    assert await update_knowledge_item(session, 1, 999999, title="Ghost") is None


async def test_archive_knowledge_item_sets_archived_status(session, trainers) -> None:
    created = await create_knowledge_item(
        session, 1, "recovery", "Sleep", "8 hours", status="published"
    )
    archived = await archive_knowledge_item(session, 1, created.id)
    assert archived.status == "archived"
    items = await list_knowledge_items(session, 1, status="published")
    assert items == []


async def test_archive_knowledge_item_is_scoped_to_trainer(session, trainers) -> None:
    created = await create_knowledge_item(session, 1, "recovery", "Sleep", "8 hours")
    assert await archive_knowledge_item(session, 2, created.id) is None