import asyncio
import datetime
import os
import random
import sqlite3

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
DEFAULT_BET = 5
MAX_CASINO_BET = 500
ADMIN_ID = 1642626687

bot = Bot(TOKEN)
dp = Dispatcher()

# Инициализация базы данных
db = sqlite3.connect("game.db")
db.row_factory = sqlite3.Row
db.executescript(
    """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        coins INTEGER DEFAULT 10,
        last_bonus TEXT,
        streak INTEGER DEFAULT 0,
        last_work TEXT,
        casino_count INTEGER DEFAULT 0,
        last_casino_date TEXT,
        casino_won INTEGER DEFAULT 0,
        casino_lost INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        shield_count INTEGER DEFAULT 0,
        boost_until TEXT,
        last_bankrupt TEXT,
        activity_score INTEGER DEFAULT 0,
        custom_status TEXT
    );
    CREATE TABLE IF NOT EXISTS invited_users (
        user_id INTEGER PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS roulette_bids (
        user_id INTEGER PRIMARY KEY,
        name TEXT,
        amount INTEGER
    );
    CREATE TABLE IF NOT EXISTS roulette_info (
        key TEXT PRIMARY KEY,
        value TEXT
    );
    CREATE TABLE IF NOT EXISTS active_duels (
        duel_id INTEGER PRIMARY KEY AUTOINCREMENT,
        creator_id INTEGER,
        creator_name TEXT,
        bet INTEGER
    );
    """
)
db.commit()


def get_user(user: types.User) -> sqlite3.Row:
    existing = db.execute("SELECT * FROM users WHERE id=?", (user.id,)).fetchone()
    if not existing:
        db.execute(
            "INSERT INTO users (id, name, coins, streak) VALUES (?, ?, 10, 0)",
            (user.id, user.first_name),
        )
        db.commit()
    else:
        db.execute("UPDATE users SET name=? WHERE id=?", (user.first_name, user.id))
        db.commit()
    return db.execute("SELECT * FROM users WHERE id=?", (user.id,)).fetchone()


def add_activity(user_id: int):
    db.execute("UPDATE users SET activity_score = activity_score + 1 WHERE id = ?", (user_id,))
    db.commit()


def kb(*buttons: tuple[str, str]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=t, callback_data=d)] for t, d in buttons]
    )


def get_toxicity_title(u: sqlite3.Row) -> str:
    if u["custom_status"]:
        return u["custom_status"]
    coins = u["coins"]
    if coins < 0:
        return "🤡 Главный должник и клоун чата"
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
    u = get_user(user)
    title = get_toxicity_title(u)
    shield_str = f"\n🛡 Защитных щитов: {u['shield_count']}" if u["shield_count"] > 0 else ""
    c_won = u["casino_won"] if "casino_won" in u.keys() else 0
    c_lost = u["casino_lost"] if "casino_lost" in u.keys() else 0
    streak = u["streak"] if "streak" in u.keys() else 0
    activity = u["activity_score"] if "activity_score" in u.keys() else 0
    
    return (
        f"📊 <b>Личная статистика: {u['name']}</b>\n\n"
        f"🪙 Баланс: <b>{u['coins']} 🪙</b>\n"
        f"🏆 Статус: {title}{shield_str}\n"
        f"🔥 Стрик бонусов: <b>{streak}/10 дней</b>\n"
        f"⚡️ Очки активности: <b>{activity}</b>\n"
        f"⚔️ Дуэли: побед {u['wins']} | поражений {u['losses']}\n"
        f"🎰 Казино: выиграно <b>+{c_won} 🪙</b> | проиграно <b>-{c_lost} 🪙</b>"
    )


def top_text() -> str:
    rows_coins = db.execute("SELECT name, coins FROM users ORDER BY coins DESC LIMIT 10").fetchall()
    lines_coins = [f"{i + 1}. {r['name']} — {r['coins']} 🪙" for i, r in enumerate(rows_coins)] or ["Ещё пусто"]

    rows_act = db.execute("SELECT name, activity_score FROM users ORDER BY activity_score DESC LIMIT 10").fetchall()
    lines_act = [f"{i + 1}. {r['name']} — {r['activity_score']} очков" for i, r in enumerate(rows_act)] or ["Ещё пусто"]

    return (
        f"🏆 <b>Топ-10 по количеству монет:</b>\n" + "\n".join(lines_coins) + "\n\n"
        f"⚡️ <b>Топ-10 по активности в боте:</b>\n" + "\n".join(lines_act)
    )


