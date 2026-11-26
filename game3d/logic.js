// ЮТУБЕРЫ 3D — игровая логика (без интерфейса). Общая с 2D-версией, плюс задания; сон и еда отключены.
// Работает и в браузере (window.Logic), и в Node (module.exports) для проверки баланса.
// Общее для всей игры: деньги, жильё, работа, время. У каждого канала своё: техника, команда, доверие, очередь видео, страйки.
(function (root) {
  'use strict';

  var GOAL_SUBS = 1000000;          // цель: столько подписчиков на любом канале
  var SECOND_CHANNEL_AT = 50000;    // столько подписчиков на первом канале нужно для второго
  var MONETIZE_AT = 1000;           // с этого числа подписчиков канал начинает зарабатывать
  var SPEED_AT = 1000;              // с этого числа подписчиков открывается ускорение времени
  var SPEEDS = [1, 2];              // обычная и ускоренная ×2 (ускоряет часы и команду, но не комментарии и события)
  var ENERGY_DRAIN = 5.5, FOOD_DRAIN = 5;   // сколько энергии и сытости уходит за игровой час
  var SLEEP_GAIN = 12.5;                     // сколько энергии возвращает час сна
  var MEAL = 55, MEAL_HOURS = 0.5;           // сколько сытости даёт еда и сколько она занимает
  var MEAL_COST = [5, 10, 20, 40];           // цена еды в каждом жилье
  var SUB_RATE = 0.004;             // подписчиков с одного просмотра
  var VIEW_BASE = 900;              // базовые просмотры нового видео (до множителей)
  var MAX_STRIKES = 3;              // на третьем страйке канал удаляют навсегда
  var STRIKE_PENALTY = 0.85;        // каждый страйк навсегда режет просмотры новых видео
  var HOUR = 3.75;                  // секунд реального времени в одном игровом часе (при скорости ×1)
  var START_HOUR = 18;              // игра начинается вечером первого дня
  var JOB_FROM = 9, JOB_TO = 17;    // обязательная смена на работе
  var MAX_COMMENTS = 30;
  var MAX_VIDEOS = 300;             // сколько последних видео хранится в списке
  var COMMENT_HOURS = 12;           // столько игровых часов (~45 с) есть на ответ
  var IGNORE_TRUST = 1.5;           // сколько доверия теряется за проигнорированный комментарий
  var MAX_PEOPLE = 3;               // до трёх человек на каждую роль
  var MAX_LVL = 10;                 // максимальный уровень роли
  var MG_AUTO_COMMENTS = 5;         // с этого уровня менеджер сам отвечает на комментарии
  var MG_AUTO_EVENTS = 8;           // с этого уровня менеджер сам решает простые события

  var WORK = { rec: 10, edit: 12, up: 6 };

  // Тематики: RPM ($ за 1000 просмотров), множители просмотров, залётов, жалоб, спонсоров, пассивных просмотров, хейта, сложность этапов
  var THEMES = {
    games:     { rpm: 2.0, views: 1.2,  viral: 1.0, strike: 1.0, sponsor: 0.9, passive: 1.0, hate: 1.3, work: { rec: 0.8, edit: 1.2, up: 1 } },
    cooking:   { rpm: 4.0, views: 0.9,  viral: 0.8, strike: 0.4, sponsor: 1.3, passive: 1.2, hate: 0.6, work: { rec: 1.3, edit: 0.9, up: 1 } },
    pranks:    { rpm: 2.5, views: 1.15, viral: 2.2, strike: 2.4, sponsor: 0.8, passive: 0.8, hate: 1.6, work: { rec: 1.0, edit: 0.8, up: 1 } },
    tech:      { rpm: 6.0, views: 0.85, viral: 0.7, strike: 0.6, sponsor: 1.7, passive: 1.1, hate: 1.0, work: { rec: 1.0, edit: 1.1, up: 1 }, gearDiscount: 0.15 },
    truecrime: { rpm: 5.0, views: 1.1,  viral: 1.2, strike: 1.7, sponsor: 0.9, passive: 1.25, hate: 1.1, work: { rec: 0.7, edit: 1.5, up: 1 } },
    vlog:      { rpm: 3.0, views: 1.0,  viral: 1.0, strike: 0.7, sponsor: 1.1, passive: 0.9, hate: 0.9, work: { rec: 0.8, edit: 0.8, up: 1 }, fans: 2 },
    music:     { rpm: 1.6, views: 1.0,  viral: 1.5, strike: 1.9, sponsor: 1.0, passive: 1.5, hate: 1.0, work: { rec: 1.4, edit: 1.0, up: 1 } },
    science:   { rpm: 5.0, views: 0.9,  viral: 1.1, strike: 0.5, sponsor: 1.2, passive: 1.3, hate: 0.7, work: { rec: 1.2, edit: 1.1, up: 1 } },
    fitness:   { rpm: 4.5, views: 0.95, viral: 0.9, strike: 0.7, sponsor: 1.5, passive: 1.0, hate: 1.1, work: { rec: 1.1, edit: 0.9, up: 1 } },
    asmr:      { rpm: 2.5, views: 0.9,  viral: 0.8, strike: 0.4, sponsor: 1.0, passive: 1.7, hate: 0.8, work: { rec: 0.9, edit: 1.0, up: 1 }, fans: 1.5 }
  };
  var THEME_IDS = Object.keys(THEMES);

  // Жильё: бонус к качеству и доступ к технике выше уровнем (ступень техники N требует жильё N−1)
  var HOMES = [
    { id: 'dorm', cost: 0, q: 1.0 },
    { id: 'flat', cost: 600, q: 1.1 },
    { id: 'loft', cost: 10000, q: 1.2 },
    { id: 'penthouse', cost: 70000, q: 1.35 }
  ];

  // Техника. Ступень 0 у первого канала есть сразу; второму каналу её надо купить (basic).
  var GEAR = {
    cam: [
      { id: 'phone', cost: 0, basic: 60, power: 1, q: 1.0 }, { id: 'webcam', cost: 40, power: 2, q: 1.4 },
      { id: 'dslr', cost: 600, power: 4, q: 2.0 }, { id: 'cinema', cost: 9000, power: 8, q: 3.0 },
      { id: 'studiocam', cost: 90000, power: 16, q: 4.5 }
    ],
    pc: [
      { id: 'laptop', cost: 0, basic: 150, power: 1, q: 1.0 }, { id: 'gamingpc', cost: 60, power: 2, q: 1.25 },
      { id: 'workstation', cost: 900, power: 4, q: 1.6 }, { id: 'renderfarm', cost: 15000, power: 8, q: 2.1 }
    ],
    net: [
      { id: 'adsl', cost: 0, basic: 30, power: 1, q: 1 }, { id: 'fiber', cost: 50, power: 2, q: 1 },
      { id: 'gigabit', cost: 1200, power: 4, q: 1 }, { id: 'satlink', cost: 20000, power: 8, q: 1 }
    ],
    mic: [
      { id: 'nomic', cost: 0, q: 1.0 }, { id: 'lavalier', cost: 30, q: 1.15 }, { id: 'usbmic', cost: 250, q: 1.3 },
      { id: 'condenser', cost: 3000, q: 1.5 }, { id: 'broadcast', cost: 30000, q: 1.75 }
    ],
    light: [
      { id: 'nolight', cost: 0, q: 1.0 }, { id: 'desklamp', cost: 80, q: 1.12 }, { id: 'ringlight', cost: 700, q: 1.28 },
      { id: 'softbox', cost: 7000, q: 1.45 }, { id: 'studiolight', cost: 50000, q: 1.7 }
    ]
  };
  var GEAR_IDS = ['cam', 'pc', 'net', 'mic', 'light'];
  var NEEDED = { rec: 'cam', edit: 'pc', up: 'net' };

  // Команда: в каждой роли до 3 человек (наём) и общий уровень роли (обучение)
  var STAFF = {
    op: { stage: 'rec', base: 150 },
    ed: { stage: 'edit', base: 200 },
    mg: { stage: 'up', base: 120 }
  };
  var HIRE_MULT = [1, 8, 40];        // второй и третий человек дороже

  var MILESTONES = [100, 1000, 10000, 100000, 1000000];

  function newChannel(theme, name, style, first) {
    return {
      theme: theme, name: name || '', style: style || 0,
      subs: 0, views: 0, likes: 0, earned: 0, catalog: 0, catalogRev: 0, videos: 0,
      monetized: false, trust: 70, strikes: 0, banned: false,
      gear: first ? { cam: 0, pc: 0, net: 0, mic: 0, light: 0 } : { cam: -1, pc: -1, net: -1, mic: 0, light: 0 },
      staff: { op: { n: 0, lvl: 0 }, ed: { n: 0, lvl: 0 }, mg: { n: 0, lvl: 0 } },
      raw: [], edited: [], work: { rec: 0, edit: 0, up: 0 }
    };
  }

  function newState() {
    return {
      v: 'fp1', rt: 0, energy: 100, food: 100, activity: null, quests: [],
      money: 0, home: 0,
      channels: [], active: 0,
      videos: [], nextVid: 1,
      comments: [], nextCid: 1, replied: 0, ignored: [], ignoredCount: 0,
      effects: [],
      event: null, nextEventAt: 0,
      job: { employed: true, active: false, end: 0, shifts: 0, lastDay: 0 },
      milestones: [],
      speed: 1, speedUnlocked: false,
      played: 0,
      won: false, wonAt: 0,
      tut: 0
    };
  }

  /* ---------- Удобные функции ---------- */
  function channel(s) { return s.channels[s.active]; }
  function theme(s) { return THEMES[channel(s).theme]; }
  function liveChannels(s) { return s.channels.filter(function (c) { return !c.banned; }); }
  function bestSubs(s) { var n = 0; s.channels.forEach(function (c) { if (!c.banned) n = Math.max(n, c.subs); }); return n; }
  function totalVideos(s) { var n = 0; s.channels.forEach(function (c) { n += c.videos; }); return n; }
  function clock(s) {
    var h = START_HOUR + s.played / HOUR;
    return { day: 1 + Math.floor(h / 24), hour: Math.floor(h % 24), minute: Math.floor((h % 1) * 60), frac: (h % 24) / 24 };
  }
  function salary(s) { return 60 + 10 * Math.min(s.job.shifts, 10); }
  function trustOf(ch) { return ch.trust; }
  function trustMul(ch) { return 0.6 + 0.6 * ch.trust / 100; }
  function addTrust(ch, d) { ch.trust = Math.max(0, Math.min(100, ch.trust + d)); }

  // Новый канал: первый, второй или замена удалённого
  function canOpenSecond(s) { return s.channels.length === 1 && !s.channels[0].banned && s.channels[0].subs >= SECOND_CHANNEL_AT; }
  function bannedIndex(s) { for (var i = 0; i < s.channels.length; i++) if (s.channels[i].banned) return i; return -1; }
  function startChannel(s, themeId, name, style) {
    if (!THEMES[themeId]) return false;
    var slot = bannedIndex(s), first = s.channels.length === 0;
    if (slot < 0) {
      if (s.channels.length >= 2) return false;
      if (s.channels.length === 1 && !canOpenSecond(s)) return false;
      slot = s.channels.length;
    }
    // одна и та же тема не может быть у двух живых каналов
    if (s.channels.some(function (c, i) { return i !== slot && !c.banned && c.theme === themeId; })) return false;
    var replacing = slot < s.channels.length;
    var ch = newChannel(themeId, String(name || '').slice(0, 30), style | 0, first || (replacing && s.channels.length === 1));
    if (replacing) {
      s.videos = s.videos.filter(function (v) { return v.ch !== slot; });
      s.comments = s.comments.filter(function (c) { return c.ch !== slot; });
      s.effects = s.effects.filter(function (e) { return e.ch !== slot; });
      s.channels[slot] = ch;
    } else s.channels.push(ch);
    s.active = slot;
    if (!s.nextEventAt) s.nextEventAt = s.rt + 70;
    return true;
  }

  /* ---------- Эффекты ---------- */
  function strikes(s) { return channel(s).strikes; }
  function broken(s, i) { return s.effects.some(function (e) { return e.type === 'broken' && e.ch === i; }); }

  function quality(s, i) {
    if (i == null) i = s.active;
    var ch = s.channels[i], q = HOMES[s.home].q;
    for (var k = 0; k < GEAR_IDS.length; k++) { var g = GEAR_IDS[k]; q *= GEAR[g][Math.max(0, ch.gear[g])].q; }
    if (broken(s, i)) q *= 0.7;
    q *= 0.85 + 0.15 * needMul(s);
    return q;
  }
  function powerOf(ch, stage) { var g = ch.gear[NEEDED[stage]]; return g < 0 ? 0 : GEAR[NEEDED[stage]][g].power; }
  function power(s, stage) { return Math.max(1, Math.round(powerOf(channel(s), stage) * needMul(s))); }
  function workNeedOf(ch, stage) { return WORK[stage] * THEMES[ch.theme].work[stage]; }
  function workNeed(s, stage) { return s.channels.length ? workNeedOf(channel(s), stage) : WORK[stage]; }
  function hasGear(ch, stage) { return ch.gear[NEEDED[stage]] >= 0; }

  function stageOpenOf(ch, stage) {
    if (ch.banned || !hasGear(ch, stage)) return false;
    if (stage === 'edit') return ch.raw.length > 0;
    if (stage === 'up') return ch.edited.length > 0;
    return true;
  }
  function stageOpen(s, stage) { return s.channels.length > 0 && stageOpenOf(channel(s), stage); }
  function canWork(s, stage) { return !s.job.active && !s.event && !s.activity && stageOpen(s, stage); }
  // Усталость и голод замедляют работу и портят картинку
  function needMul(s) { return 1; }   // в 3D-версии сна и еды нет

  function addWorkTo(s, i, stage, amount, rng, events) {
    var ch = s.channels[i], guard = 0;
    while (amount > 0 && stageOpenOf(ch, stage) && guard++ < 1000) {
      var need = workNeedOf(ch, stage), room = need - ch.work[stage];
      if (amount < room) { ch.work[stage] += amount; amount = 0; break; }
      amount -= room; ch.work[stage] = 0;
      if (stage === 'rec') { ch.raw.push('video'); events.push({ type: 'recorded', ch: i }); }
      else if (stage === 'edit') { ch.edited.push(ch.raw.shift()); events.push({ type: 'edited', ch: i }); }
      else { ch.edited.shift(); publish(s, i, rng, events); }
    }
    return events;
  }
  function addWork(s, stage, amount, rng, events) { return addWorkTo(s, s.active, stage, amount, rng, events || []); }

  /* ---------- Видео ---------- */
  function titleSeed(s, i, rng) {
    var tt = [Math.floor(rng() * 1000), Math.floor(rng() * 1000), Math.floor(rng() * 1000), Math.floor(rng() * 1000)];
    for (var k = s.videos.length - 1; k >= 0; k--) if (s.videos[k].ch === i) {
      if (s.videos[k].tt && s.videos[k].tt[0] % 6 === tt[0] % 6) tt[0] += 1 + Math.floor(rng() * 5);
      break;
    }
    return tt;
  }
  function publish(s, i, rng, events) {
    var ch = s.channels[i], th = THEMES[ch.theme], q = quality(s, i);
    var mult = th.views * trustMul(ch) * Math.pow(STRIKE_PENALTY, ch.strikes);
    var viralChance = 0.04 * th.viral, boost = null;
    for (var k = 0; k < s.effects.length; k++) if (s.effects[k].type === 'boost' && s.effects[k].ch === i) { boost = s.effects[k]; break; }
    if (boost) viralChance *= boost.viral || 1;
    var viral = rng() < viralChance;
    var luck = (0.7 + 0.6 * rng()) * (viral ? 6 + rng() * 6 : 1);
    var views = Math.floor((VIEW_BASE + 6 * Math.sqrt(ch.subs)) * q * mult * luck * (boost ? boost.mult : 1));
    var subs = views * SUB_RATE + (boost && boost.subs || 0);
    var rpm = Math.round(th.rpm * (0.85 + 0.3 * rng()) * 100) / 100;
    var money = ch.monetized ? views / 1000 * rpm : 0;
    if (boost) s.effects.splice(s.effects.indexOf(boost), 1);
    var v = {
      id: s.nextVid++, ch: i, n: ch.videos, len: Math.round((8 + 7 * rng()) * 60), rpm: rpm, tt: titleSeed(s, i, rng),
      launch: views, t: s.played, mon: true, viral: viral, src: boost ? boost.src : null, cut: false, earned: money, cm: 0
    };
    s.videos.push(v);
    if (s.videos.length > MAX_VIDEOS) s.videos.shift();
    ch.videos++; ch.catalog += views; ch.catalogRev += views * rpm;
    ch.views += views; ch.subs += subs; ch.likes += views * likeRate(ch); ch.earned += money; s.money += money;
    if (viral) addTrust(ch, 1);
    var n = (rng() < 0.6 ? 1 : 0) + (viral ? 2 : 0);
    for (var c = 0; c < n; c++) addComment(s, v, rng, events);
    events.push({ type: 'published', ch: i, video: v, views: views, subs: subs, money: money, viral: viral, boost: v.src });
  }
  function likeRate(ch) { return 0.02 + 0.04 * ch.trust / 100; }
  function videoViews(s, v) {
    var ch = s.channels[v.ch]; if (!ch) return v.launch;
    return Math.floor(v.launch * (1 + 0.0015 * THEMES[ch.theme].passive * trustMul(ch) * Math.max(0, s.played - v.t)));
  }
  // Заработок видео: 0, пока канал не монетизирован
  function videoEarned(s, v) {
    var ch = s.channels[v.ch]; if (!ch || !ch.monetized) return v.earned || 0;
    if (!v.mon) return v.earned || 0;
    return (v.earned || 0) + (videoViews(s, v) - v.launch) / 1000 * v.rpm;
  }
  function findVideo(s, id) { for (var i = 0; i < s.videos.length; i++) if (s.videos[i].id === id) return s.videos[i]; return null; }

  /* ---------- Комментарии ---------- */
  function addComment(s, v, rng, events) {
    var ch = s.channels[v.ch], th = THEMES[ch.theme];
    var wHate = 0.25 * th.hate * (1.4 - ch.trust / 100), wPos = 0.45 * (0.6 + ch.trust / 100), wQ = 0.3;
    var r = rng() * (wHate + wPos + wQ);
    var kind = r < wPos ? 'pos' : r < wPos + wQ ? 'q' : 'hate';
    var c = { id: s.nextCid++, vid: v.id, ch: v.ch, kind: kind, pick: Math.floor(rng() * 1000), t: s.rt };
    v.cm = (v.cm || 0) + 1;
    if (ch.staff.mg.n > 0 && ch.staff.mg.lvl >= MG_AUTO_COMMENTS) { replyEffect(s, c, 'pos'); return; }
    s.comments.push(c);
    if (s.comments.length > MAX_COMMENTS) ignoreComment(s, s.comments[0], events);
    events.push({ type: 'comment', comment: c });
  }
  function replyEffect(s, c, tone) {
    var ch = s.channels[c.ch], d;
    if (c.kind === 'pos') d = tone === 'pos' ? { trust: 0.6, subs: 1 + ch.subs * 0.0005 } : tone === 'neu' ? { trust: 0.2, subs: 0 } : { trust: -2, subs: 0 };
    else if (c.kind === 'q') d = tone === 'pos' ? { trust: 1, subs: 1 + ch.subs * 0.0003 } : tone === 'neu' ? { trust: 0.4, subs: 0 } : { trust: -2, subs: 0 };
    else d = tone === 'pos' ? { trust: 1.5, subs: 0 } : tone === 'neu' ? { trust: 0, subs: 0 } : { trust: -3, subs: 2 + ch.subs * 0.003 };
    addTrust(ch, d.trust); ch.subs += d.subs; s.replied++;
    return d;
  }
  function ignoreComment(s, c, events) {
    var i = s.comments.indexOf(c); if (i < 0) return;
    s.comments.splice(i, 1);
    s.ignored.push(c); if (s.ignored.length > 20) s.ignored.shift();
    s.ignoredCount++;
    if (s.channels[c.ch]) addTrust(s.channels[c.ch], -IGNORE_TRUST);
    if (events) events.push({ type: 'comment_ignored', comment: c });
  }
  function commentLeft(s, c) { return COMMENT_HOURS * HOUR - (s.rt - c.t); }   // в реальных секундах, ускорение не влияет
  function replyComment(s, cid, tone) {
    for (var i = 0; i < s.comments.length; i++) if (s.comments[i].id === cid) return replyEffect(s, s.comments.splice(i, 1)[0], tone);
    return null;
  }

  /* ---------- Команда ---------- */
  function staffRateOf(ch, kind) { var r = ch.staff[kind]; return r.n * r.lvl * 0.4 * Math.sqrt(powerOf(ch, STAFF[kind].stage)); }
  function staffRate(s, kind) { return staffRateOf(channel(s), kind); }
  function hireCost(s, kind) { var r = channel(s).staff[kind]; return r.n >= MAX_PEOPLE ? null : Math.round(STAFF[kind].base * HIRE_MULT[r.n]); }
  function trainCost(s, kind) { var r = channel(s).staff[kind]; return r.n === 0 || r.lvl >= MAX_LVL ? null : Math.round(STAFF[kind].base * 1.5 * Math.pow(2.1, r.lvl - 1)); }
  function hire(s, kind) {
    var c = hireCost(s, kind); if (c == null || s.money < c) return false;
    var r = channel(s).staff[kind]; s.money -= c; r.n++; if (r.lvl === 0) r.lvl = 1; return true;
  }
  function train(s, kind) { var c = trainCost(s, kind); if (c == null || s.money < c) return false; s.money -= c; channel(s).staff[kind].lvl++; return true; }
  function mgAuto(ch, need) { return ch.staff.mg.n > 0 && ch.staff.mg.lvl >= need; }

  /* ---------- Работа ---------- */
  function quitJob(s) { if (!s.job.employed) return false; s.job.employed = false; s.job.active = false; return true; }

  /* ---------- Задания: ведут игрока от первого видео до миллиона ---------- */
  function anyStaff(s, f) { return s.channels.some(function (c) { return !c.banned && ['op', 'ed', 'mg'].some(function (k) { return f(c.staff[k]); }); }); }
  function anyGear(s, f) { return s.channels.some(function (c) { return !c.banned && GEAR_IDS.some(function (k) { return f(c.gear[k], k); }); }); }
  var QUESTS = [
    { id: 'video1', goal: 1, val: function (s) { return totalVideos(s); }, money: 25 },
    { id: 'subs10', goal: 10, val: bestSubs, money: 25 },
    { id: 'cam1', goal: 1, val: function (s) { return channel(s).gear.cam >= 1 ? 1 : 0; }, money: 30 },
    { id: 'reply3', goal: 3, val: function (s) { return s.replied; }, trust: 5 },
    { id: 'videos10', goal: 10, val: function (s) { return totalVideos(s); }, money: 60 },
    { id: 'subs100', goal: 100, val: bestSubs, money: 80 },
    { id: 'light1', goal: 1, val: function (s) { return anyGear(s, function (g, k) { return k === 'light' && g >= 1; }) ? 1 : 0; }, money: 50 },
    { id: 'hire1', goal: 1, val: function (s) { return anyStaff(s, function (r) { return r.n >= 1; }) ? 1 : 0; }, money: 100 },
    { id: 'subs1k', goal: 1000, val: bestSubs, money: 250 },
    { id: 'flat', goal: 1, val: function (s) { return s.home >= 1 ? 1 : 0; }, money: 300 },
    { id: 'videos50', goal: 50, val: function (s) { return totalVideos(s); }, money: 600 },
    { id: 'subs10k', goal: 10000, val: bestSubs, money: 2000 },
    { id: 'train5', goal: 1, val: function (s) { return anyStaff(s, function (r) { return r.lvl >= 5; }) ? 1 : 0; }, money: 1500 },
    { id: 'tier3', goal: 1, val: function (s) { return anyGear(s, function (g) { return g >= 3; }) ? 1 : 0; }, money: 4000 },
    { id: 'loft', goal: 1, val: function (s) { return s.home >= 2 ? 1 : 0; }, money: 5000 },
    { id: 'subs100k', goal: 100000, val: bestSubs, money: 20000 },
    { id: 'second', goal: 2, val: function (s) { return s.channels.length; }, money: 10000 },
    { id: 'penthouse', goal: 1, val: function (s) { return s.home >= 3 ? 1 : 0; }, money: 30000 },
    { id: 'auto', goal: 1, val: function (s) { return anyStaff(s, function (r) { return r.n >= 1 && r.lvl >= MG_AUTO_EVENTS; }) ? 1 : 0; }, money: 50000 },
    { id: 'subs1m', goal: 1000000, val: bestSubs, money: 0 }
  ];
  var QUEST_SHOWN = 3;
  // Активные задания — первые несколько невыполненных
  function activeQuests(s) {
    var out = [];
    for (var i = 0; i < QUESTS.length && out.length < QUEST_SHOWN; i++) if (s.quests.indexOf(QUESTS[i].id) < 0) out.push(QUESTS[i]);
    return out;
  }
  function questProgress(s, q) { return Math.min(q.goal, Math.floor(q.val(s))); }
  function questTick(s, events) {
    activeQuests(s).forEach(function (q) {
      if (q.val(s) >= q.goal) {
        s.quests.push(q.id);
        if (q.money) s.money += q.money;
        if (q.trust && s.channels.length) addTrust(channel(s), q.trust);
        events.push({ type: 'quest_done', quest: q });
      }
    });
  }

  /* ---------- Сон и еда (в 3D-версии не используются) ---------- */
  function mealCost(s) { return MEAL_COST[s.home]; }
  function canRest(s) { return !s.job.active && !s.event && !s.activity && s.channels.length > 0; }
  function sleep(s) { if (!canRest(s)) return false; s.activity = { type: 'sleep', start: s.played }; return true; }
  function eat(s) {
    if (!canRest(s) || s.money < mealCost(s) || s.food >= 98) return false;
    s.money -= mealCost(s); s.activity = { type: 'eat', end: s.played + MEAL_HOURS * HOUR }; return true;
  }
  function wake(s) { if (s.activity && s.activity.type === 'sleep') { s.activity = null; return true; } return false; }
  function needsTick(s, gdt, events) {
    var hours = gdt / HOUR, a = s.activity;
    if (a && a.type === 'sleep') {
      s.energy = Math.min(100, s.energy + SLEEP_GAIN * hours); s.food = Math.max(0, s.food - FOOD_DRAIN * 0.5 * hours);
      if (s.energy >= 100) { s.activity = null; events.push({ type: 'woke', reason: 'rested' }); }
    } else {
      s.energy = Math.max(0, s.energy - ENERGY_DRAIN * hours * (s.food <= 0 ? 2 : 1));
      s.food = Math.max(0, s.food - FOOD_DRAIN * hours);
      if (a && a.type === 'eat' && s.played >= a.end) { s.food = Math.min(100, s.food + MEAL); s.activity = null; events.push({ type: 'ate' }); }
      if (s.energy <= 0 && !s.job.active) { s.activity = { type: 'sleep', start: s.played, fainted: true }; events.push({ type: 'fainted' }); }
    }
  }

  /* ---------- Скорость ---------- */
  function setSpeed(s, v) { if (SPEEDS.indexOf(v) < 0 || (v > 1 && !s.speedUnlocked)) return false; s.speed = v; return true; }

  /* ---------- События ---------- */
  var NAMES = ['Max Pixel', 'Лиза Лайк', 'DJ Борщ', 'Kira Plays', 'Саня Влог', 'Mr. Tofu', 'Ника Бьюти', 'Tony Byte', 'Шеф Гоша', 'Луна ASMR', 'Doc Science', 'Fit Masha'];
  function niceRound(n) {
    if (n < 100) return Math.max(10, Math.round(n / 5) * 5);
    var p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / p) * p;
  }
  function eventOptions(s, ev) {
    switch (ev.kind) {
      case 'monetized': case 'banned': return ['ok'];
      case 'sponsor': return ['take', 'honest', 'decline'];
      case 'strike': return ev.cuttable ? ['cut', 'demonetize', 'delete', 'ignore'] : ['demonetize', 'delete', 'ignore'];
      case 'collab': return ['accept', 'decline'];
      case 'trend': return ['follow', 'skip'];
      case 'drama': return ['apologize', 'joke', 'attack', 'ignore'];
      case 'broken': return ['repair', 'keep'];
      case 'fans': return ['go', 'skip'];
    }
    return ['ok'];
  }
  function canChoose(s, ev, opt) {
    if ((ev.kind === 'collab' && opt === 'accept') || (ev.kind === 'broken' && opt === 'repair') || (ev.kind === 'fans' && opt === 'go')) return s.money >= (ev.cost || 0);
    return true;
  }
  function makeEvent(s, rng) {
    var ch = channel(s), th = theme(s), subs = ch.subs;
    var pool = [['collab', 1.0], ['trend', 0.8], ['drama', 0.6 * th.hate], ['fans', 0.5 * (th.fans || 1)]];
    if (ch.monetized) pool.push(['sponsor', 1.3 * th.sponsor]);
    if (s.videos.some(function (v) { return v.ch === s.active; })) pool.push(['strike', 0.8 * th.strike]);
    if (ch.gear.cam > 0 && !broken(s, s.active)) pool.push(['broken', 0.5]);
    var sum = 0; pool.forEach(function (p) { sum += p[1]; });
    var r = rng() * sum, kind = pool[0][0];
    for (var i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r <= 0) { kind = pool[i][0]; break; } }
    var ev = { kind: kind, theme: ch.theme, ch: s.active, pick: Math.floor(rng() * 1000) };
    if (kind === 'sponsor') ev.amount = niceRound((60 + Math.sqrt(subs) * 25 + subs * 0.05) * th.sponsor);
    else if (kind === 'strike') { var list = s.videos.filter(function (v) { return v.ch === s.active; }).slice(-15); ev.vid = list[Math.floor(rng() * list.length)].id; ev.cuttable = rng() < 0.6; }
    else if (kind === 'collab') {
      ev.name = NAMES[Math.floor(rng() * NAMES.length)];
      ev.partner = niceRound(Math.max(300, subs * (0.4 + rng() * 2.6) + 200));
      ev.cost = ev.partner > subs ? niceRound(ev.partner * 0.02 + 20) : 0;
      ev.mult = Math.round(Math.min(4, 1.5 + ev.partner / Math.max(1, subs + 500)) * 10) / 10;
    } else if (kind === 'broken') ev.cost = niceRound(Math.max(20, GEAR.cam[ch.gear.cam].cost * 0.15));
    else if (kind === 'fans') ev.cost = niceRound(Math.max(15, s.money * 0.05));
    return ev;
  }
  function resolveEvent(s, opt, rng) {
    var ev = s.event; if (!ev) return null;
    if (eventOptions(s, ev).indexOf(opt) < 0 || !canChoose(s, ev, opt)) return null;
    s.event = null;
    if (ev.kind !== 'monetized' && ev.kind !== 'banned') s.nextEventAt = s.rt + 40 + rng() * 40;
    var ch = s.channels[ev.ch], out = { kind: ev.kind, opt: opt, ch: ev.ch };
    if (!ch) return out;
    function boost(mult, src, extra) { s.effects.push({ type: 'boost', ch: ev.ch, mult: mult, src: src, viral: extra && extra.viral, subs: extra && extra.subs }); }
    switch (ev.kind + ':' + opt) {
      case 'sponsor:take': s.money += ev.amount; addTrust(ch, -6); out.money = ev.amount; break;
      case 'sponsor:honest': out.money = Math.round(ev.amount * 0.7); s.money += out.money; addTrust(ch, -1); break;
      case 'sponsor:decline': addTrust(ch, 2); break;
      case 'strike:cut': { var v = findVideo(s, ev.vid); if (v) { var lost = Math.floor(v.launch * 0.2); v.launch -= lost; v.cut = true; ch.catalog -= lost; if (v.mon) ch.catalogRev -= lost * v.rpm; } break; }
      case 'strike:demonetize': { var v2 = findVideo(s, ev.vid); if (v2 && v2.mon) { v2.earned = videoEarned(s, v2); v2.mon = false; ch.catalogRev -= v2.launch * v2.rpm; } break; }
      case 'strike:delete': { var v3 = findVideo(s, ev.vid); if (v3) { ch.catalog -= v3.launch; if (v3.mon) ch.catalogRev -= v3.launch * v3.rpm; s.videos.splice(s.videos.indexOf(v3), 1); s.comments = s.comments.filter(function (c) { return c.vid !== v3.id; }); } break; }
      case 'strike:ignore':
        ch.strikes++; out.strikes = ch.strikes;
        if (ch.strikes >= MAX_STRIKES) { ch.banned = true; out.banned = true; s.event = { kind: 'banned', theme: ch.theme, ch: ev.ch }; }
        break;
      case 'collab:accept': s.money -= ev.cost; boost(ev.mult, 'collab', { subs: ev.partner * 0.02 }); break;
      case 'trend:follow': boost(2, 'trend', { viral: 2 }); break;
      case 'drama:apologize': addTrust(ch, 5); out.subs = -Math.floor(ch.subs * 0.01); ch.subs += out.subs; break;
      case 'drama:joke': addTrust(ch, 1); out.subs = Math.floor(ch.subs * 0.02 + 10); ch.subs += out.subs; break;
      case 'drama:attack': addTrust(ch, -12); out.subs = Math.floor(ch.subs * 0.04 + 20); ch.subs += out.subs; break;
      case 'drama:ignore': addTrust(ch, -3); break;
      case 'broken:repair': s.money -= ev.cost; break;
      case 'broken:keep': s.effects.push({ type: 'broken', ch: ev.ch, until: s.played + 120 }); break;
      case 'fans:go': s.money -= ev.cost; out.subs = Math.floor(ch.subs * 0.01 + 10); ch.subs += out.subs; addTrust(ch, 8); break;
    }
    ch.subs = Math.max(0, ch.subs);
    return out;
  }
  function autoChoice(s, ev) {
    var ch = s.channels[ev.ch]; if (!ch || !mgAuto(ch, MG_AUTO_EVENTS)) return null;
    if (ev.kind === 'sponsor') return 'honest';
    if (ev.kind === 'trend') return 'follow';
    if (ev.kind === 'collab') return canChoose(s, ev, 'accept') ? 'accept' : 'decline';
    if (ev.kind === 'broken') return canChoose(s, ev, 'repair') ? 'repair' : 'keep';
    if (ev.kind === 'fans') return canChoose(s, ev, 'go') ? 'go' : 'skip';
    return null; // жалобы и скандалы всегда решает игрок
  }

  /* ---------- Такт игры (dt уже с учётом скорости) ---------- */
  // rdt — реальные секунды; scale — ускорение (×2 у игрока, больше в меню разработчика)
  function tick(s, rdt, rng, scale) {
    var events = [];
    if (!s.channels.length || s.event) return events;
    var dt = rdt * (scale || s.speed || 1);
    s.played += dt; s.rt += rdt;
    questTick(s, events);
    s.channels.forEach(function (ch, i) {
      if (ch.banned) return;
      for (var k in STAFF) if (ch.staff[k].n > 0) addWorkTo(s, i, STAFF[k].stage, staffRateOf(ch, k) * dt, rng, events);
      var rate = 0.0015 * THEMES[ch.theme].passive * trustMul(ch) * dt, pv = ch.catalog * rate;
      if (pv > 0) {
        ch.views += pv; ch.subs += pv * SUB_RATE * 0.3; ch.likes += pv * likeRate(ch) * 0.3;
        if (ch.monetized) { var earn = ch.catalogRev * rate / 1000; s.money += earn; ch.earned += earn; }
      }
      if (!ch.monetized && ch.subs >= MONETIZE_AT && !s.event) {
        ch.monetized = true; s.event = { kind: 'monetized', theme: ch.theme, ch: i };
        events.push({ type: 'event', event: s.event });
      }
    });
    if (s.event) return events;
    for (var ci = s.comments.length - 1; ci >= 0; ci--) if (commentLeft(s, s.comments[ci]) <= 0) ignoreComment(s, s.comments[ci], events);
    for (var e = s.effects.length - 1; e >= 0; e--) {
      var ef = s.effects[e];
      if (ef.until && ef.until <= s.played) { s.effects.splice(e, 1); events.push({ type: 'effect_end', effect: ef.type }); }
    }
    var c = clock(s);
    if (s.job.employed && !s.job.active && c.day !== s.job.lastDay && c.hour >= JOB_FROM && c.hour < JOB_TO) {
      if (s.activity) { s.activity = null; events.push({ type: 'woke', reason: 'job' }); }
      s.job.active = true; s.job.lastDay = c.day;
      s.job.end = s.played + (JOB_TO - c.hour - c.minute / 60) * HOUR;
      events.push({ type: 'shift_start' });
    }
    if (s.job.active && s.played >= s.job.end) {
      s.job.active = false; var pay = salary(s); s.money += pay; s.job.shifts++;
      events.push({ type: 'shift_done', pay: pay });
    }
    if (!s.job.active && !s.activity && !channel(s).banned && totalVideos(s) >= 6 && s.rt >= s.nextEventAt) {
      var ev = makeEvent(s, rng), auto = autoChoice(s, ev);
      s.event = ev;
      if (auto) events.push({ type: 'auto_event', event: ev, result: resolveEvent(s, auto, rng) });
      else events.push({ type: 'event', event: ev });
    }
    var best = bestSubs(s);
    if (!s.speedUnlocked && best >= SPEED_AT) { s.speedUnlocked = true; events.push({ type: 'speed_unlocked' }); }
    for (var m = 0; m < MILESTONES.length; m++) {
      if (best >= MILESTONES[m] && s.milestones.indexOf(MILESTONES[m]) < 0) { s.milestones.push(MILESTONES[m]); events.push({ type: 'milestone', value: MILESTONES[m] }); }
    }
    if (canOpenSecond(s) && !s.secondNotified) { s.secondNotified = true; events.push({ type: 'second_ready' }); }
    if (!s.won && best >= GOAL_SUBS) { s.won = true; s.wonAt = s.played; events.push({ type: 'won' }); }
    return events;
  }

  /* ---------- Покупки ---------- */
  function gearNeedsHome(kind, tier) { return Math.max(0, tier - 1); }
  function gearCost(s, kind) {
    var ch = channel(s), lvl = ch.gear[kind], nxt = GEAR[kind][lvl + 1]; if (!nxt) return null;
    var base = lvl < 0 ? nxt.basic : nxt.cost;
    var d = s.channels.some(function (c) { return !c.banned && THEMES[c.theme].gearDiscount; }) ? 0.15 : 0;
    return Math.round(base * (1 - d));
  }
  function gearBlocked(s, kind) { var t = channel(s).gear[kind] + 1; return GEAR[kind][t] && s.home < gearNeedsHome(kind, t); }
  function buyGear(s, kind) {
    var c = gearCost(s, kind);
    if (c == null || s.money < c || gearBlocked(s, kind)) return false;
    s.money -= c; channel(s).gear[kind]++; return true;
  }
  function homeCost(s) { var h = HOMES[s.home + 1]; return h ? h.cost : null; }
  function moveHome(s) { var c = homeCost(s); if (c == null || s.money < c) return false; s.money -= c; s.home++; return true; }

  function restore(data) {
    var s = newState();
    if (!data || typeof data !== 'object' || data.v !== 'fp1') return s;
    for (var k in s) {
      if (!(k in data)) continue;
      if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) {
        for (var j in s[k]) if (data[k] && typeof data[k][j] === typeof s[k][j]) s[k][j] = data[k][j];
      } else s[k] = data[k];
    }
    s.secondNotified = !!data.secondNotified;
    s.channels = (s.channels || []).filter(function (c) { return c && THEMES[c.theme]; });
    if (s.active >= s.channels.length) s.active = 0;
    if (SPEEDS.indexOf(s.speed) < 0) s.speed = 1;
    return s;
  }

  var api = {
    GOAL_SUBS: GOAL_SUBS, SECOND_CHANNEL_AT: SECOND_CHANNEL_AT, MONETIZE_AT: MONETIZE_AT, SPEED_AT: SPEED_AT, SPEEDS: SPEEDS,
    MAX_STRIKES: MAX_STRIKES, HOUR: HOUR, JOB_FROM: JOB_FROM, JOB_TO: JOB_TO, COMMENT_HOURS: COMMENT_HOURS, IGNORE_TRUST: IGNORE_TRUST,
    MAX_PEOPLE: MAX_PEOPLE, MAX_LVL: MAX_LVL, MG_AUTO_COMMENTS: MG_AUTO_COMMENTS, MG_AUTO_EVENTS: MG_AUTO_EVENTS,
    WORK: WORK, THEMES: THEMES, THEME_IDS: THEME_IDS, HOMES: HOMES, GEAR: GEAR, GEAR_IDS: GEAR_IDS, NEEDED: NEEDED, STAFF: STAFF, MILESTONES: MILESTONES,
    newState: newState, restore: restore, startChannel: startChannel, canOpenSecond: canOpenSecond, bannedIndex: bannedIndex, liveChannels: liveChannels,
    channel: channel, theme: theme, bestSubs: bestSubs, totalVideos: totalVideos, clock: clock, salary: salary,
    quality: quality, power: power, powerOf: powerOf, workNeed: workNeed, hasGear: hasGear, stageOpen: stageOpen, canWork: canWork,
    trustMul: trustMul, addTrust: addTrust, strikes: strikes, broken: broken,
    videoViews: videoViews, videoEarned: videoEarned, likeRate: likeRate, findVideo: findVideo,
    addWork: addWork, tick: tick, staffRate: staffRate, staffRateOf: staffRateOf, hireCost: hireCost, trainCost: trainCost, hire: hire, train: train, mgAuto: mgAuto,
    QUESTS: QUESTS, activeQuests: activeQuests, questProgress: questProgress,
    quitJob: quitJob, setSpeed: setSpeed, sleep: sleep, eat: eat, wake: wake, mealCost: mealCost, canRest: canRest, needMul: needMul, commentLeft: commentLeft, replyComment: replyComment, makeEvent: makeEvent,
    eventOptions: eventOptions, canChoose: canChoose, resolveEvent: resolveEvent,
    gearCost: gearCost, gearBlocked: gearBlocked, gearNeedsHome: gearNeedsHome, buyGear: buyGear, homeCost: homeCost, moveHome: moveHome
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(this);
