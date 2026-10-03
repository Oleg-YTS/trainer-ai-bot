import logging
from functools import lru_cache

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    BotCommand,
    CallbackQuery,
    MenuButtonCommands,
    MenuButtonWebApp,
    Message,
    User,
    WebAppInfo,
)
from sqlalchemy.exc import SQLAlchemyError

from app.ai.orchestrator import AIOrchestrator
from app.ai.service import AnswerUnavailable, build_grounded_answer
from app.bot.keyboards import (
    EDIT_PROFILE_CALLBACK,
    GENDER_CALLBACK_PREFIX,
    TOPIC_CALLBACK_PREFIX,
    gender_keyboard,
    profile_keyboard,
    topics_keyboard,
)
from app.clients.messages import ASSISTANT_ROLE, USER_ROLE, record_message
from app.clients.onboarding import (
    GENDERS,
    TOPIC_PROMPTS,
    build_profile,
    gender_label,
    is_profile_complete,
    profile_text,
    validate_name,
)
from app.clients.service import read_profile, register_telegram_client, update_profile
from app.config.settings import get_settings
from app.database.models import Client

router = Router()
logger = logging.getLogger(__name__)

AI_UNAVAILABLE_TEXT = (
    "ИИ-часть пока в разработке. Я передал вопрос тренеру — "
    "он ответит, как только увидит сообщение."
)

WELCOME_TEXT = "Привет! Я AI-консультант тренера. Задам пару вопросов, чтобы отвечать точнее."
NAME_QUESTION = "Как тебя зовут? Напиши имя — так я буду к тебе обращаться."
NAME_INVALID_TEXT = "Похоже, в имени опечатка. Напиши имя буквами, например: Иван."
GENDER_QUESTION = "{name}, укажи пол — это нужно тренеру для плана тренировок."
PROFILE_SAVED_TEXT = "Готово, {name}! Запомнил: {gender}."
PROFILE_GREETING = "Привет, {name}! Рад снова видеть."
TOPICS_TEXT = "Выбери тему или просто напиши свой вопрос 👇"

BOT_COMMANDS = [
    BotCommand(command="start", description="Старт и знакомство"),
    BotCommand(command="profile", description="Мой профиль"),
]


class Onboarding(StatesGroup):
    name = State()


@lru_cache
def get_orchestrator() -> AIOrchestrator:
    return AIOrchestrator()


def build_dispatcher() -> Dispatcher:
    dp = Dispatcher()
    dp.include_router(router)
    return dp


async def setup_bot_menu(bot: Bot) -> None:
    await bot.set_my_commands(BOT_COMMANDS)
    settings = get_settings()
    if settings.base_url:
        try:
            await bot.set_chat_menu_button(
                menu_button=MenuButtonWebApp(
                    text="AI Библиотекарь",
                    web_app=WebAppInfo(url=settings.base_url)
                )
            )
            logger.info("Successfully configured Telegram WebApp MenuButton: %s", settings.base_url)
            return
        except Exception as exc:
            logger.warning("Could not set WebApp MenuButton: %s", exc)
    await bot.set_chat_menu_button(menu_button=MenuButtonCommands())


def telegram_display_name(user: User) -> str:
    if user.full_name:
        return user.full_name[:200]
    if user.username:
        return f"@{user.username}"[:200]
    return f"id{user.id}"[:200]


async def register_user(user: User) -> Client | None:
    try:
        return await register_telegram_client(user.id, telegram_display_name(user))
    except (SQLAlchemyError, RuntimeError) as exc:  # a database problem must not break the bot
        logger.warning("Client registration failed: %s", exc)
        return None


async def register(message: Message) -> Client | None:
    if message.from_user is None:
        return None
    return await register_user(message.from_user)


async def store_message(client_id: int, role: str, text: str) -> None:
    try:
        await record_message(client_id, role, text)
    except (SQLAlchemyError, RuntimeError, ValueError) as exc:  # history is not critical for a reply
        logger.warning("Saving message failed: %s", exc)


async def load_profile(client: Client | None) -> dict[str, str]:
    if client is None:
        return {}
    try:
        return await read_profile(client.id)
    except (SQLAlchemyError, RuntimeError, ValueError) as exc:
        logger.warning("Loading profile failed: %s", exc)
        return {}