def check_and_run_roulette() -> str:
    now = datetime.datetime.now()
    row = db.execute("SELECT value FROM roulette_info WHERE key='next_spin'").fetchone()
    
    if not row:
        next_spin = (now + datetime.timedelta(minutes=30)).isoformat()
        db.execute("INSERT OR REPLACE INTO roulette_info (key, value) VALUES ('next_spin', ?)", (next_spin,))
        db.commit()
        return ""
    
    next_spin_dt = datetime.datetime.fromisoformat(row["value"])
    if now >= next_spin_dt:
        bids = db.execute("SELECT * FROM roulette_bids").fetchall()
        announcement = ""
        if bids:
            total_bank = sum(b["amount"] for b in bids)
            participants = []
            for b in bids:
                participants.extend([b] * b["amount"])
            winner = random.choice(participants)
            db.execute("UPDATE users SET coins = coins + ? WHERE id = ?", (total_bank, winner["user_id"]))
            db.commit()
            announcement = f"🎡 <b>Итоги получасовой рулетки ПОРОГ Коинов!</b>\nБанк: <b>{total_bank} 🪙</b>\nПобедитель: <b>{winner['name']}</b> забирает весь куш! 🎉\n\n"
        
        db.execute("DELETE FROM roulette_bids")
        new_next_spin = (now + datetime.timedelta(minutes=30)).isoformat()
        db.execute("UPDATE roulette_info SET value = ? WHERE key = 'next_spin'", (new_next_spin,))
        db.commit()
        return announcement
    return ""


def get_roulette_content() -> tuple[str, InlineKeyboardMarkup]:
    check_and_run_roulette()
    now = datetime.datetime.now()
    row = db.execute("SELECT value FROM roulette_info WHERE key='next_spin'").fetchone()
    if row:
        next_spin_dt = datetime.datetime.fromisoformat(row["value"])
        time_left = next_spin_dt - now
        if time_left.total_seconds() < 0:
            time_left = datetime.timedelta(0)
        mins, secs = divmod(int(time_left.total_seconds()), 60)
        timer_str = f"{mins:02d} мин. {secs:02d} сек."
    else:
        timer_str = "30 мин. 00 сек."

    bids = db.execute("SELECT * FROM roulette_bids").fetchall()
    total_bank = sum(b["amount"] for b in bids)
    
    roulette_lines = []
    if bids:
        for b in bids:
            chance = (b["amount"] / total_bank) * 100
            roulette_lines.append(f"• <b>{b['name']}</b> — вложил <b>{b['amount']} 🪙</b> (шанс на куш: <b>{chance:.1f}%</b>)")
    else:
        roulette_lines.append("<i>Пока никто не сделал ставку. Стань первым!</i>")

    text = (
        f"🎡 <b>Получасовая рулетка ПОРОГ Коинов</b>\n\n"
        f"⏱ <b>До новой крутки:</b> <code>{timer_str}</code>\n"
        f"💰 Общий банк: <b>{total_bank} 🪙</b>\n"
        f"<i>Розыгрыш каждые 30 минут. Больше вложил — выше шанс на куш!</i>\n\n"
        f"<b>Список участников:</b>\n" + "\n".join(roulette_lines) + f"\n\n"
        f"<b>Сделай ставку в банк:</b>"
    )
    markup = kb(
        ("➕ Вложить 10 🪙", "r_bet:10"),
        ("➕ Вложить 50 🪙", "r_bet:50"),
        ("➕ Вложить 100 🪙", "r_bet:100"),
        ("➕ Вложить 500 🪙", "r_bet:500"),
        ("✏️ Своя ставка в рулетку", "r_bet_custom")
    )
    return text, markup


def do_bonus(user: types.User) -> str:
    check_and_run_roulette()
    u = get_user(user)
    now = datetime.datetime.now()
    streak = u["streak"] if "streak" in u.keys() else 0
    last_bonus_str = u["last_bonus"]
    
    if last_bonus_str:
        last_dt = datetime.datetime.fromisoformat(last_bonus_str)
        diff = now - last_dt
        if diff < datetime.timedelta(days=1):
            time_left = datetime.timedelta(days=1) - diff
            hours, remainder = divmod(int(time_left.total_seconds()), 3600)
            mins, secs = divmod(remainder, 60)
            return f"⏳ Бонус уже получен! До следующей попытки: <b>{hours} ч. {mins} мин. {secs} сек.</b>\n🔥 Текущий стрик: <b>{streak}/10 дней</b>."
        elif diff > datetime.timedelta(days=2):
            streak = 0

    streak = min(streak + 1, 10)
    base_delta = 9 + streak
    boost_active = u["boost_until"] and datetime.datetime.fromisoformat(u["boost_until"]) > now
    extra_bonus = base_delta if boost_active else 0
    total_delta = base_delta + extra_bonus
    new_coins = u["coins"] + total_delta
    
    db.execute("UPDATE users SET coins=?, last_bonus=?, streak=? WHERE id=?", (new_coins, now.isoformat(), streak, user.id))
    db.commit()
    
    boost_note = f" (💥 Буст x2: +{base_delta} из воздуха!)" if boost_active else ""
    return f"🎁 <b>Бонус забран (День {streak}/10)!</b> Начислено <b>+{total_delta} 🪙</b>{boost_note}\n🪙 Баланс: <b>{new_coins} 🪙</b>"


