MALE_GENDER = "male"
FEMALE_GENDER = "female"
GENDER_MENU: tuple[tuple[str, str], ...] = (
    (MALE_GENDER, "Мужской"),
    (FEMALE_GENDER, "Женский"),
)
GENDER_LABELS = dict(GENDER_MENU)
GENDERS = frozenset(GENDER_LABELS)
NAME_KEY = "name"
GENDER_KEY = "gender"
MIN_NAME_LENGTH = 2
MAX_NAME_LENGTH = 50
NAME_EXTRA_CHARS = " -'"

TOPICS: tuple[tuple[str, str, str], ...] = (
    ("training", "🏋 Тренировки", "Расскажи коротко про тренировки: с чего начать и что важно знать."),
    ("nutrition", "🥗 Питание", "Расскажи коротко про питание: базовые принципы без сложных схем."),
    ("recovery", "😴 Восстановление", "Расскажи коротко про восстановление, сон и нагрузку."),
    ("weight_loss", "⚖️ Похудение", "Расскажи коротко, как подходить к снижению веса."),
    ("muscle_gain", "💪 Набор массы", "Расскажи коротко, как подходить к набору мышечной массы."),
)
TOPIC_PROMPTS = {category: prompt for category, _, prompt in TOPICS}


def normalize_name(value: str) -> str:
    return " ".join((value or "").split())


def validate_name(value: str) -> str:
    name = normalize_name(value)
    if not MIN_NAME_LENGTH <= len(name) <= MAX_NAME_LENGTH:
        raise ValueError("name length is out of range")
    if name.startswith("/"):
        raise ValueError("name must not be a command")
    if not all(char.isalpha() or char in NAME_EXTRA_CHARS for char in name):
        raise ValueError("name contains unsupported characters")
    return name


def build_profile(name: str, gender: str) -> dict[str, str]:
    if gender not in GENDERS:
        raise ValueError(f"unsupported gender: {gender}")
    return {NAME_KEY: validate_name(name), GENDER_KEY: gender}


def is_profile_complete(profile: dict[str, str]) -> bool:
    return bool(profile.get(NAME_KEY)) and profile.get(GENDER_KEY) in GENDERS


def gender_label(gender: str) -> str:
    return GENDER_LABELS.get(gender, "не указан")


def profile_text(profile: dict[str, str]) -> str:
    return (
        f"Твой профиль:\n• Имя: {profile.get(NAME_KEY, 'не указано')}\n"
        f"• Пол: {gender_label(profile.get(GENDER_KEY, ''))}"
    )
