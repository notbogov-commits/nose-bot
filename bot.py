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
DEFAULT_BET = 5

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


def get_toxicity_title(coins: int) -> str:
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
    title = get_toxicity_title(u["coins"])
    return (
        f"📊 Твоя игровая статистика, {u['name']}\n\n"
        f"🪙 Баланс коинов: {u['coins']}\n"
        f"🏆 Твой титул: {title}\n"
        f"⚔️ Дуэли: побед {u['wins']} | поражений {u['losses']}\n\n"
        f"💡 <i>Всё происходит прямо в боте по кнопкам, спамить реальными комментариями в канале не нужно!</i>"
    )


# Общий рейтинг всех комментаторов (без ограничения в 5 человек)
def top_text() -> str:
    rows = db.execute("SELECT name, coins FROM users ORDER BY coins DESC").fetchall()
    if not rows:
        return "Пока никто не заработал коины"
    lines = [f"{i + 1}. {r['name']} — {r['coins']} коинов" for i, r in enumerate(rows)]
    return "🏆 Общий рейтинг комментаторов:\n" + "\n".join(lines)


NEWS_JOKES = [
    "📰 НОВОСТИ КАНАЛА:\n\nВ комментариях тишина. Админ снова забыл выпустить мем, все сидят без коинов.",
    "📰 НОВОСТИ КАНАЛА:\n\nСамый душный комментатор недели пытался расплатиться коинами в магазине, но его выгнали за токсичность.",
    "📰 НОВОСТИ КАНАЛА:\n\nСиноптики прогнозируют бурю в комментах: подписчики копят коины для жестких дуэлей.",
    "📰 НОВОСТИ КАНАЛА:\n\nУченые выяснили, что игра в боте заменяет психотерапевта, но разрушает личную жизнь.",
    "📰 НОВОСТИ КАНАЛА:\n\nОдин из подписчиков попытался набрать коинов ночью, но разбудил соседа-полицейского. Теперь у него новый статус: 'Клиент изолятора'.",
    "📰 НОВОСТИ КАНАЛА:\n\nАдмин объявил амнистицию для забаненных, но они всё равно не поняли, куда писать.",
    "📰 НОВОСТИ КАНАЛА:\n\nНа черном рынке комментариев зафиксирован рекордный скачок цен на качественные оскорбления.",
    "📰 НОВОСТИ КАНАЛА:\n\nВ чате замечен странный тип: он прочитал все правила с первого раза и ничего не написал. Самый подозрительный элемент.",
    "📰 НОВОСТИ КАНАЛА:\n\nМестные тролли начали объединяться в профсоюзы. Требуют оплату коинами за каждую тонну вылитой желчи.",
    "📰 НОВОСТИ КАНАЛА:\n\nОдин из комментаторов попытался сдать бутылки, чтобы отыграться в дуэли, но его опередили более опытные коллеги.",
    "📰 НОВОСТИ КАНАЛА:\n\nНовостей ноль, потому что админ ушел спать, а бот работает на честном слове и энергии терпил.",
    "📰 НОВОСТИ КАНАЛА:\n\nВзломали базу данных канала: оказалось, что 90% активности держатся на трех людях с бессонницей.",
    "📰 НОВОСТИ КАНАЛА:\n\nСамый активный комментатор недели получил в подарок бесплатный бан от нейросети.",
    "📰 НОВОСТИ КАНАЛА:\n\nПсихиатры бьют тревогу: игроки в дуэли начали разговаривать во сне фразами 'Принять вызов за 5 коинов'.",
    "📰 НОВОСТИ КАНАЛА:\n\nВ чате прошел слух, будто коины можно обменять на реальную работу, но все дружно сделали вид, что не расслышали.",
    "📰 НОВОСТИ КАНАЛА:\n\nОдинокие подписчики находят любовь в дуэлях. Романтика: сначала ты забираешь у нее коины, а потом она кидает в тебя жалобу на спам.",
    "📰 НОВОСТИ КАНАЛА:\n\nМинздрав предупреждает: избыток душноты в комментариях приводит к выпадению чувства юмора.",
    "📰 НОВОСТИ КАНАЛА:\n\nСтатистика показывает, что 80% игроков сливают коины в первые пять минут после получения бонуса.",
    "📰 НОВОСТИ КАНАЛА:\n\nАдмин пообещал выпустить уникальный контент, если подписчики перестанут писать 'первый' под каждым постом.",
    "📰 НОВОСТИ КАНАЛА:\n\nВ местных подворотнях стали замечать людей, которые вымогают коины за плюсики под постами.",
    "📰 НОВОСТИ КАНАЛА:\n\nГоворят, если написать в комментах 'Админ молодец', баланс уменьшится на 10 коинов из соображений кармы.",
    "📰 НОВОСТИ КАНАЛА:\n\nПодписчик со дна топа попытался взять кредит под залог своего мнения, но банк отказал из-за нулевой ликвидности.",
    "📰 НОВОСТИ КАНАЛА:\n\nВ чате объявлен план 'Перехват': кто-то украл у бота все смайлики с какашками.",
    "📰 НОВОСТИ КАНАЛА:\n\nЭксперты по кибербезопасности советуют менять пароль от аккаунта после каждой проигранной дуэли.",
    "📰 НОВОСТИ КАНАЛА:\n\nНочной чат превратился в клуб анонимных лудоманов, обсуждающих курсы вымышленных коинов.",
    "📰 НОВОСТИ КАНАЛА:\n\nОдин подписчик так долго писал простыню текста в комментарии, что у него постарел кот и обновился айфон.",
    "📰 НОВОСТИ КАНАЛА:\n\nВ канале ввели налог на душноту. Теперь каждый второй комментарий облагается штрафом в пользу админа.",
    "📰 НОВОСТИ КАНАЛА:\n\nНичего особенного не произошло, просто у кого-то опять сгорело кресло от слива в дуэли.",
    "📰 НОВОСТИ КАНАЛА:\n\nРейтинг токсичности канала побил все рекорды. Мы официально обогнали токсичные паблики про автомобили.",
    "📰 НОВОСТИ КАНАЛА:\n\nЕсли вы дочитали эту новость до конца — вам срочно нужно выйти на улицу и потрогать траву."
]


