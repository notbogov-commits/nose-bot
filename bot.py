import asyncio
import datetime
import os
import random
import sqlite3
import time

from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command
from aiogram.types import (
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQueryResultArticle,
    InputTextMessageContent,
)
from aiohttp import web

TOKEN = os.getenv("BOT_TOKEN", "9119538825:AAENZDrBothOJODdYIgOzPZRGfl-noFs1QU")
DEFAULT_BET = 5  # Базовая ставка 5 коинов
MAX_CASINO_BET = 50  # Максимальная ставка в казино и дуэлях
ADMIN_ID = 1642626687  # Твой ID

bot = Bot(TOKEN)
dp = Dispatcher()

# Словарь для защиты от спама (анти-кликер для кнопок)
last_action_time = {}

# Инициализация базы данных с нуля (чистый старт для всех)
db = sqlite3.connect("game.db")
db.row_factory = sqlite3.Row
db.executescript(
    """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        coins INTEGER DEFAULT 10,
        last_bonus TEXT,
        last_work TEXT,
        casino_count INTEGER DEFAULT 0,
        last_casino_date TEXT,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        shield_count INTEGER DEFAULT 0,
        boost_until TEXT,
        custom_status TEXT
    );
    CREATE TABLE IF NOT EXISTS invited_users (
        user_id INTEGER PRIMARY KEY
    );
    """
)
db.commit()


def get_user(user: types.User) -> sqlite3.Row:
    """Получает пользователя из базы или создает нового с балансом 10 коинов."""
    existing = db.execute("SELECT * FROM users WHERE id=?", (user.id,)).fetchone()
    if not existing:
        db.execute(
            "INSERT INTO users (id, name, coins) VALUES (?, ?, 10)",
            (user.id, user.first_name),
        )
        db.commit()
    else:
        db.execute("UPDATE users SET name=? WHERE id=?", (user.first_name, user.id))
        db.commit()

    return db.execute("SELECT * FROM users WHERE id=?", (user.id,)).fetchone()


def kb(*buttons: tuple[str, str]) -> InlineKeyboardMarkup:
    """Вспомогательная функция для генерации инлайн-клавиатур."""
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=t, callback_data=d)] for t, d in buttons]
    )


def get_toxicity_title(u: sqlite3.Row) -> str:
    """Определяет игровой статус/титул пользователя в зависимости от баланса."""
    if u["custom_status"]:
        return u["custom_status"]
    coins = u["coins"]
    if coins < 0:
        return "🤡 Главный должник чата"
    elif coins <= 5:
        return "😶 Тихоня"
    elif coins <= 20:
        return "💬 Комментатор"
    elif coins <= 50:
        return "🔥 Активист"
    elif coins <= 100:
        return "👑 Уважаемый душнила"
    else:
        return "🗿 Властелин комментов"


def stats_text(user: types.User) -> str:
    """Формирует текст личной статистики игрока."""
    u = get_user(user)
    title = get_toxicity_title(u)
    shield_str = f"\n🛡 Защитных щитов: {u['shield_count']}" if u["shield_count"] > 0 else ""
    return (
        f"📊 <b>Статистика игрока: {u['name']}</b>\n\n"
        f"🪙 Баланс: <b>{u['coins']} 🪙</b>\n"
        f"🏆 Статус: {title}{shield_str}\n"
        f"⚔️ Дуэли: побед {u['wins']} | поражений {u['losses']}\n\n"
        f"<i>💡 Все действия происходят внутри бота по кнопкам.</i>"
    )


def top_text() -> str:
    """Формирует таблицу лидеров (Топ-15)."""
    rows = db.execute("SELECT name, coins FROM users ORDER BY coins DESC LIMIT 15").fetchall()
    if not rows:
        return "🏆 <b>Рейтинг пуст.</b> Будь первым!"
    
    lines = [f"{i + 1}. {r['name']} — {r['coins']} 🪙" for i, r in enumerate(rows)]
    return "🏆 <b>Топ-15 комментаторов канала:</b>\n\n" + "\n".join(lines)


