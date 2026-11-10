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

# Твой Telegram ID для админ-команд
ADMIN_ID = 9119538825

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


# Правила без звездочек с жирными тегами <b> и пунктом про просрочку
def rules_text() -> str:
    return (
        "📜 ПРАВИЛА ИГРЫ:\n\n"
        "1. 👃 <b>Вырастить нос:</b> Раз в сутки (от -5 до +10 см).\n"
        "2. 💼 <b>Подработка:</b> Раз в 6 часов (риск плюс или минус см).\n"
        "3. 🤝 <b>Обмен и Шуллерство:</b> Раз в час можно передать см другому игроку. Можно включить шуллерство (шанс 50/50 обмануть и забрать больше или спалиться и отменить сделку).\n"
        "4. 🎰 <b>Казино:</b> Ставки от своего баланса на Красное (2x), Чёрное (2x) или Зеро (14x).\n"
        "5. 💳 <b>Кредит:</b> +10 см, вернуть 15 см за 24 часа.\n"
        "6. ⚠️ <b>Просрочка:</b> Если не вернуть кредит ровно за сутки, долг автоматически увеличивается еще на +5 см за каждые просроченные сутки!\n"
        "7. 📢 <b>Банкротство:</b> Списание долгов при минусе (1 раз).\n"
        "8. 🎯 <b>Дуэли:</b> Ставки сантиметрами против игроков."
    )


def stats_text(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)
    return (
        f"📊 Носатая статистика {u['name']}\n"
        f"👃 Носатость: {u['size']} см\n"
        f"💳 Долг: {u['debt']} см\n"
        f"🏆 Победы: {u['wins']} | Поражения: {u['losses']}"
    )


def top_text() -> str:
    rows = db.execute("SELECT name, size FROM users ORDER BY size DESC LIMIT 10").fetchall()
    if not rows:
        return "Пока никто не мерялся Носатостью"
    lines = [f"{i + 1}. {r['name']} — {r['size']} см Носатости" for i, r in enumerate(rows)]
    return "🏆 Носатый топ чата:\n" + "\n".join(lines)


def top_wins_text() -> str:
    rows = db.execute("SELECT name, wins FROM users WHERE wins > 0 ORDER BY wins DESC LIMIT 10").fetchall()
    if not rows:
        return "Пока нет побед в дуэлях"
    lines = [f"{i + 1}. {r['name']} — {r['wins']} поб." for i, r in enumerate(rows)]
    return "⚔️ Топ Носатых дуэлянтов:\n" + "\n".join(lines)


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
        msg = f"💼 {u['name']} успешно подработал! Носатость выросла на +{earned} см. Теперь: {size} см"
    else:
        lost = random.randint(2, 5)
        size = u["size"] - lost
        msg = f"💢 {u['name']} прогорел на авантюре! Носатость уменьшилась на -{lost} см. Теперь: {size} см"

    db.execute("UPDATE users SET size=?, last_work=? WHERE id=?", (size, now.isoformat(), user.id))
    db.commit()
    return msg


