from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.clients.onboarding import GENDER_MENU, TOPICS

GENDER_CALLBACK_PREFIX = "gender:"
TOPIC_CALLBACK_PREFIX = "topic:"
EDIT_PROFILE_CALLBACK = "profile:edit"


def gender_keyboard() -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text=label, callback_data=f"{GENDER_CALLBACK_PREFIX}{gender}")]
        for gender, label in GENDER_MENU
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def topics_keyboard() -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text=label, callback_data=f"{TOPIC_CALLBACK_PREFIX}{category}")]
        for category, label, _ in TOPICS
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def profile_keyboard() -> InlineKeyboardMarkup:
    button = InlineKeyboardButton(text="Изменить профиль", callback_data=EDIT_PROFILE_CALLBACK)
    return InlineKeyboardMarkup(inline_keyboard=[[button]])