def do_bonus(user: types.User) -> str:
    """Логика выдачи ежедневного бонуса (раз в 24 часа) с защитой от накрутки."""
    u = get_user(user)
    now = datetime.datetime.now()
    
    if u["last_bonus"]:
        last_dt = datetime.datetime.fromisoformat(u["last_bonus"])
        if now - last_dt < datetime.timedelta(days=1):
            time_left = datetime.timedelta(days=1) - (now - last_dt)
            hours, remainder = divmod(int(time_left.total_seconds()), 3600)
            mins, _ = divmod(remainder, 60)
            return f"⏳ Бонус уже получен! Следующий будет доступен через {hours} ч. {mins} мин."

    delta = 10
    if u["boost_until"] and datetime.datetime.fromisoformat(u["boost_until"]) > now:
        delta *= 2

    new_coins = u["coins"] + delta
    db.execute("UPDATE users SET coins=?, last_bonus=? WHERE id=?", (new_coins, now.isoformat(), user.id))
    db.commit()
    
    boost_note = " (💥 Активен буст x2!)" if delta > 10 else ""
    return f"🎁 <b>Бонус забран!</b> Начислено <b>+{delta} 🪙</b>{boost_note}\n🪙 Баланс: <b>{new_coins} 🪙</b>"


def do_work(user: types.User) -> str:
    """Логика вброса тейка в комментарии (раз в 6 часов, шанс 50/50)."""
    u = get_user(user)
    now = datetime.datetime.now()
    if u["last_work"]:
        last_dt = datetime.datetime.fromisoformat(u["last_work"])
        if now - last_dt < datetime.timedelta(hours=6):
            time_left = datetime.timedelta(hours=6) - (now - last_dt)
            hours, remainder = divmod(int(time_left.total_seconds()), 3600)
            mins, _ = divmod(remainder, 60)
            return f"⏳ Следующий вброс тейка доступен через {hours} ч. {mins} мин."

    gain = 3
    loss = 3
    if u["boost_until"] and datetime.datetime.fromisoformat(u["boost_until"]) > now:
        gain *= 2
        loss *= 2

    success = random.random() < 0.5
    if success:
        new_coins = u["coins"] + gain
        msg = f"💬 <b>Тейк зашел!</b> Зрители оценили мнение, получено <b>+{gain} 🪙</b>.\n🪙 Баланс: <b>{new_coins} 🪙</b>"
    else:
        new_coins = u["coins"] - loss
        msg = f"📉 <b>Кринж...</b> Комментаторы заминусили вброс. Потеряно <b>-{loss} 🪙</b>.\n🪙 Баланс: <b>{new_coins} 🪙</b>"

    db.execute("UPDATE users SET coins=?, last_work=? WHERE id=?", (new_coins, now.isoformat(), user.id))
    db.commit()
    return msg


def article(id_: str, title: str, description: str, text: str, markup=None) -> InlineQueryResultArticle:
    """Вспомогательная функция для элементов инлайн-меню."""
    return InlineQueryResultArticle(
        id=id_,
        title=title,
        description=description,
        input_message_content=InputTextMessageContent(message_text=text, parse_mode="HTML"),
        reply_markup=markup,
    )


# ---------- АДМИН-КОМАНДЫ ----------
@dp.message(Command("add"))
async def admin_add_coins(m: types.Message):
    if m.from_user.id != ADMIN_ID:
        return
    args = m.text.split()
    if len(args) < 2 or not args[1].lstrip("-").isdigit():
        return
    amount = int(args[1])
    get_user(m.from_user)
    db.execute("UPDATE users SET coins=coins+? WHERE id=?", (amount, m.from_user.id))
    db.commit()
    u = get_user(m.from_user)
    await m.reply(f"👑 Накрутка: {amount:+d} 🪙. Баланс: {u['coins']} 🪙")


@dp.message(Command("backup"))
async def admin_backup_db(m: types.Message):
    if m.from_user.id != ADMIN_ID:
        return
    if os.path.exists("game.db"):
        await m.answer_document(FSInputFile("game.db"), caption="📦 Бэкап базы данных game.db")


@dp.message(Command("start"))
async def start(m: types.Message):
    bot_info = await bot.get_me()
    await m.answer(f"👋 Бот запущен! Напиши <code>@{bot_info.username}</code> в чате канала.", parse_mode="HTML")