def do_bankrupt(user: types.User) -> str:
    u = get_user(user)
    if u["coins"] >= 0:
        return "🚫 Функция «Банкрот» доступна только тем, у кого отрицательный баланс (долги)."
    
    now = datetime.datetime.now()
    if u["last_bankrupt"]:
        last_dt = datetime.datetime.fromisoformat(u["last_bankrupt"])
        if now - last_dt < datetime.timedelta(days=7):
            time_left = datetime.timedelta(days=7) - (now - last_dt)
            return f"⏳ Банкротство доступно раз в неделю! Осталось ждать: {time_left.days} дн. {int(time_left.seconds/3600)} ч."

    db.execute("UPDATE users SET coins=0, last_bankrupt=? WHERE id=?", (now.isoformat(), user.id))
    db.commit()
    return "🏛 <b>Банкротство успешно!</b> Все твои долги аннулированы, баланс обнулен до <b>0 🪙</b>."


def do_work(user: types.User) -> str:
    check_and_run_roulette()
    u = get_user(user)
    now = datetime.datetime.now()
    
    if u["last_work"]:
        last_dt = datetime.datetime.fromisoformat(u["last_work"])
        if now - last_dt < datetime.timedelta(hours=1):
            time_left = datetime.timedelta(hours=1) - (now - last_dt)
            mins, secs = divmod(int(time_left.total_seconds()), 60)
            return f"⏳ Лимит вбросов исчерпан! Ждать: <b>{mins} мин. {secs} сек.</b>"

    base_gain = 3
    base_loss = 3
    boost_active = u["boost_until"] and datetime.datetime.fromisoformat(u["boost_until"]) > now
    
    success = random.random() < 0.5
    if success:
        gain = base_gain + (base_gain if boost_active else 0)
        new_coins = u["coins"] + gain
        msg = f"💬 <b>Тейк зашел!</b> Получено <b>+{gain} 🪙</b>.\n🪙 Баланс: <b>{new_coins} 🪙</b>"
    else:
        loss = base_loss + (base_loss if boost_active else 0)
        new_coins = u["coins"] - loss
        msg = f"📉 <b>Кринж...</b> Потеряно <b>-{loss} 🪙</b>.\n🪙 Баланс: <b>{new_coins} 🪙</b>"

    db.execute("UPDATE users SET coins=?, last_work=? WHERE id=?", (new_coins, now.isoformat(), user.id))
    db.commit()
    return msg


def article(id_: str, title: str, description: str, text: str, markup=None) -> InlineQueryResultArticle:
    return InlineQueryResultArticle(
        id=id_,
        title=title,
        description=description,
        input_message_content=InputTextMessageContent(message_text=text, parse_mode="HTML"),
        reply_markup=markup,
    )


# ---------- КОМАНДЫ ----------
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
        await m.answer_document(FSInputFile("game.db"), caption="📦 Бэкап game.db")


@dp.message(Command("start"))
async def start(m: types.Message):
    get_user(m.from_user)
    add_activity(m.from_user.id)
    bot_info = await bot.get_me()
    await m.answer(f"👋 Бот <b>ПОРОГ Коинов</b> запущен! Напиши <code>@{bot_info.username}</code> в чате канала.", parse_mode="HTML")


