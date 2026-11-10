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
BONUS_MIN, BONUS_MAX = -5, 10
DEFAULT_BET = 10

ADMIN_ID = 9119538825

bot = Bot(TOKEN)
dp = Dispatcher()

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
        last_trade TEXT,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS news_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT,
        time TEXT
    );
    """
)
db.commit()


def get_user(user: types.User) -> sqlite3.Row:
    db.execute(
        "INSERT OR IGNORE INTO users (id, name, coins) VALUES (?, ?, 10)",
        (user.id, user.first_name),
    )
    db.execute("UPDATE users SET name=? WHERE id=?", (user.first_name, user.id))
    db.commit()
    return db.execute("SELECT * FROM users WHERE id=?", (user.id,)).fetchone()


def kb(*buttons: tuple[str, str]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=t, callback_data=d)] for t, d in buttons]
    )


def add_news(text: str):
    now = datetime.datetime.now().isoformat()
    db.execute("INSERT INTO news_log (text, time) VALUES (?, ?)", (text, now))
    db.commit()


def rules_text() -> str:
    return (
        "📜 ПРАВИЛА ИГРЫ:\n\n"
        "1. 🎁 <b>Ежедневный бонус:</b> Получить коины раз в сутки (от -5 до +10).\n"
        "2. 💼 <b>Активность в чате:</b> Подработка раз в 6 часов (риск плюс или минус коины).\n"
        "3. 🃏 <b>Черный рынок обмена:</b> Передавай коины комментаторам или рискуй (шуллерство 50/50, чтобы обмануть и забрать больше).\n"
        "4. 🎰 <b>Казино:</b> Ставки коинами (Красное/Черное 2x, Зеро 14x). Доступно только при плюсовом балансе.\n"
        "5. 🎯 <b>Дуэли мнениями:</b> Ставки коинами 1 на 1 против других подписчиков."
    )


def stats_text(user: types.User) -> str:
    u = get_user(user)
    return (
        f"📊 Статистика комментатора {u['name']}\n"
        f"🪙 Баланс коинов: {u['coins']}\n"
        f"🏆 Победы в дуэлях: {u['wins']} | Поражения: {u['losses']}"
    )


def top_text() -> str:
    rows = db.execute("SELECT name, coins FROM users ORDER BY coins DESC LIMIT 5").fetchall()
    if not rows:
        return "Пока никто не заработал коины"
    lines = [f"{i + 1}. {r['name']} — {r['coins']} коинов" for i, r in enumerate(rows)]
    return "🏆 Топ-5 комментаторов:\n" + "\n".join(lines)


def get_news_text() -> str:
    row = db.execute("SELECT text FROM news_log ORDER BY id DESC LIMIT 1").fetchone()
    if row and random.random() < 0.6:
        return f"📰 НОВОСТИ КАНАЛА:\n\n{row['text']}"
    
    jokes = [
        "📰 НОВОСТИ КАНАЛА:\n\nВ комментариях тишина. Админ опять забыл выпустить мем, все сидят без коинов.",
        "📰 НОВОСТИ КАНАЛА:\n\nСамый душный комментатор недели попытался расплатиться коинами в магазине, но его выгнали за токсичность.",
        "📰 НОВОСТИ КАНАЛА:\n\nСиноптики прогнозируют бурю в комментах: подписчики копят коины для жестких дуэлей."
    ]
    return random.choice(jokes)


# Действия
def do_bonus(user: types.User) -> str:
    u = get_user(user)
    now = datetime.datetime.now()
    if u["last_bonus"]:
        last_dt = datetime.datetime.fromisoformat(u["last_bonus"])
        if now - last_dt < datetime.timedelta(days=1):
            timeLeft = datetime.timedelta(days=1) - (now - last_dt)
            hours, remainder = divmod(int(timeLeft.total_seconds()), 3600)
            mins, _ = divmod(remainder, 60)
            return f"{u['name']}, бонус уже получен! Жди еще {hours} ч. {mins} мин."

    delta = random.randint(BONUS_MIN, BONUS_MAX)
    new_coins = u["coins"] + delta
    db.execute("UPDATE users SET coins=?, last_bonus=? WHERE id=?", (new_coins, now.isoformat(), user.id))
    db.commit()
    return f"{u['name']}, ежедневный бонус принес {delta:+d} коинов! Баланс: {new_coins} 🪙"


def do_work(user: types.User) -> str:
    u = get_user(user)
    now = datetime.datetime.now()
    if u["last_work"]:
        last_dt = datetime.datetime.fromisoformat(u["last_work"])
        if now - last_dt < datetime.timedelta(hours=6):
            timeLeft = datetime.timedelta(hours=6) - (now - last_dt)
            hours, remainder = divmod(int(timeLeft.total_seconds()), 3600)
            mins, _ = divmod(remainder, 60)
            return f"{u['name']}, отдохни от комментов! Следующая активность через {hours} ч. {mins} мин."

    if random.random() < 0.55:
        earned = random.randint(3, 8)
        new_coins = u["coins"] + earned
        msg = f"💼 Отличный высер в комментариях! Тебе накинули +{earned} коинов. Баланс: {new_coins} 🪙"
    else:
        lost = random.randint(2, 5)
        new_coins = u["coins"] - lost
        msg = f"💢 Твой комментарий заминусили! Штраф -{lost} коинов. Баланс: {new_coins} 🪙"

    db.execute("UPDATE users SET coins=?, last_work=? WHERE id=?", (new_coins, now.isoformat(), user.id))
    db.commit()
    return msg


def do_trade(user: types.User, target_id: int, amount: int, is_scam: bool) -> str:
    u = get_user(user)
    if u["coins"] <= 0 and not is_scam:
        return f"{u['name']}, у тебя нулевой или отрицательный баланс коинов!"

    now = datetime.datetime.now()
    if u["last_trade"]:
        last_dt = datetime.datetime.fromisoformat(u["last_trade"])
        if now - last_dt < datetime.timedelta(hours=1):
            timeLeft = datetime.timedelta(hours=1) - (now - last_dt)
            mins = int(timeLeft.total_seconds() // 60)
            return f"{u['name']}, обмениваться можно раз в час! Подожди еще {mins} мин."

    if not is_scam and u["coins"] < amount:
        return f"{u['name']}, у тебя не хватает коинов ({u['coins']} из {amount})!"

    target = db.execute("SELECT * FROM users WHERE id=?", (target_id,)).fetchone()
    if not target or user.id == target_id:
        return "Нельзя провести обмен с этим пользователем."

    if is_scam:
        if random.random() < 0.5:
            stolen = amount // 2
            sender_new = u["coins"] - stolen
            target_new = target["coins"] + stolen
            db.execute("UPDATE users SET coins=?, last_trade=? WHERE id=?", (sender_new, now.isoformat(), user.id))
            db.execute("UPDATE users SET coins=? WHERE id=?", (target_new, target_id))
            db.commit()
            return f"🃏 Шуллерство удалость! Ты отдал всего {stolen} коинов вместо {amount}. Баланс: {sender_new} 🪙"
        else:
            penalty = 3
            sender_new = u["coins"] - penalty
            db.execute("UPDATE users SET coins=?, last_trade=? WHERE id=?", (sender_new, now.isoformat(), user.id))
            db.commit()
            return f"🚨 Тебя поймали за накруткой! Штраф за попытку обмана: -{penalty} коинов. Баланс: {sender_new} 🪙"
    else:
        sender_new = u["coins"] - amount
        target_new = target["coins"] + amount
        db.execute("UPDATE users SET coins=?, last_trade=? WHERE id=?", (sender_new, now.isoformat(), user.id))
        db.execute("UPDATE users SET coins=? WHERE id=?", (target_new, target_id))
        db.commit()
        return f"🤝 Передано {amount} коинов комментатору {target['name']}. Баланс: {sender_new} 🪙"


def do_roulette(user: types.User, choice: str, bet: int) -> str:
    u = get_user(user)
    if u["coins"] <= 0 or u["coins"] < bet:
        return f"{u['name']}, недостаточно коинов для ставки (баланс должен быть больше 0)!"

    roll_num = random.randint(0, 36)
    if roll_num == 0:
        res_text = "🟢 ЗЕРО (0)"
        won = (choice == "zero")
        payout = bet * 14
    elif roll_num % 2 != 0:
        res_text = f"🔴 Красное ({roll_num})"
        won = (choice == "red")
        payout = bet * 2
    else:
        res_text = f"⚫️ Черное ({roll_num})"
        won = (choice == "black")
        payout = bet * 2

    if won:
        new_coins = u["coins"] + (payout - bet)
        msg = f"🎰 Выпало {res_text}. Победа! Выиграно +{payout - bet} коинов! Баланс: {new_coins} 🪙"
        if bet >= 25:
            add_news(f"🏆 Крупный куш в казино: {u['name']} поднял {payout} коинов!")
    else:
        new_coins = u["coins"] - bet
        msg = f"🎰 Выпало {res_text}. Проигрыш: -{bet} коинов. Баланс: {new_coins} 🪙"

    db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, user.id))
    db.commit()
    return msg


def article(id_: str, title: str, text: str, markup=None) -> InlineQueryResultArticle:
    return InlineQueryResultArticle(
        id=id_,
        title=title,
        input_message_content=InputTextMessageContent(message_text=text, parse_mode="HTML"),
        reply_markup=markup,
    )


# ---------- КОМПАКТНОЕ МЕНЮ ДЛЯ КОММЕНТАТОРОВ ----------
@dp.inline_query()
async def inline_query_menu(q: types.InlineQuery):
    uid = q.from_user.id
    u = get_user(q.from_user)
    coins = u["coins"]
    text = q.query.strip()
    bet = int(text) if text.isdigit() and int(text) > 0 else DEFAULT_BET

    results = [
        article("title", "💬 РЕЙТИНГ КОММЕНТАТОРОВ", "✨ Игра для комьюнити <b>«РЕЙТИНГ КОММЕНТАТОРОВ»</b>\nВыбирай действие ниже:"),
        article("rules", "📜 Правила игры", rules_text()),
        article("news", "📰 Новости канала", get_news_text()),
        
        article("bonus", "🎁 Ежедневный бонус", "Получаю бонус...",
                kb(("Забрать бонус 🎁", f"bonus:{uid}"))),
        article("work", "💼 Активность в чате", "Пишу коммент...",
                kb(("Написать коммент 💼", f"work:{uid}"))),
        
        article(
            "trade_menu",
            "🃏 Черный рынок (обмен 10 коинов)",
            f"🤝 <b>Обмен коинами</b> (Баланс: {coins} 🪙)",
            InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(text="🎁 Передать 10", callback_data=f"trade:{uid}:10:0"),
                    InlineKeyboardButton(text="🃏 Шуллер 10 (50%)", callback_data=f"trade:{uid}:10:1")
                ]
            ])
        ),
    ]

    if coins > 0:
        results.append(
            article(
                "casino_menu",
                "🎰 Коин-Казино (ставка 10 коинов)",
                f"🎰 <b>Казино</b> (Баланс: {coins} 🪙)",
                InlineKeyboardMarkup(inline_keyboard=[
                    [
                        InlineKeyboardButton(text="🔴 Красное (10)", callback_data=f"roulette:{uid}:red:10"),
                        InlineKeyboardButton(text="⚫️ Черное (10)", callback_data=f"roulette:{uid}:black:10")
                    ],
                    [
                        InlineKeyboardButton(text="🟢 Зеро 14x (10)", callback_data=f"roulette:{uid}:zero:10")
                    ]
                ])
            )
        )
    else:
        results.append(
            article("casino_disabled", "🎰 Казино закрыто", "Казино недоступно: у тебя 0 или меньше коинов.")
        )

    duel_markup = kb((f"Принять вызов ({bet} 🪙)", f"duel:{uid}:{bet}")) if coins > 0 else None
    duel_title = f"🎯 Дуэль мнениями (ставка: {bet} коинов)" if coins > 0 else "🎯 Дуэль заблокирована (нет коинов)"

    results.extend([
        article("stats", "📊 Моя статистика", stats_text(q.from_user)),
        article("top", "🏆 Топ-5 комментаторов", top_text()),
        article("duel", duel_title, "Дуэль комментаторов!", duel_markup),
    ])

    await q.answer(results, cache_time=0, is_personal=True)


async def edit(c: types.CallbackQuery, text: str, markup=None):
    await bot.edit_message_text(text, inline_message_id=c.inline_message_id, reply_markup=markup, parse_mode="HTML")


@dp.callback_query(F.data.startswith("bonus:"))
async def on_bonus(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Не твоя кнопка", show_alert=True)
    await edit(c, do_bonus(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("work:"))
async def on_work(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Не твоя кнопка", show_alert=True)
    await edit(c, do_work(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("trade:"))
async def on_trade(c: types.CallbackQuery):
    _, owner, amount, is_scam = c.data.split(":")
    if c.from_user.id != int(owner):
        return await c.answer("Не твоя кнопка", show_alert=True)
    
    other_users = db.execute("SELECT id, name FROM users WHERE id != ?", (c.from_user.id,)).fetchall()
    if not other_users:
        return await c.answer("Нет других комментаторов для обмена!", show_alert=True)
    
    target = random.choice(other_users)
    result_msg = do_trade(c.from_user, target["id"], int(amount), bool(int(is_scam)))
    await edit(c, result_msg)
    await c.answer()


@dp.callback_query(F.data.startswith("roulette:"))
async def on_roulette(c: types.CallbackQuery):
    _, owner, choice, bet = c.data.split(":")
    if c.from_user.id != int(owner):
        return await c.answer("Не твоя кнопка", show_alert=True)
    
    u = get_user(c.from_user)
    if u["coins"] <= 0 or u["coins"] < int(bet):
        return await c.answer("Недостаточно коинов!", show_alert=True)

    for frame in ["🎡 Рулетка крутится..."]:
        await edit(c, frame)
        await asyncio.sleep(0.3)

    result_msg = do_roulette(c.from_user, choice, int(bet))
    await edit(c, result_msg)
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
        return await c.answer("Игрок не найден", show_alert=True)

    if b["coins"] <= 0 or b["coins"] < bet:
        return await c.answer("Недостаточно коинов для дуэли!", show_alert=True)
    
    winner, loser = random.choice([(a, b), (b, a)])
    db.execute("UPDATE users SET coins=coins+?, wins=wins+1 WHERE id=?", (bet, winner["id"]))
    db.execute("UPDATE users SET coins=coins-?, losses=losses+1 WHERE id=?", (bet, loser["id"]))
    db.commit()
    
    await edit(c, f"⚔️ В дуэли мнений победил {winner['name']} и забрал {bet} 🪙 у {loser['name']}!")
    await c.answer()


@dp.message(Command("add"))
async def admin_add_coins(m: types.Message):
    if m.from_user.id != ADMIN_ID:
        return
    args = m.text.split()
    if len(args) < 2 or not args[1].lstrip("-").isdigit():
        return
    amount = int(args[1])
    db.execute("UPDATE users SET coins=coins+? WHERE id=?", (amount, m.from_user.id))
    db.commit()
    u = get_user(m.from_user)
    await m.reply(f"👑 Админ-накрутка: {amount:+d} коинов. Баланс: {u['coins']} 🪙")


@dp.message(Command("start"))
async def start(m: types.Message):
    await m.answer("👋 Бот рейтинга комментаторов запущен! Напиши `@имя_бота` в любом чате канала.")


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