@dp.message()
async def handle_all_messages(message: types.Message):
    """Обработка текстовых сообщений и защита от спама для новых участников в топиках."""
    if not message.from_user or message.from_user.is_bot:
        return

    text_lower = message.text.lower() if message.text else ""

    if text_lower in ["!игра", "игра", "/game"]:
        welcome_text = "🔥 Игровая экономика канала ПОРОГ:"
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🎮 Открыть меню игры", switch_inline_query_current_chat="")]
        ])
        await message.reply(welcome_text, reply_markup=keyboard, parse_mode="HTML")
        return

    if message.message_thread_id:
        user_id = message.from_user.id
        first_name = message.from_user.first_name

        already_invited = db.execute("SELECT 1 FROM invited_users WHERE user_id=?", (user_id,)).fetchone()
        already_playing = db.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone()

        if not already_invited and not already_playing:
            db.execute("INSERT OR IGNORE INTO invited_users (user_id) VALUES (?)", (user_id,))
            db.commit()

            teaser = f"🔥 {first_name}, залетай в игровую экономику канала ПОРОГ! Копи коины и забирай призы 👇"
            keyboard = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🎮 Открыть меню игры", switch_inline_query_current_chat="")]
            ])
            await message.reply(teaser, reply_markup=keyboard, parse_mode="HTML")