async def save_profile(client: Client | None, profile: dict[str, str]) -> None:
    if client is None:
        return
    try:
        await update_profile(client.id, profile)
    except (SQLAlchemyError, RuntimeError, ValueError) as exc:
        logger.warning("Saving profile failed: %s", exc)


async def ask_name(message: Message, state: FSMContext) -> None:
    await state.set_state(Onboarding.name)
    await message.answer(NAME_QUESTION)


async def reply_from_button(callback: CallbackQuery, text: str, keyboard=None) -> None:
    if isinstance(callback.message, Message):
        await callback.message.answer(text, reply_markup=keyboard)


async def answer_question(message: Message, client: Client | None, text: str) -> None:
    client_id = client.id if client is not None else None
    if client_id is not None:
        await store_message(client_id, USER_ROLE, text)

    orchestrator = get_orchestrator()
    if not orchestrator.is_configured:
        await message.answer(AI_UNAVAILABLE_TEXT)
        return

    try:
        answer_text = await build_grounded_answer(orchestrator, client_id, text)
    except AnswerUnavailable as exc:
        logger.warning("Grounded answer unavailable: %s", exc)
        await message.answer(AI_UNAVAILABLE_TEXT)
        return

    if client_id is not None:
        await store_message(client_id, ASSISTANT_ROLE, answer_text)

    await message.answer(answer_text)


@router.message(CommandStart())
async def start(message: Message, state: FSMContext) -> None:
    client = await register(message)
    profile = await load_profile(client)

    if is_profile_complete(profile):
        greeting = PROFILE_GREETING.format(name=profile.get("name", ""))
        await message.answer(f"{greeting}\n\n{TOPICS_TEXT}", reply_markup=topics_keyboard(message.from_user.id if message.from_user else None))
        return

    await message.answer(WELCOME_TEXT)
    await ask_name(message, state)


@router.message(Command("profile"))
async def show_profile(message: Message, state: FSMContext) -> None:
    client = await register(message)
    profile = await load_profile(client)

    if not is_profile_complete(profile):
        await ask_name(message, state)
        return

    await message.answer(profile_text(profile), reply_markup=profile_keyboard(message.from_user.id if message.from_user else None))


@router.message(Onboarding.name)
async def save_name(message: Message, state: FSMContext) -> None:
    try:
        name = validate_name(message.text or "")
    except ValueError:
        await message.answer(NAME_INVALID_TEXT)
        return

    await state.update_data(name=name)
    await message.answer(GENDER_QUESTION.format(name=name), reply_markup=gender_keyboard())


async def ask_name_from_button(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(Onboarding.name)
    await reply_from_button(callback, NAME_QUESTION)


@router.callback_query(F.data.startswith(GENDER_CALLBACK_PREFIX))
async def choose_gender(callback: CallbackQuery, state: FSMContext) -> None:
    gender = (callback.data or "").removeprefix(GENDER_CALLBACK_PREFIX)
    name = (await state.get_data()).get("name", "")
    if gender not in GENDERS or not name:
        await callback.answer()
        await ask_name_from_button(callback, state)
        return

    await save_profile(await register_user(callback.from_user), build_profile(name, gender))
    await state.clear()
    await callback.answer()
    saved = PROFILE_SAVED_TEXT.format(name=name, gender=gender_label(gender))
    await reply_from_button(callback, f"{saved}\n\n{TOPICS_TEXT}", topics_keyboard(callback.from_user.id))


@router.callback_query(F.data == EDIT_PROFILE_CALLBACK)
async def edit_profile(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.answer()
    await ask_name_from_button(callback, state)


@router.callback_query(F.data.startswith(TOPIC_CALLBACK_PREFIX))
async def choose_topic(callback: CallbackQuery) -> None:
    category = (callback.data or "").removeprefix(TOPIC_CALLBACK_PREFIX)
    prompt = TOPIC_PROMPTS.get(category)
    await callback.answer()
    if prompt is None or not isinstance(callback.message, Message):
        return
    await answer_question(callback.message, await register_user(callback.from_user), prompt)


@router.message()
async def handle_message(message: Message) -> None:
    client = await register(message)
    if not message.text:
        return
    await answer_question(message, client, message.text)
