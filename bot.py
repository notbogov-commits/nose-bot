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
        size INTEGER DEFAULT 1,
        last_grow TEXT,
        last_work TEXT,
        last_trade TEXT,
        debt INTEGER DEFAULT 0,
        debt_time TEXT,
        last_credit_time TEXT,
        bankrupt_used INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS news_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT,
        time TEXT
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


def check_credit_timeout(u: sqlite3.Row):
    if u["debt"] > 0 and u["debt_time"]:
        debt_dt = datetime.datetime.fromisoformat(u["debt_time"])
        now = datetime.datetime.now()
        if now > debt_dt:
            overdue_duration = now - debt_dt
            extra_days = int(overdue_duration.total_seconds() // 86400) + 1
            total_current_debt = CREDIT_DEBT + (extra_days - 1) * 5
            
            if total_current_debt > u["debt"]:
                db.execute("UPDATE users SET debt=? WHERE id=?", (total_current_debt, u["id"]))
                db.commit()


def add_news(text: str):
    now = datetime.datetime.now().isoformat()
    db.execute("INSERT INTO news_log (text, time) VALUES (?, ?)", (text, now))
    db.commit()


def rules_text() -> str:
    return (
        "📜 ПРАВИЛА ИГРЫ:\n\n"
        "1. 👃 <b>Вырастить нос:</b> Раз в сутки (от -5 до +10 см).\n"
        "2. 💼 <b>Подработка:</b> Раз в 6 часов (риск плюс или минус см).\n"
        "3. 🤝 <b>Обмен и Шуллерство:</b> Раз в час. Можно уйти в минус только через неудачное шуллерство (шанс 50/50).\n"
        "4. 🎰 <b>Казино:</b> Ставки доступны только при положительном балансе (нельзя ставить больше, чем есть).\n"
        "5. 💳 <b>Кредит и просрочка:</b> +10 см, вернуть 15 см за 24 часа. Просрочка увеличивает долг на +5 см каждые сутки!\n"
        "6. 📢 <b>Банкротство:</b> Списание долгов при минусе (1 раз).\n"
        "7. 🎯 <b>Дуэли:</b> Ставки сантиметрами. Проигрыш может вогнать в минус."
    )


def stats_text(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)
    return (
        f"📊 Носатая статистика {u['name']}\n"
        f"👃 Носатость: {u['size']} см | 💳 Долг: {u['debt']} см\n"
        f"🏆 Победы: {u['wins']} | Поражения: {u['losses']}"
    )


def top_text() -> str:
    rows = db.execute("SELECT name, size FROM users ORDER BY size DESC LIMIT 5").fetchall()
    if not rows:
        return "Пока никто не мерялся Носатостью"
    lines = [f"{i + 1}. {r['name']} — {r['size']} см" for i, r in enumerate(rows)]
    return "🏆 Топ-5 носатых:\n" + "\n".join(lines)


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
            return f"{u['name']}, ты уже растил нос! Попытка через {hours} ч. {minutes} мин."

    delta = random.randint(GROW_MIN, GROW_MAX)
    event_text = ""
    event_roll = random.random()
    if event_roll < 0.15:
        delta -= 3
        event_text = "\n❄️ Мороз! Нос съежился на 3 см."
    elif event_roll > 0.85:
        delta += 4
        event_text = "\n☀️ Солнечный день! +4 см к Носатости."

    debt = u["debt"]
    note = ""
    if delta > 0 and debt > 0:
        pay = min(debt, delta // 2 or 1)
        delta -= pay
        debt -= pay
        note = f"\nНа погашение кредита ушло {pay} см, долг: {debt} см"

    size = u["size"] + delta
    db.execute("UPDATE users SET size=?, last_grow=?, debt=? WHERE id=?", (size, now.isoformat(), debt, user.id))
    db.commit()
    return f"{u['name']}, Носатость изменилась на {delta:+d} см.{event_text} Теперь: {size} см{note}"


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
            return f"{u['name']}, отдыхай после подработки! Еще {hours} ч. {minutes} мин."

    success = random.random() < 0.55
    if success:
        earned = random.randint(3, 7)
        size = u["size"] + earned
        msg = f"💼 {u['name']} успешно подработал! +{earned} см. Теперь: {size} см"
    else:
        lost = random.randint(2, 5)
        size = u["size"] - lost
        msg = f"💢 {u['name']} прогорел на авантюре! -{lost} см. Теперь: {size} см"

    db.execute("UPDATE users SET size=?, last_work=? WHERE id=?", (size, now.isoformat(), user.id))
    db.commit()
    return msg


def do_trade(user: types.User, target_id: int, amount: int, is_scam: bool) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)

    if u["size"] <= 0 and not is_scam:
        return f"{u['name']}, у тебя нулевой или отрицательный баланс, честный обмен невозможен!"

    now = datetime.datetime.now()
    if u["last_trade"]:
        last_dt = datetime.datetime.fromisoformat(u["last_trade"])
        if now - last_dt < datetime.timedelta(hours=1):
            timeLeft = datetime.timedelta(hours=1) - (now - last_dt)
            mins = int(timeLeft.total_seconds() // 60)
            return f"{u['name']}, обмен доступен раз в час! Подожди еще {mins} мин."

    if not is_scam and u["size"] < amount:
        return f"{u['name']}, у тебя нет столько сантиметров для обмена ({u['size']} из {amount} см)!"

    target = db.execute("SELECT * FROM users WHERE id=?", (target_id,)).fetchone()
    if not target:
        return "Игрок-получатель не найден."

    if user.id == target_id:
        return "Нельзя обмениваться самому с собой!"

    if is_scam:
        if random.random() < 0.5:
            stolen = amount // 2
            sender_new = u["size"] - stolen
            target_new = target["size"] + stolen
            db.execute("UPDATE users SET size=?, last_trade=? WHERE id=?", (sender_new, now.isoformat(), user.id))
            db.execute("UPDATE users SET size=? WHERE id=?", (target_new, target_id))
            db.commit()
            return f"🃏 Шуллерство удалось! Ты отдал всего {stolen} см вместо {amount} см. Баланс: {sender_new} см."
        else:
            penalty = 3
            sender_new = u["size"] - penalty
            db.execute("UPDATE users SET size=?, last_trade=? WHERE id=?", (sender_new, now.isoformat(), user.id))
            db.commit()
            return f"🚨 Шуллера поймали! Сделка отменена. Штраф за аферу: -{penalty} см. Баланс: {sender_new} см."
    else:
        sender_new = u["size"] - amount
        target_new = target["size"] + amount
        db.execute("UPDATE users SET size=?, last_trade=? WHERE id=?", (sender_new, now.isoformat(), user.id))
        db.execute("UPDATE users SET size=? WHERE id=?", (target_new, target_id))
        db.commit()
        return f"🤝 Честный обмен: передано {amount} см игроку {target['name']}. Баланс: {sender_new} см."


def do_roulette(user: types.User, choice: str, bet: int) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)

    # Жесткий лимит: нельзя ставить, если баланс <= 0 или ставка больше баланса
    if u["size"] <= 0:
        return f"{u['name']}, казино закрыто: у тебя нулевой или отрицательный баланс!"
    if u["size"] < bet:
        return f"{u['name']}, нельзя поставить больше, чем есть на балансе ({u['size']} из {bet} см)!"

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
        new_size = u["size"] + (payout - bet)
        msg = f"🎰 Выпало {res_text}. Победа! Выиграно +{payout - bet} см! Баланс: {new_size} см"
    else:
        new_size = u["size"] - bet
        msg = f"🎰 Выпало {res_text}. Проигрыш: -{bet} см. Баланс: {new_size} см"

    db.execute("UPDATE users SET size=? WHERE id=?", (new_size, user.id))
    db.commit()
    return msg


def get_news_text() -> str:
    row = db.execute("SELECT text FROM news_log ORDER BY id DESC LIMIT 1").fetchone()
    if row and random.random() < 0.6:
        return f"📰 НОСАТЫЕ СВОДКИ:\n\n{row['text']}"
    
    jokes = [
        "📰 НОСАТЫЕ СВОДКИ:\n\nПо игре тишина, на рынке стабильный недовес носов.",
        "📰 НОСАТЫЕ СВОДКИ:\n\nОдин добряк попытался вернуть кредит носом, но банк отказал.",
        "📰 НОСАТЫЕ СВОДКИ:\n\nСиноптики предупреждают: длинные носы на морозе лучше прятать."
    ]
    return random.choice(jokes)


def do_credit(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)
    if u["debt"] > 0:
        return f"У тебя уже есть долг: {u['debt']} см!"
    
    now = datetime.datetime.now()
    due_time = now + datetime.timedelta(days=1)
    db.execute("UPDATE users SET size=size+?, debt=?, debt_time=?, last_credit_time=? WHERE id=?",
               (CREDIT_AMOUNT, CREDIT_DEBT, due_time.isoformat(), now.isoformat(), user.id))
    db.commit()
    return f"Кредит получен (+{CREDIT_AMOUNT} см). Вернуть {CREDIT_DEBT} см за 24 часа (иначе пеня +5 см/сутки)!"


def do_pay_credit(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)
    if u["debt"] == 0:
        return "У тебя нет долгов."
    if u["size"] < u["debt"]:
        return f"Не хватает сантиметров для погашения ({u['size']} из {u['debt']} см)."
    
    db.execute("UPDATE users SET size=size-?, debt=0, debt_time=NULL WHERE id=?", (u["debt"], user.id))
    db.commit()
    return "Долг успешно погашен!"


def do_bankrupt(user: types.User) -> str:
    u = get_user(user)
    if u["size"] >= 0:
        return "Банкротство доступно только при отрицательной Носатости!"
    if u["bankrupt_used"] == 1:
        return "Ты уже использовал банкротство."

    db.execute("UPDATE users SET size=0, debt=0, debt_time=NULL, bankrupt_used=1 WHERE id=?", (user.id,))
    db.commit()
    return "Банкротство оформлено! Долги списаны, баланс обнулен."


def article(id_: str, title: str, text: str, markup=None) -> InlineQueryResultArticle:
    return InlineQueryResultArticle(
        id=id_,
        title=title,
        input_message_content=InputTextMessageContent(message_text=text, parse_mode="HTML"),
        reply_markup=markup,
    )


# ---------- ИНЛАЙН-МЕНЮ С ОГРАНИЧЕНИЯМИ СТАВОК ----------
@dp.inline_query()
async def inline_query_menu(q: types.InlineQuery):
    uid = q.from_user.id
    u = get_user(q.from_user)
    check_credit_timeout(u)
    u = get_user(q.from_user)
    
    current_size = u["size"]
    text = q.query.strip()
    bet = int(text) if text.isdigit() and int(text) > 0 else DEFAULT_BET

    results = [
        article("title", "🚨 ВЕЛИКИЙ НОСАТЫЙ ПУТЬ", "✨ Игра <b>«ВЕЛИКИЙ НОСАТЫЙ ПУТЬ»</b>\nВыберите действие в меню:"),
        article("rules", "📜 Правила игры", rules_text()),
        article("news", "📰 Носатые новости", get_news_text()),
        
        article("grow", "👃 Вырастить нос (раз в сутки)", "Тяну нос...",
                kb(("Вырастить 👃", f"grow:{uid}"))),
        article("work", "💼 Подработка (раз в 6 часов)", "Ищу подработку...",
                kb(("Начать подработку 💼", f"work:{uid}"))),
        
        article(
            "trade_menu",
            "🤝 Обмен и Шуллерство (10 см)",
            f"🤝 <b>Обмен сантиметрами</b> (Баланс: {current_size} см)",
            InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(text="🎁 Передать 10 см", callback_data=f"trade:{uid}:10:0"),
                    InlineKeyboardButton(text="🃏 Шуллер 10 см (50%)", callback_data=f"trade:{uid}:10:1")
                ]
            ])
        ),
    ]

    # Казино активно ТОЛЬКО если баланс больше 0
    if current_size > 0:
        results.append(
            article(
                "casino_menu",
                "🎰 Носатое Казино (ставка 10 см)",
                f"🎰 <b>Казино</b> (Баланс: {current_size} см)",
                InlineKeyboardMarkup(inline_keyboard=[
                    [
                        InlineKeyboardButton(text="🔴 Красное (10 см)", callback_data=f"roulette:{uid}:red:10"),
                        InlineKeyboardButton(text="⚫️ Черное (10 см)", callback_data=f"roulette:{uid}:black:10")
                    ],
                    [
                        InlineKeyboardButton(text="🟢 Зеро 14x (10 см)", callback_data=f"roulette:{uid}:zero:10")
                    ]
                ])
            )
        )
    else:
        results.append(
            article("casino_disabled", "🎰 Казино закрыто", "🎰 Казино недоступно: у тебя нулевой или отрицательный баланс!")
        )

    # Проверка для дуэли: если баланс <= 0, дуэль заблокирована
    if current_size > 0:
        duel_markup = kb((f"Принять вызов ({bet} см)", f"duel:{uid}:{bet}"))
        duel_title = f"🎯 Дуэль (ставка: {bet} см)"
        duel_text = f"Дуэль на {bet} см!"
    else:
        duel_markup = None
        duel_title = "🎯 Дуэль заблокирована (нет баланса)"
        duel_text = "Дуэль недоступна: нельзя ставить ставку при нулевом или отрицательном балансе."

    results.extend([
        article("stats", "📊 Моя статистика", stats_text(q.from_user)),
        article("top", "🏆 Топ-5 носатых", top_text()),
        article("duel", duel_title, duel_text, duel_markup),
        article("credit", "💳 Взять кредит (+10 см)", "Беру кредит...",
                kb(("Взять кредит", f"credit:{uid}"))),
        article("pay_credit", "💸 Вернуть кредит", "Возвращаю кредит...",
                kb(("Вернуть долг", f"paycredit:{uid}"))),
        article("bankrupt", "📢 Объявить банкротство", "Банкротство...",
                kb(("Банкротство", f"bankrupt:{uid}"))),
    ])

    await q.answer(results, cache_time=0, is_personal=True)