@dp.message()
async def handle_all_messages(message: types.Message):
    if not message.from_user or message.from_user.is_bot:
        return

    add_activity(message.from_user.id)
    text_lower = message.text.lower() if message.text else ""

    if text_lower in ["!игра", "игра", "/game"]:
        welcome_text = "🔥 Игровая экосистема <b>ПОРОГ Коинов</b>:"
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🎮 Открыть меню игры", switch_inline_query_current_chat="")]
        ])
        await message.reply(welcome_text, reply_markup=keyboard, parse_mode="HTML")
        return

    if message.message_thread_id:
        user_id = message.from_user.id
        first_name = message.from_user.first_name
        already_invited = db.execute("SELECT 1 FROM invited_users WHERE user_id=?", (user_id,)).fetchone()

        if not already_invited:
            db.execute("INSERT OR IGNORE INTO invited_users (user_id) VALUES (?)", (user_id,))
            db.commit()
            teaser = f"🔥 {first_name}, залетай в экономику <b>ПОРОГ Коинов</b>! Копи валюту и забирай призы 👇"
            keyboard = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🎮 Открыть меню игры", switch_inline_query_current_chat="")]
            ])
            await message.reply(teaser, reply_markup=keyboard, parse_mode="HTML")


# ---------- ГЛАВНОЕ ИНЛАЙН-МЕНЮ (4 ПУНКТА + МАГАЗИН) ----------
@dp.inline_query()
async def inline_query_menu(q: types.InlineQuery):
    add_activity(q.from_user.id)
    roulette_notice = check_and_run_roulette()
    
    uid = q.from_user.id
    u = get_user(q.from_user)
    coins = u["coins"]
    r_text, r_markup = get_roulette_content()
    if roulette_notice:
        r_text = roulette_notice + r_text

    results = [
        # ПУНКТ 1: F.A.Q
        article(
            "faq",
            "📌 1. F.A.Q (О боте ПОРОГ Коинов)",
            "Правила, информация об авторе и гарантии безопасности",
            (
                "📌 <b>Добро пожаловать в ПОРОГ Коинов!</b>\n\n"
                "🤖 <b>Что это за бот?</b>\n"
                "Официальная игровая экономика и валюта канала. Зарабатывайте коины, соревнуйтесь и обменивайте их на призы.\n\n"
                "👤 <b>Кто разработчик?</b>\n"
                "Проект создан автором YouTube-канала <b>ПОРОГ</b>.\n\n"
                "💡 <b>Важная информация:</b>\n"
                "• Реальные деньги или платежные системы <b>не используются</b>.\n"
                "• Все игры, ставки и магазины происходят <b>исключительно внутри бота</b> по кнопкам.\n"
                "• Комментарии в Telegram-канале не начисляют валюту автоматически — всё управление здесь!"
            )
        ),
        
        # ПУНКТ 2: Мой профиль
        article(
            "profile",
            "👤 2. Мой профиль, Бонус & Банкрот",
            "Статистика, ежедневный бонус, вброс тейков и банкротство",
            stats_text(q.from_user) + "\n\n<i>Выберите действие ниже:</i>",
            kb(
                ("Забрать бонус 🎁", f"bonus:{uid}"),
                ("💬 Вбросить тейк", f"work:{uid}"),
                ("🏛 Списать долги (Банкрот)", f"bankrupt:{uid}")
            )
        ),

        # ПУНКТ 3: Казино / Дуэли
        article(
            "casino_duels",
            "🎲 3. Казино & Дуэли",
            "Стандартное казино (до 10 раз/сутки), получасовая рулетка и дуэли",
            (
                f"🎲 <b>Казино и Дуэли ПОРОГ Коинов</b>\n\n"
                f"💰 Твой баланс: <b>{coins} 🪙</b>\n\n"
                f"Выберите режим игры:"
            ),
            kb(
                ("🎰 Обычное Казино (ставка 5-500 или своя)", f"cas_menu:{uid}"),
                ("⚔️ Создать Дуэль (своя ставка)", f"duel_create_prompt:{uid}"),
                ("⚔️ Активные вызовы / Дуэли", f"duel_list:{uid}"),
                ("🎡 Получасовая Рулетка (Джекпот)", f"open_roulette:{uid}")
            )
        ),

        # ПУНКТ 4: Таблица лидеров
        article(
            "top",
            "🏆 4. Таблица лидеров",
            "Топ по количеству монет и по активности в боте",
            top_text()
        ),

        # Магазин призов
        article(
            "shop",
            "🛒 Магазин призов ПОРОГА",
            "Потрать накопленные коины на реальные призы и усиления",
            (
                "🛒 <b>Магазин призов ПОРОГА:</b>\n\n"
                "1️⃣ 🎬 <b>Тема ролика — 5,000 🪙</b>\n"
                "2️⃣ 🎥 <b>Упоминание в титрах — 2,500 🪙</b>\n"
                "3️⃣ ⭐ <b>Telegram Premium — 1,600 🪙</b>\n"
                "4️⃣ 🛡 <b>3 щита защиты — 150 🪙</b>\n"
                "5️⃣ 🎟 <b>Буст x2 на 24ч — 50 🪙</b>\n\n"
                f"💰 Ваш баланс: <b>{coins} 🪙</b>"
            ),
            InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🎬 Тема (5000 🪙)", callback_data=f"buy:{uid}:theme")],
                [InlineKeyboardButton(text="🎥 Титры (2500 🪙)", callback_data=f"buy:{uid}:mention")],
                [InlineKeyboardButton(text="⭐ TG Premium (1600 🪙)", callback_data=f"buy:{uid}:tgprem")],
                [InlineKeyboardButton(text="🛡 3 щита (150 🪙)", callback_data=f"buy:{uid}:shield")],
                [InlineKeyboardButton(text="🎟 Буст x2 (50 🪙)", callback_data=f"buy:{uid}:boost")],
            ])
        )
    ]

    await q.answer(results, cache_time=0, is_personal=True)


