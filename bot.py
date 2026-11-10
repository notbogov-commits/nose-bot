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

# ---------- НАСТРОЙКИ ----------
TOKEN = os.getenv("BOT_TOKEN", "9119538825:AAGOh9D2ok-bAP9u8kYi_NijCJr5gyNiK8g")
GROW_MIN, GROW_MAX = -5, 10      # диапазон ежедневного изменения (см)
CREDIT_AMOUNT = 10               # сколько дает кредит
CREDIT_DEBT = 15                 # сколько нужно вернуть
DEFAULT_BET = 10                 # ставка по умолчанию в дуэли
PROMOS = {"start": 5, "welcome": 3}  # промокоды
# --------------------------------

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


# Проверка просрочки кредита (вызывается при действиях игрока)
def check_credit_timeout(u: sqlite3.Row):
    if u["debt"] > 0 and u["debt_time"]:
        debt_dt = datetime.datetime.fromisoformat(u["debt_time"])
        if datetime.datetime.now() > debt_dt:
            # Время вышло! Снимаем долг с носа (уменьшаем размер, может уйти в минус)
            new_size = u["size"] - u["debt"]
            db.execute(
                "UPDATE users SET size=?, debt=0, debt_time=NULL WHERE id=?",
                (new_size, u["id"])
            )
            db.commit()
            return True
    return False


# ---------- ЛОГИКА ИГРЫ ----------
def do_grow(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user) # обновляем данные после проверки долга

    now = datetime.datetime.now()
    today_str = str(now.date())
    
    # Проверка: выращивать можно раз в сутки (24 часа)
    if u["last_grow"]:
        last_grow_dt = datetime.datetime.fromisoformat(u["last_grow"])
        if now - last_grow_dt < datetime.timedelta(days=1):
            timeLeft = datetime.timedelta(days=1) - (now - last_grow_dt)
            hours, remainder = divmod(int(timeLeft.total_seconds()), 3600)
            minutes, _ = divmod(remainder, 60)
            return f"{u['name']}, ты уже тянул нос недавно! Следующая попытка через {hours} ч. {minutes} мин."

    delta = random.randint(GROW_MIN, GROW_MAX)
    
    # Случайные события
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

    size = u["size"] + delta # теперь размер может уходить в минус
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

    # Проверка кулдауна кредита (раз в неделю)
    if u["last_credit_time"]:
        last_cred = datetime.datetime.fromisoformat(u["last_credit_time"])
        if datetime.datetime.now() - last_cred < datetime.timedelta(days=7):
            return f"{u['name']}, брать кредит можно только 1 раз в неделю!"

    now = datetime.datetime.now()
    due_time = now + datetime.timedelta(days=1) # Срок отдать — сутки (24 часа)
    
    db.execute(
        "UPDATE users SET size=size+?, debt=?, debt_time=?, last_credit_time=? WHERE id=?",
        (CREDIT_AMOUNT, CREDIT_DEBT, due_time.isoformat(), now.isoformat(), user.id),
    )
    db.commit()
    return f"{u['name']} взял кредит: +{CREDIT_AMOUNT} см. Вернуть нужно {CREDIT_DEBT} см ровно за 24 часа, иначе нос уменьшится!"


def do_pay_credit(user: types.User) -> str:
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
        return f"{u['name']}, банкротство доступно только игрокам с отрицательным балансом (минусом на носу)!"
    if u["bankrupt_used"] == 1:
        return f"{u['name']}, ты уже использовал банкротство ранее. Второй шанс дают только раз в жизни!"

    db.execute(
        "UPDATE users SET size=0, debt=0, debt_time=NULL, bankrupt_used=1 WHERE id=?",
        (user.id,)
    )
    db.commit()
    return f"📢 {u['name']} объявил себя банкротом! Долги списаны, а размер носа обнулен до 0 см. Больше так рисковать нельзя!"


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
        "1. 👃 **Вырастить нос:** можно раз в сутки (24 часа). Нос может как вырасти, так и уменьшиться (или попасть под погоду).\n"
        "2. 💳 **Кредит:** дает +10 см, но вернуть нужно 15 см ровно за 24 часа. Если не успеешь — долг автоматически отнимется от твоего носа (можно уйти в минус!). Кредит доступен раз в неделю.\n"
        "3. 💸 **Вернуть кредит:** можно досрочно через специальную кнопку в меню.\n"
        "4. 📢 **Банкротство:** если у тебя ушел баланс в минус, ты можешь 1 раз за всю игру объявить банкротство — долг сгорит, а баланс станет 0.\n"
        "5. 🎯 **Дуэли:** соревнуйся с другими игроками на сантиметры и забирай победы!"
    )


def article(id_: str, title: str, text: str, markup=None) -> InlineQueryResultArticle:
    return InlineQueryResultArticle(
        id=id_,
        title=title,
        input_message_content=InputTextMessageContent(message_text=text),
        reply_markup=markup,
    )


# ---------- МИНИМАЛИСТИЧНОЕ ИНЛАЙН-МЕНЮ ----------
@dp.inline_query()
async def inline_menu(q: types.InlineQuery):
    uid = q.from_user.id
    text = q.query.strip()
    bet = int(text) if text.isdigit() and int(text) > 0 else DEFAULT_BET

    results = [
        article("grow", "👃 Вырастить нос (раз в сутки)", "Тяну нос...",
                kb(("Вырастить 👃", f"grow:{uid}"))),
        article("top", "🏆 Топ носов", top_text()),
        article("topwins", "⚔️ Топ дуэлянтов", top_wins_text()),
        article("credit", "💳 Взять кредит (+10 см)", "Беру кредит...",
                kb(("Взять кредит", f"credit:{uid}"))),
        article("pay_credit", "💸 Вернуть кредит", "Возвращаю кредит...",
                kb(("Вернуть долг", f"paycredit:{uid}"))),
        article("bankrupt", "📢 Объявить банкротство", "Оформляю банкротство...",
                kb(("Банкротство (- баланс)", f"bankrupt:{uid}"))),
        article("stats", "📊 Моя статистика", stats_text(q.from_user)),
        article("rules", "📜 Правила игры", rules_text()),
        article(
            "duel",
            f"🎯 Дуэль (ставка: {bet} см)",
            f"{q.from_user.first_name} вызывает на дуэль! Ставка: {bet} см",
            kb((f"Принять вызов ({bet} см)", f"duel:{uid}:{bet}"))),
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
    
    # Разрешаем дуэли даже при минусовом балансе (или с ограничением)
    winner, loser = random.choice([(a, b), (b, a)])
    db.execute("UPDATE users SET size=size+?, wins=wins+1 WHERE id=?", (bet, winner["id"]))
    db.execute("UPDATE users SET size=size-?, losses=losses+1 WHERE id=?", (bet, loser["id"]))
    db.commit()
    await edit(
        c,
        f"⚔️ Дуэль завершена!\n"
        f"{a['name']} против {b['name']}\n"
        f"🏆 Победил {winner['name']} и забрал {bet} см у {loser['name']}!",
    )
    await c.answer()


@dp.message(Command("start"))
async def start(m: types.Message):
    await m.answer(
        "👋 Привет! Это бот носатых рекордов.\n"
        "Напиши `@имя_бота` в любом чате, чтобы открыть меню."
    )


async def main():
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())