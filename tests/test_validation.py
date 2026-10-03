import pytest

from app.ai.validation import MAX_ANSWER_LENGTH, validate_answer


def test_validate_answer_returns_stripped_text() -> None:
    assert validate_answer("  hold the plank 30 seconds  ") == "hold the plank 30 seconds"


def test_validate_answer_rejects_non_string() -> None:
    with pytest.raises(TypeError, match="must be a string"):
        validate_answer(None)
    with pytest.raises(TypeError, match="must be a string"):
        validate_answer(42)


def test_validate_answer_rejects_empty_text() -> None:
    with pytest.raises(ValueError, match="is empty"):
        validate_answer("")
    with pytest.raises(ValueError, match="is empty"):
        validate_answer("   ")


def test_validate_answer_truncates_long_text() -> None:
    assert len(validate_answer("a" * (MAX_ANSWER_LENGTH + 100))) == MAX_ANSWER_LENGTH


def test_validate_answer_rejects_internal_prompt_fragments() -> None:
    with pytest.raises(ValueError, match="leaks internal"):
        validate_answer("SYSTEM RULES: never invent facts")
    with pytest.raises(ValueError, match="leaks internal"):
        validate_answer("RELEVANT KNOWLEDGE is empty")