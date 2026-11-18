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
        return "Главный должник и клоун чата"
    elif coins <= 5:
        return "Тихоня"
    elif coins <= 20:
        return "Комментатор"
    elif coins <= 50:
        return "Активист"
    elif coins <= 100:
        return "Уважаемый душнила"
    else:
        return "Властелин комментов"


def stats_text(user: types.User) -> str:
    u = get_user(user)
    title = get_toxicity_title(u)
    shield_str = f"\n🛡 Защитных щитов: {u['shield_count']}" if u["shield_count"] > 0 else ""
    c_won = u["casino_won"] if "casino_won" in u.keys() else 0
    c_lost = u["casino_lost"] if "casino_lost" in u.keys() else 0
    streak = u["streak"] if "streak" in u.keys() else 0
    activity = u["activity_score"] if "activity_score" in u.keys() else 0
    
    return (
        f"📊 Личная статистика: {u['name']}\n\n"
        f"🪙 Баланс: {u['coins']} 🪙\n"
        f"🏆 Статус: {title}{shield_str}\n"
        f"🔥 Стрик бонусов: {streak}/10 дней\n"
        f"⚡️ Очки активности: {activity}\n"
        f"⚔️ Дуэли: побед {u['wins']} | поражений {u['losses']}\n"
        f"🎰 Казино: выиграно +{c_won} 🪙 | проиграно -{c_lost} 🪙"
    )


def top_text() -> str:
    rows_coins = db.execute("SELECT name, coins FROM users ORDER BY coins DESC LIMIT 10").fetchall()
    lines_coins = [f"{i + 1}. {r['name']} — {r['coins']} 🪙" for i, r in enumerate(rows_coins)] or ["Ещё пусто"]

    rows_act = db.execute("SELECT name, activity_score FROM users ORDER BY activity_score DESC LIMIT 10").fetchall()
    lines_act = [f"{i + 1}. {r['name']} — {r['activity_score']} очков" for i, r in enumerate(rows_act)] or ["Ещё пусто"]

    return (
        f"🏆 Топ-10 по количеству монет:\n" + "\n".join(lines_coins) + "\n\n"
        f"⚡️ Топ-10 по активности в боте:\n" + "\n".join(lines_act)
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
            announcement = f"🎡 Итоги получасовой рулетки ПОРОГ Коинов!\nБанк: {total_bank} 🪙\nПобедитель: {winner['name']} забирает весь куш! 🎉\n\n"
        
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
            roulette_lines.append(f"• {b['name']} — вложил {b['amount']} 🪙 (шанс на куш: {chance:.1f}%)")
    else:
        roulette_lines.append("<i>Пока никто не сделал ставку. Стань первым!</i>")

    text = (
        f"🎡 Получасовая рулетка ПОРОГ Коинов\n\n"
        f"⏱ До новой крутки: {timer_str}\n"
        f"💰 Общий банк: {total_bank} 🪙\n"
        f"Розыгрыш каждые 30 минут. Больше вложил — выше шанс на куш!\n\n"
        f"Список участников:\n" + "\n".join(roulette_lines) + f"\n\n"
        f"Сделай ставку в банк:"
    )
    markup = kb(
        ("➕ Вложить 5 🪙", "r_bet:5"),
        ("➕ Вложить 10 🪙", "r_bet:10"),
        ("➕ Вложить 15 🪙", "r_bet:15"),
        ("➕ Вложить 20 🪙", "r_bet:20"),
        ("➕ Вложить 50 🪙", "r_bet:50"),
        ("⬅️ Назад в казино и дуэли", "cas_back_main")
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
            return f"⏳ Бонус уже получен! До следующей попытки: {hours} ч. {mins} мин. {secs} сек.\n🔥 Текущий стрик: {streak}/10 дней."
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
    return f"🎁 Бонус забран (День {streak}/10)! Начислено +{total_delta} 🪙{boost_note}\n🪙 Баланс: {new_coins} 🪙"


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
    return "🏛 Банкротство успешно! Все твои долги аннулированы, баланс обнулен до 0 🪙."


def do_work(user: types.User) -> str:
    check_and_run_roulette()
    u = get_user(user)
    now = datetime.datetime.now()
    
    if u["last_work"]:
        last_dt = datetime.datetime.fromisoformat(u["last_work"])
        if now - last_dt < datetime.timedelta(hours=1):
            time_left = datetime.timedelta(hours=1) - (now - last_dt)
            mins, secs = divmod(int(time_left.total_seconds()), 60)
            return f"⏳ Лимит вбросов исчерпан! Ждать: {mins} мин. {secs} сек."

    base_gain = 3
    base_loss = 3
    boost_active = u["boost_until"] and datetime.datetime.fromisoformat(u["boost_until"]) > now
    
    success = random.random() < 0.5
    if success:
        gain = base_gain + (base_gain if boost_active else 0)
        new_coins = u["coins"] + gain
        msg = f"💬 Тейк зашел! Получено +{gain} 🪙.\n🪙 Баланс: {new_coins} 🪙"
    else:
        loss = base_loss + (base_loss if boost_active else 0)
        new_coins = u["coins"] - loss
        msg = f"📉 Кринж... Потеряно -{loss} 🪙.\n🪙 Баланс: {new_coins} 🪙"

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
    await m.answer(f"👋 Бот ПОРОГ Коинов запущен! Напиши <code>@{bot_info.username}</code> в чате канала.", parse_mode="HTML")


@dp.message()
async def handle_all_messages(message: types.Message):
    if not message.from_user or message.from_user.is_bot:
        return

    add_activity(message.from_user.id)
    text_lower = message.text.lower() if message.text else ""

    if text_lower in ["!игра", "игра", "/game"]:
        welcome_text = "🔥 Игровая экосистема ПОРОГ Коинов:"
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
            teaser = f"🔥 {first_name}, залетай в экономику ПОРОГ Коинов! Копи валюту и забирай призы 👇"
            keyboard = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🎮 Открыть меню игры", switch_inline_query_current_chat="")]
            ])
            await message.reply(teaser, reply_markup=keyboard, parse_mode="HTML")