# ---------- ИНЛАЙН-МЕНЮ БОТА ----------
@dp.inline_query()
async def inline_query_menu(q: types.InlineQuery):
    uid = q.from_user.id
    u = get_user(q.from_user)
    coins = u["coins"]
    text = q.query.strip()

    max_other_coins = db.execute("SELECT MAX(coins) as m FROM users WHERE id != ?", (uid,)).fetchone()["m"] or 0
    bet = int(text) if text.isdigit() and int(text) > 0 else DEFAULT_BET
    bet = min(bet, MAX_CASINO_BET)

    if coins < bet:
        duel_markup = None
        duel_title = f"🚫 Дуэль (нет коинов на {bet} 🪙)"
        duel_desc = f"Баланс: {coins} 🪙. Ставка выше вашего баланса."
        duel_msg = f"❌ Нельзя создать дуэль на <b>{bet} 🪙</b> (на балансе {coins} 🪙)."
    elif max_other_coins > 0 and bet > max_other_coins:
        duel_markup = None
        duel_title = f"🚫 Дуэль (ставка выше всех)"
        duel_desc = f"Максимум у соперников: {max_other_coins} 🪙."
        duel_msg = f"❌ Ставка <b>{bet} 🪙</b> выше, чем баланс остальных игроков (макс: {max_other_coins} 🪙)."
    else:
        duel_markup = kb((f"⚔️ Принять вызов ({bet} 🪙)", f"duel:{uid}:{bet}"))
        duel_title = f"🎯 Дуэль мнений (ставка: {bet} 🪙)"
        duel_desc = f"Вызов на {bet} 🪙. Выберите сумму ставки кнопками ниже."
        duel_msg = (
            f"🎯 <b>Дуэль мнений</b>\n\n"
            f"👤 Инициатор: {q.from_user.first_name}\n"
            f"💰 Ставка: <b>{bet} 🪙</b> (макс. 50)\n\n"
            f"<i>Нажми кнопку ниже, чтобы принять вызов и испытать удачу (честно 50/50)!</i>"
        )

    results = [
        # Памятка и правила в самом верху меню
        article(
            "info",
            "📌 Правила и информация о боте",
            "Как играть, зарабатывать коины и обменивать их на призы",
            (
                "📌 <b>Добро пожаловать в игровую экономику ПОРОГА!</b>\n\n"
                "🤖 <b>Что это за бот?</b> Официальная валюта канала, где ты можешь копить коины и обменивать их на реальные призы (темы для роликов, ник в титрах, Telegram Premium и др.).\n\n"
                "💡 <b>Как зарабатывать:</b>\n"
                "• 🎁 Забирай <b>Ежедневный бонус</b> (+10 🪙 раз в сутки).\n"
                "• 💬 Вбрасывай <b>Тейки</b> (раз в 6 часов, шанс 50/50).\n"
                "• 🎰 Крути <b>Казино</b> (до 5 раз в сутки, ставки до 50 🪙).\n"
                "• ⚔️ Сражайся в <b>Дуэлях</b> (честно 50/50).\n\n"
                f"💰 Твой текущий баланс: <b>{coins} 🪙</b>"
            ),
        ),
        article(
            "shop",
            "🛒 Магазин призов ПОРОГА",
            "Потрать коины на полезные и эксклюзивные привилегии:",
            (
                "🛒 <b>Магазин призов ПОРОГА:</b>\n"
                "<i>Потрать коины на полезные и эксклюзивные привилегии:</i>\n\n"
                "1️⃣ 🎬 <b>Тема для ролика — 5,000 🪙</b>\n"
                "<i>(Выбор темы для следующего видео на канале)</i>\n\n"
                "2️⃣ 🎥 <b>Упоминание в титрах — 2,500 🪙</b>\n"
                "<i>(Твой ник попадёт в титры следующего ролика)</i>\n\n"
                "3️⃣ ⭐ <b>Telegram Premium (1 мес) — 800 🪙</b>\n"
                "<i>(Месяц подписки за активность в боте)</i>\n\n"
                "4️⃣ 🛡 <b>3 щита защиты — 150 🪙</b>\n"
                "<i>(Защита от потери коинов в проигранных дуэлях)</i>\n\n"
                "5️⃣ 🎟 <b>Буст x2 на 24ч — 50 🪙</b>\n"
                "<i>(Удваивает ежедневный бонус и тейки на целый день)</i>\n\n"
                "6️⃣ ⭐ <b>Пополнить +100 коинов — 50 ⭐️</b>\n"
                "<i>(Ускорение прогресса через Telegram Stars)</i>"
            ),
            kb(
                ("🎬 Тема ролика (5000 🪙)", f"buy:{uid}:theme"),
                ("🎥 Упоминание в титрах (2500 🪙)", f"buy:{uid}:mention"),
                ("⭐ Telegram Premium (800 🪙)", f"buy:{uid}:tgprem"),
                ("🛡 3 щита (150 🪙)", f"buy:{uid}:shield"),
                ("🎟 Буст x2 (50 🪙)", f"buy:{uid}:boost"),
                ("⭐ Купить +100 коинов (50 ⭐️)", f"buy:{uid}:stars100"),
            ),
        ),
        article(
            "casino",
            "🎰 Казино ПОРОГА",
            "Ставка до 50 🪙 • Красное/Белое (47.5%, x2), Зеленое (5%, x8) • 5 игр в сутки",
            (
                "🎰 <b>Казино ПОРОГА</b> (лимит: 5 раз в сутки)\n\n"
                "• 🔴 <b>Красное</b> — шанс 47.5% (Выплата x2)\n"
                "• ⚪️ <b>Белое</b> — шанс 47.5% (Выплата x2)\n"
                "• 🟢 <b>Зеленое</b> — шанс 5% (Джекпот x8)\n"
                "<i>Максимальная ставка — 50 монет.</i>\n\n"
                f"💰 Твой баланс: <b>{coins} 🪙</b>\n\n"
                "<b>Выберите размер ставки:</b>"
            ),
            kb(
                ("5 🪙", f"cas_bet:{uid}:5"),
                ("10 🪙", f"cas_bet:{uid}:10"),
                ("15 🪙", f"cas_bet:{uid}:15"),
                ("20 🪙", f"cas_bet:{uid}:20"),
                ("30 🪙", f"cas_bet:{uid}:30"),
                ("50 🪙", f"cas_bet:{uid}:50"),
            )
        ),
        article(
            "bonus",
            "🎁 Ежедневный бонус",
            "Забирай стабильно +10 коинов каждый день (раз в 24 часа)",
            (
                "🎁 <b>Ежедневный бонус</b>\n\n"
                "Бесплатное пополнение баланса. Доступно 1 раз в сутки (+10 коинов, а с активным бустом x2 — целых +20 коинов!)."
            ),
            kb(("Забрать бонус 🎁 (+10 🪙)", f"bonus:{uid}")),
        ),
        article(
            "work",
            "💬 Вбросить тейк в комменты",
            "Шанс 50/50 (+3 / -3 коина • раз в 6 часов)",
            (
                "💬 <b>Вбросить тейк</b>\n\n"
                "Симуляция активности. Шанс 50 на 50: либо твое мнение оценят зрители (<b>+3 коина</b>), либо напишешь кринж и тебя заминусят (<b>-3 коина</b>). Доступно раз в 6 часов."
            ),
            kb(("Вбросить тейк 💬", f"work:{uid}")),
        ),
        article(
            "stats",
            "📊 Моя статистика",
            "Твой текущий баланс, титул, щиты и победы в дуэлях",
            stats_text(q.from_user),
        ),
        article(
            "top",
            "🏆 Рейтинг комментаторов",
            "Таблица лидеров канала по количеству коинов",
            top_text(),
        ),
        article(
            "duel",
            "🎯 Дуэль мнений (Выбор ставки)",
            "Вызови бойца на дуэль. Выберите ставку от 5 до 50 монет.",
            (
                "🎯 <b>Дуэль мнений — Выбор ставки</b>\n\n"
                "<i>Выберите сумму ставки для дуэли (макс. 50 монет):</i>"
            ),
            kb(
                ("⚔️ Дуэль на 5 🪙", f"duel_prep:{uid}:5"),
                ("⚔️ Дуэль на 10 🪙", f"duel_prep:{uid}:10"),
                ("⚔️ Дуэль на 15 🪙", f"duel_prep:{uid}:15"),
                ("⚔️ Дуэль на 20 🪙", f"duel_prep:{uid}:20"),
                ("⚔️ Дуэль на 30 🪙", f"duel_prep:{uid}:30"),
                ("⚔️ Дуэль на 50 🪙", f"duel_prep:{uid}:50"),
            ),
        ),
    ]

    await q.answer(results, cache_time=0, is_personal=True)