async def edit(c: types.CallbackQuery, text: str, markup=None):
    await bot.edit_message_text(text, inline_message_id=c.inline_message_id, reply_markup=markup, parse_mode="HTML")


@dp.callback_query(F.data.startswith("grow:"))
async def on_grow(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Не твоя кнопка", show_alert=True)
    await edit(c, do_grow(c.from_user))
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
        return await c.answer("Нет других игроков для обмена!", show_alert=True)
    
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
    if u["size"] <= 0 or u["size"] < int(bet):
        return await c.answer("Недостаточно средств или баланс <= 0!", show_alert=True)

    for frame in ["🎡 Рулетка крутится..."]:
        await edit(c, frame)
        await asyncio.sleep(0.3)

    result_msg = do_roulette(c.from_user, choice, int(bet))
    await edit(c, result_msg)
    await c.answer()


@dp.callback_query(F.data.startswith("credit:"))
async def on_credit(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Не твоя кнопка", show_alert=True)
    await edit(c, do_credit(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("paycredit:"))
async def on_pay_credit(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Не твоя кнопка", show_alert=True)
    await edit(c, do_pay_credit(c.from_user))
    await c.answer()


@dp.callback_query(F.data.startswith("bankrupt:"))
async def on_bankrupt(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Не твоя кнопка", show_alert=True)
    await edit(c, do_bankrupt(c.from_user))
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

    if b["size"] <= 0 or b["size"] < bet:
        return await c.answer("У тебя нет столько сантиметров для ставки в дуэли (баланс должен быть больше 0)!", show_alert=True)
    
    winner, loser = random.choice([(a, b), (b, a)])
    db.execute("UPDATE users SET size=size+?, wins=wins+1 WHERE id=?", (bet, winner["id"]))
    db.execute("UPDATE users SET size=size-?, losses=losses+1 WHERE id=?", (bet, loser["id"]))
    db.commit()
    
    await edit(c, f"⚔️ Победил {winner['name']} и забрал {bet} см у {loser['name']}!")
    await c.answer()


@dp.message(Command("add"))
async def admin_add_size(m: types.Message):
    if m.from_user.id != ADMIN_ID:
        return
    args = m.text.split()
    if len(args) < 2 or not args[1].lstrip("-").isdigit():
        return
    amount = int(args[1])
    db.execute("UPDATE users SET size=size+? WHERE id=?", (amount, m.from_user.id))
    db.commit()
    u = get_user(m.from_user)
    await m.reply(f"👑 Накручено {amount:+d} см. Баланс: {u['size']} см")


@dp.message(Command("start"))
async def start(m: types.Message):
    await m.answer("👋 Игра «ВЕЛИКИЙ НОСАТЫЙ ПУТЬ» открыта. Напиши `@имя_бота` в чате.")


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
