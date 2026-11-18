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
ADMIN_ID = 1642626687

bot = Bot(TOKEN)
dp = Dispatcher()

# Инициализация базы данных
db = sqlite3.connect("game.db", check_same_thread=False)
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
        bet INTEGER,
        created_at TEXT
    );
    """
)
db.commit()

# Безопасная миграция для существующей базы данных
for col_sql in [
    "ALTER TABLE users ADD COLUMN streak INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN casino_won INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN casino_lost INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN last_bankrupt TEXT",
    "ALTER TABLE users ADD COLUMN activity_score INTEGER DEFAULT 0",
]:
    try:
        db.execute(col_sql)
        db.commit()
    except sqlite3.OperationalError:
        pass


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


def has_boost(u: sqlite3.Row, now: datetime.datetime | None = None) -> bool:
    if not u["boost_until"]:
        return False
    now = now or datetime.datetime.now()
    return datetime.datetime.fromisoformat(u["boost_until"]) > now


def kb(*buttons: tuple[str, str]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=t, callback_data=d)] for t, d in buttons]
    )


def get_toxicity_title(u: sqlite3.Row) -> str:
    if u["custom_status"]:
        return u["custom_status"]
    coins = u["coins"]
    if coins < 0:
        return "Должник"
    elif coins <= 5:
        return "Новичок"
    elif coins <= 20:
        return "Комментатор"
    elif coins <= 50:
        return "Активист"
    elif coins <= 100:
        return "Эксперт"
    else:
        return "Властелин"


def stats_text(user: types.User) -> str:
    u = get_user(user)
    title = get_toxicity_title(u)
    shield_str = f"\n🛡 Щиты: {u['shield_count']}" if u["shield_count"] > 0 else ""
    boost_str = "\n🎟 Буст x2: активен" if has_boost(u) else ""
    c_won = u["casino_won"] or 0
    c_lost = u["casino_lost"] or 0
    streak = u["streak"] or 0
    activity = u["activity_score"] or 0

    return (
        f"👤 <b>Профиль: {u['name']}</b>\n\n"
        f"🪙 Баланс: <b>{u['coins']}</b>\n"
        f"🏆 Статус: {title}{shield_str}{boost_str}\n"
        f"🔥 Стрик бонусов: {streak}/10 дней\n"
        f"⚡️ Активность: {activity}\n"
        f"⚔️ Дуэли: побед {u['wins']} / поражений {u['losses']}\n"
        f"🎰 Казино: +{c_won} / -{c_lost}"
    )


def top_text() -> str:
    rows_coins = db.execute("SELECT name, coins FROM users ORDER BY coins DESC LIMIT 10").fetchall()
    lines_coins = [f"{i + 1}. {r['name']} — {r['coins']}" for i, r in enumerate(rows_coins)] or ["Пусто"]

    rows_act = db.execute("SELECT name, activity_score FROM users ORDER BY activity_score DESC LIMIT 10").fetchall()
    lines_act = [f"{i + 1}. {r['name']} — {r['activity_score']}" for i, r in enumerate(rows_act)] or ["Пусто"]

    return (
        f"🏆 <b>Топ по монетам</b>\n" + "\n".join(lines_coins) + "\n\n"
        f"⚡️ <b>Топ по активности</b>\n" + "\n".join(lines_act)
    )


# ---------- РУЛЕТКА (30 МИНУТ ПОСЛЕ 1 СТАВКИ) ----------
def check_and_run_roulette() -> str:
    now = datetime.datetime.now()
    row = db.execute("SELECT value FROM roulette_info WHERE key='next_spin'").fetchone()
    bids = db.execute("SELECT * FROM roulette_bids").fetchall()

    if not bids:
        db.execute("INSERT OR REPLACE INTO roulette_info (key, value) VALUES ('next_spin', '')")
        db.commit()
        return ""

    if not row or not row["value"]:
        next_spin = (now + datetime.timedelta(minutes=30)).isoformat()
        db.execute("INSERT OR REPLACE INTO roulette_info (key, value) VALUES ('next_spin', ?)", (next_spin,))
        db.commit()
        return ""

    next_spin_dt = datetime.datetime.fromisoformat(row["value"])
    if now >= next_spin_dt:
        total_bank = sum(b["amount"] for b in bids)
        participants = []
        for b in bids:
            participants.extend([b] * b["amount"])

        winner = random.choice(participants)
        db.execute("UPDATE users SET coins = coins + ? WHERE id = ?", (total_bank, winner["user_id"]))
        db.commit()

        announcement = (
            f"🎡 <b>Итоги рулетки</b>\n"
            f"Банк: {total_bank}\n"
            f"Победитель: <b>{winner['name']}</b>\n\n"
        )

        db.execute("DELETE FROM roulette_bids")
        db.execute("INSERT OR REPLACE INTO roulette_info (key, value) VALUES ('next_spin', '')")
        db.commit()
        return announcement
    return ""


def get_roulette_content(owner_id: int) -> tuple[str, InlineKeyboardMarkup]:
    notice = check_and_run_roulette()
    now = datetime.datetime.now()
    row = db.execute("SELECT value FROM roulette_info WHERE key='next_spin'").fetchone()

    if row and row["value"]:
        next_spin_dt = datetime.datetime.fromisoformat(row["value"])
        time_left = next_spin_dt - now
        if time_left.total_seconds() < 0:
            time_left = datetime.timedelta(0)
        mins, secs = divmod(int(time_left.total_seconds()), 60)
        timer_str = f"{mins:02d}:{secs:02d}"
    else:
        timer_str = "ожидание 1-й ставки"

    bids = db.execute("SELECT * FROM roulette_bids").fetchall()
    total_bank = sum(b["amount"] for b in bids)

    roulette_lines = []
    if bids:
        for b in bids:
            chance = (b["amount"] / total_bank) * 100
            roulette_lines.append(f"• {b['name']} — {b['amount']} ({chance:.1f}%)")
    else:
        roulette_lines.append("Ставок пока нет")

    text = (
        f"{notice}"
        f"🎡 <b>Получасовая рулетка</b>\n\n"
        f"⏱ До розыгрыша: <b>{timer_str}</b>\n"
        f"💰 Банк: <b>{total_bank}</b>\n\n"
        f"<i>Таймер (30 мин) запускается после первой ставки. Победитель определяется по проценту вклада и забирает весь банк.</i>\n\n"
        f"<b>Участники:</b>\n" + "\n".join(roulette_lines) + "\n\n"
        f"Сделать ставку:"
    )
    markup = kb(
        ("➕ 5", f"r_bet:{owner_id}:5"),
        ("➕ 10", f"r_bet:{owner_id}:10"),
        ("➕ 15", f"r_bet:{owner_id}:15"),
        ("➕ 20", f"r_bet:{owner_id}:20"),
        ("➕ 50", f"r_bet:{owner_id}:50"),
        ("⬅️ Назад", f"cas_back_main:{owner_id}"),
    )
    return text, markup


# ---------- БОНУС, БАНКРОТСТВО, ТЕЙКИ ----------
def do_bonus(user: types.User) -> str:
    check_and_run_roulette()
    u = get_user(user)
    now = datetime.datetime.now()
    streak = u["streak"] or 0
    last_bonus_str = u["last_bonus"]

    if last_bonus_str:
        last_dt = datetime.datetime.fromisoformat(last_bonus_str)
        diff = now - last_dt
        if diff < datetime.timedelta(days=1):
            time_left = datetime.timedelta(days=1) - diff
            hours, remainder = divmod(int(time_left.total_seconds()), 3600)
            mins, _ = divmod(remainder, 60)
            return f"⏳ Бонус уже получен. До следующего: {hours}ч {mins}м\n🔥 Стрик: {streak}/10 дней"
        elif diff > datetime.timedelta(days=2):
            streak = 0

    streak = min(streak + 1, 10)
    base_delta = 9 + streak
    boost_active = has_boost(u, now)
    extra_bonus = base_delta if boost_active else 0
    total_delta = base_delta + extra_bonus
    new_coins = u["coins"] + total_delta

    db.execute(
        "UPDATE users SET coins=?, last_bonus=?, streak=? WHERE id=?",
        (new_coins, now.isoformat(), streak, user.id),
    )
    db.commit()

    boost_note = f" (буст x2: +{extra_bonus} из воздуха)" if boost_active else ""
    return f"🎁 Бонус получен: <b>+{total_delta}</b>{boost_note}\n🪙 Баланс: <b>{new_coins}</b>"


def do_bankrupt(user: types.User) -> str:
    u = get_user(user)
    if u["coins"] >= 0:
        return "Банкротство доступно только при минусовом балансе. Оно списывает все долги до 0 раз в неделю."

    now = datetime.datetime.now()
    if u["last_bankrupt"]:
        last_dt = datetime.datetime.fromisoformat(u["last_bankrupt"])
        if now - last_dt < datetime.timedelta(days=7):
            time_left = datetime.timedelta(days=7) - (now - last_dt)
            days = time_left.days
            hours = time_left.seconds // 3600
            return f"Банкротство доступно раз в неделю. Осталось: {days}д {hours}ч"

    db.execute("UPDATE users SET coins=0, last_bankrupt=? WHERE id=?", (now.isoformat(), user.id))
    db.commit()
    return "🏛 Долги списаны. Баланс обнулен до 0."


def do_work(user: types.User) -> str:
    check_and_run_roulette()
    u = get_user(user)
    now = datetime.datetime.now()

    if u["last_work"]:
        last_dt = datetime.datetime.fromisoformat(u["last_work"])
        if now - last_dt < datetime.timedelta(hours=1):
            time_left = datetime.timedelta(hours=1) - (now - last_dt)
            mins, secs = divmod(int(time_left.total_seconds()), 60)
            return f"⏳ Лимит вбросов исчерпан. Ждать: {mins}м {secs}с"

    boost_active = has_boost(u, now)
    success = random.random() < 0.5

    if success:
        gain = 6 if boost_active else 3
        new_coins = u["coins"] + gain
        boost_note = " (буст x2)" if boost_active else ""
        msg = f"💬 Тейк зашел: <b>+{gain}</b>{boost_note}\n🪙 Баланс: <b>{new_coins}</b>"
    else:
        loss = 6 if boost_active else 3
        new_coins = u["coins"] - loss
        boost_note = " (буст x2)" if boost_active else ""
        msg = f"📉 Кринж: <b>-{loss}</b>{boost_note}\n🪙 Баланс: <b>{new_coins}</b>"

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
    await m.reply(f"Баланс изменен: {amount:+d}. Всего: {u['coins']}")


@dp.message(Command("backup"))
async def admin_backup_db(m: types.Message):
    if m.from_user.id != ADMIN_ID:
        return
    if os.path.exists("game.db"):
        await m.answer_document(FSInputFile("game.db"), caption="Резервная копия базы данных")


@dp.message(Command("start"))
async def start(m: types.Message):
    get_user(m.from_user)
    add_activity(m.from_user.id)
    bot_info = await bot.get_me()
    await m.answer(
        f"Бот ПОРОГ Коинов запущен. Напишите <code>@{bot_info.username}</code> в чате.",
        parse_mode="HTML",
    )


@dp.message()
async def handle_all_messages(message: types.Message):
    if not message.from_user or message.from_user.is_bot:
        return

    add_activity(message.from_user.id)
    text_lower = message.text.lower() if message.text else ""

    if text_lower in ["!игра", "игра", "/game"]:
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="🎮 Открыть меню", switch_inline_query_current_chat="")]
            ]
        )
        await message.reply("Игровая экономика канала ПОРОГ:", reply_markup=keyboard)


# ---------- ГЛАВНОЕ ИНЛАЙН-МЕНЮ ----------
@dp.inline_query()
async def inline_query_menu(q: types.InlineQuery):
    add_activity(q.from_user.id)
    check_and_run_roulette()

    uid = q.from_user.id
    u = get_user(q.from_user)
    coins = u["coins"]

    results = [
        article(
            "faq",
            "📌 F.A.Q",
            "О боте ПОРОГ Коинов и правилах",
            (
                "📌 <b>Привет! Это ПОРОГ Коинов</b>\n\n"
                "Добро пожаловать в мини-игру канала ПОРОГ. Здесь можно испытывать удачу, бросать вызовы другим участникам и копить монеты на призы.\n\n"
                "<b>Как всё устроено:</b>\n"
                "• Разработчик: автор канала ПОРОГ\n"
                "• Реальные деньги не используются\n"
                "• Комментарии в канале не начисляют и не списывают монеты\n"
                "• Все игры и покупки проходят только внутри бота по кнопкам"
            ),
        ),
        article(
            "profile",
            "👤 Мой профиль",
            "Статистика, бонус, тейки и банкротство",
            stats_text(q.from_user)
            + "\n\n<i>Бонус растет со стриком до 10 дней. Банкротство обнуляет долги до 0 раз в неделю при минусовом балансе.</i>",
            kb(
                ("🎁 Забрать бонус", f"bonus:{uid}"),
                ("💬 Вбросить тейк", f"work:{uid}"),
                ("🏛 Банкрот", f"bankrupt:{uid}"),
            ),
        ),
        article(
            "casino_duels",
            "🎲 Игры и магазин",
            "Казино, дуэли, рулетка и магазин призов",
            (
                f"🎲 <b>Игры и магазин</b>\n\n"
                f"🪙 Баланс: <b>{coins}</b>\n\n"
                f"<i>В играх доступны ставки 5, 10, 15, 20 и 50. Можно уходить в минус.</i>"
            ),
            kb(
                ("🎰 Казино", f"cas_menu:{uid}"),
                ("⚔️ Дуэль", f"duel_menu:{uid}"),
                ("🎡 Рулетка", f"open_roulette:{uid}"),
                ("🛒 Магазин", f"shop_menu:{uid}"),
            ),
        ),
        article(
            "top",
            "🏆 Таблица лидеров",
            "Топ по монетам и активности",
            top_text(),
        ),
    ]

    await q.answer(results, cache_time=0, is_personal=True)


async def edit(c: types.CallbackQuery, text: str, markup=None):
    await bot.edit_message_text(
        text,
        inline_message_id=c.inline_message_id,
        reply_markup=markup,
        parse_mode="HTML",
    )


@dp.callback_query(F.data.startswith("bonus:"))
async def on_bonus(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    if c.from_user.id != owner:
        return await c.answer("Чужая кнопка", show_alert=True)
    await edit(c, do_bonus(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("work:"))
async def on_work(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    if c.from_user.id != owner:
        return await c.answer("Чужая кнопка", show_alert=True)
    await edit(c, do_work(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("bankrupt:"))
async def on_bankrupt(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    if c.from_user.id != owner:
        return await c.answer("Чужая кнопка", show_alert=True)
    res = do_bankrupt(c.from_user)
    await c.answer(res, show_alert=True)


# ---------- КАЗИНО ----------
@dp.callback_query(F.data.startswith("cas_menu:"))
async def on_casino_menu(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    if c.from_user.id != owner:
        return await c.answer("Чужое меню", show_alert=True)

    u = get_user(c.from_user)
    await edit(
        c,
        f"🎰 <b>Казино</b>\n"
        f"🪙 Баланс: <b>{u['coins']}</b>\n\n"
        f"<i>Красное и черное дают x2, зеленое — x8. Лимит: 10 игр в сутки.</i>\n\n"
        f"Выберите ставку:",
        kb(
            ("5", f"cas_bet:{owner}:5"),
            ("10", f"cas_bet:{owner}:10"),
            ("15", f"cas_bet:{owner}:15"),
            ("20", f"cas_bet:{owner}:20"),
            ("50", f"cas_bet:{owner}:50"),
            ("⬅️ Назад", f"cas_back_main:{owner}"),
        ),
    )
    await c.answer()


@dp.callback_query(F.data.startswith("cas_bet:"))
async def on_casino_bet(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    _, owner_str, bet_str = c.data.split(":")
    owner, bet = int(owner_str), int(bet_str)
    if c.from_user.id != owner:
        return await c.answer("Чужая кнопка", show_alert=True)

    u = get_user(c.from_user)
    now = datetime.datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    casino_count = u["casino_count"] if u["last_casino_date"] == today_str else 0

    if casino_count >= 10:
        midnight = (now + datetime.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        time_left = midnight - now
        hours, remainder = divmod(int(time_left.total_seconds()), 3600)
        mins, _ = divmod(remainder, 60)
        return await c.answer(f"Лимит 10/10 исчерпан. Сброс через {hours}ч {mins}м", show_alert=True)

    await edit(
        c,
        f"🎰 <b>Казино ({casino_count + 1}/10)</b>\n"
        f"Ставка: <b>{bet}</b>\n\n"
        f"Выберите цвет:",
        kb(
            ("🔴 Красное (x2)", f"cas_play:{owner}:{bet}:red"),
            ("⬛️ Черное (x2)", f"cas_play:{owner}:{bet}:black"),
            ("🟢 Зеленое (x8)", f"cas_play:{owner}:{bet}:green"),
            ("⬅️ Назад", f"cas_menu:{owner}"),
        ),
    )
    await c.answer()


@dp.callback_query(F.data.startswith("cas_play:"))
async def on_casino_play(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    _, owner_str, bet_str, color = c.data.split(":")
    owner, bet = int(owner_str), int(bet_str)
    if c.from_user.id != owner:
        return await c.answer("Чужая кнопка", show_alert=True)

    u = get_user(c.from_user)
    now = datetime.datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    casino_count = u["casino_count"] if u["last_casino_date"] == today_str else 0
    if casino_count >= 10:
        return await c.answer("Лимит исчерпан", show_alert=True)

    boost_active = has_boost(u, now)
    new_casino_count = casino_count + 1
    db.execute(
        "UPDATE users SET casino_count=?, last_casino_date=? WHERE id=?",
        (new_casino_count, today_str, owner),
    )
    db.commit()

    await edit(c, "🎰 Крутим рулетку...")
    await asyncio.sleep(1.5)

    roll = random.random()
    if roll < 0.475:
        w_color, emoji, name = "red", "🔴", "Красное"
    elif roll < 0.95:
        w_color, emoji, name = "black", "⬛️", "Черное"
    else:
        w_color, emoji, name = "green", "🟢", "Зеленое"

    c_won_add = u["casino_won"] or 0
    c_lost_add = u["casino_lost"] or 0

    if color == w_color:
        mult = 8 if color == "green" else 2
        base_net_win = bet * (mult - 1)
        extra_win = base_net_win if boost_active else 0
        total_net_win = base_net_win + extra_win

        new_coins = u["coins"] + total_net_win
        c_won_add += total_net_win
        boost_note = f" (буст x2: +{extra_win} из воздуха)" if boost_active else ""
        msg = (
            f"🎰 {emoji} Выпало: <b>{name}</b>\n"
            f"Выигрыш: <b>+{total_net_win}</b>{boost_note}\n"
            f"🪙 Баланс: <b>{new_coins}</b>"
        )
    else:
        total_loss = (bet * 2) if boost_active else bet
        new_coins = u["coins"] - total_loss
        c_lost_add += total_loss
        boost_note = " (буст x2: двойной минус)" if boost_active else ""
        msg = (
            f"🎰 {emoji} Выпало: <b>{name}</b>\n"
            f"Проигрыш: <b>-{total_loss}</b>{boost_note}\n"
            f"🪙 Баланс: <b>{new_coins}</b>"
        )

    db.execute(
        "UPDATE users SET coins=?, casino_won=?, casino_lost=? WHERE id=?",
        (new_coins, c_won_add, c_lost_add, owner),
    )
    db.commit()

    await edit(c, msg, kb(("🎰 Играть еще", f"cas_menu:{owner}"), ("⬅️ Меню", f"cas_back_main:{owner}")))
    await c.answer()


# ---------- ДУЭЛИ (ПРИНЯТИЕ В ЧАТЕ + АВТО-СБРОС ЧЕРЕЗ 10 МИНУТ) ----------
@dp.callback_query(F.data.startswith("duel_menu:"))
async def on_duel_menu(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    if c.from_user.id != owner:
        return await c.answer("Чужое меню", show_alert=True)

    u = get_user(c.from_user)
    await edit(
        c,
        f"⚔️ <b>Дуэль</b>\n"
        f"🪙 Баланс: <b>{u['coins']}</b>\n\n"
        f"<i>Вызов появится в чате. Любой участник может принять его в течение 10 минут, иначе дуэль сгорит.</i>\n\n"
        f"Выберите ставку:",
        kb(
            ("5", f"duel_create:{owner}:5"),
            ("10", f"duel_create:{owner}:10"),
            ("15", f"duel_create:{owner}:15"),
            ("20", f"duel_create:{owner}:20"),
            ("50", f"duel_create:{owner}:50"),
            ("⬅️ Назад", f"cas_back_main:{owner}"),
        ),
    )
    await c.answer()


@dp.callback_query(F.data.startswith("duel_create:"))
async def on_duel_create(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    _, owner_str, bet_str = c.data.split(":")
    owner, bet = int(owner_str), int(bet_str)
    if c.from_user.id != owner:
        return await c.answer("Чужая кнопка", show_alert=True)

    u = get_user(c.from_user)
    now = datetime.datetime.now()

    # Чистим просроченные дуэли (старше 10 минут)
    ten_mins_ago = (now - datetime.timedelta(minutes=10)).isoformat()
    db.execute("DELETE FROM active_duels WHERE created_at < ?", (ten_mins_ago,))

    cursor = db.execute(
        "INSERT INTO active_duels (creator_id, creator_name, bet, created_at) VALUES (?, ?, ?, ?)",
        (owner, u["name"], bet, now.isoformat()),
    )
    db.commit()
    duel_id = cursor.lastrowid

    await edit(
        c,
        f"⚔️ <b>Вызов на дуэль</b>\n\n"
        f"👤 Игрок: <b>{u['name']}</b>\n"
        f"💰 Ставка: <b>{bet}</b>\n\n"
        f"<i>Нажмите кнопку ниже, чтобы принять бой (активно 10 минут):</i>",
        kb(("⚔️ Принять вызов", f"duel_accept:{duel_id}")),
    )
    await c.answer("Вызов опубликован в чате")


@dp.callback_query(F.data.startswith("duel_accept:"))
async def on_duel_accept(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    duel_id = int(c.data.split(":")[1])

    now = datetime.datetime.now()
    ten_mins_ago = (now - datetime.timedelta(minutes=10)).isoformat()
    db.execute("DELETE FROM active_duels WHERE created_at < ?", (ten_mins_ago,))
    db.commit()

    duel = db.execute("SELECT * FROM active_duels WHERE duel_id=?", (duel_id,)).fetchone()
    if not duel:
        await edit(c, "⌛️ <b>Дуэль отменена</b>\n\nПрошло более 10 минут, вызов сгорел.")
        return await c.answer("Дуэль устарела (прошло 10 минут)", show_alert=True)

    if c.from_user.id == duel["creator_id"]:
        return await c.answer("Нельзя принять собственную дуэль", show_alert=True)

    creator = db.execute("SELECT * FROM users WHERE id=?", (duel["creator_id"],)).fetchone()
    acceptor = get_user(c.from_user)
    if not creator:
        db.execute("DELETE FROM active_duels WHERE duel_id=?", (duel_id,))
        db.commit()
        return await c.answer("Инициатор дуэли не найден", show_alert=True)

    bet = duel["bet"]
    db.execute("DELETE FROM active_duels WHERE duel_id=?", (duel_id,))
    db.commit()

    winner, loser = random.choice([(creator, acceptor), (acceptor, creator)])

    loser_boost = has_boost(loser, now)
    loser_loss = (bet * 2) if loser_boost else bet

    winner_boost = has_boost(winner, now)
    winner_gain = (bet * 2) if winner_boost else bet

    if loser["shield_count"] > 0:
        db.execute("UPDATE users SET shield_count=shield_count-1 WHERE id=?", (loser["id"],))
        shield_msg = " (щит защитил от потери)"
    else:
        db.execute("UPDATE users SET coins=coins-?, losses=losses+1 WHERE id=?", (loser_loss, loser["id"]))
        boost_l_note = " (буст x2)" if loser_boost else ""
        shield_msg = f" (-{loser_loss}{boost_l_note})"

    db.execute("UPDATE users SET coins=coins+?, wins=wins+1 WHERE id=?", (winner_gain, winner["id"]))
    db.commit()

    boost_w_note = " (буст x2 из воздуха)" if winner_boost else ""
    await edit(
        c,
        f"⚔️ <b>Итог дуэли</b>\n\n"
        f"Бойцы: {creator['name']} vs {acceptor['name']}\n"
        f"Победитель: <b>{winner['name']}</b> (+{winner_gain}{boost_w_note})\n"
        f"Проигравший: {loser['name']}{shield_msg}",
    )
    await c.answer()


@dp.callback_query(F.data.startswith("cas_back_main:"))
async def on_cas_back_main(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    if c.from_user.id != owner:
        return await c.answer("Чужое меню", show_alert=True)

    u = get_user(c.from_user)
    await edit(
        c,
        f"🎲 <b>Игры и магазин</b>\n\n"
        f"🪙 Баланс: <b>{u['coins']}</b>\n\n"
        f"<i>В играх доступны ставки 5, 10, 15, 20 и 50. Можно уходить в минус.</i>",
        kb(
            ("🎰 Казино", f"cas_menu:{owner}"),
            ("⚔️ Дуэль", f"duel_menu:{owner}"),
            ("🎡 Рулетка", f"open_roulette:{owner}"),
            ("🛒 Магазин", f"shop_menu:{owner}"),
        ),
    )
    await c.answer()


# ---------- РУЛЕТКА ----------
@dp.callback_query(F.data.startswith("open_roulette:"))
async def on_open_roulette(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    if c.from_user.id != owner:
        return await c.answer("Чужое меню", show_alert=True)

    text, markup = get_roulette_content(owner)
    await edit(c, text, markup)
    await c.answer()


@dp.callback_query(F.data.startswith("r_bet:"))
async def on_roulette_bet_inline(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    _, owner_str, amount_str = c.data.split(":")
    owner, amount = int(owner_str), int(amount_str)
    if c.from_user.id != owner:
        return await c.answer("Чужая кнопка", show_alert=True)

    check_and_run_roulette()
    u = get_user(c.from_user)
    new_coins = u["coins"] - amount
    db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, c.from_user.id))

    existing_bid = db.execute("SELECT amount FROM roulette_bids WHERE user_id=?", (c.from_user.id,)).fetchone()
    if existing_bid:
        new_amount = existing_bid["amount"] + amount
        db.execute("UPDATE roulette_bids SET amount=? WHERE user_id=?", (new_amount, c.from_user.id))
    else:
        db.execute(
            "INSERT INTO roulette_bids (user_id, name, amount) VALUES (?, ?, ?)",
            (c.from_user.id, u["name"], amount),
        )

    db.commit()
    text, markup = get_roulette_content(owner)
    await edit(c, text, markup)
    await c.answer(f"Вложено: {amount}")


# ---------- МАГАЗИН ----------
@dp.callback_query(F.data.startswith("shop_menu:"))
async def on_shop_menu(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    if c.from_user.id != owner:
        return await c.answer("Чужое меню", show_alert=True)

    u = get_user(c.from_user)
    coins = u["coins"]
    await edit(
        c,
        f"🛒 <b>Магазин призов</b>\n\n"
        f"🎬 <b>Тема ролика — 5000</b>\n"
        f"<i>Выбор темы для будущего видео на канале</i>\n\n"
        f"🎥 <b>Титры — 2500</b>\n"
        f"<i>Упоминание вашего ника в титрах нового ролика</i>\n\n"
        f"⭐ <b>Telegram Premium — 1600</b>\n"
        f"<i>Месяц подписки в подарок от автора</i>\n\n"
        f"🛡 <b>3 щита — 150</b>\n"
        f"<i>Защищают от потери монет при поражении в дуэлях</i>\n\n"
        f"🎟 <b>Буст x2 (24ч) — 50</b>\n"
        f"<i>Удваивает плюсы (бонус, тейки, победы) из воздуха, но также удваивает минусы и проигрыши</i>\n\n"
        f"🪙 Баланс: <b>{coins}</b>",
        InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="🎬 Тема (5000)", callback_data=f"buy:{owner}:theme")],
                [InlineKeyboardButton(text="🎥 Титры (2500)", callback_data=f"buy:{owner}:mention")],
                [InlineKeyboardButton(text="⭐ Премиум (1600)", callback_data=f"buy:{owner}:tgprem")],
                [InlineKeyboardButton(text="🛡 Щиты (150)", callback_data=f"buy:{owner}:shield")],
                [InlineKeyboardButton(text="🎟 Буст (50)", callback_data=f"buy:{owner}:boost")],
                [InlineKeyboardButton(text="⬅️ Назад", callback_data=f"cas_back_main:{owner}")],
            ]
        ),
    )
    await c.answer()


@dp.callback_query(F.data.startswith("buy:"))
async def on_buy(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    _, owner, item = c.data.split(":")
    owner = int(owner)
    if c.from_user.id != owner:
        return await c.answer("Чужая кнопка", show_alert=True)

    u = get_user(c.from_user)
    coins = u["coins"]
    prices = {"theme": 5000, "mention": 2500, "tgprem": 1600, "shield": 150, "boost": 50}

    price = prices.get(item, 0)
    if coins < price:
        return await c.answer(f"Недостаточно монет. Нужно: {price}", show_alert=True)

    new_coins = coins - price
    user_link = f"<a href='tg://user?id={c.from_user.id}'>{c.from_user.first_name}</a>"
    db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, owner))
    db.commit()

    back_kb = kb(("🛒 В магазин", f"shop_menu:{owner}"), ("⬅️ Меню", f"cas_back_main:{owner}"))

    if item == "theme":
        await edit(c, "🎉 Тема ролика куплена. Уведомление отправлено автору.", back_kb)
        await bot.send_message(ADMIN_ID, f"🚨 Куплена тема ролика (5000):\n👤 {user_link}", parse_mode="HTML")
    elif item == "mention":
        await edit(c, "🎉 Титры куплены. Напишите автору свой ник.", back_kb)
        await bot.send_message(ADMIN_ID, f"🚨 Куплены титры (2500):\n👤 {user_link}", parse_mode="HTML")
    elif item == "tgprem":
        await edit(c, "🎉 Telegram Premium куплен. Ожидайте выдачи.", back_kb)
        await bot.send_message(ADMIN_ID, f"🚨 Куплен Telegram Premium (1600):\n👤 {user_link}", parse_mode="HTML")
    elif item == "shield":
        db.execute("UPDATE users SET shield_count=shield_count+3 WHERE id=?", (owner,))
        db.commit()
        await edit(c, "🛡 Добавлено 3 защитных щита.", back_kb)
    elif item == "boost":
        expiry = (datetime.datetime.now() + datetime.timedelta(days=1)).isoformat()
        db.execute("UPDATE users SET boost_until=? WHERE id=?", (expiry, owner))
        db.commit()
        await edit(c, "🎟 Буст x2 активирован на 24 часа.", back_kb)

    await c.answer()


# ---------- ВЕБ-СЕРВЕР ----------
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
