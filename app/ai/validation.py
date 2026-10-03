MIN_ANSWER_LENGTH = 2
MAX_ANSWER_LENGTH = 4000
INTERNAL_MARKERS = (
    "system rules",
    "relevant knowledge",
    "recent conversation",
    "current user message",
    "no client profile data is available",
    "no relevant product knowledge was found",
)


def validate_answer(raw: str) -> str:
    if not isinstance(raw, str):
        raise TypeError("answer must be a string")
    text = raw.strip()
    if len(text) < MIN_ANSWER_LENGTH:
        raise ValueError("answer is empty")
    lowered = text.lower()
    if any(marker in lowered for marker in INTERNAL_MARKERS):
        raise ValueError("answer leaks internal prompt fragments")
    return text[:MAX_ANSWER_LENGTH]