async def edit(c: types.CallbackQuery, text: str, markup=None):
    """Удобное редактирование текста инлайн-сообщения."""
    await bot.edit_message_text(text, inline_message_id=c.inline_message_id, reply_markup=markup, parse_mode="HTML")


@dp.callback_query(F.data.startswith("bonus:"))
async def on_bonus(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Не твоя кнопка", show_alert=True)
    
    current_time = time.time()
    user_id = c.from_user.id
    if user_id in last_action_time and current_time - last_action_time[user_id] < 2:
        return await c.answer("⏳ Подожди секунду...", show_alert=True)
    last_action_time[user_id] = current_time

    res_text = do_bonus(c.from_user)
    await edit(c, res_text)
    await c.answer()


@dp.callback_query(F.data.startswith("work:"))
async def on_work(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Не твоя кнопка", show_alert=True)
    await edit(c, do_work(c.from_user))
    await c.answer()


# ---------- ЛОГИКА КАЗИНО ----------
@dp.callback_query(F.data.startswith("cas_bet:"))
async def on_casino_bet_chosen(c: types.CallbackQuery):
    _, owner_str, bet_str = c.data.split(":")
    owner = int(owner_str)
    bet = int(bet_str)

    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)

    u = get_user(c.from_user)
    
    now = datetime.datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    
    casino_count = u["casino_count"] if u["last_casino_date"] == today_str else 0
    if casino_count >= 5:
        return await c.answer("🚫 Лимит исчерпан! В казино можно играть только 5 раз в сутки.", show_alert=True)

    if u["coins"] < bet:
        return await c.answer(f"Недостаточно коинов! У тебя {u['coins']} 🪙", show_alert=True)

    await edit(
        c,
        (
            f"🎰 <b>Казино ПОРОГА</b> (осталось попыток сегодня: {5 - casino_count}/5)\n\n"
            f"Выбранная ставка: <b>{bet} 🪙</b>\n\n"
            "<b>Шансы и выплаты:</b>\n"
            "• 🔴 <b>Красное</b> — шанс 47.5% (Выплата x2)\n"
            "• ⚪️ <b>Белое</b> — шанс 47.5% (Выплата x2)\n"
            "• 🟢 <b>Зеленое</b> — шанс 5% (Джекпот x8)\n\n"
            "<i>Выберите цвет для ставки:</i>"
        ),
        kb(
            ("🔴 Красное (x2)", f"cas_play:{owner}:{bet}:red"),
            ("⚪️ Белое (x2)", f"cas_play:{owner}:{bet}:white"),
            ("🟢 Зеленое (Джекпот x8)", f"cas_play:{owner}:{bet}:green"),
            ("⬅️ Изменить ставку", f"cas_back:{owner}")
        )
    )
    await c.answer()


@dp.callback_query(F.data.startswith("cas_back:"))
async def on_casino_back(c: types.CallbackQuery):
    owner = int(c.data.split(":")[1])
    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)
    
    u = get_user(c.from_user)
    await edit(
        c,
        (
            "🎰 <b>Казино ПОРОГА</b> (лимит: 5 раз в сутки)\n\n"
            "• 🔴 <b>Красное</b> — шанс 47.5% (Выплата x2)\n"
            "• ⚪️ <b>Белое</b> — шанс 47.5% (Выплата x2)\n"
            "• 🟢 <b>Зеленое</b> — шанс 5% (Джекпот x8)\n"
            "<i>Максимальная ставка — 50 монет.</i>\n\n"
            f"💰 Твой баланс: <b>{u['coins']} 🪙</b>\n\n"
            "<b>Выберите размер ставки:</b>"
        ),
        kb(
            ("5 🪙", f"cas_bet:{owner}:5"),
            ("10 🪙", f"cas_bet:{owner}:10"),
            ("15 🪙", f"cas_bet:{owner}:15"),
            ("20 🪙", f"cas_bet:{owner}:20"),
            ("30 🪙", f"cas_bet:{owner}:30"),
            ("50 🪙", f"cas_bet:{owner}:50"),
        )
    )
    await c.answer()