def do_trade(user: types.User, target_id: int, amount: int, is_scam: bool) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)

    now = datetime.datetime.now()
    if u["last_trade"]:
        last_dt = datetime.datetime.fromisoformat(u["last_trade"])
        if now - last_dt < datetime.timedelta(hours=1):
            timeLeft = datetime.timedelta(hours=1) - (now - last_dt)
            mins = int(timeLeft.total_seconds() // 60)
            return f"{u['name']}, обмен доступен раз в час! Подожди еще {mins} мин."

    if u["size"] < amount:
        return f"{u['name']}, у тебя нет столько сантиметров для обмена ({u['size']} из {amount} см)!"

    target = db.execute("SELECT * FROM users WHERE id=?", (target_id,)).fetchone()
    if not target:
        return "Игрок-получатель не найден в базе игры."

    if user.id == target_id:
        return "Нельзя обмениваться самому с собой!"

    if is_scam:
        success_scam = random.random() < 0.5
        if success_scam:
            stolen = amount // 2
            sender_new = u["size"] - stolen
            target_new = target["size"] + stolen
            db.execute("UPDATE users SET size=?, last_trade=? WHERE id=?", (sender_new, now.isoformat(), user.id))
            db.execute("UPDATE users SET size=? WHERE id=?", (target_new, target_id))
            db.commit()
            add_news(f"🃏 Дерзкий шуллер: {u['name']} обманул при обмене с {target['name']} и сэкономил см!")
            return f"🃏 {u['name']} попытался кинуть партнера... и шуллерство удалось! Ты отдал всего {stolen} см вместо {amount} см. Баланс: {sender_new} см."
        else:
            penalty = 3
            sender_new = u["size"] - penalty
            db.execute("UPDATE users SET size=?, last_trade=? WHERE id=?", (sender_new, now.isoformat(), user.id))
            db.commit()
            add_news(f"🚨 Позор шуллеру: {u['name']} спалился при обмене с {target['name']} и получил штраф!")
            return f"🚨 Шуллера поймали за руку! Партнер раскусил обман, сделка отменена. Штраф за попытку аферы: -{penalty} см. Баланс: {sender_new} см."
    else:
        sender_new = u["size"] - amount
        target_new = target["size"] + amount
        db.execute("UPDATE users SET size=?, last_trade=? WHERE id=?", (sender_new, now.isoformat(), user.id))
        db.execute("UPDATE users SET size=? WHERE id=?", (target_new, target_id))
        db.commit()
        return f"🤝 Честный обмен завершен! {u['name']} передал {amount} см игроку {target['name']}. Твой баланс: {sender_new} см."


def do_roulette(user: types.User, choice: str, bet: int) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)

    if u["size"] < bet:
        return f"{u['name']}, недостаточно Носатости для ставки ({u['size']} из {bet} см)!"

    roll_num = random.randint(0, 36)
    if roll_num == 0:
        res_color = "zero"
        res_text = "🟢 ЗЕРО (0)"
    elif roll_num % 2 != 0:
        res_color = "red"
        res_text = f"🔴 Красное ({roll_num})"
    else:
        res_color = "black"
        res_text = f"⚫️ Черное ({roll_num})"

    won = False
    payout = 0
    if choice == "red" and res_color == "red":
        won = True
        payout = bet * 2
    elif choice == "black" and res_color == "black":
        won = True
        payout = bet * 2
    elif choice == "zero" and res_color == "zero":
        won = True
        payout = bet * 14

    if won:
        new_size = u["size"] + (payout - bet)
        msg = f"🎰 Рулетка крутанулась! Выпало: {res_text}.\n🎉 Поздравляем, {u['name']} сорвал куш и выиграл +{payout - bet} см Носатости!"
        if bet >= 25 or payout >= 100:
            add_news(f"🏆 Крупный куш в казино: {u['name']} поднял {payout} см на рулетке!")
    else:
        new_size = u["size"] - bet
        msg = f"🎰 Рулетка крутанулась! Выпало: {res_text}.\n💸 Увы, {u['name']} проиграл ставку и лишился -{bet} см Носатости."

    db.execute("UPDATE users SET size=? WHERE id=?", (new_size, user.id))
    db.commit()
    return msg


def get_news_text() -> str:
    row = db.execute("SELECT text FROM news_log ORDER BY id DESC LIMIT 1").fetchone()
    if row and random.random() < 0.6:
        return f"📰 НОСАТЫЕ СВОДКИ:\n\n{row['text']}"
    
    jokes = [
        "📰 НОСАТЫЕ СВОДКИ:\n\nПо игре тишина, на рынке стабильный недовес. Говорят, патологоанатомы в моргах начали подрабатывать шуллерством — носы воруют чище, чем кредиторы.",
        "📰 НОСАТЫЕ СВОДКИ:\n\nНовостей ноль. Один добряк попытался вернуть кредит носом, но банк отказал, сославшись на то, что бэушные носы второй свежести им не нужны.",
        "📰 НОСАТЫЕ СВОДКИ:\n\nВ чате затишье. Синоптики объявили штормовое предупреждение: у кого длинный нос — прячьте на улице, иначе коммунальщики примут за сосульки и сбьют лопатой.",
        "📰 НОСАТЫЕ СВОДКИ:\n\nНичего нового. Одинокие носатые граждане нашли утешение в кредитах: хоть где-то тебя имеют бесплатно и регулярно."
    ]
    return random.choice(jokes)


