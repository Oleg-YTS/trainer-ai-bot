from urllib.parse import quote
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from app.clients.onboarding import GENDER_MENU, TOPICS
from app.config.settings import get_settings

GENDER_CALLBACK_PREFIX = "gender:"
TOPIC_CALLBACK_PREFIX = "topic:"
EDIT_PROFILE_CALLBACK = "profile:edit"

def gender_keyboard() -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text=label, callback_data=f"{GENDER_CALLBACK_PREFIX}{gender}")]
        for gender, label in GENDER_MENU
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)

def topics_keyboard(telegram_user_id: int | None = None) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text=label, callback_data=f"{TOPIC_CALLBACK_PREFIX}{category}")]
        for category, label, _ in TOPICS
    ]
    settings = get_settings()
    if settings.base_url and telegram_user_id:
        url = f"{settings.base_url}?tg_id={telegram_user_id}"
        rows.append([InlineKeyboardButton(text="📱 Открыть AI Библиотекарь", web_app=WebAppInfo(url=url))])
    return InlineKeyboardMarkup(inline_keyboard=rows)

def profile_keyboard(telegram_user_id: int | None = None) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text="Изменить профиль", callback_data=EDIT_PROFILE_CALLBACK)]]
    settings = get_settings()
    if settings.base_url and telegram_user_id:
        url = f"{settings.base_url}?tg_id={telegram_user_id}"
        rows.append([InlineKeyboardButton(text="📱 Открыть AI Библиотекарь", web_app=WebAppInfo(url=url))])
    return InlineKeyboardMarkup(inline_keyboard=rows)