async def edit(c: types.CallbackQuery, text: str, markup=None):
    await bot.edit_message_text(text, inline_message_id=c.inline_message_id, reply_markup=markup, parse_mode="HTML")


@dp.callback_query(F.data.startswith("bonus:"))
async def on_bonus(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    await edit(c, do_bonus(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("work:"))
async def on_work(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    await edit(c, do_work(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("bankrupt:"))
async def on_bankrupt(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    res = do_bankrupt(c.from_user)
    await c.answer(res, show_alert=True)


# ---------- КАЗИНО ----------
@dp.callback_query(F.data.startswith("cas_menu:"))
async def on_casino_menu(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)
    
    u = get_user(c.from_user)
    await edit(
        c,
        f"🎰 <b>Казино ПОРОГ Коинов</b>\n💰 Баланс: <b>{u['coins']} 🪙</b>\n\n<b>Выберите размер ставки:</b>",
        kb(
            ("5 🪙", f"cas_bet:{owner}:5"),
            ("10 🪙", f"cas_bet:{owner}:10"),
            ("20 🪙", f"cas_bet:{owner}:20"),
            ("50 🪙", f"cas_bet:{owner}:50"),
            ("✏️ Своя ставка", f"cas_custom_prompt:{owner}"),
            ("⬅️ Назад в меню казино", f"cas_back:{owner}")
        )
    )
    await c.answer()


@dp.callback_query(F.data.startswith("cas_bet:"))
async def on_casino_bet(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    _, owner_str, bet_str = c.data.split(":")
    owner, bet = int(owner_str), int(bet_str)
    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)

    u = get_user(c.from_user)
    now = datetime.datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    casino_count = u["casino_count"] if u["last_casino_date"] == today_str else 0
    
    if casino_count >= 10:
        midnight = (now + datetime.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        time_left = midnight - now
        hours, remainder = divmod(int(time_left.total_seconds()), 3600)
        mins, secs = divmod(remainder, 60)
        return await c.answer(f"🚫 Лимит казино исчерпан (10/10)! Сброс через: {hours} ч. {mins} мин.", show_alert=True)

    await edit(
        c,
        f"🎰 <b>Казино ПОРОГА</b> (попытка {casino_count + 1}/10)\nСтавка: <b>{bet} 🪙</b>\n\n<i>Выберите цвет:</i>",
        kb(
            ("🔴 Красное (x2)", f"cas_play:{owner}:{bet}:red"),
            ("⬛️ Черное (x2)", f"cas_play:{owner}:{bet}:black"),
            ("🟢 Зеленое (Джекпот x8)", f"cas_play:{owner}:{bet}:green"),
            ("⬅️ К выбору ставки", f"cas_menu:{owner}")
        )
    )
    await c.answer()


@dp.callback_query(F.data.startswith("cas_custom_prompt:"))
async def on_cas_custom_prompt(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    await c.answer("✏️ Чтобы сделать свою ставку, отправь в чате:\n/casino [сумма]\nПример: /casino 75", show_alert=True)


@dp.message(Command("casino"))
async def custom_casino_bet_command(m: types.Message):
    add_activity(m.from_user.id)
    args = m.text.split()
    if len(args) < 2 or not args[1].isdigit():
        return await m.reply("⚠️ Укажи корректную сумму. Пример: <code>/casino 50</code>", parse_mode="HTML")
    
    bet = int(args[1])
    if bet <= 0 or bet > MAX_CASINO_BET:
        return await m.reply(f"⚠️ Ставка должна быть от 1 до {MAX_CASINO_BET} коинов.")

    u = get_user(m.from_user)
    now = datetime.datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    casino_count = u["casino_count"] if u["last_casino_date"] == today_str else 0
    
    if casino_count >= 10:
        return await m.reply("🚫 Лимит игр в казино на сегодня исчерпан (10/10).")

    new_casino_count = casino_count + 1
    new_coins = u["coins"] - bet
    db.execute("UPDATE users SET coins=?, casino_count=?, last_casino_date=? WHERE id=?", (new_coins, new_casino_count, today_str, m.from_user.id))
    db.commit()

    roll = random.random()
    if roll < 0.475:
        w_color, emoji, name = "red", "🔴", "Красное"
    elif roll < 0.95:
        w_color, emoji, name = "black", "⬛️", "Черное"
    else:
        w_color, emoji, name = "green", "🟢", "Зеленое (Джекпот)"

    win_color = w_color
    mult = 8 if win_color == "green" else 2
    winnings = bet * mult
    net_win = winnings - bet

    boost_active = u["boost_until"] and datetime.datetime.fromisoformat(u["boost_until"]) > now
    extra_win = net_win if boost_active else 0
    total_w = winnings + extra_win
    net_win_total = net_win + extra_win

    new_coins += total_w
    c_won = u["casino_won"] + net_win_total
    db.execute("UPDATE users SET coins=?, casino_won=? WHERE id=?", (new_coins, c_won, m.from_user.id))
    db.commit()

    await m.reply(f"🎰 Казино выдало {emoji} <b>{name}</b>!\nВыигрыш: <b>+{net_win_total} 🪙</b>\nБаланс: <b>{new_coins} 🪙</b>", parse_mode="HTML")


@dp.callback_query(F.data.startswith("cas_play:"))
async def on_casino_play(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    _, owner_str, bet_str, color = c.data.split(":")
    owner, bet = int(owner_str), int(bet_str)
    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)

    u = get_user(c.from_user)
    now = datetime.datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    casino_count = u["casino_count"] if u["last_casino_date"] == today_str else 0
    if casino_count >= 10:
        return await c.answer("Лимит исчерпан!", show_alert=True)

    new_casino_count = casino_count + 1
    new_coins = u["coins"] - bet
    db.execute("UPDATE users SET coins=?, casino_count=?, last_casino_date=? WHERE id=?", (new_coins, new_casino_count, today_str, owner))
    db.commit()

    await edit(c, f"🎰 <b>Крутим рулетку...</b> 🎲")
    try:
        await bot.send_dice(chat_id=c.message.chat.id, emoji="🎰")
    except Exception:
        pass
    await asyncio.sleep(3)

    roll = random.random()
    if roll < 0.475:
        w_color, emoji, name = "red", "🔴", "Красное"
    elif roll < 0.95:
        w_color, emoji, name = "black", "⬛️", "Черное"
    else:
        w_color, emoji, name = "green", "🟢", "Зеленое (Джекпот)"

    c_won_add = u["casino_won"]
    c_lost_add = u["casino_lost"]

    if color == w_color:
        mult = 8 if color == "green" else 2
        winnings = bet * mult
        net_win = winnings - bet

        boost_active = u["boost_until"] and datetime.datetime.fromisoformat(u["boost_until"]) > now
        extra_win = net_win if boost_active else 0
        total_winnings = winnings + extra_win
        net_win_total = net_win + extra_win

        new_coins += total_winnings
        c_won_add += net_win_total
        msg = f"🎰 <b>{emoji} Выпало: {name}!</b>\nВыигрыш: <b>+{net_win_total} 🪙</b>\nБаланс: <b>{new_coins} 🪙</b>"
    else:
        net_loss = bet
        c_lost_add += net_loss
        msg = f"🎰 <b>{emoji} Выпало: {name}</b>\nПроигрыш: <b>-{bet} 🪙</b>\nБаланс: <b>{new_coins} 🪙</b>"

    db.execute("UPDATE users SET coins=?, casino_won=?, casino_lost=? WHERE id=?", (new_coins, c_won_add, c_lost_add, owner))
    db.commit()

    await edit(c, msg)
    await c.answer()


@dp.callback_query(F.data.startswith("cas_back:"))
async def on_casino_back(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    u = get_user(c.from_user)
    await edit(
        c,
        f"🎲 <b>Казино & Дуэли ПОРОГ Коинов</b>\n💰 Баланс: <b>{u['coins']} 🪙</b>",
        kb(
            ("🎰 Обычное Казино", f"cas_menu:{owner}"),
            ("⚔️ Создать Дуэль", f"duel_create_prompt:{owner}"),
            ("⚔️ Активные вызовы", f"duel_list:{owner}"),
            ("🎡 Получасовая Рулетка", f"open_roulette:{owner}")
        )
    )
    await c.answer()


# ---------- ДУЭЛИ ----------
@dp.callback_query(F.data.startswith("duel_create_prompt:"))
async def on_duel_create_prompt(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    await c.answer("⚔️ Чтобы создать дуэль, отправь в чате:\n/duel [ставка]\nПример: /duel 25", show_alert=True)


@dp.message(Command("duel"))
async def custom_duel_command(m: types.Message):
    add_activity(m.from_user.id)
    args = m.text.split()
    if len(args) < 2 or not args[1].isdigit():
        return await m.reply("⚠️ Укажи ставку. Пример: <code>/duel 30</code>", parse_mode="HTML")
    
    bet = int(args[1])
    if bet <= 0:
        return await m.reply("⚠️ Ставка должна быть больше 0.")

    u = get_user(m.from_user)
    db.execute("INSERT INTO active_duels (creator_id, creator_name, bet) VALUES (?, ?, ?)", (m.from_user.id, u["name"], bet))
    db.commit()
    await m.reply(f"⚔️ Дуэль с вкладом <b>{bet} 🪙</b> создана! Другие игроки могут принять её через меню бота в разделе Казино/Дуэли.", parse_mode="HTML")


@dp.callback_query(F.data.startswith("duel_list:"))
async def on_duel_list(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    duels = db.execute("SELECT * FROM active_duels").fetchall()
    
    if not duels:
        return await c.answer("Пока нет активных дуэлей. Создай свою через /duel [сумма]!", show_alert=True)

    buttons = []
    for d in duels:
        buttons.append((f"⚔️ {d['creator_name']} ({d['bet']} 🪙)", f"duel_accept:{owner}:{d['duel_id']}"))
    
    buttons.append(("⬅️ Назад", f"cas_back:{owner}"))
    await edit(c, "⚔️ <b>Активные дуэли игроков:</b>\nВыбери вызов, чтобы принять бой!", kb(*buttons))
    await c.answer()


@dp.callback_query(F.data.startswith("duel_accept:"))
async def on_duel_accept(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    _, owner_str, duel_id_str = c.data.split(":")
    owner, duel_id = int(owner_str), int(duel_id_str)
    
    if c.from_user.id == owner:
        return await c.answer("Нельзя принять собственный вызов!", show_alert=True)

    duel = db.execute("SELECT * FROM active_duels WHERE duel_id=?", (duel_id,)).fetchone()
    if not duel:
        return await c.answer("Эта дуэль уже завершена.", show_alert=True)

    bet = duel["bet"]
    creator = db.execute("SELECT * FROM users WHERE id=?", (duel["creator_id"],)).fetchone()
    acceptor = get_user(c.from_user)

    db.execute("DELETE FROM active_duels WHERE duel_id=?", (duel_id,))
    db.commit()

    winner, loser = random.choice([(creator, acceptor), (acceptor, creator)])
    now = datetime.datetime.now()

    loser_boost = loser["boost_until"] and datetime.datetime.fromisoformat(loser["boost_until"]) > now
    loser_loss = (bet * 2) if loser_boost else bet
    winner_boost = winner["boost_until"] and datetime.datetime.fromisoformat(winner["boost_until"]) > now
    winner_gain = (bet * 2) if winner_boost else bet

    if loser["shield_count"] > 0:
        db.execute("UPDATE users SET shield_count=shield_count-1 WHERE id=?", (loser["id"],))
        shield_msg = f" (у {loser['name']} сработал щит 🛡)"
    else:
        db.execute("UPDATE users SET coins=coins-?, losses=losses+1 WHERE id=?", (loser_loss, loser["id"]))
        shield_msg = f" (-{loser_loss} 🪙)"

    db.execute("UPDATE users SET coins=coins+?, wins=wins+1 WHERE id=?", (winner_gain, winner["id"]))
    db.commit()

    await edit(c, f"⚔️ <b>Дуэль завершена!</b>\nПобедил <b>{winner['name']}</b> (+{winner_gain} 🪙), победив <b>{loser['name']}</b>{shield_msg}!")
    await c.answer()


# ---------- РУЛЕТКА ----------
@dp.callback_query(F.data.startswith("open_roulette:"))
async def on_open_roulette(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    text, markup = get_roulette_content()
    await edit(c, text, markup)
    await c.answer()


@dp.callback_query(F.data.startswith("r_bet:"))
async def on_roulette_bet_inline(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    _, amount_str = c.data.split(":")
    amount = int(amount_str)
    
    u = get_user(c.from_user)
    new_coins = u["coins"] - amount
    db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, c.from_user.id))
    
    existing_bid = db.execute("SELECT amount FROM roulette_bids WHERE user_id=?", (c.from_user.id,)).fetchone()
    if existing_bid:
        new_amount = existing_bid["amount"] + amount
        db.execute("UPDATE roulette_bids SET amount=? WHERE user_id=?", (new_amount, c.from_user.id))
    else:
        db.execute("INSERT INTO roulette_bids (user_id, name, amount) VALUES (?, ?, ?)", (c.from_user.id, u["name"], amount))
    
    db.commit()
    text, markup = get_roulette_content()
    await edit(c, text, markup)
    await c.answer(f"✅ Вложено {amount} 🪙 в рулетку!", show_alert=True)


@dp.callback_query(F.data.startswith("r_bet_custom"))
async def on_r_bet_custom(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    await c.answer("✏️ Чтобы вложить свою сумму, отправь в чат:\n/roulette [сумма]\nПример: /roulette 150", show_alert=True)


@dp.message(Command("roulette"))
async def custom_roulette_command(m: types.Message):
    add_activity(m.from_user.id)
    args = m.text.split()
    if len(args) < 2 or not args[1].isdigit():
        return await m.reply("⚠️ Укажи сумму. Пример: <code>/roulette 100</code>", parse_mode="HTML")
    
    amount = int(args[1])
    if amount <= 0:
        return await m.reply("⚠️ Сумма должна быть больше 0.")

    u = get_user(m.from_user)
    new_coins = u["coins"] - amount
    db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, m.from_user.id))

    existing_bid = db.execute("SELECT amount FROM roulette_bids WHERE user_id=?", (m.from_user.id,)).fetchone()
    if existing_bid:
        new_amount = existing_bid["amount"] + amount
        db.execute("UPDATE roulette_bids SET amount=? WHERE user_id=?", (new_amount, m.from_user.id))
    else:
        db.execute("INSERT INTO roulette_bids (user_id, name, amount) VALUES (?, ?, ?)", (m.from_user.id, u["name"], amount))
    
    db.commit()
    await m.reply(f"✅ Успешно вложено <b>{amount} 🪙</b> в получасовую рулетку!", parse_mode="HTML")


# ---------- МАГАЗИН ----------
@dp.callback_query(F.data.startswith("buy:"))
async def on_buy(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    _, owner, item = c.data.split(":")
    owner = int(owner)
    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)

    u = get_user(c.from_user)
    coins = u["coins"]
    prices = {"theme": 5000, "mention": 2500, "tgprem": 1600, "shield": 150, "boost": 50}

    price = prices.get(item, 0)
    if coins < price:
        return await c.answer(f"Недостаточно коинов! Нужно {price} 🪙", show_alert=True)

    new_coins = coins - price
    user_link = f"<a href='tg://user?id={c.from_user.id}'>{c.from_user.first_name}</a>"
    db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, owner))
    db.commit()

    if item == "theme":
        await edit(c, "🎉 <b>Тема ролика куплена!</b> Админу отправлено уведомление.")
        await bot.send_message(ADMIN_ID, f"🚨 <b>Купили тему ролика (5000 🪙):</b>\n👤 {user_link}", parse_mode="HTML")
    elif item == "mention":
        await edit(c, "🎉 <b>Упоминание в титрах куплено!</b> Напиши админу свой ник.")
        await bot.send_message(ADMIN_ID, f"🚨 <b>Купили упоминание (2500 🪙):</b>\n👤 {user_link}", parse_mode="HTML")
    elif item == "tgprem":
        await edit(c, "🎉 <b>Telegram Premium куплен!</b> Админу отправлено уведомление.")
        await bot.send_message(ADMIN_ID, f"🚨 <b>Купили Telegram Premium (1600 🪙):</b>\n👤 {user_link}", parse_mode="HTML")
    elif item == "shield":
        db.execute("UPDATE users SET shield_count=shield_count+3 WHERE id=?", (owner,))
        db.commit()
        await edit(c, "🛡 <b>Успешно!</b> Добавлено 3 защитных щита.")
    elif item == "boost":
        expiry = (datetime.datetime.now() + datetime.timedelta(days=1)).isoformat()
        db.execute("UPDATE users SET boost_until=? WHERE id=?", (expiry, owner))
        db.commit()
        await edit(c, "💥 <b>Буст x2 активирован на 24 часа!</b>")

    await c.answer()


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
