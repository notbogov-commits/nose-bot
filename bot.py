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
DEFAULT_BET = 5  # Базовая ставка теперь 5 коинов
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
    CREATE TABLE IF NOT EXISTS post_comments (
        post_id INTEGER,
        user_id INTEGER,
        PRIMARY KEY (post_id, user_id)
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
    shield_str = f"\n🛡 Щитов от слива в дуэлях: {u['shield_count']}" if u["shield_count"] > 0 else ""
    return (
        f"📊 Твоя игровая статистика, {u['name']}\n\n"
        f"🪙 Баланс коинов: {u['coins']}\n"
        f"🏆 Твой статус: {title}{shield_str}\n"
        f"⚔️ Дуэли: побед {u['wins']} | поражений {u['losses']}\n\n"
        f"💡 <i>Всё происходит прямо в боте по кнопкам, спамить реальными комментариями в канале не нужно!</i>"
    )


def top_text() -> str:
    rows = db.execute("SELECT name, coins FROM users ORDER BY coins DESC").fetchall()
    if not rows:
        return "Пока никто не заработал коины"
    lines = []
    for i, r in enumerate(rows):
        lines.append(f"{i + 1}. {r['name']} — {r['coins']} коинов")
    return "🏆 Общий рейтинг комментаторов:\n" + "\n".join(lines)


NEWS_JOKES = [
    "📰 НОВОСТИ КАНАЛА:\n\nВ комментариях тишина. Админ снова забыл выпустить мем, все сидят без коинов.",
    "📰 НОВОСТИ КАНАЛА:\n\nСамый душный комментатор недели пытался расплатиться коинами в магазине, но его выгнали за токсичность.",
    "📰 НОВОСТИ КАНАЛА:\n\nСиноптики прогнозируют бурю в комментах: подписчики копят коины для жестких дуэлей.",
    "📰 НОВОСТИ КАНАЛА:\n\nУченые выяснили, что игра в боте заменяет психотерапевта, но разрушает личную жизнь.",
    "📰 НОВОСТИ КАНАЛА:\n\nАдмин объявил амнистицию для забаненных, но они всё равно не поняли, куда писать.",
]


def get_news_text() -> str:
    row = db.execute("SELECT text FROM news_log ORDER BY id DESC LIMIT 1").fetchone()
    if row and random.random() < 0.4:
        return f"📰 НОВОСТИ КАНАЛА:\n\n{row['text']}"
    return random.choice(NEWS_JOKES)


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

    delta = 10
    if u["boost_until"] and datetime.datetime.fromisoformat(u["boost_until"]) > now:
        delta *= 2

    new_coins = u["coins"] + delta
    db.execute("UPDATE users SET coins=?, last_bonus=? WHERE id=?", (new_coins, now.isoformat(), user.id))
    db.commit()
    boost_note = " (💥 х2 Буст активен!)" if delta > 10 else ""
    return f"{u['name']}, ежедневный бонус принес +{delta} коинов!{boost_note} Баланс: {new_coins} 🪙"


def do_work(user: types.User) -> str:
    u = get_user(user)
    now = datetime.datetime.now()
    if u["last_work"]:
        last_dt = datetime.datetime.fromisoformat(u["last_work"])
        if now - last_dt < datetime.timedelta(hours=6):
            timeLeft = datetime.timedelta(hours=6) - (now - last_dt)
            hours, remainder = divmod(int(timeLeft.total_seconds()), 3600)
            mins, _ = divmod(remainder, 60)
            return f"{u['name']}, ты уже вбрасывал тейк в комменты! Следующая попытка через {hours} ч. {mins} мин."

    gain = 3
    loss = 3
    if u["boost_until"] and datetime.datetime.fromisoformat(u["boost_until"]) > now:
        gain *= 2
        loss *= 2

    success = random.random() < 0.5
    if success:
        new_coins = u["coins"] + gain
        msg = f"💬 Твой виртуальный тейк залетел в комментах на ура! Зрители оценили, получено **+{gain} коина**. Баланс: {new_coins} 🪙"
    else:
        new_coins = u["coins"] - loss
        msg = f"📉 Ты написал полный кринж в обсуждении, местные заминусили... Потеряно **-{loss} коина**. Баланс: {new_coins} 🪙"

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


# ---------- АДМИН-КОМАНДА ----------
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
    await m.answer("👋 Бот запущен! Напиши `@имя_бота` в любом чате канала.")


@dp.message()
async def handle_all_messages(message: types.Message):
    if message.from_user and message.from_user.is_bot:
        return

    text_lower = message.text.lower() if message.text else ""

    if text_lower in ["!игра", "игра", "/game"]:
        welcome_text = "🔥 Привет, подписчики ПОРОГА! Игра ждет тебя в кнопке ниже:"
        keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🎮 Открыть игру", switch_inline_query_current_chat="")]
        ])
        await message.reply(welcome_text, reply_markup=keyboard, parse_mode="HTML")
        return

    if message.message_thread_id and message.from_user:
        post_id = message.message_thread_id
        user_id = message.from_user.id

        existing = db.execute(
            "SELECT 1 FROM post_comments WHERE post_id=? AND user_id=?", 
            (post_id, user_id)
        ).fetchone()

        if not existing:
            db.execute("INSERT OR IGNORE INTO post_comments (post_id, user_id) VALUES (?, ?)", (post_id, user_id))
            db.commit()

            teaser = f"🔥 {message.from_user.first_name}, залетай в игровую экономику канала ПОРОГ! Копи коины и забирай призы 👇"
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
    
    # Если игрок ввел число в инлайн-строке (например, "@бот 50"), то это ставка для дуэли
    bet = int(text) if text.isdigit() and int(text) > 0 else DEFAULT_BET

    duel_markup = kb((f"⚔️ Принять вызов на {bet} 🪙", f"duel:{uid}:{bet}")) if coins > 0 else None
    duel_title = f"🎯 Дуэль мнениями (ставка: {bet} 🪙)"
    duel_desc = f"Вызови бойца на дуэль (ставка {bet} коинов). Напиши в поиске цифру, чтобы изменить ставку!" if coins > 0 else "Дуэль заблокирована: нужен положительный баланс"

    results = [
        article(
            "news", 
            "📰 Новости канала", 
            "Свежие шутки и сводки из жизни комьюнити", 
            get_news_text()
        ),
        article(
            "shop",
            "🛒 Магазин призов ПОРОГА",
            "5 позиций: тема для ролика, упоминание, реклама, щиты и буст",
            (
                "<b>🛒 Магазин призов канала ПОРОГ:</b>\n\n"
                "1️⃣ <b>🎬 Предложить тему для ролика</b> — 500 🪙\n"
                "<i>Обсуждаем тему ролика под ваши желания, и я снимаю на нее!</i>\n\n"
                "2️⃣ <b>🎥 Упоминание вас в видео</b> — 300 🪙\n"
                "<i>Ваш ник попадет в титры / вставку с благодарностью в следующем ролике.</i>\n\n"
                "3️⃣ <b>📢 Реклама своего ТГ-канала</b> — 250 🪙\n"
                "<i>Реклама у нас в ТГ-канале.</i>\n\n"
                "4️⃣ <b>🛡 3 иммунитета от слива</b> — 150 🪙\n"
                "<i>Защитные щиты для безопасных дуэлей.</i>\n\n"
                "5️⃣ <b>🎟 Буст х2 на сутки</b> — 50 🪙\n"
                "<i>Удваивает бонус и тейки на 24 часа.</i>"
            ),
            kb(
                ("🎬 Тема для ролика (500 🪙)", f"buy:{uid}:theme"),
                ("🎥 Упоминание в видео (300 🪙)", f"buy:{uid}:mention"),
                ("📢 Реклама в ТГ-канале (250 🪙)", f"buy:{uid}:ads"),
                ("🛡 3 иммунитета (150 🪙)", f"buy:{uid}:shield"),
                ("🎟 Буст х2 на сутки (50 🪙)", f"buy:{uid}:boost"),
            )
        ),
        article(
            "bonus", 
            "🎁 Ежедневный бонус", 
            "Забирай стабильно +10 коинов каждый день (раз в 24 часа)", 
            "Получаю ежедневный бонус...",
            kb(("Забрать бонус 🎁", f"bonus:{uid}"))
        ),
        article(
            "work", 
            "💬 Вбросить тейк в комменты (раз в 6 часов)", 
            "Шанс 50/50: зашедшее мнение (+3) или провал (-3)", 
            "Вбрасываю тейк...",
            kb(("Вбросить тейк 💬", f"work:{uid}"))
        ),
        article(
            "stats", 
            "📊 Моя статистика", 
            "Посмотреть свой баланс, статус и победы в игре", 
            stats_text(q.from_user)
        ),
        article(
            "top", 
            "🏆 Общий рейтинг комментаторов", 
            "Полный список всех участников канала по коинам", 
            top_text()
        ),
        article(
            "duel", 
            duel_title, 
            duel_desc, 
            (
                f"🎯 <b>Дуэль мнений создана!</b>\n\n"
                f"👤 Инициатор: {q.from_user.first_name}\n"
                f"💰 Ставка: <b>{bet} 🪙</b>\n\n"
                f"<i>Нажми кнопку ниже, чтобы принять вызов и испытать удачу!</i>"
            ), 
            duel_markup
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


# ---------- ОБРАБОТЧИК МАГАЗИНА (5 ТОВАРОВ) ----------
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
        "boost": 50
    }

    price = prices.get(item, 0)
    if coins < price:
        return await c.answer(f"Недостаточно коинов! Нужно {price} 🪙", show_alert=True)

    new_coins = coins - price

    user_link = f"<a href='tg://user?id={c.from_user.id}'>{c.from_user.first_name}</a>"

    if item == "theme":
        db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, owner))
        db.commit()
        await edit(c, "🎉 **Покупка успешна!** Ты приобрел право обсудить тему ролика. Админу отправлено уведомление, он скоро напишет тебе!")
        await bot.send_message(ADMIN_ID, f"🚨 <b>КУПИЛИ ТЕМУ РОЛИКА (500 🪙)!</b>\n👤 Пользователь: {user_link} (ID: <code>{c.from_user.id}</code>)", parse_mode="HTML")

    elif item == "mention":
        db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, owner))
        db.commit()
        await edit(c, "🎉 **Покупка успешна!** Упоминание в видео приобретено. Напиши админу свой ник/текст для титров.")
        await bot.send_message(ADMIN_ID, f"🚨 <b>Купили упоминание в видео (300 🪙)!</b>\n👤 Пользователь: {user_link} (ID: <code>{c.from_user.id}</code>)", parse_mode="HTML")

    elif item == "ads":
        db.execute("UPDATE users SET coins=? WHERE id=?", (new_coins, owner))
        db.commit()
        await edit(c, "📢 **Реклама в ТГ-канале куплена!** Скинь админу текст/ссылку для публикации.")
        await bot.send_message(ADMIN_ID, f"🚨 <b>Купили рекламу в ТГ (250 🪙)!</b>\n👤 Пользователь: {user_link} (ID: <code>{c.from_user.id}</code>)", parse_mode="HTML")

    elif item == "shield":
        db.execute("UPDATE users SET coins=?, shield_count=shield_count+3 WHERE id=?", (new_coins, owner))
        db.commit()
        await edit(c, "🛡 **Успешно!** Добавлено 3 защитных щита от слива в дуэлях.")

    elif item == "boost":
        expiry = (datetime.datetime.now() + datetime.timedelta(days=1)).isoformat()
        db.execute("UPDATE users SET coins=?, boost_until=? WHERE id=?", (new_coins, expiry, owner))
        db.commit()
        await edit(c, "💥 **Буст активирован!** На 24 часа ежедневный бонус и тейки приносят х2 коинов.")

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
        return await c.answer(f"Недостаточно коинов для дуэли! Нужно минимум {bet} 🪙", show_alert=True)
    
    winner, loser = random.choice([(a, b), (b, a)])
    
    if loser["shield_count"] > 0:
        db.execute("UPDATE users SET shield_count=shield_count-1 WHERE id=?", (loser["id"],))
        db.commit()
        shield_msg = f" (но у {loser['name']} сработал щит 🛡, коины не списались!)"
    else:
        db.execute("UPDATE users SET coins=coins-?, losses=losses+1 WHERE id=?", (bet, loser["id"]))
        shield_msg = ""

    db.execute("UPDATE users SET coins=coins+?, wins=wins+1 WHERE id=?", (bet, winner["id"]))
    db.commit()
    
    add_news(f"🎯 Дуэльная бойня: {winner['name']} разнес мнение {loser['name']} и забрал {bet} 🪙!")
    await edit(c, f"⚔️ В дуэли мнений (ставка: {bet} 🪙) победил {winner['name']} и забрал банк у {loser['name']}!{shield_msg}")
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
