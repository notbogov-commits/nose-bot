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
MAX_CASINO_BET = 50  # Максимальная ставка в обычном казино
ADMIN_ID = 1642626687  # Твой ID

bot = Bot(TOKEN)
dp = Dispatcher()

# Инициализация базы данных и безопасная миграция таблиц
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
    """
)
db.commit()

# Автоматически добавляем колонки для старых баз
try:
    db.execute("ALTER TABLE users ADD COLUMN streak INTEGER DEFAULT 0")
    db.execute("ALTER TABLE users ADD COLUMN casino_won INTEGER DEFAULT 0")
    db.execute("ALTER TABLE users ADD COLUMN casino_lost INTEGER DEFAULT 0")
    db.execute("ALTER TABLE users ADD COLUMN last_bankrupt TEXT")
    db.commit()
except sqlite3.OperationalError:
    pass


def get_user(user: types.User) -> sqlite3.Row:
    """Получает пользователя из базы или создает нового с балансом 10 коинов."""
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


def kb(*buttons: tuple[str, str]) -> InlineKeyboardMarkup:
    """Вспомогательная функция для генерации инлайн-клавиатур."""
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=t, callback_data=d)] for t, d in buttons]
    )


def get_toxicity_title(u: sqlite3.Row) -> str:
    """Определяет игровой статус/титул пользователя в зависимости от баланса."""
    if u["custom_status"]:
        return u["custom_status"]
    coins = u["coins"]
    if coins < 0:
        return "🤡 Главный должник и клоун чата"
    elif coins <= 5:
        return "😶 Тихоня"
    elif coins <= 20:
        return "💬 Комментатор"
    elif coins <= 50:
        return "🔥 Активист"
    elif coins <= 100:
        return "👑 Уважаемый душнила"
    else:
        return "🗿 Властелин комментов"


def stats_text(user: types.User) -> str:
    """Формирует текст личной статистики игрока."""
    u = get_user(user)
    title = get_toxicity_title(u)
    shield_str = f"\n🛡 Защитных щитов: {u['shield_count']}" if u["shield_count"] > 0 else ""
    c_won = u["casino_won"] if "casino_won" in u.keys() else 0
    c_lost = u["casino_lost"] if "casino_lost" in u.keys() else 0
    streak = u["streak"] if "streak" in u.keys() else 0
    
    return (
        f"📊 <b>Статистика игрока: {u['name']}</b>\n\n"
        f"🪙 Баланс: <b>{u['coins']} 🪙</b>\n"
        f"🏆 Статус: {title}{shield_str}\n"
        f"🔥 Стрик бонусов: <b>{streak}/10 дней</b>\n"
        f"⚔️ Дуэли: побед {u['wins']} | поражений {u['losses']}\n"
        f"🎰 Казино: выиграно <b>+{c_won} 🪙</b> | проиграно <b>-{c_lost} 🪙</b>\n\n"
        f"<i>💡 Все действия происходят внутри бота по кнопкам.</i>"
    )


def top_text() -> str:
    """Формирует таблицу лидеров (Топ-15)."""
    rows = db.execute("SELECT name, coins FROM users ORDER BY coins DESC LIMIT 15").fetchall()
    if not rows:
        return "🏆 <b>Рейтинг пуст.</b> Будь первым!"
    
    lines = [f"{i + 1}. {r['name']} — {r['coins']} 🪙" for i, r in enumerate(rows)]
    return "🏆 <b>Топ-15 комментаторов канала:</b>\n\n" + "\n".join(lines)


# ---------- ПРОВЕРКА И РОЗЫГРЫШ ПОЛУЧАСОВОЙ РУЛЕТКИ ----------
def check_and_run_roulette() -> str:
    """Розыгрыш получасовой рулетки."""
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
            
            announcement = f"🎡 <b>Итоги получасовой рулетки!</b>\nБанк составил: <b>{total_bank} 🪙</b>\nПобедитель: <b>{winner['name']}</b> забирает весь банк! 🎉\n\n"
        
        db.execute("DELETE FROM roulette_bids")
        new_next_spin = (now + datetime.timedelta(minutes=30)).isoformat()
        db.execute("UPDATE roulette_info SET value = ? WHERE key = 'next_spin'", (new_next_spin,))
        db.commit()
        return announcement
    return ""


def get_roulette_content() -> tuple[str, InlineKeyboardMarkup]:
    """Генерирует контент для получасовой рулетки."""
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
            roulette_lines.append(f"• <b>{b['name']}</b> — вложил <b>{b['amount']} 🪙</b> (шанс на куш: <b>{chance:.1f}%</b>)")
    else:
        roulette_lines.append("<i>Пока никто не сделал ставку. Стань первым!</i>")

    text = (
        f"🎡 <b>Получасовая Рулетка ПОРОГА</b>\n\n"
        f"⏱ <b>До новой крутки осталось:</b> <code>{timer_str}</code>\n"
        f"💰 Общий банк: <b>{total_bank} 🪙</b>\n"
        f"<i>Розыгрыш происходит автоматически каждые 30 минут. Больше вложил — выше шанс на куш!</i>\n\n"
        f"<b>Список участников:</b>\n" + "\n".join(roulette_lines) + f"\n\n"
        f"<b>Сделай ставку в банк:</b>"
    )
    markup = kb(
        ("➕ Вложить 10 🪙", "r_bet:10"),
        ("➕ Вложить 50 🪙", "r_bet:50"),
        ("➕ Вложить 100 🪙", "r_bet:100"),
        ("➕ Вложить 500 🪙", "r_bet:500"),
    )
    return text, markup


def do_bonus(user: types.User) -> str:
    """Ежедневный бонус со стриком и честным бустом (добавление монет из воздуха)."""
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
            return f"⏳ Бонус уже получен! До следующей попытки осталось: <b>{hours} ч. {mins} мин. {secs} сек.</b>\n🔥 Текущий стрик: <b>{streak}/10 дней</b>."
        elif diff > datetime.timedelta(days=2):
            streak = 0

    streak = min(streak + 1, 10)
    base_delta = 9 + streak
    
    boost_active = u["boost_until"] and datetime.datetime.fromisoformat(u["boost_until"]) > now
    extra_bonus = base_delta if boost_active else 0  # Буст насыпает сверху такую же сумму из воздуха!
    
    total_delta = base_delta + extra_bonus
    new_coins = u["coins"] + total_delta
    
    db.execute("UPDATE users SET coins=?, last_bonus=?, streak=? WHERE id=?", (new_coins, now.isoformat(), streak, user.id))
    db.commit()
    
    boost_note = f" (💥 Буст x2: +{base_delta} сверху из воздуха!)" if boost_active else ""
    return f"🎁 <b>Бонус забран (День {streak}/10)!</b> Начислено <b>+{total_delta} 🪙</b>{boost_note}\n🔥 Стрик увеличен!\n🪙 Баланс: <b>{new_coins} 🪙</b>"


def do_work(user: types.User) -> str:
    """Вброс тейка с уходом в минус и честным удвоением при бусте (из воздуха)."""
    check_and_run_roulette()
    u = get_user(user)
    now = datetime.datetime.now()
    
    if u["last_work"]:
        last_dt = datetime.datetime.fromisoformat(u["last_work"])
        if now - last_dt < datetime.timedelta(hours=1):
            time_left = datetime.timedelta(hours=1) - (now - last_dt)
            mins, secs = divmod(int(time_left.total_seconds()), 60)
            return f"⏳ Лимит вбросов исчерпан! До следующей попытки осталось: <b>{mins} мин. {secs} сек.</b>"

    base_gain = 3
    base_loss = 3
    
    boost_active = u["boost_until"] and datetime.datetime.fromisoformat(u["boost_until"]) > now
    
    success = random.random() < 0.5
    if success:
        gain = base_gain + (base_gain if boost_active else 0)  # При бусте добавляем столько же из воздуха
        new_coins = u["coins"] + gain
        boost_note = " (💥 Буст x2: +3 из воздуха!)" if boost_active else ""
        msg = f"💬 <b>Тейк зашел!</b> Зрители оценили мнение, получено <b>+{gain} 🪙</b>.{boost_note}\n🪙 Баланс: <b>{new_coins} 🪙</b>"
    else:
        loss = base_loss + (base_loss if boost_active else 0)  # При бусте убытки тоже удваиваются (х2 к потерям)
        new_coins = u["coins"] - loss
        boost_note = " (💥 Буст x2: х2 к потерям!)" if boost_active else ""
        msg = f"📉 <b>Кринж...</b> Комментаторы заминусили вброс. Потеряно <b>-{loss} 🪙</b>.{boost_note}\n🪙 Баланс: <b>{new_coins} 🪙</b>"

    db.execute("UPDATE users SET coins=?, last_work=? WHERE id=?", (new_coins, now.isoformat(), user.id))
    db.commit()
    return msg


def do_bankrupt(user: types.User) -> str:
    """Кнопка Банкрот: доступна раз в неделю только при отрицательном балансе."""
    u = get_user(user)
    if u["coins"] >= 0:
        return "🚫 <b>Ошибка!</b> Функция «Банкрот» доступна только тем, у кого отрицательный баланс (долги)."
    
    now = datetime.datetime.now()
    if u["last_bankrupt"]:
        last_dt = datetime.datetime.fromisoformat(u["last_bankrupt"])
        if now - last_dt < datetime.timedelta(days=7):
            time_left = datetime.timedelta(days=7) - (now - last_dt)
            days = time_left.days
            hours, _ = divmod(time_left.seconds, 3600)
            return f"⏳ Процедура банкротства уже запускалась! Следующая будет доступна через {days} дн. {hours} ч."

    db.execute("UPDATE users SET coins=0, last_bankrupt=? WHERE id=?", (now.isoformat(), user.id))
    db.commit()
    return "🏛 <b>Процедура банкротства завершена!</b> Все твои долги аннулированы, баланс обнулен до <b>0 🪙</b>. Начинай с чистого листа!"


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
        await m.answer_document(FSInputFile("game.db"), caption="📦 Бэкап базы данных game.db")


@dp.message(Command("start"))
async def start(m: types.Message):
    bot_info = await bot.get_me()
    await m.answer(f"👋 Бот запущен! Напиши <code>@{bot_info.username}</code> в чате канала.", parse_mode="HTML")


@dp.message()
async def handle_all_messages(message: types.Message):
    if not message.from_user or message.from_user.is_bot:
        return

    text_lower = message.text.lower() if message.text else ""

    if text_lower in ["!игра", "игра", "/game"]:
        welcome_text = "🔥 Игровая экономика канала ПОРОГ:"
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

            teaser = f"🔥 {first_name}, залетай в игровую экономику канала ПОРОГ! Копи коины и забирай призы 👇"
            keyboard = InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🎮 Открыть меню игры", switch_inline_query_current_chat="")]
            ])
            await message.reply(teaser, reply_markup=keyboard, parse_mode="HTML")


# ---------- ИНЛАЙН-МЕНЮ БОТА ----------
@dp.inline_query()
async def inline_query_menu(q: types.InlineQuery):
    roulette_notice = check_and_run_roulette()
    
    uid = q.from_user.id
    u = get_user(q.from_user)
    coins = u["coins"]
    text = q.query.strip()

    bet = int(text) if text.isdigit() and int(text) > 0 else DEFAULT_BET
    bet = min(bet, MAX_CASINO_BET)

    r_text, r_markup = get_roulette_content()
    if roulette_notice:
        r_text = roulette_notice + r_text

    results = [
        article(
            "info",
            "📌 Правила и информация о боте",
            "Как играть, зарабатывать коины, стрик, рулетка и призы",
            (
                "📌 <b>Добро пожаловать в игровую экономику ПОРОГА!</b>\n\n"
                "🤖 <b>Правила и возможности:</b>\n"
                "• 🎁 <b>Ежедневный стрик:</b> Забирай бонус каждые сутки (от 10 до 19 коинов за 10 дней подряд).\n"
                "• 💬 <b>Вброс тейков:</b> Раз в час кидай мнение (±3 коина). Можно уходить в минус!\n"
                "• 🎰 <b>Казино:</b> До 10 раз в сутки (Красное/Черное x2, Зеленое x8).\n"
                "• 🎡 <b>Получасовая рулетка:</b> Вкладывай монеты в банк, розыгрыш каждые 30 минут!\n"
                "• ⚔️ <b>Дуэли:</b> Сражайся с другими игроками на коины (проигрыш удваивается при бусте).\n"
                "• 🏛 <b>Банкрот:</b> Если ушел в минус, раз в неделю можно списать все долги кнопкой в меню бонуса!\n\n"
                f"💰 Твой текущий баланс: <b>{coins} 🪙</b>"
            ),
        ),
        article(
            "shop",
            "🛒 Магазин призов ПОРОГА",
            "Потрать накопленные коины на реальные призы и усиления",
            (
                "🛒 <b>Магазин призов ПОРОГА:</b>\n\n"
                "1️⃣ 🎬 <b>Тема ролика — 5,000 🪙</b>\n"
                "   <i>(Обсуждаем тему ролика под ваши желания, и я снимаю на нее!)</i>\n\n"
                "2️⃣ 🎥 <b>Упоминание в титрах — 2,500 🪙</b>\n"
                "   <i>(Ваш ник попадет в титры / вставку с благодарностью в следующем ролике)</i>\n\n"
                "3️⃣ ⭐ <b>Telegram Premium — 1,600 🪙</b>\n"
                "   <i>(Месяц подписки за активность в боте)</i>\n\n"
                "4️⃣ 🛡 <b>3 щита защиты — 150 🪙</b>\n"
                "   <i>(Защитные щиты для безопасных дуэлей)</i>\n\n"
                "5️⃣ 🎟 <b>Буст x2 на 24ч — 50 🪙</b>\n"
                "   <i>(Удваивает бонус из воздуха, удваивает чистый выигрыш в казино, удваивает тейки и удваивает проигрыши/минусы на целый день!)</i>\n\n"
                f"💰 Ваш баланс: <b>{coins} 🪙</b>"
            ),
            InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text="🎬 Тема ролика (5000 🪙)", callback_data=f"buy:{uid}:theme")],
                [InlineKeyboardButton(text="🎥 Упоминание в титрах (2500 🪙)", callback_data=f"buy:{uid}:mention")],
                [InlineKeyboardButton(text="⭐ Telegram Premium (1600 🪙)", callback_data=f"buy:{uid}:tgprem")],
                [InlineKeyboardButton(text="🛡 3 щита (150 🪙)", callback_data=f"buy:{uid}:shield")],
                [InlineKeyboardButton(text="🎟 Буст x2 (50 🪙)", callback_data=f"buy:{uid}:boost")],
            ])
        ),
        article(
            "roulette",
            "🎡 Получасовая Рулетка",
            "Вложи коины, следи за таймером, шансом на куш и забирай банк каждые 30 минут!",
            r_text,
            r_markup
        ),
        article(
            "casino",
            "🎰 Казино ПОРОГА",
            "Ставка до 50 🪙 • Красное/Черное (x2), Зеленое (x8) • 10 игр в сутки",
            (
                "🎰 <b>Казино ПОРОГА</b> (лимит: 10 раз в сутки)\n\n"
                "• 🔴 <b>Красное</b> / ⬛️ <b>Черное</b> — выплата x2\n"
                "• 🟢 <b>Зеленое</b> — Джекпот x8\n"
                "<i>(💥 Буст x2 добавляет сверху точно такой же чистый выигрыш из воздуха!)</i>\n\n"
                f"💰 Твой баланс: <b>{coins} 🪙</b>\n\n"
                "<b>Выберите размер ставки:</b>"
            ),
            kb(
                ("5 🪙", f"cas_bet:{uid}:5"),
                ("10 🪙", f"cas_bet:{uid}:10"),
                ("15 🪙", f"cas_bet:{uid}:15"),
                ("20 🪙", f"cas_bet:{uid}:20"),
                ("30 🪙", f"cas_bet:{uid}:30"),
                ("50 🪙", f"cas_bet:{uid}:50"),
            )
        ),
        article(
            "duel",
            "⚔️ Дуэль на коины",
            "Вызвать оппонента на дуэль (ставка от 5 до 50 коинов)",
            (
                f"⚔️ <b>Дуэль комментаторов</b>\n\n"
                f"Сыграй на коины с другим участником канала!\n"
                f"• Ставка: <b>{bet} 🪙</b>\n"
                f"• Победитель забирает банк, проигравший теряет ставку (при бусте проигрыш или победа удваиваются).\n"
                f"*(Учитываются щиты защиты)*\n\n"
                f"💰 Твой баланс: <b>{coins} 🪙</b>\n\n"
                f"<b>Нажми кнопку ниже, чтобы отправить вызов в чат:</b>"
            ),
            kb(("⚔️ Бросить вызов на дуэль (%d 🪙)" % bet, f"duel:{uid}:{bet}")),
        ),
        article(
            "bonus",
            "🎁 Ежедневный бонус & Банкрот",
            "Забирай бонус каждый день или спиши долги раз в неделю!",
            (
                f"🎁 <b>Ежедневный бонус и Банкрот</b>\n\n"
                f"Текущий стрик: <b>{u['streak']}/10 дней</b>\n"
                f"<i>Забирай бонус ежедневно для роста награды. Если ушел в минус — используй кнопку банкротства (доступно раз в неделю при долгах)!</i>"
            ),
            kb(
                ("Забрать бонус 🎁", f"bonus:{uid}"),
                ("🏛 Списать долги (Банкрот)", f"bankrupt:{uid}")
            )
        ),
        article(
            "work",
            "💬 Вбросить тейк в комменты",
            "Шанс 50/50 (+3 / -3 коина • раз в час • можно в минус)",
            (
                f"💬 <b>Вбросить тейк</b>\n\n"
                f"Шанс 50 на 50: либо +3 коина, либо -3 коина (с бустом x2 — ±6 коинов или х2 к минусу!).\n"
                f"<i>⚠️ Разрешено уходить в минус.</i>"
            ),
            kb(("Вбросить тейк 💬", f"work:{uid}")),
        ),
        article(
            "stats",
            "📊 Моя статистика",
            "Твой баланс, стрик, казино и победы в дуэлях",
            stats_text(q.from_user),
        ),
        article(
            "top",
            "🏆 Рейтинг комментаторов",
            "Таблица лидеров канала по количеству коинов",
            top_text(),
        ),
    ]

    await q.answer(results, cache_time=0, is_personal=True)


async def edit(c: types.CallbackQuery, text: str, markup=None):
    await bot.edit_message_text(text, inline_message_id=c.inline_message_id, reply_markup=markup, parse_mode="HTML")


@dp.callback_query(F.data.startswith("bonus:"))
async def on_bonus(c: types.CallbackQuery):
    res_text = do_bonus(c.from_user)
    await edit(c, res_text)
    await c.answer()


@dp.callback_query(F.data.startswith("bankrupt:"))
async def on_bankrupt(c: types.CallbackQuery):
    if c.from_user.id != int(c.data.split(":")[1]):
        return await c.answer("Не твоя кнопка", show_alert=True)
    res_text = do_bankrupt(c.from_user)
    await c.answer(res_text, show_alert=True)


@dp.callback_query(F.data.startswith("work:"))
async def on_work(c: types.CallbackQuery):
    res_text = do_work(c.from_user)
    await edit(c, res_text)
    await c.answer()


# ---------- ЛОГИКА ПОЛУЧАСОВОЙ РУЛЕТКИ С ТАЙМЕРОМ ----------
@dp.callback_query(F.data.startswith("r_bet:"))
async def on_roulette_bet_inline(c: types.CallbackQuery):
    check_and_run_roulette()
    _, amount_str = c.data.split(":")
    amount = int(amount_str)
    
    u = get_user(c.from_user)
    new_coins = u["coins"] - amount  # Теперь можно уходить в минус и в рулетке!
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
    await c.answer(f"✅ Успешно вложено {amount} 🪙 в банк рулетки!", show_alert=True)


# ---------- ЛОГИКА КАЗИНО С БУСТОМ ИЗ ВОЗДУХА ----------
@dp.callback_query(F.data.startswith("cas_bet:"))
async def on_casino_bet_chosen(c: types.CallbackQuery):
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
        return await c.answer(f"🚫 Лимит исчерпан (10/10)! Сброс лимита через: {hours} ч. {mins} мин. {secs} сек.", show_alert=True)

    await edit(
        c,
        f"🎰 <b>Казино ПОРОГА</b> (попытка {casino_count + 1}/10)\nСтавка: <b>{bet} 🪙</b>\n\n<i>Выберите цвет:</i>",
        kb(
            ("🔴 Красное (x2)", f"cas_play:{owner}:{bet}:red"),
            ("⬛️ Черное (x2)", f"cas_play:{owner}:{bet}:black"),
            ("🟢 Зеленое (Джекпот x8)", f"cas_play:{owner}:{bet}:green"),
            ("⬅️ Изменить ставку", f"cas_back:{owner}")
        )
    )
    await c.answer()


@dp.callback_query(F.data.startswith("cas_back:"))
async def on_casino_back(c: types.CallbackQuery):
    owner = int(c.data.split(":")[1])
    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)
    u = get_user(c.from_user)
    await edit(
        c,
        f"🎰 <b>Казино ПОРОГА</b>\n💰 Баланс: <b>{u['coins']} 🪙</b>\n\n<b>Выберите размер ставки:</b>",
        kb(
            ("5 🪙", f"cas_bet:{owner}:5"),
            ("10 🪙", f"cas_bet:{owner}:10"),
            ("15 🪙", f"cas_bet:{owner}:15"),
            ("20 🪙", f"cas_bet:{owner}:20"),
            ("30 🪙", f"cas_bet:{owner}:30"),
            ("50 🪙", f"cas_bet:{owner}:50"),
        )
    )
    await c.answer()


@dp.callback_query(F.data.startswith("cas_play:"))
async def on_casino_play(c: types.CallbackQuery):
    _, owner_str, bet_str, color = c.data.split(":")
    owner, bet = int(owner_str), int(bet_str)
    if c.from_user.id != owner:
        return await c.answer("Не твоя кнопка", show_alert=True)

    u = get_user(c.from_user)
    now = datetime.datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    casino_count = u["casino_count"] if u["last_casino_date"] == today_str else 0
    if casino_count >= 10:
        return await c.answer("Ошибка лимита!", show_alert=True)

    new_casino_count = casino_count + 1
    new_coins = u["coins"] - bet
    db.execute("UPDATE users SET coins=?, casino_count=?, last_casino_date=? WHERE id=?", (new_coins, new_casino_count, today_str, owner))
    db.commit()

    await edit(c, f"🎰 <b>Крутим рулетку...</b> 🎲")
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

    c_won_add = u["casino_won"] if "casino_won" in u.keys() else 0
    c_lost_add = u["casino_lost"] if "casino_lost" in u.keys() else 0

    if color == w_color:
        mult = 8 if color == "green" else 2
        winnings = bet * mult
        net_win = winnings - bet  # Чистый выигрыш

        boost_active = u["boost_until"] and datetime.datetime.fromisoformat(u["boost_until"]) > now
        extra_win = net_win if boost_active else 0  # Буст добавляет такой же чистый выигрыш из воздуха!
        
        total_winnings = winnings + extra_win
        net_win_total = net_win + extra_win
        
        new_coins += total_winnings
        c_won_add += net_win_total

        msg_boost = f" (💥 Буст x2: +{net_win} из воздуха!)" if boost_active else ""
        msg = f"🎰 <b>{emoji} Выпало: {name}!</b>{msg_boost}\nВыигрыш: <b>+{net_win_total} 🪙</b>\nБаланс: <b>{new_coins} 🪙</b>"
    else:
        net_loss = bet
        c_lost_add += net_loss
        msg = f"🎰 <b>{emoji} Выпало: {name}</b>\nПроигрыш: <b>-{bet} 🪙</b>\nБаланс: <b>{new_coins} 🪙</b>"

    db.execute("UPDATE users SET coins=?, casino_won=?, casino_lost=? WHERE id=?", (new_coins, c_won_add, c_lost_add, owner))
    db.commit()

    await edit(c, msg)
    await c.answer()


# ---------- ЛОГИКА ДУЭЛЕЙ С УЧЕТОМ БУСТА ----------
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

    winner, loser = random.choice([(a, b), (b, a)])
    
    # Проверяем буст у победителя и проигравшего для удвоения ставки
    now = datetime.datetime.now()
    
    # Списание у проигравшего (если буст — теряет в двойне)
    loser_boost = loser["boost_until"] and datetime.datetime.fromisoformat(loser["boost_until"]) > now
    loser_loss = (bet * 2) if loser_boost else bet
    
    # Начисление победителю (если буст — получает в двойне банк)
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
    
    await edit(c, f"⚔️ <b>Итог дуэли:</b> победил <b>{winner['name']}</b> (+{winner_gain} 🪙), забрав банк у <b>{loser['name']}</b>{shield_msg}!")
    await c.answer()


# ---------- МАГАЗИН ПРИЗОВ ЗА КОИНЫ ----------
@dp.callback_query(F.data.startswith("buy:"))
async def on_buy(c: types.CallbackQuery):
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
        await edit(c, "🎉 <b>Тема ролика куплена!</b> Админу отправлено уведомление.")
        await bot.send_message(ADMIN_ID, f"🚨 <b>Купили тему ролика (5000 🪙):</b>\n👤 {user_link}", parse_mode="HTML")
    elif item == "mention":
        await edit(c, "🎉 <b>Упоминание в титрах куплено!</b> Напиши админу свой ник.")
        await bot.send_message(ADMIN_ID, f"🚨 <b>Купили упоминание (2500 🪙):</b>\n👤 {user_link}", parse_mode="HTML")
    elif item == "tgprem":
        await edit(c, "🎉 <b>Telegram Premium куплен!</b> Админу отправлено уведомление.")
        await bot.send_message(ADMIN_ID, f"🚨 <b>Купили Telegram Premium (1600 🪙):</b>\n👤 {user_link}", parse_mode="HTML")
    elif item == "shield":
        db.execute("UPDATE users SET shield_count=shield_count+3 WHERE id=?", (owner,))
        db.commit()
        await edit(c, "🛡 <b>Успешно!</b> Добавлено 3 защитных щита.")
    elif item == "boost":
        expiry = (datetime.datetime.now() + datetime.timedelta(days=1)).isoformat()
        db.execute("UPDATE users SET boost_until=? WHERE id=?", (expiry, owner))
        db.commit()
        await edit(c, "💥 <b>Буст активирован!</b> На 24 часа бонус дает монеты из воздуха, чистый выигрыш в казино удваивается, тейки и дуэли приносят х2 при победе или х2 при проигрыше!")

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