def do_credit(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)

    if u["debt"] > 0:
        return f"{u['name']}, у тебя уже есть долг: {u['debt']} см!"

    if u["last_credit_time"]:
        last_cred = datetime.datetime.fromisoformat(u["last_credit_time"])
        if datetime.datetime.now() - last_cred < datetime.timedelta(days=7):
            return f"{u['name']}, кредит доступен 1 раз в неделю!"

    now = datetime.datetime.now()
    due_time = now + datetime.timedelta(days=1)
    db.execute("UPDATE users SET size=size+?, debt=?, debt_time=?, last_credit_time=? WHERE id=?",
               (CREDIT_AMOUNT, CREDIT_DEBT, due_time.isoformat(), now.isoformat(), user.id))
    db.commit()
    return f"{u['name']} взял кредит (+{CREDIT_AMOUNT} см). Вернуть {CREDIT_DEBT} см ровно за 24 часа! (Просрочка: +5 см каждые сутки)."


def do_pay_credit(user: types.User) -> str:
    u = get_user(user)
    check_credit_timeout(u)
    u = get_user(user)

    if u["debt"] == 0:
        return f"{u['name']}, у тебя нет долгов."
    
    debt_amt = u["debt"]
    if u["size"] < debt_amt:
        return f"{u['name']}, не хватает Носатости для погашения ({u['size']} из {debt_amt} см)."

    db.execute("UPDATE users SET size=size-?, debt=0, debt_time=NULL WHERE id=?", (debt_amt, user.id))
    db.commit()
    return f"{u['name']} успешно погасил долг ({debt_amt} см)!"


def do_bankrupt(user: types.User) -> str:
    u = get_user(user)
    if u["size"] >= 0:
        return f"{u['name']}, банкротство доступно только при отрицательной Носатости!"
    if u["bankrupt_used"] == 1:
        return f"{u['name']}, ты уже использовал банкротство."

    db.execute("UPDATE users SET size=0, debt=0, debt_time=NULL, bankrupt_used=1 WHERE id=?", (user.id,))
    db.commit()
    return f"📢 {u['name']} объявил банкротство! Долги списаны, Носатость обнулена до 0 см."


def do_promo(user: types.User, code: str) -> str:
    u = get_user(user)
    bonus = PROMOS.get(code)
    if bonus is None:
        return "Такого промокода нет"
    used = db.execute("SELECT 1 FROM promo_used WHERE user_id=? AND code=?", (user.id, code)).fetchone()
    if used:
        return f"{u['name']}, промокод уже использован"
    db.execute("INSERT INTO promo_used VALUES (?, ?)", (user.id, code))
    db.execute("UPDATE users SET size=size+? WHERE id=?", (bonus, user.id))
    db.commit()
    return f"{u['name']} активировал промокод (+{bonus} см Носатости)!"


def article(id_: str, title: str, text: str, markup=None) -> InlineQueryResultArticle:
    return InlineQueryResultArticle(
        id=id_,
        title=title,
        input_message_content=InputTextMessageContent(message_text=text, parse_mode="HTML"),
        reply_markup=markup,
    )


