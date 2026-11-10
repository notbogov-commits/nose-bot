import asyncio
import datetime
import os
import random
import sqlite3

from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQueryResultArticle,
    InputTextMessageContent,
)
from aiohttp import web

TOKEN = os.getenv("BOT_TOKEN", "9119538825:AAGOh9D2ok-bAP9u8kYi_NijCJr5gyNiK8g")
GROW_MIN, GROW_MAX = -5, 10
CREDIT_AMOUNT = 10
CREDIT_DEBT = 15
DEFAULT_BET = 10
PROMOS = {"start": 5, "welcome": 3}

bot = Bot(TOKEN)
dp = Dispatcher()

db = sqlite3.connect("game.db")
db.row_factory = sqlite3.Row
db.executescript(
    """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        size INTEGER DEFAULT 1,
        last_grow TEXT,
        last_work TEXT,
        last_scam TEXT,
        debt INTEGER DEFAULT 0,
        debt_time TEXT,
        last_credit_time TEXT,
        bankrupt_used INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS promo_used (
        user_id INTEGER,
        code TEXT,
        PRIMARY KEY (user_id, code)
    );
    """
)
db.commit()


def get_user(user: types.User) -> sqlite3.Row:
    db.execute(
        "INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)",
        (user.id, user.first_name),
    )
    db.execute("UPDATE users SET name=? WHERE id=?", (user.first_name, user.id))
    db.commit()
    return db.execute("SELECT * FROM users WHERE id=?", (user.id,)).fetchone()


def kb(*buttons: tuple[str, str]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=t, callback_data=d)] for t, d in buttons]
    )


