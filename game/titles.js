// ЮТУБЕРЫ — генератор названий видео и варианты названий каналов.
// Шаблоны повторяют популярные форматы роликов. {a}, {b} — слова, {n} — число.
// Русские и английские списки выровнены по индексам, поэтому название переводится при смене языка.
window.TITLES = {
  nums: [100, 7, 30, 1000, 5, 10, 48, 365, 50, 12],
  // Каждый шаблон: [текст, слова для {a}, слова для {b}]. Слова уже в нужном падеже.
  ru: {
    games: [
      ['{n} дней выживания в {a}', ['хардкорном режиме', 'мире без ночи', 'пустыне', 'зомби-апокалипсисе', 'бесконечной пещере']],
      ['Прошёл {a} {b}', ['самую сложную игру', 'игру из детства', 'хоррор', 'игру с худшими отзывами', 'бесплатную игру'], ['без единого урона', 'вслепую', 'с одним предметом', 'за один вечер', 'без прыжков']],
      ['Эта {a} сломала мне мозг', ['головоломка', 'инди-игра', 'бесплатная игра', 'игра на одну кнопку', 'старая игра']],
      ['Построил {a} за {n} часов', ['огромный город', 'секретную базу', 'замок из ста комнат', 'работающий компьютер', 'парк аттракционов']],
      ['Спидран {a} за {n} минут', ['первой части', 'игры из детства', 'самого сложного уровня', 'всей игры']],
      ['Нашёл {a}, о которой никто не знает', ['секретную концовку', 'скрытую комнату', 'пасхалку', 'тайную локацию']]
    ],
    cooking: [
      ['Готовлю {a} за {n} минут', ['бургер', 'рамен', 'торт', 'пасту', 'завтрак на всю семью']],
      ['Дешёвый {a} против дорогого', ['бургер', 'стейк', 'торт', 'кофе', 'суши-сет']],
      ['Повторяю {a} из фильма', ['пиццу', 'завтрак', 'торт', 'суп', 'бургер']],
      ['Ем только {a} {n} часов', ['уличную еду', 'еду из автомата', 'острые блюда', 'фастфуд', 'сладкое']],
      ['Бабушкин рецепт: {a}', ['пирожки', 'борщ', 'блины', 'плов', 'вареники']],
      ['Пробую {a} со всего мира', ['уличную еду', 'странные сладости', 'чипсы', 'газировки', 'сыры']]
    ],
    pranks: [
      ['Последний, кто {a}, получит $10 000', ['выйдет из круга', 'уснёт', 'засмеётся', 'отпустит руку', 'моргнёт']],
      ['{n} часов {a}', ['в пустом торговом центре', 'в коробке', 'в машине', 'в шалаше из подушек', 'без телефона']],
      ['Говорю «да» на всё {n} часов', []],
      ['Разыграл друга: {a}', ['комната из шариков', 'невидимая дверь', 'соль вместо сахара', 'говорящий холодильник', 'исчезнувшая машина']],
      ['Кто дольше {a}?', ['продержится в бассейне', 'не будет есть сладкое', 'простоит на одной ноге', 'не возьмёт телефон']],
      ['Неделю живу {a}', ['в костюме динозавра', 'по правилам младшего брата', 'без интернета', 'на крыше']]
    ],
    tech: [
      ['Купил самый дешёвый {a} на маркетплейсе', ['телефон', 'ноутбук', 'планшет', 'монитор', 'смарт-телевизор']],
      ['{a} за $50 против $1500', ['Телефон', 'Ноутбук', 'Наушники', 'Монитор', 'Видеокарта']],
      ['{a} спустя {n} дней: стоит ли брать?', ['Новый телефон', 'Робот-пылесос', 'Умные часы', 'Игровой ноутбук', 'Электросамокат']],
      ['Собрал {a} своими руками', ['игровой ПК', 'умный дом', 'сетап для стрима', 'домашний сервер', 'ретро-консоль']],
      ['Проверил {n} странных гаджетов', []],
      ['Не покупайте {a}, пока не посмотрите это', ['телефон', 'ноутбук', 'наушники', 'видеокарту', 'монитор']]
    ],
    truecrime: [
      ['Загадочное исчезновение {a}', ['смотрителя маяка', 'туристов в горах', 'пассажира ночного поезда', 'целого посёлка', 'капитана корабля']],
      ['Дело, которое не могут раскрыть {n} лет', []],
      ['{a}: что случилось на самом деле', ['Пропавшая картина', 'Пустой отель', 'Кассета на чердаке', 'Исчезнувший самолёт', 'Следы на снегу']],
      ['Самое странное ограбление {a}', ['банка', 'музея', 'ювелирного магазина', 'поезда', 'казино']],
      ['Он оставил одну улику: {a}', ['ключ от сейфа', 'письмо без адреса', 'часы, остановившиеся в 3:15', 'старую фотографию', 'билет в кино']],
      ['Тайна {a}', ['заброшенного отеля', 'острова без людей', 'пустой деревни', 'старого маяка', 'запертой комнаты']]
    ],
    vlog: [
      ['Мой день как {a}', ['ютубер', 'студент', 'фрилансер', 'бариста', 'курьер']],
      ['Переехал в {a}', ['новую квартиру', 'другой город', 'деревню', 'маленький дом', 'общежитие']],
      ['Неделя без {a}', ['сахара', 'телефона', 'соцсетей', 'кофе', 'интернета']],
      ['Поехал в {a} без плана', ['горы', 'другой город', 'путешествие', 'поход', 'отпуск']],
      ['Что я ем за день как {a}', ['ютубер', 'студент', 'спортсмен', 'программист']],
      ['Утренняя рутина ютубера', []]
    ],
    music: [
      ['Пишу хит за {n} часов', []],
      ['Кавер на {a}', ['песню из рекламы', 'мелодию из мультика', 'старый хит', 'саундтрек игры', 'песню из детства']],
      ['Трек из звуков {a}', ['кухни', 'метро', 'дождя', 'стаканов с водой', 'старого синтезатора']],
      ['Играю {a} на {n} инструментах', ['одну песню', 'гимн школы', 'колыбельную', 'рингтон']],
      ['Реакция на мой первый трек', []],
      ['Как звучит {a} на {b}', ['хит', 'колыбельная', 'песня из рекламы', 'саундтрек'], ['укулеле', 'пианино за $10', 'гитаре без струны', 'детском синтезаторе']]
    ],
    science: [
      ['Что будет, если {a}?', ['заморозить газировку', 'нагреть магнит', 'бросить яйцо с крыши', 'смешать краску и масло', 'положить телефон в рис']],
      ['Собрал {a} своими руками', ['робота', 'радио', 'катапульту', 'водяную ракету', 'солнечную печку']],
      ['Проверяю {n} лайфхаков из интернета', []],
      ['Сделал {a} из мусора', ['робота', 'лодку', 'лампу', 'колонку', 'вертолёт']],
      ['Можно ли {a}?', ['вырастить кристалл дома', 'сварить мыло на кухне', 'зажечь сталь', 'сделать радугу в комнате', 'заморозить кипяток']],
      ['Построил {a} за {n} часов', ['вулкан', 'мини-гидроэлектростанцию', 'катапульту', 'робота']]
    ],
    fitness: [
      ['{n} отжиманий каждый день: результат', []],
      ['Тренируюсь как {a} {n} дней', ['супергерой', 'олимпийский чемпион', 'боксёр', 'гимнаст', 'солдат']],
      ['Тренировка дома без инвентаря: {a}', ['пресс за 10 минут', 'всё тело', 'растяжка', 'кардио', 'ноги']],
      ['Ем как {a} целый день', ['бодибилдер', 'олимпийский пловец', 'боксёр', 'марафонец']],
      ['Пробежал {a} без подготовки', ['марафон', 'полумарафон', '10 километров', 'забег по горам']],
      ['Мой прогресс за {n} дней', []]
    ],
    asmr: [
      ['АСМР {a} для сна', ['стрижка', 'сказка', 'массаж', 'библиотека', 'кафе']],
      ['{n} часов звуков {a}', ['дождя', 'камина', 'моря', 'леса', 'клавиатуры']],
      ['Тихий шёпот: {a}', ['сказка на ночь', 'рецепт печенья', 'прогноз погоды', 'история замка']],
      ['Звуки {a} для учёбы', ['дождя', 'кафе', 'библиотеки', 'поезда', 'камина']],
      ['Мурашки за {n} минут', []],
      ['АСМР, но {a}', ['без слов', 'с котом', 'в лесу', 'на кухне', 'в поезде']]
    ]
  },
  en: {
    games: [
      ['{n} days surviving in {a}', ['hardcore mode', 'a world without night', 'the desert', 'a zombie apocalypse', 'an endless cave']],
      ['I beat {a} {b}', ['the hardest game', 'my childhood game', 'a horror game', 'the worst-rated game', 'a free game'], ['without taking damage', 'blindfolded', 'with one item', 'in one evening', 'without jumping']],
      ['This {a} broke my brain', ['puzzle game', 'indie game', 'free game', 'one-button game', 'old game']],
      ['I built {a} in {n} hours', ['a huge city', 'a secret base', 'a 100-room castle', 'a working computer', 'a theme park']],
      ['Speedrunning {a} in {n} minutes', ['the first game', 'my childhood game', 'the hardest level', 'the whole game']],
      ['I found {a} nobody knows about', ['a secret ending', 'a hidden room', 'an Easter egg', 'a secret location']]
    ],
    cooking: [
      ['Making {a} in {n} minutes', ['a burger', 'ramen', 'a cake', 'pasta', 'family breakfast']],
      ['Cheap {a} vs expensive {a}', ['burger', 'steak', 'cake', 'coffee', 'sushi']],
      ['Recreating {a} from a movie', ['the pizza', 'the breakfast', 'the cake', 'the soup', 'the burger']],
      ['Eating only {a} for {n} hours', ['street food', 'vending machine food', 'spicy food', 'fast food', 'sweets']],
      ['Grandma\'s recipe: {a}', ['pies', 'borscht', 'pancakes', 'pilaf', 'dumplings']],
      ['Trying {a} from around the world', ['street food', 'weird sweets', 'chips', 'sodas', 'cheese']]
    ],
    pranks: [
      ['Last to {a} wins $10,000', ['leave the circle', 'fall asleep', 'laugh', 'let go', 'blink']],
      ['{n} hours {a}', ['in an empty mall', 'in a box', 'in a car', 'in a pillow fort', 'without a phone']],
      ['Saying yes to everything for {n} hours', []],
      ['I pranked my friend: {a}', ['a room full of balloons', 'the invisible door', 'salt instead of sugar', 'a talking fridge', 'the missing car']],
      ['Who can {a} longest?', ['stay in the pool', 'go without sweets', 'stand on one leg', 'ignore their phone']],
      ['Living {a} for a week', ['in a dinosaur costume', 'by my little brother\'s rules', 'without internet', 'on the roof']]
    ],
    tech: [
      ['I bought the cheapest {a} online', ['phone', 'laptop', 'tablet', 'monitor', 'smart TV']],
      ['$50 {a} vs $1500 {a}', ['phone', 'laptop', 'headphones', 'monitor', 'graphics card']],
      ['{a} after {n} days: worth it?', ['New phone', 'Robot vacuum', 'Smartwatch', 'Gaming laptop', 'E-scooter']],
      ['I built {a} myself', ['a gaming PC', 'a smart home', 'a streaming setup', 'a home server', 'a retro console']],
      ['Testing {n} weird gadgets', []],
      ['Don\'t buy {a} before watching this', ['a phone', 'a laptop', 'headphones', 'a graphics card', 'a monitor']]
    ],
    truecrime: [
      ['The mysterious disappearance of {a}', ['a lighthouse keeper', 'hikers in the mountains', 'a night-train passenger', 'an entire village', 'a ship captain']],
      ['A case unsolved for {n} years', []],
      ['{a}: what really happened', ['The missing painting', 'The empty hotel', 'The tape in the attic', 'The vanished plane', 'Footprints in the snow']],
      ['The strangest {a} robbery', ['bank', 'museum', 'jewelry store', 'train', 'casino']],
      ['He left one clue: {a}', ['a safe key', 'a letter with no address', 'a clock stopped at 3:15', 'an old photo', 'a movie ticket']],
      ['The mystery of {a}', ['the abandoned hotel', 'the empty island', 'the ghost village', 'the old lighthouse', 'the locked room']]
    ],
    vlog: [
      ['A day in my life as a {a}', ['YouTuber', 'student', 'freelancer', 'barista', 'courier']],
      ['I moved to {a}', ['a new apartment', 'another city', 'the countryside', 'a tiny house', 'a dorm']],
      ['A week without {a}', ['sugar', 'my phone', 'social media', 'coffee', 'internet']],
      ['Went {a} with no plan', ['to the mountains', 'to another city', 'on a trip', 'hiking', 'on vacation']],
      ['What I eat in a day as a {a}', ['YouTuber', 'student', 'athlete', 'programmer']],
      ['My morning routine as a YouTuber', []]
    ],
    music: [
      ['Writing a hit in {n} hours', []],
      ['Covering {a}', ['a TV jingle', 'a cartoon theme', 'an old hit', 'a game soundtrack', 'a song from my childhood']],
      ['A track made of {a} sounds', ['kitchen', 'subway', 'rain', 'water glass', 'old synth']],
      ['Playing {a} on {n} instruments', ['one song', 'the school anthem', 'a lullaby', 'a ringtone']],
      ['Reacting to my first track', []],
      ['What {a} sounds like on {b}', ['a hit', 'a lullaby', 'a TV jingle', 'a soundtrack'], ['ukulele', 'a $10 piano', 'a guitar missing a string', 'a toy synth']]
    ],
    science: [
      ['What happens if you {a}?', ['freeze soda', 'heat a magnet', 'drop an egg from a roof', 'mix paint and oil', 'put a phone in rice']],
      ['I built {a} myself', ['a robot', 'a radio', 'a catapult', 'a water rocket', 'a solar oven']],
      ['Testing {n} internet life hacks', []],
      ['Making {a} from trash', ['a robot', 'a boat', 'a lamp', 'a speaker', 'a helicopter']],
      ['Can you {a}?', ['grow a crystal at home', 'make soap in the kitchen', 'set steel on fire', 'make a rainbow indoors', 'freeze boiling water']],
      ['Built {a} in {n} hours', ['a volcano', 'a mini hydro plant', 'a catapult', 'a robot']]
    ],
    fitness: [
      ['{n} push-ups every day: results', []],
      ['Training like a {a} for {n} days', ['superhero', 'Olympic champion', 'boxer', 'gymnast', 'soldier']],
      ['Home workout, no equipment: {a}', ['10-minute abs', 'full body', 'stretching', 'cardio', 'legs']],
      ['Eating like a {a} for a day', ['bodybuilder', 'Olympic swimmer', 'boxer', 'marathon runner']],
      ['Running {a} with no training', ['a marathon', 'a half marathon', '10 km', 'a mountain race']],
      ['My {n}-day progress', []]
    ],
    asmr: [
      ['ASMR {a} for sleep', ['haircut', 'bedtime story', 'massage', 'library', 'café']],
      ['{n} hours of {a} sounds', ['rain', 'fireplace', 'ocean', 'forest', 'keyboard']],
      ['Soft whispers: {a}', ['a bedtime story', 'a cookie recipe', 'the weather forecast', 'a castle tale']],
      ['{a} sounds for studying', ['Rain', 'Café', 'Library', 'Train', 'Fireplace']],
      ['Tingles in {n} minutes', []],
      ['ASMR, but {a}', ['no talking', 'with a cat', 'in the woods', 'in the kitchen', 'on a train']]
    ]
  },
  // Варианты названия канала по темам (подставляются в поле, игрок может написать своё)
  names: {
    ru: {
      games: ['ПиксельПанда', 'Геймер Без Тормозов', 'Лагающий Лис', 'Сейв-Пойнт'], cooking: ['Кухня Сани', 'Вкусно и Точка Зрения', 'Жарим Тут', 'Сковородка Шоу'],
      pranks: ['Хаос ТВ', 'Пранк Патруль', 'Ни Дня Без Шуток', 'Пятничный Беспредел'], tech: ['Гаджет Лаб', 'Распаковка Дня', 'Техно Гарри', 'Кремний'],
      truecrime: ['Тёмные Архивы', 'Нераскрытое', 'Дело №13', 'Ночной Детектив'], vlog: ['Просто Жизнь', 'Дневник Вани', 'Без Фильтров', 'Один День'],
      music: ['Бит Квартал', 'Гараж Саунд', 'Нота Ля', 'Громче Тише'], science: ['Почему Так', 'Мастерская Бума', 'Опыт Номер Ноль', 'Наука Дома'],
      fitness: ['Железный Подъезд', 'Каждый День Спорт', 'Пульс 160', 'Сильнее Вчера'], asmr: ['Шёпот Луны', 'Тихий Час', 'Мурашки ТВ', 'Сонный Кот']
    },
    en: {
      games: ['PixelPanda', 'No Lag Gamer', 'Laggy Fox', 'Save Point'], cooking: ['Sam\'s Kitchen', 'Pan Show', 'Hot Stove', 'Tasty Takes'],
      pranks: ['Chaos TV', 'Prank Patrol', 'Friday Mayhem', 'No Chill Crew'], tech: ['Gadget Lab', 'Unbox Daily', 'Tech Harry', 'Silicon'],
      truecrime: ['Dark Archives', 'Unsolved', 'Case No. 13', 'Night Detective'], vlog: ['Just Life', 'Ivan\'s Diary', 'No Filter', 'One Day'],
      music: ['Beat Block', 'Garage Sound', 'Note A', 'Loud Quiet'], science: ['Why Though', 'Boom Workshop', 'Experiment Zero', 'Science at Home'],
      fitness: ['Iron Stairs', 'Daily Sport', 'Pulse 160', 'Stronger Than Yesterday'], asmr: ['Moon Whisper', 'Quiet Hour', 'Tingles TV', 'Sleepy Cat']
    }
  },
  // Оформления каналов: по 3 на тему. [фон баннера, второй цвет, цвет аватарки, узор]
  styles: {
    games: [['#7c6cf2', '#2c3150', '#c9c3f2', 'grid'], ['#2fbf94', '#1f2338', '#bff0de', 'dots'], ['#ff5d4f', '#ffc23d', '#ffd3cf', 'zig']],
    cooking: [['#ff8a3d', '#ffc23d', '#ffe3cc', 'dots'], ['#2fbf94', '#e9c79f', '#d9f5ea', 'check'], ['#ff5d4f', '#fff0c2', '#ffd3cf', 'stripe']],
    pranks: [['#ffc23d', '#ff5d4f', '#fff0c2', 'zig'], ['#7be0a8', '#7c6cf2', '#d9f5ea', 'dots'], ['#ff7ae0', '#ffc23d', '#ffd9f3', 'stripe']],
    tech: [['#8fd3ff', '#2c3150', '#dff1ff', 'grid'], ['#1f2338', '#2fbf94', '#c9cde0', 'grid'], ['#c9d2de', '#7c6cf2', '#eef2f7', 'stripe']],
    truecrime: [['#2c3150', '#ff5d4f', '#c9cde0', 'stripe'], ['#6b5a46', '#e9c79f', '#e9dccb', 'dots'], ['#1f2338', '#ffc23d', '#c9cde0', 'zig']],
    vlog: [['#2fbf94', '#ffc23d', '#d9f5ea', 'dots'], ['#ffb3ab', '#7c6cf2', '#ffe0dc', 'stripe'], ['#8fd3ff', '#ff8a3d', '#dff1ff', 'zig']],
    music: [['#ff5d4f', '#1f2338', '#ffd3cf', 'stripe'], ['#7c6cf2', '#ff7ae0', '#e4dfff', 'zig'], ['#ffc23d', '#2c3150', '#fff0c2', 'dots']],
    science: [['#2fbf94', '#8fd3ff', '#d9f5ea', 'grid'], ['#ff8a3d', '#2c3150', '#ffe3cc', 'dots'], ['#7c6cf2', '#7be0a8', '#e4dfff', 'zig']],
    fitness: [['#ff5d4f', '#2c3150', '#ffd3cf', 'zig'], ['#2fbf94', '#1f2338', '#d9f5ea', 'stripe'], ['#ffc23d', '#ff8a3d', '#fff0c2', 'dots']],
    asmr: [['#c9b8f2', '#8fd3ff', '#ece4ff', 'dots'], ['#b7e4d0', '#e9c79f', '#e2f5ec', 'stripe'], ['#2c3a66', '#f4f1d0', '#c9cde0', 'dots']]
  }
};