# ---------- ГЛАВНОЕ ИНЛАЙН-МЕНЮ (СТРОГО С ЭМОДЗИ В НАЧАЛЕ И БЕЗ НУМЕРАЦИИ) ----------
@dp.inline_query()
async def inline_query_menu(q: types.InlineQuery):
    add_activity(q.from_user.id)
    roulette_notice = check_and_run_roulette()
    
    uid = q.from_user.id
    u = get_user(q.from_user)
    coins = u["coins"]

    results = [
        # ПУНКТ 1: F.A.Q
        article(
            "faq",
            "📌 F.A.Q (О боте ПОРОГ Коинов)",
            "Правила, информация об авторе и гарантии безопасности",
            (
                "📌 Добро пожаловать в ПОРОГ Коинов!\n\n"
                "🤖 Что это за бот?\n"
                "Официальная игровая экономика и валюта канала. Зарабатывайте коины, соревнуйтесь и обменивайте их на призы.\n\n"
                "👤 Кто разработчик?\n"
                "Проект создан автором YouTube-канала ПОРОГ.\n\n"
                "💡 Важная информация:\n"
                "• Реальные деньги или платежные системы не используются.\n"
                "• Все игры, ставки и магазины происходят исключительно внутри бота по кнопкам.\n"
                "• Комментарии в Telegram-канале не начисляют валюту автоматически — всё управление здесь!"
            )
        ),
        
        # ПУНКТ 2: Мой профиль
        article(
            "profile",
            "👤 Мой профиль, Бонус & Банкрот",
            "Статистика, ежедневный бонус, вброс тейков и банкротство",
            stats_text(q.from_user) + "\n\n<i>Выберите действие ниже:</i>",
            kb(
                ("Забрать бонус 🎁", f"bonus:{uid}"),
                ("💬 Вбросить тейк", f"work:{uid}"),
                ("🏛 Списать долги (Банкрот)", f"bankrupt:{uid}")
            )
        ),

        # ПУНКТ 3: Казино, Дуэли и Магазин
        article(
            "casino_duels",
            "🎲 Казино, Дуэли & Магазин",
            "Сыграй в казино, запусти дуэль, открой рулетку или загляни в магазин призов",
            (
                f"🎲 Казино, Дуэли и Магазин ПОРОГ Коинов\n\n"
                f"💰 Твой баланс: {coins} 🪙\n\n"
                f"Выберите раздел:"
            ),
            kb(
                ("🎰 Казино (ставка 5, 10, 15, 20, 50)", f"cas_menu:{uid}"),
                ("⚔️ Создать Дуэль (ставка 5, 10, 15, 20, 50)", f"duel_menu:{uid}"),
                ("🎡 Получасовая Рулетка (Джекпот)", f"open_roulette:{uid}"),
                ("🛒 Магазин призов ПОРОГА", f"shop_menu:{uid}")
            )
        ),

        # ПУНКТ 4: Таблица лидеров
        article(
            "top",
            "🏆 Таблица лидеров",
            "Топ по количеству монет и по активности в боте",
            top_text()
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


# ---------- КАЗИНО (ФИКСИРОВАННЫЕ СТАВКИ 5, 10, 15, 20, 50) ----------
@dp.callback_query(F.data.startswith("cas_menu:"))
async def on_casino_menu(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)
    
    u = get_user(c.from_user)
    await edit(
        c,
        f"🎰 Казино ПОРОГ Коинов\n💰 Баланс: {u['coins']} 🪙\n\nВыберите размер ставки:",
        kb(
            ("5 🪙", f"cas_bet:{owner}:5"),
            ("10 🪙", f"cas_bet:{owner}:10"),
            ("15 🪙", f"cas_bet:{owner}:15"),
            ("20 🪙", f"cas_bet:{owner}:20"),
            ("50 🪙", f"cas_bet:{owner}:50"),
            ("⬅️ Назад в меню", f"cas_back_main:{owner}")
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
        f"🎰 Казино ПОРОГА (попытка {casino_count + 1}/10)\nСтавка: {bet} 🪙\n\nВыберите цвет:",
        kb(
            ("🔴 Красное (x2)", f"cas_play:{owner}:{bet}:red"),
            ("⬛️ Черное (x2)", f"cas_play:{owner}:{bet}:black"),
            ("🟢 Зеленое (Джекпот x8)", f"cas_play:{owner}:{bet}:green"),
            ("⬅️ К выбору ставки", f"cas_menu:{owner}")
        )
    )
    await c.answer()


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

    await edit(c, f"🎰 Крутим рулетку... 🎲")
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
        msg = f"🎰 {emoji} Выпало: {name}!\nВыигрыш: +{net_win_total} 🪙\nБаланс: {new_coins} 🪙"
    else:
        net_loss = bet
        c_lost_add += net_loss
        msg = f"🎰 {emoji} Выпало: {name}\nПроигрыш: -{bet} 🪙\nБаланс: {new_coins} 🪙"

    db.execute("UPDATE users SET coins=?, casino_won=?, casino_lost=? WHERE id=?", (new_coins, c_won_add, c_lost_add, owner))
    db.commit()

    await edit(c, msg)
    await c.answer()


# ---------- ДУЭЛИ (ФИКСИРОВАННЫЕ СТАВКИ 5, 10, 15, 20, 50 БЕЗ СПИСКОВ ВЫЗОВОВ) ----------
@dp.callback_query(F.data.startswith("duel_menu:"))
async def on_duel_menu(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)
    
    u = get_user(c.from_user)
    await edit(
        c,
        f"⚔️ Дуэли ПОРОГ Коинов\n💰 Баланс: {u['coins']} 🪙\n\nВыбери ставку для дуэли (соперник найдется случайным образом):",
        kb(
            ("5 🪙", f"duel_play:{owner}:5"),
            ("10 🪙", f"duel_play:{owner}:10"),
            ("15 🪙", f"duel_play:{owner}:15"),
            ("20 🪙", f"duel_play:{owner}:20"),
            ("50 🪙", f"duel_play:{owner}:50"),
            ("⬅️ Назад в меню", f"cas_back_main:{owner}")
        )
    )
    await c.answer()


@dp.callback_query(F.data.startswith("duel_play:"))
async def on_duel_play(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    _, owner_str, bet_str = c.data.split(":")
    owner, bet = int(owner_str), int(bet_str)
    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)

    initiator = get_user(c.from_user)
    if initiator["coins"] < bet:
        return await c.answer(f"Недостаточно коинов! У тебя {initiator['coins']} 🪙", show_alert=True)

    # Ищем случайного оппонента в базе (кроме самого инициатора)
    opponents = db.execute("SELECT * FROM users WHERE id != ?", (owner,)).fetchall()
    if not opponents:
        return await c.answer("Пока нет других участников для дуэли!", show_alert=True)

    opponent_row = random.choice(opponents)
    opponent = db.execute("SELECT * FROM users WHERE id=?", (opponent_row["id"],)).fetchone()

    if opponent["coins"] < bet:
        return await c.answer(f"Случайный противник ({opponent['name']}) слишком беден для этой ставки! Попробуй еще раз.", show_alert=True)

    winner, loser = random.choice([(initiator, opponent), (opponent, initiator)])
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

    await edit(
        c,
        f"⚔️ Дуэль на {bet} 🪙 завершена!\n\n"
        f"🥊 Бойцы: {initiator['name']} vs {opponent['name']}\n"
        f"🎉 Победитель: {winner['name']} (+{winner_gain} 🪙)\n"
        f"😢 Проигравший: {loser['name']}{shield_msg}",
        kb(("🔄 Сыграть еще", f"duel_menu:{owner}"), ("⬅️ В меню", f"cas_back_main:{owner}"))
    )
    await c.answer()


@dp.callback_query(F.data.startswith("cas_back_main:"))
async def on_cas_back_main(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    u = get_user(c.from_user)
    await edit(
        c,
        f"🎲 Казино, Дуэли и Магазин ПОРОГ Коинов\n💰 Баланс: {u['coins']} 🪙\n\nВыберите раздел:",
        kb(
            ("🎰 Казино (ставка 5, 10, 15, 20, 50)", f"cas_menu:{owner}"),
            ("⚔️ Создать Дуэль (ставка 5, 10, 15, 20, 50)", f"duel_menu:{owner}"),
            ("🎡 Получасовая Рулетка (Джекпот)", f"open_roulette:{owner}"),
            ("🛒 Магазин призов ПОРОГА", f"shop_menu:{owner}")
        )
    )
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


# ---------- МАГАЗИН (ДОБАВЛЕН В РАЗДЕЛ) ----------
@dp.callback_query(F.data.startswith("shop_menu:"))
async def on_shop_menu(c: types.CallbackQuery):
    add_activity(c.from_user.id)
    owner = int(c.data.split(":")[1])
    u = get_user(c.from_user)
    coins = u["coins"]
    await edit(
        c,
        f"🛒 Магазин призов ПОРОГА:\n\n"
        f"🎬 Тема ролика — 5,000 🪙\n"
        f"🎥 Упоминание в титрах — 2,500 🪙\n"
        f"⭐ Telegram Premium — 1,600 🪙\n"
        f"🛡 3 щита защиты — 150 🪙\n"
        f"🎟 Буст x2 на 24ч — 50 🪙\n\n"
        f"💰 Ваш баланс: {coins} 🪙",
        InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🎬 Тема (5000 🪙)", callback_data=f"buy:{owner}:theme")],
            [InlineKeyboardButton(text="🎥 Титры (2500 🪙)", callback_data=f"buy:{owner}:mention")],
            [InlineKeyboardButton(text="⭐ TG Premium (1600 🪙)", callback_data=f"buy:{owner}:tgprem")],
            [InlineKeyboardButton(text="🛡 3 щита (150 🪙)", callback_data=f"buy:{owner}:shield")],
            [InlineKeyboardButton(text="🎟 Буст x2 (50 🪙)", callback_data=f"buy:{owner}:boost")],
            [InlineKeyboardButton(text="⬅️ Назад в меню", callback_data=f"cas_back_main:{owner}")]
        ])
    )
    await c.answer()


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
        await edit(c, "🎉 Тема ролика куплена! Админу отправлено уведомление.")
        await bot.send_message(ADMIN_ID, f"🚨 Купили тему ролика (5000 🪙):\n👤 {user_link}", parse_mode="HTML")
    elif item == "mention":
        await edit(c, "🎉 Упоминание в титрах куплено! Напиши админу свой ник.")
        await bot.send_message(ADMIN_ID, f"🚨 Купили упоминание (2500 🪙):\n👤 {user_link}", parse_mode="HTML")
    elif item == "tgprem":
        await edit(c, "🎉 Telegram Premium куплен! Админу отправлено уведомление.")
        await bot.send_message(ADMIN_ID, f"🚨 Купили Telegram Premium (1600 🪙):\n👤 {user_link}", parse_mode="HTML")
    elif item == "shield":
        db.execute("UPDATE users SET shield_count=shield_count+3 WHERE id=?", (owner,))
        db.commit()
        await edit(c, "🛡 Успешно! Добавлено 3 защитных щита.")
    elif item == "boost":
        expiry = (datetime.datetime.now() + datetime.timedelta(days=1)).isoformat()
        db.execute("UPDATE users SET boost_until=? WHERE id=?", (expiry, owner))
        db.commit()
        await edit(c, "💥 Буст x2 активирован на 24 часа!")

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