@dp.callback_query(F.data.startswith("cas_play:"))
async def on_casino_play(c: types.CallbackQuery):
    _, owner_str, bet_str, color = c.data.split(":")
    owner = int(owner_str)
    bet = int(bet_str)

    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)

    current_time = time.time()
    if owner in last_action_time and current_time - last_action_time[owner] < 3:
        return await c.answer("⏳ Не спеши! Подожди пару секунд перед следующим броском.", show_alert=True)
    last_action_time[owner] = current_time

    if bet > MAX_CASINO_BET:
        return await c.answer(f"Максимальная ставка в казино — {MAX_CASINO_BET} монет!", show_alert=True)

    u = get_user(c.from_user)
    
    now = datetime.datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    casino_count = u["casino_count"] if u["last_casino_date"] == today_str else 0
    if casino_count >= 5:
        return await c.answer("🚫 Лимит исчерпан! В казино можно играть только 5 раз в сутки.", show_alert=True)

    if u["coins"] < bet:
        return await c.answer(f"Недостаточно коинов! Нужно {bet} 🪙", show_alert=True)

    new_casino_count = casino_count + 1
    new_coins = u["coins"] - bet
    db.execute(
        "UPDATE users SET coins=?, casino_count=?, last_casino_date=? WHERE id=?", 
        (new_coins, new_casino_count, today_str, owner)
    )
    db.commit()

    await edit(c, f"🎰 <b>Казино ПОРОГА</b>\n\nСтавка: {bet} 🪙. <b>Крутим рулетку...</b> 🎲")
    
    try:
        await bot.send_dice(chat_id=c.message.chat.id, emoji="🎰")
    except Exception:
        pass
    
    await asyncio.sleep(3)

    roll = random.random()
    if roll < 0.475:
        winning_color = "red"
        emoji = "🔴"
        name_color = "Красное"
    elif roll < 0.95:
        winning_color = "white"
        emoji = "⚪️"
        name_color = "Белое"
    else:
        winning_color = "green"
        emoji = "🟢"
        name_color = "Зеленое (Джекпот)"

    color_names = {"red": "Красное 🔴", "white": "Белое ⚪️", "green": "Зеленое 🟢"}

    if color == winning_color:
        multiplier = 8 if color == "green" else 2
        winnings = bet * multiplier
        profit = winnings - bet
        new_coins += winnings
        db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, owner))
        db.commit()

        msg = (
            f"🎰 <b>{emoji} Выпало: {name_color}!</b>\n\n"
            f"🎯 Ставка на {color_names[color]} ({bet} 🪙) сыграла!\n"
            f"💰 Выигрыш: <b>+{profit} 🪙</b> (x{multiplier})\n"
            f"🪙 Твой новый баланс: <b>{new_coins} 🪙</b>\n"
            f"<i>Использовано попыток в казино сегодня: {new_casino_count}/5</i>"
        )
    else:
        msg = (
            f"🎰 <b>{emoji} Выпало: {name_color}</b>\n\n"
            f"❌ Ставка на {color_names[color]} ({bet} 🪙) проиграла.\n"
            f"📉 Потеряно: <b>-{bet} 🪙</b>\n"
            f"🪙 Твой новый баланс: <b>{new_coins} 🪙</b>\n"
            f"<i>Использовано попыток в казино сегодня: {new_casino_count}/5</i>"
        )

    await edit(c, msg)
    await c.answer()