# ---------- ИНЛАЙН-МЕНЮ ----------
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
        article("title", "🚨 ВЕЛИКИЙ НОСАТЫЙ ПУТЬ", "✨ Игра <b>«ВЕЛИКИЙ НОСАТЫЙ ПУТЬ»</b>\nВыберите нужное действие в меню ниже:"),
        article("rules", "📜 Правила игры", rules_text()),
        article("news", "📰 Носатые новости", get_news_text()),
        article("grow", "👃 Вырастить нос (раз в сутки)", "Тяну нос...",
                kb(("Вырастить 👃", f"grow:{uid}"))),
        article("work", "💼 Подработка (раз в 6 часов)", "Ищу подработку...",
                kb(("Начать подработку 💼", f"work:{uid}"))),
        
        article(
            "trade_menu",
            "🤝 Обмен и Шуллерство (раз в час)",
            f"🤝 <b>Черный рынок обмена</b>\nТвой баланс: {current_size} см.\nВыбери сумму для передачи другу:",
            InlineKeyboardMarkup(inline_keyboard=[
                [
                    InlineKeyboardButton(text="🎁 Передать 5 см", callback_data=f"trade:{uid}:5:0"),
                    InlineKeyboardButton(text="🃏 Шуллер 5 см (50%)", callback_data=f"trade:{uid}:5:1")
                ],
                [
                    InlineKeyboardButton(text="🎁 Передать 10 см", callback_data=f"trade:{uid}:10:0"),
                    InlineKeyboardButton(text="🃏 Шуллер 10 см (50%)", callback_data=f"trade:{uid}:10:1")
                ],
                [
                    InlineKeyboardButton(text="🎁 Передать 25 см", callback_data=f"trade:{uid}:25:0"),
                    InlineKeyboardButton(text="🃏 Шуллер 25 см (50%)", callback_data=f"trade:{uid}:25:1")
                ]
            ])
        ),
    ]

    if current_size > 0:
        results.append(
            article(
                "casino_menu",
                "🎰 Носатое Казино (выбор ставки)",
                f"🎰 <b>Носатое Казино</b>\nТвой баланс: {current_size} см.\nВыберите сумму ставки для игры:",
                InlineKeyboardMarkup(inline_keyboard=[
                    [
                        InlineKeyboardButton(text="5 см 🔴/⚫️/🟢", callback_data=f"casinobet:{uid}:5"),
                        InlineKeyboardButton(text="10 см 🔴/⚫️/🟢", callback_data=f"casinobet:{uid}:10"),
                        InlineKeyboardButton(text="25 см 🔴/⚫️/🟢", callback_data=f"casinobet:{uid}:25")
                    ],
                    [
                        InlineKeyboardButton(text="50 см 🔴/⚫️/🟢", callback_data=f"casinobet:{uid}:50"),
                        InlineKeyboardButton(text="100 см 🔴/⚫️/🟢", callback_data=f"casinobet:{uid}:100"),
                        InlineKeyboardButton(text="1000 см 🔴/⚫️/🟢", callback_data=f"casinobet:{uid}:1000")
                    ]
                ])
            )
        )
    else:
        results.append(
            article(
                "casino_disabled",
                "🎰 Казино заблокировано (нужен баланс > 0)",
                "🎰 Казино недоступно: у тебя нулевой или отрицательный баланс носатости! Сначала подзаработай или возьми кредит."
            )
        )

    results.extend([
        article("stats", "📊 Моя статистика", stats_text(q.from_user)),
        article("top", "🏆 Носатый топ", top_text()),
        article("topwins", "⚔️ Топ дуэлянтов", top_wins_text()),
        article("duel", f"🎯 Дуэль (ставка: {bet} см)", f"{q.from_user.first_name} вызывает на дуэль! Ставка: {bet} см",
                kb((f"Принять вызов ({bet} см)", f"duel:{uid}:{bet}"))),
        article("credit", "💳 Взять кредит (+10 см)", "Беру кредит...",
                kb(("Взять кредит", f"credit:{uid}"))),
        article("pay_credit", "💸 Вернуть кредит", "Возвращаю кредит...",
                kb(("Вернуть долг", f"paycredit:{uid}"))),
        article("bankrupt", "📢 Объявить банкротство", "Оформляю банкротство...",
                kb(("Банкротство (- баланс)", f"bankrupt:{uid}"))),
    ])

    if text.lower() in PROMOS:
        results.insert(
            3,
            article("promo", f"🎁 Промокод: {text.lower()}", "Активирую...",
                    kb(("Активировать", f"promo:{uid}:{text.lower()}"))),
        )
    await q.answer(results, cache_time=0, is_personal=True)


async def edit(c: types.CallbackQuery, text: str, markup=None):
    await bot.edit_message_text(text, inline_message_id=c.inline_message_id, reply_markup=markup, parse_mode="HTML")


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


