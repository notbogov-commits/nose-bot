// ЮТУБЕРЫ — игровая логика (без интерфейса).
// Работает и в браузере (window.Logic), и в Node (module.exports) для проверки баланса.
(function (root) {
  'use strict';

  var GOAL_SUBS = 1000000;          // цель: столько подписчиков на любом канале
  var SECOND_CHANNEL_AT = 50000;    // столько подписчиков на первом канале нужно для второго
  var MONETIZE_AT = 1000;           // с этого числа подписчиков канал начинает зарабатывать
  var SUB_RATE = 0.004;             // подписчиков с одного просмотра
  var VIEW_BASE = 900;              // базовые просмотры нового видео (до множителей)
  var STRIKE_TIME = 240;            // сколько секунд действует страйк
  var MAX_STRIKES = 3;              // при стольких страйках загрузка блокируется
  var HOUR = 3.75;                  // секунд реального времени в одном игровом часе
  var SHIFT_HOURS = 8;              // длина смены на работе (игровые часы)
  var START_HOUR = 18;              // игра начинается вечером первого дня
  var JOB_FROM = 9, JOB_TO = 17;    // обязательная смена на работе
  var MAX_COMMENTS = 30;            // сколько неотвеченных комментариев хранится
  var MAX_VIDEOS = 300;             // сколько последних видео хранится в списке канала
  var MG_AUTO_COMMENTS = 5;         // с этого уровня менеджер сам отвечает на комментарии
  var MG_AUTO_EVENTS = 10;          // с этого уровня менеджер сам решает простые события
  var COMMENT_HOURS = 12;           // столько игровых часов (~45 с) есть на ответ, потом комментарий проигнорирован
  var IGNORE_TRUST = 1.5;           // сколько доверия теряется за проигнорированный комментарий

  var WORK = { rec: 10, edit: 12, up: 6 };

  // Тематики канала: RPM (доход в $ за 1000 просмотров), множители просмотров, залётов, жалоб, спонсоров, пассивных просмотров и сложности этапов
  var THEMES = {
    games:     { rpm: 2.0, views: 1.2,  money: 0.8,  viral: 1.0, strike: 1.0, sponsor: 0.9, passive: 1.0, hate: 1.3, work: { rec: 0.8, edit: 1.2, up: 1 } },
    cooking:   { rpm: 4.0, views: 0.9,  money: 1.2,  viral: 0.8, strike: 0.4, sponsor: 1.3, passive: 1.2, hate: 0.6, work: { rec: 1.3, edit: 0.9, up: 1 } },
    pranks:    { rpm: 2.5, views: 1.15, money: 0.9,  viral: 2.2, strike: 2.4, sponsor: 0.8, passive: 0.8, hate: 1.6, work: { rec: 1.0, edit: 0.8, up: 1 } },
    tech:      { rpm: 6.0, views: 0.85, money: 1.4,  viral: 0.7, strike: 0.6, sponsor: 1.7, passive: 1.1, hate: 1.0, work: { rec: 1.0, edit: 1.1, up: 1 }, gearDiscount: 0.15 },
    truecrime: { rpm: 5.0, views: 1.15, money: 1.1,  viral: 1.2, strike: 1.7, sponsor: 0.9, passive: 1.4, hate: 1.1, work: { rec: 0.7, edit: 1.5, up: 1 } },
    vlog:      { rpm: 3.0, views: 1.0,  money: 1.0,  viral: 1.0, strike: 0.7, sponsor: 1.1, passive: 0.9, hate: 0.9, work: { rec: 0.8, edit: 0.8, up: 1 }, fans: 2 },
    music:     { rpm: 1.6, views: 1.0,  money: 0.9,  viral: 1.5, strike: 1.9, sponsor: 1.0, passive: 1.5, hate: 1.0, work: { rec: 1.4, edit: 1.0, up: 1 } },
    science:   { rpm: 5.0, views: 0.9,  money: 1.2,  viral: 1.1, strike: 0.5, sponsor: 1.2, passive: 1.3, hate: 0.7, work: { rec: 1.2, edit: 1.1, up: 1 } },
    fitness:   { rpm: 4.5, views: 0.95, money: 1.25, viral: 0.9, strike: 0.7, sponsor: 1.5, passive: 1.0, hate: 1.1, work: { rec: 1.1, edit: 0.9, up: 1 } },
    asmr:      { rpm: 2.5, views: 0.9,  money: 1.0,  viral: 0.8, strike: 0.4, sponsor: 1.0, passive: 1.7, hate: 0.8, work: { rec: 0.9, edit: 1.0, up: 1 }, fans: 1.5 }
  };
  var THEME_IDS = Object.keys(THEMES);

  // Форматы видео: сложность работы, просмотры, подписчики, доход за 1000 просмотров, длина в минутах
  var FORMATS = {
    short: { work: 0.45, views: 1.7, subs: 0.6, rpm: 0.06, len: [0.4, 0.9] },
    video: { work: 1.0, views: 1.0, subs: 1.0, rpm: 1.0, len: [8, 15] },
    long:  { work: 2.2, views: 0.85, subs: 1.35, rpm: 1.6, len: [25, 45] }
  };
  var FORMAT_IDS = ['short', 'video', 'long'];

  // Жильё: даёт бонус к качеству и открывает технику выше уровнем (ступень техники N требует жильё N−1)
  var HOMES = [
    { id: 'dorm', cost: 0, q: 1.0 },
    { id: 'flat', cost: 600, q: 1.1 },
    { id: 'loft', cost: 10000, q: 1.2 },
    { id: 'penthouse', cost: 70000, q: 1.35 }
  ];

  var GEAR = {
    cam: [
      { id: 'phone', cost: 0, power: 1, q: 1.0 }, { id: 'webcam', cost: 40, power: 2, q: 1.4 },
      { id: 'dslr', cost: 600, power: 4, q: 2.0 }, { id: 'cinema', cost: 9000, power: 8, q: 3.0 },
      { id: 'studiocam', cost: 90000, power: 16, q: 4.5 }
    ],
    pc: [
      { id: 'laptop', cost: 0, power: 1, q: 1.0 }, { id: 'gamingpc', cost: 60, power: 2, q: 1.25 },
      { id: 'workstation', cost: 900, power: 4, q: 1.6 }, { id: 'renderfarm', cost: 15000, power: 8, q: 2.1 }
    ],
    net: [
      { id: 'adsl', cost: 0, power: 1, q: 1 }, { id: 'fiber', cost: 50, power: 2, q: 1 },
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

  var STAFF = {
    op: { stage: 'rec', base: 150, growth: 2.0, max: 15 },
    ed: { stage: 'edit', base: 200, growth: 2.0, max: 15 },
    mg: { stage: 'up', base: 120, growth: 2.0, max: 15 }
  };

  var MILESTONES = [100, 1000, 10000, 100000, 1000000];

  function newChannel(theme, name, style) {
    return { theme: theme, name: name || '', style: style || 0, subs: 0, views: 0, likes: 0, earned: 0, catalog: 0, catalogRev: 0, videos: 0, monetized: false };
  }

  function newState() {
    return {
      v: 5,
      money: 0, trust: 70,
      raw: [], edited: [],          // очереди: формат каждого отснятого и смонтированного видео
      format: 'video',
      work: { rec: 0, edit: 0, up: 0 },
      gear: { cam: 0, pc: 0, net: 0, mic: 0, light: 0 },
      home: 0,
      staff: { op: 0, ed: 0, mg: 0 },
      channels: [], active: 0,
      videos: [], nextVid: 1,
      comments: [], nextCid: 1, replied: 0, ignored: [], ignoredCount: 0,
      effects: [],
      event: null, nextEventAt: 0,
      job: { employed: true, active: false, end: 0, shifts: 0, lastDay: 0 },
      milestones: [],
      played: 0,
      won: false, wonAt: 0,
      tut: 0
    };
  }

  /* ---------- Удобные функции ---------- */
  function channel(s) { return s.channels[s.active]; }
  function theme(s) { return THEMES[channel(s).theme]; }
  function bestSubs(s) { var n = 0; s.channels.forEach(function (c) { n = Math.max(n, c.subs); }); return n; }
  function totalVideos(s) { var n = 0; s.channels.forEach(function (c) { n += c.videos; }); return n; }
  function clock(s) {
    var h = START_HOUR + s.played / HOUR;
    return { day: 1 + Math.floor(h / 24), hour: Math.floor(h % 24), minute: Math.floor((h % 1) * 60), frac: (h % 24) / 24 };
  }
  function salary(s) { return 60 + 10 * Math.min(s.job.shifts, 10); }

  function startChannel(s, themeId, name, style) {
    if (!THEMES[themeId] || s.channels.length >= 2) return false;
    if (s.channels.length === 1 && (!canOpenSecond(s) || s.channels[0].theme === themeId)) return false;
    s.channels.push(newChannel(themeId, String(name || '').slice(0, 30), style | 0));
    s.active = s.channels.length - 1;
    if (!s.nextEventAt) s.nextEventAt = s.played + 70;
    return true;
  }
  function canOpenSecond(s) { return s.channels.length === 1 && s.channels[0].subs >= SECOND_CHANNEL_AT; }

  /* ---------- Эффекты ---------- */
  function strikesOn(s, ch) { var n = 0; s.effects.forEach(function (e) { if (e.type === 'strike' && e.ch === ch) n++; }); return n; }
  function strikes(s) { return strikesOn(s, s.active); }
  function broken(s) { return s.effects.some(function (e) { return e.type === 'broken'; }); }
  function trustMul(s) { return 0.6 + 0.6 * s.trust / 100; }
  function addTrust(s, d) { s.trust = Math.max(0, Math.min(100, s.trust + d)); }

  function quality(s) {
    var q = HOMES[s.home].q;
    for (var i = 0; i < GEAR_IDS.length; i++) q *= GEAR[GEAR_IDS[i]][s.gear[GEAR_IDS[i]]].q;
    if (broken(s)) q *= 0.7;
    return q;
  }
  function power(s, stage) {
    if (stage === 'rec') return GEAR.cam[s.gear.cam].power;
    if (stage === 'edit') return GEAR.pc[s.gear.pc].power;
    return GEAR.net[s.gear.net].power;
  }
  function itemFormat(s, stage) { return stage === 'rec' ? s.format : stage === 'edit' ? s.raw[0] : s.edited[0]; }
  function workNeed(s, stage) {
    var f = FORMATS[itemFormat(s, stage) || s.format];
    return WORK[stage] * (s.channels.length ? theme(s).work[stage] : 1) * f.work;
  }

  // Может ли работа над этапом идти вообще (сотрудники работают и во время смены игрока)
  function stageOpen(s, stage) {
    if (!s.channels.length) return false;
    if (stage === 'edit') return s.raw.length > 0;
    if (stage === 'up') return s.edited.length > 0 && strikes(s) < MAX_STRIKES;
    return true;
  }
  // Может ли игрок нажимать сам
  function canWork(s, stage) { return !s.job.active && !s.event && stageOpen(s, stage); }

  function addWork(s, stage, amount, rng, events) {
    events = events || [];
    var guard = 0;
    while (amount > 0 && stageOpen(s, stage) && guard++ < 1000) {
      var need = workNeed(s, stage), room = need - s.work[stage];
      if (amount < room) { s.work[stage] += amount; amount = 0; break; }
      amount -= room; s.work[stage] = 0;
      if (stage === 'rec') { s.raw.push(s.format); events.push({ type: 'recorded' }); }
      else if (stage === 'edit') { s.edited.push(s.raw.shift()); events.push({ type: 'edited' }); }
      else publish(s, s.edited.shift(), rng, events);
    }
    return events;
  }

  /* ---------- Видео ---------- */
  function publish(s, fmtId, rng, events) {
    var ch = channel(s), th = theme(s), q = quality(s), f = FORMATS[fmtId] || FORMATS.video;
    var mult = th.views * f.views * trustMul(s) * Math.pow(0.75, strikes(s));
    var viralChance = 0.04 * th.viral * (fmtId === 'short' ? 1.5 : 1), boost = null;
    for (var i = 0; i < s.effects.length; i++) if (s.effects[i].type === 'boost' && s.effects[i].ch === s.active) { boost = s.effects[i]; break; }
    if (boost) { mult *= boost.mult; viralChance *= boost.viral || 1; }
    var viral = rng() < viralChance;
    var luck = (0.7 + 0.6 * rng()) * (viral ? 6 + rng() * 6 : 1) * (boost ? boost.mult : 1);
    var views = Math.floor((VIEW_BASE + 6 * Math.sqrt(ch.subs)) * q * mult * luck / (boost ? boost.mult : 1));
    var subs = views * SUB_RATE * f.subs + (boost && boost.subs || 0);
    var rpm = Math.round(th.rpm * f.rpm * (0.85 + 0.3 * rng()) * 100) / 100;
    var money = ch.monetized ? views / 1000 * rpm : 0;
    if (boost) s.effects.splice(s.effects.indexOf(boost), 1);
    var len = f.len[0] + (f.len[1] - f.len[0]) * rng();
    var v = {
      id: s.nextVid++, ch: s.active, n: ch.videos, fmt: fmtId, len: Math.round(len * 60), rpm: rpm,
      tt: titleSeed(s, rng),
      launch: views, t: s.played, mon: true, paid: ch.monetized, viral: viral, src: boost ? boost.src : null, cut: false,
      perf: Math.round(luck * 100), earned: money, cm: 0
    };
    s.videos.push(v);
    if (s.videos.length > MAX_VIDEOS) s.videos.shift();
    ch.videos++; ch.catalog += views; ch.catalogRev += views * rpm;
    ch.views += views; ch.subs += subs; ch.likes += views * likeRate(s); ch.earned += money; s.money += money;
    if (viral) addTrust(s, 1);
    var n = (rng() < 0.6 ? 1 : 0) + (viral ? 2 : 0);
    for (var c = 0; c < n; c++) addComment(s, v, rng, events);
    events.push({ type: 'published', video: v, views: views, subs: subs, money: money, viral: viral, boost: v.src });
  }
  // Случайные числа для названия; шаблон не повторяет предыдущее видео канала (у каждой темы 6 шаблонов)
  function titleSeed(s, rng) {
    var tt = [Math.floor(rng() * 1000), Math.floor(rng() * 1000), Math.floor(rng() * 1000), Math.floor(rng() * 1000)];
    for (var i = s.videos.length - 1; i >= 0; i--) if (s.videos[i].ch === s.active) {
      if (s.videos[i].tt && s.videos[i].tt[0] % 6 === tt[0] % 6) tt[0] += 1 + Math.floor(rng() * 5);
      break;
    }
    return tt;
  }
  function likeRate(s) { return 0.02 + 0.04 * s.trust / 100; }
  function dislikeRate(s) { return 0.001 + 0.012 * (1 - s.trust / 100); }
  // Сколько денег принесло видео (стартовые + со временем, если канал монетизирован)
  function videoEarned(s, v) {
    if (!v.mon) return v.earned || 0;
    var extra = s.channels[v.ch].monetized ? (videoViews(s, v) - v.launch) / 1000 * v.rpm : 0;
    return (v.earned || 0) + extra;
  }
  // Сколько просмотров у видео сейчас (стартовые + набранные со временем)
  function videoViews(s, v) {
    var th = THEMES[s.channels[v.ch].theme];
    return Math.floor(v.launch * (1 + 0.0015 * th.passive * trustMul(s) * Math.max(0, s.played - v.t)));
  }
  function findVideo(s, id) { for (var i = 0; i < s.videos.length; i++) if (s.videos[i].id === id) return s.videos[i]; return null; }

  /* ---------- Комментарии ---------- */
  function addComment(s, v, rng, events) {
    var th = THEMES[s.channels[v.ch].theme];
    var wHate = 0.25 * th.hate * (1.4 - s.trust / 100), wPos = 0.45 * (0.6 + s.trust / 100), wQ = 0.3;
    var r = rng() * (wHate + wPos + wQ);
    var kind = r < wPos ? 'pos' : r < wPos + wQ ? 'q' : 'hate';
    var c = { id: s.nextCid++, vid: v.id, ch: v.ch, kind: kind, pick: Math.floor(rng() * 1000), t: s.played };
    v.cm = (v.cm || 0) + 1;
    if (s.staff.mg >= MG_AUTO_COMMENTS) {
      var res = replyEffect(s, c, 'pos');
      events.push({ type: 'auto_reply', comment: c, result: res });
      return;
    }
    s.comments.push(c);
    if (s.comments.length > MAX_COMMENTS) ignoreComment(s, s.comments[0], events);
    events.push({ type: 'comment', comment: c });
  }
  // tone: 'pos' | 'neu' | 'neg'
  function replyEffect(s, c, tone) {
    var ch = s.channels[c.ch], d = { trust: 0, subs: 0 };
    if (c.kind === 'pos') d = tone === 'pos' ? { trust: 0.6, subs: 1 + ch.subs * 0.0005 } : tone === 'neu' ? { trust: 0.2, subs: 0 } : { trust: -2, subs: 0 };
    else if (c.kind === 'q') d = tone === 'pos' ? { trust: 1, subs: 1 + ch.subs * 0.0003 } : tone === 'neu' ? { trust: 0.4, subs: 0 } : { trust: -2, subs: 0 };
    else d = tone === 'pos' ? { trust: 1.5, subs: 0 } : tone === 'neu' ? { trust: 0, subs: 0 } : { trust: -3, subs: 2 + ch.subs * 0.003 };
    addTrust(s, d.trust); ch.subs += d.subs; s.replied++;
    return d;
  }
  // Не ответил вовремя — комментарий уходит в «проигнорированные», канал теряет доверие
  function ignoreComment(s, c, events) {
    var i = s.comments.indexOf(c); if (i < 0) return;
    s.comments.splice(i, 1);
    s.ignored.push(c); if (s.ignored.length > 20) s.ignored.shift();
    s.ignoredCount++; addTrust(s, -IGNORE_TRUST);
    if (events) events.push({ type: 'comment_ignored', comment: c });
  }
  function commentLeft(s, c) { return COMMENT_HOURS * HOUR - (s.played - c.t); }
  function replyComment(s, cid, tone) {
    for (var i = 0; i < s.comments.length; i++) if (s.comments[i].id === cid) {
      var c = s.comments.splice(i, 1)[0];
      return replyEffect(s, c, tone);
    }
    return null;
  }

  function passiveRate(s, i) { var ch = s.channels[i]; return ch.catalog * 0.0015 * THEMES[ch.theme].passive * trustMul(s); }
  function staffRate(s, kind) { return s.staff[kind] * 0.6 * Math.sqrt(power(s, STAFF[kind].stage)); }

  /* ---------- Работа ---------- */
  // Уволиться можно один раз и навсегда. Если ты сейчас на смене, смена прерывается без зарплаты.
  function quitJob(s) {
    if (!s.job.employed) return false;
    s.job.employed = false; s.job.active = false;
    return true;
  }
  function setFormat(s, f) { if (FORMATS[f]) { s.format = f; return true; } return false; }

  /* ---------- События (на весь экран, игра на паузе) ---------- */
  var NAMES = ['Max Pixel', 'Лиза Лайк', 'DJ Борщ', 'Kira Plays', 'Саня Влог', 'Mr. Tofu', 'Ника Бьюти', 'Tony Byte', 'Шеф Гоша', 'Луна ASMR', 'Doc Science', 'Fit Masha'];
  function niceRound(n) {
    if (n < 100) return Math.max(10, Math.round(n / 5) * 5);
    var p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / p) * p;
  }
  function recentVideo(s, rng) {
    var list = s.videos.filter(function (v) { return v.ch === s.active; }).slice(-15);
    return list.length ? list[Math.floor(rng() * list.length)] : null;
  }

  // Какие варианты ответа есть у события
  function eventOptions(s, ev) {
    switch (ev.kind) {
      case 'monetized': return ['ok'];
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
    if (s.gear.cam > 0 && !broken(s)) pool.push(['broken', 0.5]);
    var sum = 0; pool.forEach(function (p) { sum += p[1]; });
    var r = rng() * sum, kind = pool[0][0];
    for (var i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r <= 0) { kind = pool[i][0]; break; } }
    var ev = { kind: kind, theme: ch.theme, ch: s.active, pick: Math.floor(rng() * 1000) };
    if (kind === 'sponsor') ev.amount = niceRound((60 + Math.sqrt(subs) * 25 + subs * 0.05) * th.sponsor);
    else if (kind === 'strike') { var v = recentVideo(s, rng); ev.vid = v.id; ev.cuttable = rng() < 0.6; }
    else if (kind === 'collab') {
      ev.name = NAMES[Math.floor(rng() * NAMES.length)];
      ev.partner = niceRound(Math.max(300, subs * (0.4 + rng() * 2.6) + 200));
      ev.cost = ev.partner > subs ? niceRound(ev.partner * 0.02 + 20) : 0;
      ev.mult = Math.round(Math.min(4, 1.5 + ev.partner / Math.max(1, subs + 500)) * 10) / 10;
    } else if (kind === 'broken') ev.cost = niceRound(Math.max(20, GEAR.cam[s.gear.cam].cost * 0.15));
    else if (kind === 'fans') ev.cost = niceRound(Math.max(15, s.money * 0.05));
    return ev;
  }

  function resolveEvent(s, opt, rng) {
    var ev = s.event; if (!ev) return null;
    if (eventOptions(s, ev).indexOf(opt) < 0 || !canChoose(s, ev, opt)) return null;
    s.event = null;
    if (ev.kind !== 'monetized') s.nextEventAt = s.played + 40 + rng() * 40;
    var ch = s.channels[ev.ch] || channel(s), out = { kind: ev.kind, opt: opt };
    function boost(mult, src, extra) { s.effects.push({ type: 'boost', ch: ev.ch, mult: mult, src: src, viral: extra && extra.viral, subs: extra && extra.subs }); }
    switch (ev.kind + ':' + opt) {
      case 'sponsor:take': s.money += ev.amount; addTrust(s, -6); out.money = ev.amount; break;
      case 'sponsor:honest': out.money = Math.round(ev.amount * 0.7); s.money += out.money; addTrust(s, -1); break;
      case 'sponsor:decline': addTrust(s, 2); break;
      case 'strike:cut': {
        var v = findVideo(s, ev.vid);
        if (v) { var lost = Math.floor(v.launch * 0.2); v.launch -= lost; v.cut = true; ch.catalog -= lost; if (v.mon) ch.catalogRev -= lost * v.rpm; }
        break;
      }
      case 'strike:demonetize': {
        var v2 = findVideo(s, ev.vid);
        if (v2 && v2.mon) { v2.earned = videoEarned(s, v2); v2.mon = false; ch.catalogRev -= v2.launch * v2.rpm; }
        break;
      }
      case 'strike:delete': {
        var v3 = findVideo(s, ev.vid);
        if (v3) { ch.catalog -= v3.launch; if (v3.mon) ch.catalogRev -= v3.launch * v3.rpm; s.videos.splice(s.videos.indexOf(v3), 1); s.comments = s.comments.filter(function (c) { return c.vid !== v3.id; }); }
        break;
      }
      case 'strike:ignore': s.effects.push({ type: 'strike', ch: ev.ch, until: s.played + STRIKE_TIME }); break;
      case 'collab:accept': s.money -= ev.cost; boost(ev.mult, 'collab', { subs: ev.partner * 0.02 }); break;
      case 'trend:follow': boost(2, 'trend', { viral: 2 }); break;
      case 'drama:apologize': addTrust(s, 5); out.subs = -Math.floor(ch.subs * 0.01); ch.subs += out.subs; break;
      case 'drama:joke': addTrust(s, 1); out.subs = Math.floor(ch.subs * 0.02 + 10); ch.subs += out.subs; break;
      case 'drama:attack': addTrust(s, -12); out.subs = Math.floor(ch.subs * 0.04 + 20); ch.subs += out.subs; break;
      case 'drama:ignore': addTrust(s, -3); break;
      case 'broken:repair': s.money -= ev.cost; break;
      case 'broken:keep': s.effects.push({ type: 'broken', until: s.played + 120 }); break;
      case 'fans:go': s.money -= ev.cost; out.subs = Math.floor(ch.subs * 0.01 + 10); ch.subs += out.subs; addTrust(s, 8); break;
    }
    ch.subs = Math.max(0, ch.subs);
    return out;
  }

  // Менеджер высокого уровня сам решает простые события
  function autoChoice(s, ev) {
    if (s.staff.mg < MG_AUTO_EVENTS) return null;
    if (ev.kind === 'sponsor') return 'honest';
    if (ev.kind === 'trend') return 'follow';
    if (ev.kind === 'collab') return canChoose(s, ev, 'accept') ? 'accept' : 'decline';
    if (ev.kind === 'broken') return canChoose(s, ev, 'repair') ? 'repair' : 'keep';
    if (ev.kind === 'fans') return canChoose(s, ev, 'go') ? 'go' : 'skip';
    return null; // страйки, скандалы и монетизацию решает игрок
  }

  /* ---------- Такт игры ---------- */
  function tick(s, dt, rng) {
    var events = [];
    if (!s.channels.length || s.event) return events;   // пока открыто событие, игра стоит
    s.played += dt;
    for (var k in STAFF) if (s.staff[k] > 0) addWork(s, STAFF[k].stage, staffRate(s, k) * dt, rng, events);
    for (var i = 0; i < s.channels.length; i++) {
      var ch = s.channels[i], rate = 0.0015 * THEMES[ch.theme].passive * trustMul(s) * dt;
      var pv = ch.catalog * rate;
      if (pv > 0) {
        ch.views += pv; ch.subs += pv * SUB_RATE * 0.3; ch.likes += pv * likeRate(s) * 0.3;
        if (ch.monetized) { var earn = ch.catalogRev * rate / 1000; s.money += earn; ch.earned += earn; }
      }
      if (!ch.monetized && ch.subs >= MONETIZE_AT) {
        ch.monetized = true;
        s.event = { kind: 'monetized', theme: ch.theme, ch: i };
        events.push({ type: 'event', event: s.event });
      }
    }
    for (var ci = s.comments.length - 1; ci >= 0; ci--) if (commentLeft(s, s.comments[ci]) <= 0) ignoreComment(s, s.comments[ci], events);
    for (var e = s.effects.length - 1; e >= 0; e--) {
      var ef = s.effects[e];
      if (ef.until && ef.until <= s.played) { s.effects.splice(e, 1); events.push({ type: 'effect_end', effect: ef.type }); }
    }
    // обязательная смена: пока ты устроен, каждый день с 9 до 17 ты на работе
    var c = clock(s);
    if (s.job.employed && !s.job.active && c.day !== s.job.lastDay && c.hour >= JOB_FROM && c.hour < JOB_TO) {
      s.job.active = true; s.job.lastDay = c.day;
      s.job.end = s.played + (JOB_TO - c.hour - c.minute / 60) * HOUR;
      events.push({ type: 'shift_start' });
    }
    if (s.job.active && s.played >= s.job.end) {
      s.job.active = false; var pay = salary(s); s.money += pay; s.job.shifts++;
      events.push({ type: 'shift_done', pay: pay });
    }
    if (!s.event && !s.job.active && totalVideos(s) >= 6 && s.played >= s.nextEventAt) {
      var ev = makeEvent(s, rng), auto = autoChoice(s, ev);
      s.event = ev;
      if (auto) events.push({ type: 'auto_event', event: ev, result: resolveEvent(s, auto, rng) });
      else events.push({ type: 'event', event: ev });
    }
    var best = bestSubs(s);
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
    var nxt = GEAR[kind][s.gear[kind] + 1]; if (!nxt) return null;
    var d = s.channels.some(function (c) { return THEMES[c.theme].gearDiscount; }) ? 0.15 : 0;
    return Math.round(nxt.cost * (1 - d));
  }
  function gearBlocked(s, kind) { var t = s.gear[kind] + 1; return GEAR[kind][t] && s.home < gearNeedsHome(kind, t); }
  function buyGear(s, kind) {
    var c = gearCost(s, kind);
    if (c == null || s.money < c || gearBlocked(s, kind)) return false;
    s.money -= c; s.gear[kind]++; return true;
  }
  function homeCost(s) { var h = HOMES[s.home + 1]; return h ? h.cost : null; }
  function moveHome(s) { var c = homeCost(s); if (c == null || s.money < c) return false; s.money -= c; s.home++; return true; }
  function staffCost(s, kind) {
    if (s.staff[kind] >= STAFF[kind].max) return null;
    return Math.round(STAFF[kind].base * Math.pow(STAFF[kind].growth, s.staff[kind]));
  }
  function hire(s, kind) { var c = staffCost(s, kind); if (c == null || s.money < c) return false; s.money -= c; s.staff[kind]++; return true; }

  function restore(data) {
    var s = newState();
    if (!data || typeof data !== 'object' || data.v !== 5) return s;
    for (var k in s) {
      if (!(k in data)) continue;
      if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) {
        for (var j in s[k]) if (data[k] && typeof data[k][j] === typeof s[k][j]) s[k][j] = data[k][j];
      } else s[k] = data[k];
    }
    s.secondNotified = !!data.secondNotified;
    s.channels = (s.channels || []).filter(function (c) { return c && THEMES[c.theme]; });
    if (s.active >= s.channels.length) s.active = 0;
    return s;
  }

  var api = {
    FORMATS: FORMATS, FORMAT_IDS: FORMAT_IDS, COMMENT_HOURS: COMMENT_HOURS, IGNORE_TRUST: IGNORE_TRUST, JOB_FROM: JOB_FROM, JOB_TO: JOB_TO,
    GOAL_SUBS: GOAL_SUBS, SECOND_CHANNEL_AT: SECOND_CHANNEL_AT, MONETIZE_AT: MONETIZE_AT, MAX_STRIKES: MAX_STRIKES,
    STRIKE_TIME: STRIKE_TIME, HOUR: HOUR, SHIFT_HOURS: SHIFT_HOURS, MG_AUTO_COMMENTS: MG_AUTO_COMMENTS, MG_AUTO_EVENTS: MG_AUTO_EVENTS,
    WORK: WORK, THEMES: THEMES, THEME_IDS: THEME_IDS, HOMES: HOMES, GEAR: GEAR, GEAR_IDS: GEAR_IDS, STAFF: STAFF, MILESTONES: MILESTONES,
    newState: newState, restore: restore, startChannel: startChannel, canOpenSecond: canOpenSecond,
    channel: channel, theme: theme, bestSubs: bestSubs, totalVideos: totalVideos, clock: clock, salary: salary,
    quality: quality, power: power, workNeed: workNeed, stageOpen: stageOpen, canWork: canWork, trustMul: trustMul,
    strikes: strikes, strikesOn: strikesOn, broken: broken, videoViews: videoViews, likeRate: likeRate, findVideo: findVideo,
    addWork: addWork, tick: tick, staffRate: staffRate, passiveRate: passiveRate, quitJob: quitJob, commentLeft: commentLeft, addTrust: addTrust, makeEvent: makeEvent, setFormat: setFormat, itemFormat: itemFormat, videoEarned: videoEarned, dislikeRate: dislikeRate,
    replyComment: replyComment, eventOptions: eventOptions, canChoose: canChoose, resolveEvent: resolveEvent,
    gearCost: gearCost, gearBlocked: gearBlocked, gearNeedsHome: gearNeedsHome, buyGear: buyGear,
    homeCost: homeCost, moveHome: moveHome, staffCost: staffCost, hire: hire
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(this);