# ---------- ЛОГИКА ДУЭЛЕЙ ----------
@dp.callback_query(F.data.startswith("duel_prep:"))
async def on_duel_prep(c: types.CallbackQuery):
    _, owner_str, bet_str = c.data.split(":")
    owner, bet = int(owner_str), int(bet_str)
    
    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)

    u = get_user(c.from_user)
    
    if u["coins"] < bet:
        return await c.answer(f"Недостаточно коинов для ставки в {bet} 🪙!", show_alert=True)

    max_other_coins = db.execute("SELECT MAX(coins) as m FROM users WHERE id != ?", (owner,)).fetchone()["m"] or 0
    if max_other_coins > 0 and bet > max_other_coins:
        return await c.answer(f"Ставка выше, чем баланс остальных игроков (макс: {max_other_coins} 🪙)", show_alert=True)

    duel_markup = kb((f"⚔️ Принять вызов ({bet} 🪙)", f"duel:{owner}:{bet}"))
    duel_msg = (
        f"🎯 <b>Дуэль мнений создана!</b>\n\n"
        f"👤 Инициатор: {c.from_user.first_name}\n"
        f"💰 Ставка: <b>{bet} 🪙</b> (макс. 50)\n\n"
        f"<i>Нажми кнопку ниже, чтобы принять вызов и испытать удачу (честно 50/50)!</i>"
    )
    
    await edit(c, duel_msg, duel_markup)
    await c.answer()


@dp.callback_query(F.data.startswith("duel:"))
async def on_duel(c: types.CallbackQuery):
    _, owner, bet = c.data.split(":")
    owner, bet = int(owner), int(bet)
    if c.from_user.id == owner:
        return await c.answer("Нельзя принять свой вызов", show_alert=True)

    a = db.execute("SELECT * FROM users WHERE id=?", (owner,)).fetchone()
    b = get_user(c.from_user)
    if not a:
        return await c.answer("Инициатор дуэли не найден в базе данных", show_alert=True)

    if a["coins"] < bet:
        await edit(c, f"❌ Дуэль на <b>{bet} 🪙</b> отменена: у {a['name']} не хватает коинов.")
        return await c.answer("У инициатора не хватает коинов", show_alert=True)

    if b["coins"] < bet:
        return await c.answer(f"Недостаточно коинов! Нужно {bet} 🪙", show_alert=True)

    winner, loser = random.choice([(a, b), (b, a)])

    if loser["shield_count"] > 0:
        db.execute("UPDATE users SET shield_count=shield_count-1 WHERE id=?", (loser["id"],))
        db.commit()
        shield_msg = f" (у {loser['name']} сработал щит 🛡)"
    else:
        db.execute("UPDATE users SET coins=coins-?, losses=losses+1 WHERE id=?", (bet, loser["id"]))
        shield_msg = ""

    db.execute("UPDATE users SET coins=coins+?, wins=wins+1 WHERE id=?", (bet, winner["id"]))
    db.commit()

    await edit(c, f"⚔️ <b>Итог дуэли ({bet} 🪙):</b> победил {winner['name']}, забрав банк у {loser['name']}!{shield_msg}")
    await c.answer()


