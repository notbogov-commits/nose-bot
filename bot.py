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
DEFAULT_BET = 5  # Базовая ставка 5 коинов
ADMIN_ID = 1642626687  # Твой ID

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
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        shield_count INTEGER DEFAULT 0,
        boost_until TEXT,
        custom_status TEXT
    );
    CREATE TABLE IF NOT EXISTS invited_users (
        user_id INTEGER PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS legacy_balances (
        name TEXT PRIMARY KEY,
        coins INTEGER
    );
    """
)

# Список игроков для восстановления балансов
INITIAL_LEGACY_USERS = [
    ("Влад", 100),
    ("Igroniz", 66),
    ("", 33),
    ("𝒹𝑒𝒻𝒻𝒶𝑒𝓉 𝓂𝒶𝓂𝒶", 23),
    ("Лучший из Лучших 🤗", 22),
    ("Vyrichol", 20),
    ("темщица 91", 20),
    ("ꜰʟᴇᴇᴢꜰʟᴏᴡ", 18),
    ("А͟р͟т͟ё͟м͟", 10),
    ("floydpower", 10),
    ("Интересно кто же я?", 10),
    ("🍁😉🍁ЛАНА🍁😉🍁", 10),
    ("Yuazov", 10),
    ("DSDED", 10),
    ("°", 10),
    ("𓆩𝚌𝚞𝚙𝚜𝚒𝚣𝚎𓆪", 10),
    ("𝓴𝓼𝔂𝓾𝓷𝓲𝓴𐙚", 10),
    ("GEORGII", 0),
    (".", 0),
    ("Mr Jimmka", -7),
]

for lname, lcoins in INITIAL_LEGACY_USERS:
    db.execute(
        "INSERT OR IGNORE INTO legacy_balances (name, coins) VALUES (?, ?)",
        (lname, lcoins),
    )
db.commit()


def get_user(user: types.User) -> sqlite3.Row:
    existing = db.execute("SELECT * FROM users WHERE id=?", (user.id,)).fetchone()
    if not existing:
        clean_name = user.first_name.strip()
        legacy = db.execute(
            "SELECT * FROM legacy_balances WHERE name=? OR TRIM(name)=?",
            (user.first_name, clean_name),
        ).fetchone()

        start_coins = legacy["coins"] if legacy else 10
        if legacy:
            db.execute("DELETE FROM legacy_balances WHERE name=?", (legacy["name"],))

        db.execute(
            "INSERT INTO users (id, name, coins) VALUES (?, ?, ?)",
            (user.id, user.first_name, start_coins),
        )
    else:
        db.execute("UPDATE users SET name=? WHERE id=?", (user.first_name, user.id))

    db.commit()
    return db.execute("SELECT * FROM users WHERE id=?", (user.id,)).fetchone()


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
        return "😶 Тихоня (боится сказать лишнего)"
    elif coins <= 20:
        return "💬 Обычный комментатор"
    elif coins <= 50:
        return "🔥 Прожженный активист"
    elif coins <= 100:
        return "👑 Уважаемый душнила"
    else:
        return "🗿 Абсолютный властелин комментов"


def stats_text(user: types.User) -> str:
    u = get_user(user)
    title = get_toxicity_title(u)
    shield_str = f"\n🛡 Щитов: {u['shield_count']}" if u["shield_count"] > 0 else ""
    return (
        f"📊 <b>Статистика: {u['name']}</b>\n\n"
        f"🪙 Баланс: <b>{u['coins']} 🪙</b>\n"
        f"🏆 Статус: {title}{shield_str}\n"
        f"⚔️ Дуэли: побед {u['wins']} | поражений {u['losses']}"
    )


def top_text() -> str:
    active_rows = db.execute("SELECT name, coins FROM users").fetchall()
    legacy_rows = db.execute("SELECT name, coins FROM legacy_balances").fetchall()

    combined = [{"name": r["name"] or "Без имени", "coins": r["coins"]} for r in active_rows]
    combined += [{"name": r["name"] or "Без имени", "coins": r["coins"]} for r in legacy_rows]
    combined.sort(key=lambda x: x["coins"], reverse=True)

    if not combined:
        return "Пока никто не заработал коины"
    lines = [f"{i + 1}. {r['name']} — {r['coins']} 🪙" for i, r in enumerate(combined)]
    return "🏆 <b>Рейтинг комментаторов:</b>\n\n" + "\n".join(lines)


def do_bonus(user: types.User) -> str:
    u = get_user(user)
    now = datetime.datetime.now()
    if u["last_bonus"]:
        last_dt = datetime.datetime.fromisoformat(u["last_bonus"])
        if now - last_dt < datetime.timedelta(days=1):
            time_left = datetime.timedelta(days=1) - (now - last_dt)
            hours, remainder = divmod(int(time_left.total_seconds()), 3600)
            mins, _ = divmod(remainder, 60)
            return f"{u['name']}, бонус уже получен! Жди еще {hours} ч. {mins} мин."

    delta = 10
    if u["boost_until"] and datetime.datetime.fromisoformat(u["boost_until"]) > now:
        delta *= 2

    new_coins = u["coins"] + delta
    db.execute("UPDATE users SET coins=?, last_bonus=? WHERE id=?", (new_coins, now.isoformat(), user.id))
    db.commit()
    boost_note = " (💥 х2 Буст!)" if delta > 10 else ""
    return f"🎁 Бонус забран: <b>+{delta} 🪙</b>{boost_note}\n🪙 Баланс: {new_coins} 🪙"


def do_work(user: types.User) -> str:
    u = get_user(user)
    now = datetime.datetime.now()
    if u["last_work"]:
        last_dt = datetime.datetime.fromisoformat(u["last_work"])
        if now - last_dt < datetime.timedelta(hours=6):
            time_left = datetime.timedelta(hours=6) - (now - last_dt)
            hours, remainder = divmod(int(time_left.total_seconds()), 3600)
            mins, _ = divmod(remainder, 60)
            return f"⏳ Следующий вброс через {hours} ч. {mins} мин."

    gain = 3
    loss = 3
    if u["boost_until"] and datetime.datetime.fromisoformat(u["boost_until"]) > now:
        gain *= 2
        loss *= 2

    success = random.random() < 0.5
    if success:
        new_coins = u["coins"] + gain
        msg = f"💬 Тейк зашел! Получено <b>+{gain} 🪙</b>\n🪙 Баланс: {new_coins} 🪙"
    else:
        new_coins = u["coins"] - loss
        msg = f"📉 Заминусили... Потеряно <b>-{loss} 🪙</b>\n🪙 Баланс: {new_coins} 🪙"

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
        await m.answer_document(FSInputFile("game.db"), caption="📦 Бэкап базы данных")


@dp.message(Command("start"))
async def start(m: types.Message):
    bot_info = await bot.get_me()
    await m.answer(f"👋 Бот запущен! Напиши <code>@{bot_info.username}</code> в чате.", parse_mode="HTML")


@dp.message()
async def handle_all_messages(message: types.Message):
    if not message.from_user or message.from_user.is_bot:
        return

    text_lower = message.text.lower() if message.text else ""

    if text_lower in ["!игра", "игра", "/game"]:
        welcome_text = "🔥 Игровая экономика канала ПОРОГ:"
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🎮 Открыть меню", switch_inline_query_current_chat="")]
        ])
        await message.reply(welcome_text, reply_markup=keyboard, parse_mode="HTML")
        return

    if message.message_thread_id:
        user_id = message.from_user.id
        first_name = message.from_user.first_name

        already_invited = db.execute("SELECT 1 FROM invited_users WHERE user_id=?", (user_id,)).fetchone()
        already_playing = db.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone()
        is_legacy = db.execute(
            "SELECT 1 FROM legacy_balances WHERE name=? OR TRIM(name)=?",
            (first_name, first_name.strip()),
        ).fetchone()

        if not already_invited and not already_playing and not is_legacy:
            db.execute("INSERT OR IGNORE INTO invited_users (user_id) VALUES (?)", (user_id,))
            db.commit()

            teaser = f"🔥 {first_name}, залетай в игровую экономику канала ПОРОГ! Копи коины и забирай призы 👇"
            keyboard = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🎮 Открыть игру", switch_inline_query_current_chat="")]
            ])
            await message.reply(teaser, reply_markup=keyboard, parse_mode="HTML")


@dp.inline_query()
async def inline_query_menu(q: types.InlineQuery):
    uid = q.from_user.id
    u = get_user(q.from_user)
    coins = u["coins"]
    text = q.query.strip()

    max_active = db.execute("SELECT MAX(coins) as m FROM users WHERE id != ?", (uid,)).fetchone()["m"]
    max_legacy = db.execute("SELECT MAX(coins) as m FROM legacy_balances").fetchone()["m"]
    other_balances = [x for x in (max_active, max_legacy) if x is not None]
    max_other_coins = max(other_balances) if other_balances else 0

    bet = int(text) if text.isdigit() and int(text) > 0 else DEFAULT_BET

    if coins < bet:
        duel_markup = None
        duel_title = f"🚫 Дуэль (нет коинов на {bet} 🪙)"
        duel_desc = f"Баланс: {coins} 🪙. Ставка выше вашего баланса."
        duel_msg = f"❌ Нельзя создать дуэль на <b>{bet} 🪙</b> (на балансе {coins} 🪙)."
    elif max_other_coins > 0 and bet > max_other_coins:
        duel_markup = None
        duel_title = f"🚫 Дуэль (ставка выше всех)"
        duel_desc = f"Максимум у других: {max_other_coins} 🪙."
        duel_msg = f"❌ Ставка <b>{bet} 🪙</b> выше, чем баланс остальных игроков (макс: {max_other_coins} 🪙)."
    else:
        duel_markup = kb((f"⚔️ Принять вызов ({bet} 🪙)", f"duel:{uid}:{bet}"))
        duel_title = f"🎯 Дуэль (ставка: {bet} 🪙)"
        duel_desc = f"Вызов на {bet} 🪙. Введите цифру после имени бота для смены ставки."
        duel_msg = (
            f"🎯 <b>Дуэль мнений</b>\n\n"
            f"👤 Инициатор: {q.from_user.first_name}\n"
            f"💰 Ставка: <b>{bet} 🪙</b>\n\n"
            f"<i>Нажми кнопку ниже для участия!</i>"
        )

    # Если в строке инлайн-поиска введено число (например, "@бот 15"), используем его как ставку для казино
    custom_cas_bet = int(text) if text.isdigit() and int(text) > 0 else 5

    results = [
        article(
            "casino",
            "🎰 Казино ПОРОГА",
            f"Ставка: {custom_cas_bet} 🪙 • Выбери цвет и испытай удачу!",
            (
                "🎰 <b>Казино ПОРОГА</b>\n\n"
                f"Текущая ставка: <b>{custom_cas_bet} 🪙</b>\n"
                "<i>(Чтобы изменить ставку, напиши цифру после имени бота в строке поиска)</i>\n\n"
                "<b>Шансы и выплаты:</b>\n"
                "• 🔴 <b>Красное</b> — шанс 45% (Выплата: x2)\n"
                "• ⚪️ <b>Белое</b> — шанс 45% (Выплата: x2)\n"
                "• 🟢 <b>Зеленое</b> — шанс 10% (Джекпот: x8)\n\n"
                f"🪙 Твой баланс: <b>{coins} 🪙</b>"
            ),
            kb(
                ("🔴 Красное (x2)", f"cas_play:{uid}:{custom_cas_bet}:red"),
                ("⚪️ Белое (x2)", f"cas_play:{uid}:{custom_cas_bet}:white"),
                ("🟢 Зеленое (Джекпот x8)", f"cas_play:{uid}:{custom_cas_bet}:green"),
            )
        ),
        article(
            "shop",
            "🛒 Магазин призов",
            "Темы ролика, упоминания, реклама, щиты, бусты",
            (
                "<b>🛒 Магазин призов ПОРОГА:</b>\n\n"
                "1️⃣ <b>🎬 Тема для ролика</b> — 500 🪙\n"
                "2️⃣ <b>🎥 Упоминание в титрах</b> — 300 🪙\n"
                "3️⃣ <b>📢 Реклама в канале</b> — 250 🪙\n"
                "4️⃣ <b>🛡 3 щита защиты</b> — 150 🪙\n"
                "5️⃣ <b>🎟 Буст x2 на 24ч</b> — 50 🪙"
            ),
            kb(
                ("🎬 Тема (500 🪙)", f"buy:{uid}:theme"),
                ("🎥 Упоминание (300 🪙)", f"buy:{uid}:mention"),
                ("📢 Реклама (250 🪙)", f"buy:{uid}:ads"),
                ("🛡 3 щита (150 🪙)", f"buy:{uid}:shield"),
                ("🎟 Буст x2 (50 🪙)", f"buy:{uid}:boost"),
            ),
        ),
        article(
            "bonus",
            "🎁 Ежедневный бонус",
            "Забрать +10 коинов (раз в 24 часа)",
            "Получаю ежедневный бонус...",
            kb(("Забрать бонус 🎁", f"bonus:{uid}")),
        ),
        article(
            "work",
            "💬 Вбросить тейк",
            "Шанс 50/50 (+3 / -3 коина • раз в 6 часов)",
            "Вбрасываю тейк...",
            kb(("Вбросить тейк 💬", f"work:{uid}")),
        ),
        article(
            "stats",
            "📊 Моя статистика",
            "Баланс, статус, победы и поражения",
            stats_text(q.from_user),
        ),
        article(
            "top",
            "🏆 Рейтинг комментаторов",
            "Таблица лидеров канала по коинам",
            top_text(),
        ),
        article(
            "duel",
            duel_title,
            duel_desc,
            duel_msg,
            duel_markup,
        ),
    ]

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


@dp.callback_query(F.data.startswith("cas_play:"))
async def on_casino_play(c: types.CallbackQuery):
    _, owner_str, bet_str, color = c.data.split(":")
    owner = int(owner_str)
    bet = int(bet_str)

    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)

    u = get_user(c.from_user)
    if u["coins"] < bet:
        return await c.answer(f"Недостаточно коинов! Нужно {bet} 🪙", show_alert=True)

    roll = random.random()
    if roll < 0.45:
        winning_color = "red"
        emoji = "🔴"
        name_color = "Красное"
    elif roll < 0.90:
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
        new_coins = u["coins"] + profit
        db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, owner))
        db.commit()

        msg = (
            f"🎰 <b>{emoji} Выпало: {name_color}!</b>\n\n"
            f"🎯 Ставка на {color_names[color]} ({bet} 🪙) сыграла!\n"
            f"💰 Выигрыш: <b>+{profit} 🪙</b> (x{multiplier})\n"
            f"🪙 Баланс: <b>{new_coins} 🪙</b>"
        )
    else:
        new_coins = u["coins"] - bet
        db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, owner))
        db.commit()

        msg = (
            f"🎰 <b>{emoji} Выпало: {name_color}</b>\n\n"
            f"❌ Ставка на {color_names[color]} ({bet} 🪙) не зашла.\n"
            f"📉 Потеряно: <b>-{bet} 🪙</b>\n"
            f"🪙 Баланс: <b>{new_coins} 🪙</b>"
        )

    await edit(c, msg)
    await c.answer()


@dp.callback_query(F.data.startswith("buy:"))
async def on_buy(c: types.CallbackQuery):
    _, owner, item = c.data.split(":")
    owner = int(owner)
    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)

    u = get_user(c.from_user)
    coins = u["coins"]

    prices = {
        "theme": 500,
        "mention": 300,
        "ads": 250,
        "shield": 150,
        "boost": 50,
    }

    price = prices.get(item, 0)
    if coins < price:
        return await c.answer(f"Недостаточно коинов! Нужно {price} 🪙", show_alert=True)

    new_coins = coins - price
    user_link = f"<a href='tg://user?id={c.from_user.id}'>{c.from_user.first_name}</a>"

    if item == "theme":
        db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, owner))
        db.commit()
        await edit(c, "🎉 <b>Тема ролика куплена!</b> Админу отправлено уведомление.")
        await bot.send_message(ADMIN_ID, f"🚨 <b>Купили тему ролика (500 🪙):</b>\n👤 {user_link} (ID: <code>{c.from_user.id}</code>)", parse_mode="HTML")

    elif item == "mention":
        db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, owner))
        db.commit()
        await edit(c, "🎉 <b>Упоминание куплено!</b> Напиши админу свой ник для титров.")
        await bot.send_message(ADMIN_ID, f"🚨 <b>Купили упоминание (300 🪙):</b>\n👤 {user_link} (ID: <code>{c.from_user.id}</code>)", parse_mode="HTML")

    elif item == "ads":
        db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, owner))
        db.commit()
        await edit(c, "📢 <b>Реклама куплена!</b> Скинь админу текст и ссылку.")
        await bot.send_message(ADMIN_ID, f"🚨 <b>Купили рекламу (250 🪙):</b>\n👤 {user_link} (ID: <code>{c.from_user.id}</code>)", parse_mode="HTML")

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


@dp.callback_query(F.data.startswith("duel:"))
async def on_duel(c: types.CallbackQuery):
    _, owner, bet = c.data.split(":")
    owner, bet = int(owner), int(bet)
    if c.from_user.id == owner:
        return await c.answer("Нельзя принять свой вызов", show_alert=True)

    a = db.execute("SELECT * FROM users WHERE id=?", (owner,)).fetchone()
    b = get_user(c.from_user)
    if not a:
        return await c.answer("Инициатор не найден", show_alert=True)

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