def get_news_text() -> str:
    row = db.execute("SELECT text FROM news_log ORDER BY id DESC LIMIT 1").fetchone()
    if row and random.random() < 0.4:
        return f"📰 НОВОСТИ КАНАЛА:\n\n{row['text']}"
    return random.choice(NEWS_JOKES)


# Ежедневный бонус: строго +10 коинов без отнимания
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
    new_coins = u["coins"] + delta
    db.execute("UPDATE users SET coins=?, last_bonus=? WHERE id=?", (new_coins, now.isoformat(), user.id))
    db.commit()
    return f"{u['name']}, ежедневный бонус принес +{delta} коинов! Баланс: {new_coins} 🪙"


# Работа 50/50: придумываем название ролика (+3 или -3)
def do_work(user: types.User) -> str:
    u = get_user(user)
    now = datetime.datetime.now()
    if u["last_work"]:
        last_dt = datetime.datetime.fromisoformat(u["last_work"])
        if now - last_dt < datetime.timedelta(hours=6):
            timeLeft = datetime.timedelta(hours=6) - (now - last_dt)
            hours, remainder = divmod(int(timeLeft.total_seconds()), 3600)
            mins, _ = divmod(remainder, 60)
            return f"{u['name']}, ты уже предлагал название ролика! Следующая попытка через {hours} ч. {mins} мин."

    success = random.random() < 0.5
    if success:
        new_coins = u["coins"] + 3
        msg = f"🎬 Твое название ролика зашло зрителям на ура! Тренд подхвачен, получено **+3 коина**. Баланс: {new_coins} 🪙"
    else:
        new_coins = u["coins"] - 3
        msg = f"📉 Ты предложил кринжовое название ролика, зрители не оценили и заминусили... Потеряно **-3 коина**. Баланс: {new_coins} 🪙"

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


@dp.message(F.text.lower().in_(["!игра", "игра", "/game"]))
async def cmd_game_trigger(message: types.Message):
    user = get_user(message.from_user)
    welcome_text = (
        f"💬 <b>Привет, {user['name']}! Это мини-игра для подписчиков канала.</b>\n\n"
        f"Здесь можно собирать коины, крутить общий рейтинг и устраивать дуэли.\n"
        f"⚠️ <i>Важно: писать реальные комментарии в канале для этого не нужно, вся игра работает прямо в боте по кнопкам!</i>\n\n"
        f"👇 Нажми на кнопку ниже, чтобы открыть игровое меню:"
    )
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🚀 Открыть меню игры", switch_inline_query="")]
    ])
    
    await message.reply(welcome_text, reply_markup=keyboard, parse_mode="HTML")


@dp.inline_query()
async def inline_query_menu(q: types.InlineQuery):
    uid = q.from_user.id
    u = get_user(q.from_user)
    coins = u["coins"]
    text = q.query.strip()
    bet = int(text) if text.isdigit() and int(text) > 0 else DEFAULT_BET

    duel_markup = kb((f"Принять вызов ({bet} 🪙)", f"duel:{uid}:{bet}")) if coins > 0 else None
    duel_title = f"🎯 Дуэль мнениями (ставка: {bet} коинов)"
    duel_desc = "Сразись с другим игроком 1 на 1 на коины" if coins > 0 else "Дуэль заблокирована: нужен положительный баланс"

    results = [
        article(
            "news", 
            "📰 Новости канала", 
            "Свежие шутки и сводки из жизни комьюнити (30+ вариантов)", 
            get_news_text()
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
            "🎬 Назвать выпуск ролика (раз в 6 часов)", 
            "Шанс 50/50: зашедшее название (+3) или провал (-3)", 
            "Предлагаю название ролика...",
            kb(("Предложить название 🎬", f"work:{uid}"))
        ),
        article(
            "stats", 
            "📊 Моя статистика", 
            "Посмотреть свой баланс, титул и победы в игре", 
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
            "Дуэль комментаторов!", 
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
    
    add_news(f"🎯 Дуэльная бойня: {winner['name']} разнес мнение {loser['name']} и забрал {bet} 🪙!")
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
    await m.answer("👋 Бот запущен! Напиши `@имя_бота` в любом чате канала.")


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