@dp.callback_query(F.data.startswith("trade:"))
async def on_trade(c: types.CallbackQuery):
    _, owner, amount, is_scam = c.data.split(":")
    if c.from_user.id != int(owner):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    
    amt = int(amount)
    scam = bool(int(is_scam))

    other_users = db.execute("SELECT id, name FROM users WHERE id != ?", (c.from_user.id,)).fetchall()
    if not other_users:
        return await c.answer("В игре пока нет других участников для обмена!", show_alert=True)
    
    target = random.choice(other_users)
    result_msg = do_trade(c.from_user, target["id"], amt, scam)
    await edit(c, result_msg)
    await c.answer()


@dp.callback_query(F.data.startswith("casinobet:"))
async def on_casino_bet(c: types.CallbackQuery):
    _, owner, bet_amt = c.data.split(":")
    if c.from_user.id != int(owner):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    
    u = get_user(c.from_user)
    bet = int(bet_amt)
    if u["size"] < bet:
        return await c.answer(f"Недостаточно Носатости! У тебя {u['size']} см, а ставка {bet} см.", show_alert=True)

    uid = c.from_user.id
    markup = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=f"🔴 На Красное ({bet} см)", callback_data=f"roulette:{uid}:red:{bet}")],
        [InlineKeyboardButton(text=f"⚫️ На Черное ({bet} см)", callback_data=f"roulette:{uid}:black:{bet}")],
        [InlineKeyboardButton(text=f"🟢 На ЗЕРО 14x ({bet} см)", callback_data=f"roulette:{uid}:zero:{bet}")]
    ])
    await edit(c, f"🎰 <b>Казино</b>\nСтавка выбрана: <b>{bet} см</b>.\nТеперь выберите исход:", markup)
    await c.answer()


@dp.callback_query(F.data.startswith("roulette:"))
async def on_roulette(c: types.CallbackQuery):
    _, owner, choice, bet = c.data.split(":")
    if c.from_user.id != int(owner):
        return await c.answer("Это не твоя кнопка", show_alert=True)
    
    u = get_user(c.from_user)
    b = int(bet)
    if u["size"] < b:
        return await c.answer("Баланс изменился, недостаточно средств!", show_alert=True)

    for frame in ["🎡 Рулетка крутится... [🔴 Красное?]", "🎡 Рулетка крутится... [⚫️ Черное?]", "🎡 Рулетка крутится... [🟢 ЗЕРО? Лонг-драйв...]"]:
        await edit(c, frame)
        await asyncio.sleep(0.3)

    result_msg = do_roulette(c.from_user, choice, b)
    await edit(c, result_msg)
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
    
    duel_res = f"⚔️ Дуэль завершена!\n{a['name']} против {b['name']}\n🏆 Победил {winner['name']} и забрал {bet} см Носатости у {loser['name']}!"
    add_news(f"🎯 Дуэльная бойня: {winner['name']} ободрал {loser['name']} на {bet} см Носатости!")
    
    await edit(c, duel_res)
    await c.answer()


@dp.message(Command("add"))
async def admin_add_size(m: types.Message):
    if m.from_user.id != ADMIN_ID:
        return
    
    args = m.text.split()
    if len(args) < 2 or not args[1].lstrip("-").isdigit():
        return await m.reply("Использование: `/add [число]`", parse_mode="Markdown")

    amount = int(args[1])
    u = get_user(m.from_user)
    db.execute("UPDATE users SET size=size+? WHERE id=?", (amount, m.from_user.id))
    db.commit()
    
    updated_user = db.execute("SELECT size FROM users WHERE id=?", (m.from_user.id,)).fetchone()
    await m.reply(f"👑 Админ-накрутка: Носатость изменена на {amount:+d} см. Текущая Носатость: {updated_user['size']} см")


@dp.message(Command("start"))
async def start(m: types.Message):
    await m.answer("👋 Привет! Это игра «ВЕЛИКИЙ НОСАТЫЙ ПУТЬ».\nНапиши `@имя_бота` в любом чате, чтобы открыть меню.")


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