# Проверка просрочки кредита с прогрессивным штрафом (+5 см за каждые просроченные сутки)
def check_credit_timeout(u: sqlite3.Row):
    if u["debt"] > 0 and u["debt_time"]:
        debt_dt = datetime.datetime.fromisoformat(u["debt_time"])
        now = datetime.datetime.now()
        if now > debt_dt:
            overdue_duration = now - debt_dt
            extra_days = int(overdue_duration.total_seconds() // 86400) + 1
            total_current_debt = CREDIT_DEBT + (extra_days - 1) * 5
            
            if total_current_debt > u["debt"]:
                db.execute(
                    "UPDATE users SET debt=? WHERE id=?",
                    (total_current_debt, u["id"])
                )
                db.commit()


def do_grow(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)

    now = datetime.datetime.now()
    if u["last_grow"]:
        last_grow_dt = datetime.datetime.fromisoformat(u["last_grow"])
        if now - last_grow_dt < datetime.timedelta(days=1):
            timeLeft = datetime.timedelta(days=1) - (now - last_grow_dt)
            hours, remainder = divmod(int(timeLeft.total_seconds()), 3600)
            minutes, _ = divmod(remainder, 60)
            return f"{u['name']}, ты уже тянул нос недавно! Следующая попытка через {hours} ч. {minutes} мин."

    delta = random.randint(GROW_MIN, GROW_MAX)
    event_text = ""
    event_roll = random.random()
    if event_roll < 0.15:
        delta -= 3
        event_text = "\n❄️ На улице мороз! Нос съежился на 3 см."
    elif event_roll > 0.85:
        delta += 4
        event_text = "\n☀️ Солнечный день! Нос отлично подрос еще на 4 см."

    debt = u["debt"]
    note = ""
    if delta > 0 and debt > 0:
        pay = min(debt, delta // 2 or 1)
        delta -= pay
        debt -= pay
        note = f"\nНа погашение кредита ушло {pay} см, долг: {debt} см"

    size = u["size"] + delta
    db.execute(
        "UPDATE users SET size=?, last_grow=?, debt=? WHERE id=?",
        (size, now.isoformat(), debt, user.id),
    )
    db.commit()
    return f"{u['name']}, размер изменился на {delta:+d} см.{event_text} Теперь: {size} см{note}"


# Подработка (раз в 6 часов)
def do_work(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)

    now = datetime.datetime.now()
    if u["last_work"]:
        last_work_dt = datetime.datetime.fromisoformat(u["last_work"])
        if now - last_work_dt < datetime.timedelta(hours=6):
            timeLeft = datetime.timedelta(hours=6) - (now - last_work_dt)
            hours, remainder = divmod(int(timeLeft.total_seconds()), 3600)
            minutes, _ = divmod(remainder, 60)
            return f"{u['name']}, ты еще не отдохнул после прошлой подработки! Жди еще {hours} ч. {minutes} мин."

    success = random.random() < 0.55
    if success:
        earned = random.randint(3, 7)
        size = u["size"] + earned
        result_msg = f"💼 {u['name']} успешно подработал! Нос вырос на +{earned} см. Теперь: {size} см"
    else:
        lost = random.randint(2, 5)
        size = u["size"] - lost
        result_msg = f"💢 {u['name']} прогорел на авантюре! Нос уменьшился на -{lost} см. Теперь: {size} см"

    db.execute("UPDATE users SET size=?, last_work=? WHERE id=?", (size, now.isoformat(), user.id))
    db.commit()
    return result_msg


# Шуллерский обмен (раз в 12 часов)
def do_scam(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)

    now = datetime.datetime.now()
    if u["last_scam"]:
        last_scam_dt = datetime.datetime.fromisoformat(u["last_scam"])
        if now - last_scam_dt < datetime.timedelta(hours=12):
            timeLeft = datetime.timedelta(hours=12) - (now - last_scam_dt)
            hours, remainder = divmod(int(timeLeft.total_seconds()), 3600)
            minutes, _ = divmod(remainder, 60)
            return f"{u['name']}, шуллерское чутье молчит. Следующая афера через {hours} ч. {minutes} мин."

    roll = random.random()
    if roll < 0.40:
        gain = random.randint(5, 8)
        size = u["size"] + gain
        msg = f"🃏 {u['name']} провел дерзкую аферу на черном рынке и обвел всех вокруг пальца! +{gain} см. Теперь: {size} см"
    elif roll < 0.75:
        gain = random.randint(2, 3)
        size = u["size"] + gain
        msg = f"🤝 {u['name']} провел стандартный обмен носами без фокусов. +{gain} см. Теперь: {size} см"
    else:
        lost = 5
        size = u["size"] - lost
        msg = f"🚨 Шуллера поймали за руку во время обмена! Позорный штраф -{lost} см. Теперь: {size} см"

    db.execute("UPDATE users SET size=?, last_scam=? WHERE id=?", (size, now.isoformat(), user.id))
    db.commit()
    return msg


def do_credit(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)

    if u["debt"] > 0:
        return f"{u['name']}, у тебя уже есть активный долг: {u['debt']} см!"

    if u["last_credit_time"]:
        last_cred = datetime.datetime.fromisoformat(u["last_credit_time"])
        if datetime.datetime.now() - last_cred < datetime.timedelta(days=7):
            return f"{u['name']}, брать кредит можно только 1 раз в неделю!"

    now = datetime.datetime.now()
    due_time = now + datetime.timedelta(days=1)
    
    db.execute(
        "UPDATE users SET size=size+?, debt=?, debt_time=?, last_credit_time=? WHERE id=?",
        (CREDIT_AMOUNT, CREDIT_DEBT, due_time.isoformat(), now.isoformat(), user.id),
    )
    db.commit()
    return f"{u['name']} взял кредит: +{CREDIT_AMOUNT} см. Вернуть нужно {CREDIT_DEBT} см ровно за 24 часа! Просрочка: +5 см каждые сутки."


def do_pay_credit(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)

    if u["debt"] == 0:
        return f"{u['name']}, у тебя нет активных долгов."
    
    debt_amt = u["debt"]
    if u["size"] < debt_amt:
        return f"{u['name']}, у тебя не хватает сантиметров на носу, чтобы погасить долг ({u['size']} из {debt_amt} см)."

    db.execute("UPDATE users SET size=size-?, debt=0, debt_time=NULL WHERE id=?", (debt_amt, user.id))
    db.commit()
    return f"{u['name']} успешно погасил долг в размере {debt_amt} см!"


def do_bankrupt(user: types.User) -> str:
    u = get_user(user)
    if u["size"] >= 0:
        return f"{u['name']}, банкротство доступно только игрокам с отрицательным балансом!"
    if u["bankrupt_used"] == 1:
        return f"{u['name']}, ты уже использовал банкротство ранее."

    db.execute("UPDATE users SET size=0, debt=0, debt_time=NULL, bankrupt_used=1 WHERE id=?", (user.id,))
    db.commit()
    return f"📢 {u['name']} объявил себя банкротом! Долги списаны, нос обнулен до 0 см."


def do_promo(user: types.User, code: str) -> str:
    u = get_user(user)
    bonus = PROMOS.get(code)
    if bonus is None:
        return "Такого промокода нет"
    used = db.execute("SELECT 1 FROM promo_used WHERE user_id=? AND code=?", (user.id, code)).fetchone()
    if used:
        return f"{u['name']}, этот промокод уже использован"
    db.execute("INSERT INTO promo_used VALUES (?, ?)", (user.id, code))
    db.execute("UPDATE users SET size=size+? WHERE id=?", (bonus, user.id))
    db.commit()
    return f"{u['name']} активировал промокод и получил +{bonus} см!"


def top_text() -> str:
    rows = db.execute("SELECT name, size FROM users ORDER BY size DESC LIMIT 10").fetchall()
    if not rows:
        return "Пока никто не играл"
    lines = [f"{i + 1}. {r['name']} — {r['size']} см" for i, r in enumerate(rows)]
    return "🏆 Топ носов чата:\n" + "\n".join(lines)


def top_wins_text() -> str:
    rows = db.execute("SELECT name, wins FROM users WHERE wins > 0 ORDER BY wins DESC LIMIT 10").fetchall()
    if not rows:
        return "Пока нет побед в дуэлях"
    lines = [f"{i + 1}. {r['name']} — {r['wins']} поб." for i, r in enumerate(rows)]
    return "⚔️ Топ дуэлянтов:\n" + "\n".join(lines)


def stats_text(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)
    return (
        f"📊 Статистика игрока {u['name']}\n"
        f"👃 Размер носа: {u['size']} см\n"
        f"💳 Долг: {u['debt']} см\n"
        f"🏆 Победы: {u['wins']} | Поражения: {u['losses']}"
    )


def rules_text() -> str:
    return (
        "📜 ПРАВИЛА ИГРЫ:\n\n"
        "1. 👃 **Вырастить нос:** Раз в сутки (от -5 до +10 см).\n"
        "2. 💼 **Подработка:** Раз в 6 часов (риск плюс или минус см).\n"
        "3. 🃏 **Шуллерский обмен:** Раз в 12 часов. Афера с риском обмануть систему или спалиться на штраф.\n"
        "4. 💳 **Кредит:** +10 см, вернуть 15 см за 24 часа.\n"
        "5. ⚠️ **Просрочка:** За каждые лишние сутки долг растет еще на +5 см.\n"
        "6. 📢 **Банкротство:** Списание долгов при минусе (1 раз).\n"
        "7. 🎯 **Дуэли:** Ставки сантиметрами против игроков."
    )


def article(id_: str, title: str, text: str, markup=None) -> InlineQueryResultArticle:
    return InlineQueryResultArticle(
        id=id_,
        title=title,
        input_message_content=InputTextMessageContent(message_text=text),
        reply_markup=markup,
    )


# ---------- МЕНЮ С НЕКЛИКАБЕЛЬНЫМ НАЗВАНИЕМ В САМОМ ВЕРХУ ----------
@dp.inline_query()
async def inline_query_menu(q: types.InlineQuery):
    uid = q.from_user.id
    text = q.query.strip()
    bet = int(text) if text.isdigit() and int(text) > 0 else DEFAULT_BET

    results = [
        # Некликабельный заголовок в самом верху чата
        article("title", "👃 «Великий Носатый Путь»", "✨ Добро пожаловать в игру «Великий Носатый Путь»!\nВыбери нужный пункт меню ниже:"),
        
        # Основные разделы игры
        article("grow", "👃 Вырастить нос (раз в сутки)", "Тяну нос...",
                kb(("Вырастить 👃", f"grow:{uid}"))),
        article("work", "💼 Подработка (раз в 6 часов)", "Ищу подработку...",
                kb(("Начать подработку 💼", f"work:{uid}"))),
        article("scam", "🃏 Шуллерский обмен (раз в 12 часов)", "Провожу аферу...",
                kb(("Рискнуть / Обменять 🃏", f"scam:{uid}"))),
        article("stats", "📊 Моя статистика", stats_text(q.from_user)),
        article("top", "🏆 Топ носов", top_text()),
        article("topwins", "⚔️ Топ дуэлянтов", top_wins_text()),
        article("duel", f"🎯 Дуэль (ставка: {bet} см)", f"{q.from_user.first_name} вызывает на дуэль! Ставка: {bet} см",
                kb((f"Принять вызов ({bet} см)", f"duel:{uid}:{bet}"))),
        article("credit", "💳 Взять кредит (+10 см)", "Беру кредит...",
                kb(("Взять кредит", f"credit:{uid}"))),
        article("pay_credit", "💸 Вернуть кредит", "Возвращаю кредит...",
                kb(("Вернуть долг", f"paycredit:{uid}"))),
        article("bankrupt", "📢 Объявить банкротство", "Оформляю банкротство...",
                kb(("Банкротство (- баланс)", f"bankrupt:{uid}"))),
        article("rules", "📜 Правила игры", rules_text()),
    ]
    if text.lower() in PROMOS:
        results.insert(
            1,  ж  # Вставляем сразу после некликабельного заголовка
            article("promo", f"🎁 Промокод: {text.lower()}", "Активирую...",
                    kb(("Активировать", f"promo:{uid}:{text.lower()}"))),
        )
    await q.answer(results, cache_time=0, is_personal=True)


async def edit(c: types.CallbackQuery, text: str, markup=None):
    await bot.edit_message_text(text, inline_message_id=c.inline_message_id, reply_markup=markup)


@dp.callback_query(F.data.startswith("grow:"))
async def on_grow(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    await edit(c, do_grow(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("work:"))
async def on_work(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    await edit(c, do_work(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("scam:"))
async def on_scam(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    await edit(c, do_scam(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("credit:"))
async def on_credit(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    await edit(c, do_credit(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("paycredit:"))
async def on_pay_credit(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    await edit(c, do_pay_credit(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("bankrupt:"))
async def on_bankrupt(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    await edit(c, do_bankrupt(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("promo:"))
async def on_promo(c: types.CallbackQuery):
    _, owner, code = c.data.split(":", 2)
    if c.from_user.id != int(owner):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    await edit(c, do_promo(c.from_user, code))
    await c.answer()


@dp.callback_query(F.data.startswith("duel:"))
async def on_duel(c: types.CallbackQuery):
    _, owner, bet = c.data.split(":")
    owner, bet = int(owner), int(bet)
    if c.from_user.id == owner:
        return await c.answer("Нельзя принять свой же вызов", show_alert=True)

    a = db.execute("SELECT * FROM users WHERE id=?", (owner,)).fetchone()
    b = get_user(c.from_user)
    if a is None:
        return await c.answer("Игрок не найден", show_alert=True)
    
    winner, loser = random.choice([(a, b), (b, a)])
    db.execute("UPDATE users SET size=size+?, wins=wins+1 WHERE id=?", (bet, winner["id"]))
    db.execute("UPDATE users SET size=size-?, losses=losses+1 WHERE id=?", (bet, loser["id"]))
    db.commit()
    await edit(
        c,
        f"⚔️ Дуэль завершена!\n{a['name']} против {b['name']}\n🏆 Победил {winner['name']} и забрал {bet} см у {loser['name']}!",
    )
    await c.answer()


@dp.message(Command("start"))
async def start(m: types.Message):
    await m.answer("👋 Привет! Это игра «Великий Носатый Путь».\nНапиши `@имя_бота` в любом чате, чтобы открыть меню.")


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
    asyncio.run(main())import asyncio
import datetime
import os
import random
import sqlite3

from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQueryResultArticle,
    InputTextMessageContent,
)
from aiohttp import web

TOKEN = os.getenv("BOT_TOKEN", "9119538825:AAGOh9D2ok-bAP9u8kYi_NijCJr5gyNiK8g")
GROW_MIN, GROW_MAX = -5, 10
CREDIT_AMOUNT = 10
CREDIT_DEBT = 15
DEFAULT_BET = 10
PROMOS = {"start": 5, "welcome": 3}

bot = Bot(TOKEN)
dp = Dispatcher()

db = sqlite3.connect("game.db")
db.row_factory = sqlite3.Row
db.executescript(
    """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        size INTEGER DEFAULT 1,
        last_grow TEXT,
        debt INTEGER DEFAULT 0,
        debt_time TEXT,
        last_credit_time TEXT,
        bankrupt_used INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS promo_used (
        user_id INTEGER,
        code TEXT,
        PRIMARY KEY (user_id, code)
    );
    """
)
db.commit()


def get_user(user: types.User) -> sqlite3.Row:
    db.execute(
        "INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)",
        (user.id, user.first_name),
    )
    db.execute("UPDATE users SET name=? WHERE id=?", (user.first_name, user.id))
    db.commit()
    return db.execute("SELECT * FROM users WHERE id=?", (user.id,)).fetchone()


def kb(*buttons: tuple[str, str]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=t, callback_data=d)] for t, d in buttons]
    )


# Проверка просрочки кредита с прогрессивным штрафом (+5 см за каждые просроченные сутки)
def check_credit_timeout(u: sqlite3.Row):
    if u["debt"] > 0 and u["debt_time"]:
        debt_dt = datetime.datetime.fromisoformat(u["debt_time"])
        now = datetime.datetime.now()
        if now > debt_dt:
            overdue_duration = now - debt_dt
            extra_days = int(overdue_duration.total_seconds() // 86400) + 1
            total_current_debt = CREDIT_DEBT + (extra_days - 1) * 5
            
            if total_current_debt > u["debt"]:
                db.execute(
                    "UPDATE users SET debt=? WHERE id=?",
                    (total_current_debt, u["id"])
                )
                db.commit()


def do_grow(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)

    now = datetime.datetime.now()
    if u["last_grow"]:
        last_grow_dt = datetime.datetime.fromisoformat(u["last_grow"])
        if now - last_grow_dt < datetime.timedelta(days=1):
            timeLeft = datetime.timedelta(days=1) - (now - last_grow_dt)
            hours, remainder = divmod(int(timeLeft.total_seconds()), 3600)
            minutes, _ = divmod(remainder, 60)
            return f"{u['name']}, ты уже тянул нос недавно! Следующая попытка через {hours} ч. {minutes} мин."

    delta = random.randint(GROW_MIN, GROW_MAX)
    event_text = ""
    event_roll = random.random()
    if event_roll < 0.15:
        delta -= 3
        event_text = "\n❄️ На улице мороз! Нос съежился на 3 см."
    elif event_roll > 0.85:
        delta += 4
        event_text = "\n☀️ Солнечный день! Нос отлично подрос еще на 4 см."

    debt = u["debt"]
    note = ""
    if delta > 0 and debt > 0:
        pay = min(debt, delta // 2 or 1)
        delta -= pay
        debt -= pay
        note = f"\nНа погашение кредита ушло {pay} см, долг: {debt} см"

    size = u["size"] + delta
    db.execute(
        "UPDATE users SET size=?, last_grow=?, debt=? WHERE id=?",
        (size, now.isoformat(), debt, user.id),
    )
    db.commit()
    return f"{u['name']}, размер изменился на {delta:+d} см.{event_text} Теперь: {size} см{note}"


def do_credit(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)

    if u["debt"] > 0:
        return f"{u['name']}, у тебя уже есть активный долг: {u['debt']} см!"

    if u["last_credit_time"]:
        last_cred = datetime.datetime.fromisoformat(u["last_credit_time"])
        if datetime.datetime.now() - last_cred < datetime.timedelta(days=7):
            return f"{u['name']}, брать кредит можно только 1 раз в неделю!"

    now = datetime.datetime.now()
    due_time = now + datetime.timedelta(days=1)
    
    db.execute(
        "UPDATE users SET size=size+?, debt=?, debt_time=?, last_credit_time=? WHERE id=?",
        (CREDIT_AMOUNT, CREDIT_DEBT, due_time.isoformat(), now.isoformat(), user.id),
    )
    db.commit()
    return f"{u['name']} взял кредит: +{CREDIT_AMOUNT} см. Вернуть нужно {CREDIT_DEBT} см ровно за 24 часа! За каждый просроченный день долг будет расти на +5 см."


def do_pay_credit(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)

    if u["debt"] == 0:
        return f"{u['name']}, у тебя нет активных долгов."
    
    debt_amt = u["debt"]
    if u["size"] < debt_amt:
        return f"{u['name']}, у тебя не хватает сантиметров на носу, чтобы погасить долг ({u['size']} из {debt_amt} см)."

    db.execute(
        "UPDATE users SET size=size-?, debt=0, debt_time=NULL WHERE id=?",
        (debt_amt, user.id)
    )
    db.commit()
    return f"{u['name']} успешно погасил долг в размере {debt_amt} см!"


def do_bankrupt(user: types.User) -> str:
    u = get_user(user)
    if u["size"] >= 0:
        return f"{u['name']}, банкротство доступно только игрокам с отрицательным балансом!"
    if u["bankrupt_used"] == 1:
        return f"{u['name']}, ты уже использовал банкротство ранее."

    db.execute(
        "UPDATE users SET size=0, debt=0, debt_time=NULL, bankrupt_used=1 WHERE id=?",
        (user.id,)
    )
    db.commit()
    return f"📢 {u['name']} объявил себя банкротом! Долги списаны, а размер носа обнулен до 0 см."


def do_promo(user: types.User, code: str) -> str:
    u = get_user(user)
    bonus = PROMOS.get(code)
    if bonus is None:
        return "Такого промокода нет"
    used = db.execute(
        "SELECT 1 FROM promo_used WHERE user_id=? AND code=?", (user.id, code)
    ).fetchone()
    if used:
        return f"{u['name']}, этот промокод уже использован"
    db.execute("INSERT INTO promo_used VALUES (?, ?)", (user.id, code))
    db.execute("UPDATE users SET size=size+? WHERE id=?", (bonus, user.id))
    db.commit()
    return f"{u['name']} активировал промокод и получил +{bonus} см!"


def top_text() -> str:
    rows = db.execute("SELECT name, size FROM users ORDER BY size DESC LIMIT 10").fetchall()
    if not rows:
        return "Пока никто не играл"
    lines = [f"{i + 1}. {r['name']} — {r['size']} см" for i, r in enumerate(rows)]
    return "🏆 Топ носов чата:\n" + "\n".join(lines)


def top_wins_text() -> str:
    rows = db.execute(
        "SELECT name, wins FROM users WHERE wins > 0 ORDER BY wins DESC LIMIT 10"
    ).fetchall()
    if not rows:
        return "Пока нет побед в дуэлях"
    lines = [f"{i + 1}. {r['name']} — {r['wins']} поб." for i, r in enumerate(rows)]
    return "⚔️ Топ дуэлянтов:\n" + "\n".join(lines)


def stats_text(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)
    return (
        f"📊 Статистика игрока {u['name']}\n"
        f"👃 Размер носа: {u['size']} см\n"
        f"💳 Долг: {u['debt']} см\n"
        f"🏆 Победы: {u['wins']} | Поражения: {u['losses']}"
    )


def rules_text() -> str:
    return (
        "📜 ПРАВИЛА ИГРЫ:\n\n"
        "1. 👃 **Вырастить нос:** можно раз в сутки (24 часа).\n"
        "2. 💳 **Кредит:** дает +10 см, вернуть нужно 15 см за 24 часа. За каждые просроченные сутки долг растет еще на +5 см!\n"
        "3. 💸 **Вернуть кредит:** досрочно через кнопку в меню.\n"
        "4. 📢 **Банкротство:** сброс долгов при отрицательном балансе (1 раз).\n"
        "5. 🎯 **Дуэли:** соревнуйся с другими игроками на сантиметры."
    )


def article(id_: str, title: str, text: str, markup=None) -> InlineQueryResultArticle:
    return InlineQueryResultArticle(
        id=id_,
        title=title,
        input_message_content=InputTextMessageContent(message_text=text),
        reply_markup=markup,
    )


# ---------- ЛОГИЧЕСКИ ВЫСТРОЕННОЕ ИНЛАЙН-МЕНЮ ----------
@dp.inline_query()
async def inline_menu(q: types.InlineQuery):
    uid = q.from_user.id
    text = q.query.strip()
    bet = int(text) if text.isdigit() and int(text) > 0 else DEFAULT_BET

    results = [
        # 1. Основное действие
        article("grow", "👃 Вырастить нос (раз в сутки)", "Тяну нос...",
                kb(("Вырастить 👃", f"grow:{uid}"))),
        # 2. Личное
        article("stats", "📊 Моя статистика", stats_text(q.from_user)),
        # 3. Рейтинги / Топы
        article("top", "🏆 Топ носов", top_text()),
        article("topwins", "⚔️ Топ дуэлянтов", top_wins_text()),
        # 4. Активность (Дуэли)
        article(
            "duel",
            f"🎯 Дуэль (ставка: {bet} см)",
            f"{q.from_user.first_name} вызывает на дуэль! Ставка: {bet} см",
            kb((f"Принять вызов ({bet} см)", f"duel:{uid}:{bet}"))),
        # 5. Финансы и долги
        article("credit", "💳 Взять кредит (+10 см)", "Беру кредит...",
                kb(("Взять кредит", f"credit:{uid}"))),
        article("pay_credit", "💸 Вернуть кредит", "Возвращаю кредит...",
                kb(("Вернуть долг", f"paycredit:{uid}"))),
        article("bankrupt", "📢 Объявить банкротство", "Оформляю банкротство...",
                kb(("Банкротство (- баланс)", f"bankrupt:{uid}"))),
        # 6. Справочная информация
        article("rules", "📜 Правила игры", rules_text()),
    ]
    if text.lower() in PROMOS:
        results.insert(
            0,
            article("promo", f"🎁 Промокод: {text.lower()}", "Активирую...",
                    kb(("Активировать", f"promo:{uid}:{text.lower()}"))),
        )
    await q.answer(results, cache_time=0, is_personal=True)


async def edit(c: types.CallbackQuery, text: str, markup=None):
    await bot.edit_message_text(
        text, inline_message_id=c.inline_message_id, reply_markup=markup
    )


@dp.callback_query(F.data.startswith("grow:"))
async def on_grow(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    await edit(c, do_grow(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("credit:"))
async def on_credit(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    await edit(c, do_credit(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("paycredit:"))
async def on_pay_credit(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    await edit(c, do_pay_credit(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("bankrupt:"))
async def on_bankrupt(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    await edit(c, do_bankrupt(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("promo:"))
async def on_promo(c: types.CallbackQuery):
    _, owner, code = c.data.split(":", 2)
    if c.from_user.id != int(owner):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    await edit(c, do_promo(c.from_user, code))
    await c.answer()


@dp.callback_query(F.data.startswith("duel:"))
async def on_duel(c: types.CallbackQuery):
    _, owner, bet = c.data.split(":")
    owner, bet = int(owner), int(bet)
    if c.from_user.id == owner:
        return await c.answer("Нельзя принять свой же вызов", show_alert=True)

    a = db.execute("SELECT * FROM users WHERE id=?", (owner,)).fetchone()
    b = get_user(c.from_user)
    if a is None:
        return await c.answer("Игрок не найден", show_alert=True)
    
    winner, loser = random.choice([(a, b), (b, a)])
    db.execute("UPDATE users SET size=size+?, wins=wins+1 WHERE id=?", (bet, winner["id"]))
    db.execute("UPDATE users SET size=size-?, losses=losses+1 WHERE id=?", (bet, loser["id"]))
    db.commit()
    await edit(
        c,
        f"⚔️ Дуэль завершена!\n{a['name']} против {b['name']}\n🏆 Победил {winner['name']} и забрал {bet} см у {loser['name']}!",
    )
    await c.answer()


@dp.message(Command("start"))
async def start(m: types.Message):
    await m.answer("👋 Привет! Это бот носатых рекордов.\nНапиши `@имя_бота` в любом чате, чтобы открыть меню.")


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