# ---------- МАГАЗИН ПРИЗОВ ----------
@dp.callback_query(F.data.startswith("buy:"))
async def on_buy(c: types.CallbackQuery):
    _, owner, item = c.data.split(":")
    owner = int(owner)
    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)

    u = get_user(c.from_user)
    coins = u["coins"]

    prices = {
        "theme": 5000,
        "mention": 2500,
        "tgprem": 800,
        "shield": 150,
        "boost": 50,
        "stars100": 0,  # Оплата за звезды обрабатывается отдельно через Telegram Payments
    }

    # Обработка покупки через Telegram Stars (пример через отправку инвойса)
    if item == "stars100":
        try:
            await bot.send_invoice(
                chat_id=c.from_user.id,
                title="Пополнение баланса",
                description="Получите +100 коинов на игровой баланс бота ПОРОГ",
                payload="buy_stars_100",
                currency="XTR",  # Валюта Telegram Stars
                prices=[types.LabeledPrice(label="100 коинов", amount=50)]  # 50 звезд
            )
            await c.answer("Счет на оплату отправлен в личные сообщения с ботом!", show_alert=True)
        except Exception:
            await c.answer("Напишите боту в личные сообщения /start, чтобы покупать за звезды!", show_alert=True)
        return

    price = prices.get(item, 0)
    if coins < price:
        return await c.answer(f"Недостаточно коинов! Нужно {price} 🪙", show_alert=True)

    new_coins = coins - price
    user_link = f"<a href='tg://user?id={c.from_user.id}'>{c.from_user.first_name}</a>"

    if item == "theme":
        db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, owner))
        db.commit()
        await edit(c, "🎉 <b>Тема ролика куплена!</b> Админу отправлено уведомление.")
        await bot.send_message(ADMIN_ID, f"🚨 <b>Купили тему ролика (5000 🪙):</b>\n👤 {user_link} (ID: <code>{c.from_user.id}</code>)", parse_mode="HTML")

    elif item == "mention":
        db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, owner))
        db.commit()
        await edit(c, "🎉 <b>Упоминание в титрах куплено!</b> Напиши админу свой ник.")
        await bot.send_message(ADMIN_ID, f"🚨 <b>Купили упоминание (2500 🪙):</b>\n👤 {user_link} (ID: <code>{c.from_user.id}</code>)", parse_mode="HTML")

    elif item == "tgprem":
        db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, owner))
        db.commit()
        await edit(c, "🎉 <b>Telegram Premium куплен!</b> Админу отправлено уведомление для выдачи приза.")
        await bot.send_message(ADMIN_ID, f"🚨 <b>Купили Telegram Premium (800 🪙):</b>\n👤 {user_link} (ID: <code>{c.from_user.id}</code>)", parse_mode="HTML")

    elif item == "shield":
        db.execute("UPDATE users SET coins=?, shield_count=shield_count+3 WHERE id=?", (new_coins, owner))
        db.commit()
        await edit(c, "🛡 <b>Успешно!</b> Добавлено 3 защитных щита.")

    elif item == "boost":
        expiry = (datetime.datetime.now() + datetime.timedelta(days=1)).isoformat()
        db.execute("UPDATE users SET coins=?, boost_until=? WHERE id=?", (new_coins, expiry, owner))
        db.commit()
        await edit(c, "💥 <b>Буст активирован!</b> На 24 часа бонус и тейки дают x2 коинов.")

    await c.answer()


# Обработка успешного платежа Telegram Stars
@dp.pre_checkout_query()
async def pre_checkout_query(pre_checkout_q: types.PreCheckoutQuery):
    await bot.answer_pre_checkout_query(pre_checkout_q.id, ok=True)


@dp.message(F.successful_payment)
async def on_successful_payment(message: types.Message):
    if message.successful_payment.invoice_payload == "buy_stars_100":
        user_id = message.from_user.id
        db.execute("UPDATE users SET coins=coins+100 WHERE id=?", (user_id,))
        db.commit()
        await message.answer("⭐️ Оплата прошла успешно! Вам начислено <b>+100 коинов</b> на баланс.", parse_mode="HTML")


# ---------- ВЕБ-СЕРВЕР ДЛЯ RENDER ----------
async def handle(request):
    return web.Response(text="Bot is running!")


app = web.Application()
app.router.add_get("/", handle)


async def web_server():
    runner = web.AppRunner(app)
    await runner.setup()
    port = int(os.environ.get("PORT", 10000))
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()


async def main():
    asyncio.create_task(web_server())
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
