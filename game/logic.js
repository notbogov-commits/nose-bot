// ЮТУБЕРЫ — игровая логика (без интерфейса).
// Работает и в браузере (window.Logic), и в Node (module.exports) для проверки баланса.
(function (root) {
  'use strict';

  var GOAL_SUBS = 1000000;          // цель: суммарно на всех каналах
  var SECOND_CHANNEL_AT = 50000;    // столько подписчиков нужно для второго канала
  var SUB_RATE = 0.012;             // подписчиков с одного просмотра
  var MONEY_RATE = 0.01;            // денег с одного просмотра
  var STRIKE_TIME = 240;            // сколько секунд действует страйк
  var MAX_STRIKES = 3;              // при стольких страйках загрузка блокируется

  // Сколько "работы" нужно на каждый этап одного видео (дальше умножается на тему)
  var WORK = { rec: 10, edit: 12, up: 6 };

  // Тематики канала.
  // views/money/viral/strike/sponsor/passive — множители; work — сложность этапов; trust — сколько доверия даёт хорошее событие
  var THEMES = {
    games:     { views: 1.2,  money: 0.8,  viral: 1.0, strike: 1.0, sponsor: 0.9, passive: 1.0, work: { rec: 0.8, edit: 1.2, up: 1 } },
    cooking:   { views: 0.9,  money: 1.2,  viral: 0.8, strike: 0.4, sponsor: 1.3, passive: 1.2, work: { rec: 1.3, edit: 0.9, up: 1 } },
    pranks:    { views: 1.15, money: 0.9,  viral: 2.2, strike: 2.4, sponsor: 0.8, passive: 0.8, work: { rec: 1.0, edit: 0.8, up: 1 } },
    tech:      { views: 0.85, money: 1.4,  viral: 0.7, strike: 0.6, sponsor: 1.7, passive: 1.1, work: { rec: 1.0, edit: 1.1, up: 1 }, gearDiscount: 0.15 },
    truecrime: { views: 1.15, money: 1.1,  viral: 1.2, strike: 1.7, sponsor: 0.9, passive: 1.4, work: { rec: 0.7, edit: 1.5, up: 1 } },
    vlog:      { views: 1.0,  money: 1.0,  viral: 1.0, strike: 0.7, sponsor: 1.1, passive: 0.9, work: { rec: 0.8, edit: 0.8, up: 1 }, fans: 2 },
    music:     { views: 1.0,  money: 0.9,  viral: 1.5, strike: 1.9, sponsor: 1.0, passive: 1.5, work: { rec: 1.4, edit: 1.0, up: 1 } },
    science:   { views: 0.9,  money: 1.2,  viral: 1.1, strike: 0.5, sponsor: 1.2, passive: 1.3, work: { rec: 1.2, edit: 1.1, up: 1 } },
    fitness:   { views: 0.95, money: 1.25, viral: 0.9, strike: 0.7, sponsor: 1.5, passive: 1.0, work: { rec: 1.1, edit: 0.9, up: 1 } },
    asmr:      { views: 0.9,  money: 1.0,  viral: 0.8, strike: 0.4, sponsor: 1.0, passive: 1.7, work: { rec: 0.9, edit: 1.0, up: 1 }, fans: 1.5 }
  };
  var THEME_IDS = Object.keys(THEMES);

  // Техника: у каждого предмета ступени. power — сила клика на своём этапе, q — множитель качества.
  var GEAR = {
    cam: [
      { id: 'phone', cost: 0, power: 1, q: 1.0 }, { id: 'webcam', cost: 40, power: 2, q: 1.4 },
      { id: 'dslr', cost: 600, power: 4, q: 2.0 }, { id: 'cinema', cost: 9000, power: 8, q: 3.0 },
      { id: 'studiocam', cost: 120000, power: 16, q: 4.5 }
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
      { id: 'condenser', cost: 3000, q: 1.5 }, { id: 'broadcast', cost: 40000, q: 1.75 }
    ],
    light: [
      { id: 'nolight', cost: 0, q: 1.0 }, { id: 'desklamp', cost: 80, q: 1.12 }, { id: 'ringlight', cost: 700, q: 1.28 },
      { id: 'softbox', cost: 7000, q: 1.45 }, { id: 'studiolight', cost: 80000, q: 1.7 }
    ]
  };
  var GEAR_IDS = ['cam', 'pc', 'net', 'mic', 'light'];

  // Команда: 3 роли, каждая прокачивается по уровням и автоматизирует свой этап.
  var STAFF = {
    op: { stage: 'rec', base: 150, growth: 2.0, max: 15 },
    ed: { stage: 'edit', base: 200, growth: 2.0, max: 15 },
    mg: { stage: 'up', base: 120, growth: 2.0, max: 15 }
  };

  var MILESTONES = [100, 1000, 10000, 100000, 1000000];

  function newChannel(theme) { return { theme: theme, subs: 0, views: 0, catalog: 0, videos: 0 }; }

  function newState() {
    return {
      v: 2,
      money: 0, trust: 70,
      raw: 0, edited: 0,
      work: { rec: 0, edit: 0, up: 0 },
      gear: { cam: 0, pc: 0, net: 0, mic: 0, light: 0 },
      staff: { op: 0, ed: 0, mg: 0 },
      channels: [],     // 1–2 канала
      active: 0,        // на какой канал идут новые видео
      effects: [],      // временные эффекты: strike, broken, boost
      event: null,      // текущая карточка события
      nextEventAt: 0,   // когда придёт следующая (секунды игры)
      milestones: [],
      played: 0,
      won: false, wonAt: 0,
      tut: 0            // шаг обучения (интерфейс)
    };
  }

  function channel(s) { return s.channels[s.active]; }
  function theme(s) { return THEMES[channel(s).theme]; }
  function totalSubs(s) { var n = 0; for (var i = 0; i < s.channels.length; i++) n += s.channels[i].subs; return n; }
  function totalViews(s) { var n = 0; for (var i = 0; i < s.channels.length; i++) n += s.channels[i].views; return n; }
  function totalVideos(s) { var n = 0; for (var i = 0; i < s.channels.length; i++) n += s.channels[i].videos; return n; }

  function startChannel(s, themeId) {
    if (!THEMES[themeId] || s.channels.length >= 2) return false;
    if (s.channels.length === 1) {
      if (!canOpenSecond(s) || s.channels[0].theme === themeId) return false;
    }
    var ch = newChannel(themeId);
    // Второй канал стартует с небольшой аудиторией первого
    if (s.channels.length === 1) ch.subs = Math.floor(s.channels[0].subs * 0.03);
    s.channels.push(ch);
    s.active = s.channels.length - 1;
    if (!s.nextEventAt) s.nextEventAt = s.played + 70;
    return true;
  }
  function canOpenSecond(s) { return s.channels.length === 1 && s.channels[0].subs >= SECOND_CHANNEL_AT; }

  /* ---------- Эффекты ---------- */
  function strikes(s) { var n = 0; s.effects.forEach(function (e) { if (e.type === 'strike' && e.ch === s.active) n++; }); return n; }
  function strikesOn(s, ch) { var n = 0; s.effects.forEach(function (e) { if (e.type === 'strike' && e.ch === ch) n++; }); return n; }
  function broken(s) { return s.effects.some(function (e) { return e.type === 'broken'; }); }
  function trustMul(s) { return 0.6 + 0.6 * s.trust / 100; }   // 0.6 … 1.2

  function quality(s) {
    var q = 1;
    for (var i = 0; i < GEAR_IDS.length; i++) q *= GEAR[GEAR_IDS[i]][s.gear[GEAR_IDS[i]]].q;
    if (broken(s)) q *= 0.7;
    return q;
  }
  function power(s, stage) {
    if (stage === 'rec') return GEAR.cam[s.gear.cam].power;
    if (stage === 'edit') return GEAR.pc[s.gear.pc].power;
    return GEAR.net[s.gear.net].power;
  }
  function workNeed(s, stage) { return WORK[stage] * (s.channels.length ? theme(s).work[stage] : 1); }

  function canWork(s, stage) {
    if (!s.channels.length) return false;
    if (stage === 'edit') return s.raw > 0;
    if (stage === 'up') return s.edited > 0 && strikes(s) < MAX_STRIKES;
    return true;
  }

  function addWork(s, stage, amount, rng, events) {
    events = events || [];
    var guard = 0;
    while (amount > 0 && canWork(s, stage) && guard++ < 1000) {
      var need = workNeed(s, stage);
      var room = need - s.work[stage];
      if (amount < room) { s.work[stage] += amount; amount = 0; break; }
      amount -= room;
      s.work[stage] = 0;
      if (stage === 'rec') { s.raw++; events.push({ type: 'recorded' }); }
      else if (stage === 'edit') { s.raw--; s.edited++; events.push({ type: 'edited' }); }
      else { s.edited--; publish(s, rng, events); }
    }
    return events;
  }

  function publish(s, rng, events) {
    var ch = channel(s), th = theme(s);
    var q = quality(s);
    var mult = th.views * trustMul(s) * Math.pow(0.75, strikes(s));
    var viralChance = 0.04 * th.viral;
    var boost = null;
    for (var i = 0; i < s.effects.length; i++) if (s.effects[i].type === 'boost') { boost = s.effects[i]; break; }
    if (boost) { mult *= boost.mult; viralChance *= boost.viral || 1; }
    var base = (300 + 2 * Math.sqrt(ch.subs)) * q * mult;
    var viral = rng() < viralChance;
    var views = Math.floor(base * (0.7 + 0.6 * rng()) * (viral ? 6 + rng() * 6 : 1));
    var subs = views * SUB_RATE;
    var money = views * MONEY_RATE * th.money;
    if (boost) {
      subs += boost.subs || 0;
      s.effects.splice(s.effects.indexOf(boost), 1);
    }
    ch.videos++;
    ch.catalog += views;
    ch.views += views; ch.subs += subs; s.money += money;
    if (viral) s.trust = Math.min(100, s.trust + 1);
    events.push({ type: 'published', views: views, subs: subs, money: money, viral: viral, boost: boost ? boost.src : null });
  }

  function passiveRate(s, i) { var ch = s.channels[i]; return ch.catalog * 0.0015 * THEMES[ch.theme].passive * trustMul(s); }

  function staffRate(s, kind) {
    return s.staff[kind] * 0.6 * Math.sqrt(power(s, STAFF[kind].stage));
  }

  /* ---------- События (карточки) ---------- */
  var NAMES = ['Max Pixel', 'Лиза Лайк', 'DJ Борщ', 'Kira Plays', 'Саня Влог', 'Mr. Tofu', 'Ника Бьюти', 'Tony Byte', 'Шеф Гоша', 'Луна ASMR', 'Doc Science', 'Fit Masha'];

  function niceRound(n) {
    if (n < 100) return Math.max(10, Math.round(n / 5) * 5);
    var p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / p) * p;
  }

  function makeEvent(s, rng) {
    var th = theme(s), subs = totalSubs(s);
    var pool = [
      ['sponsor', 1.2 * th.sponsor],
      ['strike', 0.8 * th.strike],
      ['collab', 1.0],
      ['trend', 0.8],
      ['drama', 0.6],
      ['fans', 0.5 * (th.fans || 1)]
    ];
    if (s.gear.cam > 0 && !broken(s)) pool.push(['broken', 0.5]);
    var sum = 0; pool.forEach(function (p) { sum += p[1]; });
    var r = rng() * sum, kind = pool[0][0];
    for (var i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r <= 0) { kind = pool[i][0]; break; } }
    var ev = { kind: kind, theme: channel(s).theme, ch: s.active, expires: s.played + 30 };
    if (kind === 'sponsor') {
      ev.amount = niceRound((60 + Math.sqrt(subs) * 25 + subs * 0.05) * th.sponsor);
      ev.trust = 6;
    } else if (kind === 'collab') {
      ev.name = NAMES[Math.floor(rng() * NAMES.length)];
      ev.partner = niceRound(Math.max(300, subs * (0.4 + rng() * 2.6) + 200));
      ev.cost = ev.partner > subs ? niceRound(ev.partner * 0.02 + 20) : 0;
      ev.mult = Math.min(4, 1.5 + ev.partner / Math.max(1, subs + 500));
    } else if (kind === 'broken') {
      ev.cost = niceRound(Math.max(20, GEAR.cam[s.gear.cam].cost * 0.15));
    } else if (kind === 'fans') {
      ev.cost = niceRound(Math.max(15, s.money * 0.05));
    }
    return ev;
  }

  // choice: 'a' (первая кнопка) или 'b' (вторая / тайм-аут)
  function resolveEvent(s, choice, rng) {
    var ev = s.event; if (!ev) return null;
    s.event = null;
    s.nextEventAt = s.played + 40 + rng() * 40;
    var ch = s.channels[ev.ch] || channel(s);
    var out = { kind: ev.kind, choice: choice, ok: true };
    function trust(d) { s.trust = Math.max(0, Math.min(100, s.trust + d)); }
    function boost(mult, src, extra) { s.effects.push({ type: 'boost', mult: mult, src: src, viral: extra && extra.viral, subs: extra && extra.subs }); }
    switch (ev.kind) {
      case 'sponsor':
        if (choice === 'a') { s.money += ev.amount; trust(-ev.trust); out.money = ev.amount; }
        else trust(2);
        break;
      case 'strike':
        if (choice === 'a') {
          if (rng() < 0.55) { trust(2); out.ok = true; }
          else { s.effects.push({ type: 'strike', ch: ev.ch, until: s.played + STRIKE_TIME }); out.ok = false; }
        } else {
          var lost = Math.floor(ch.catalog * 0.1); ch.catalog -= lost; out.lost = lost;
        }
        break;
      case 'collab':
        if (choice === 'a') {
          if (s.money < ev.cost) { out.ok = false; break; }
          s.money -= ev.cost;
          boost(ev.mult, 'collab', { subs: ev.partner * 0.02 });
        }
        break;
      case 'trend':
        if (choice === 'a') boost(2, 'trend', { viral: 2 });
        break;
      case 'drama':
        if (choice === 'a') {
          if (rng() < 0.5) { var g = Math.floor(ch.subs * 0.03 + 20); ch.subs += g; trust(5); out.ok = true; out.subs = g; }
          else { trust(-10); out.ok = false; }
        } else trust(-3);
        break;
      case 'broken':
        if (choice === 'a') { if (s.money >= ev.cost) s.money -= ev.cost; else { out.ok = false; s.effects.push({ type: 'broken', until: s.played + 120 }); } }
        else s.effects.push({ type: 'broken', until: s.played + 120 });
        break;
      case 'fans':
        if (choice === 'a') {
          var c = Math.min(ev.cost, s.money); s.money -= c;
          var f = Math.floor(ch.subs * 0.01 + 10); ch.subs += f; trust(8); out.subs = f;
        }
        break;
    }
    return out;
  }

  /* ---------- Такт игры ---------- */
  function tick(s, dt, rng) {
    var events = [];
    if (!s.channels.length) return events;
    s.played += dt;
    for (var k in STAFF) if (s.staff[k] > 0) addWork(s, STAFF[k].stage, staffRate(s, k) * dt, rng, events);
    for (var i = 0; i < s.channels.length; i++) {
      var ch = s.channels[i], pv = passiveRate(s, i) * dt;
      if (pv > 0) { ch.views += pv; ch.subs += pv * SUB_RATE * 0.3; s.money += pv * MONEY_RATE * THEMES[ch.theme].money; }
    }
    // истёкшие эффекты
    for (var e = s.effects.length - 1; e >= 0; e--) {
      var ef = s.effects[e];
      if (ef.until && ef.until <= s.played) { s.effects.splice(e, 1); events.push({ type: 'effect_end', effect: ef.type }); }
    }
    // карточки событий: начинаются после нескольких видео
    if (s.event && s.played >= s.event.expires) events.push({ type: 'event_timeout', result: resolveEvent(s, 'b', rng) });
    if (!s.event && totalVideos(s) >= 8 && s.played >= s.nextEventAt) {
      s.event = makeEvent(s, rng);
      events.push({ type: 'event', event: s.event });
    }
    var total = totalSubs(s);
    for (var m = 0; m < MILESTONES.length; m++) {
      if (total >= MILESTONES[m] && s.milestones.indexOf(MILESTONES[m]) < 0) {
        s.milestones.push(MILESTONES[m]); events.push({ type: 'milestone', value: MILESTONES[m] });
      }
    }
    if (canOpenSecond(s) && !s.secondNotified) { s.secondNotified = true; events.push({ type: 'second_ready' }); }
    if (!s.won && total >= GOAL_SUBS) { s.won = true; s.wonAt = s.played; events.push({ type: 'won' }); }
    return events;
  }

  /* ---------- Покупки ---------- */
  function gearCost(s, kind) {
    var nxt = GEAR[kind][s.gear[kind] + 1]; if (!nxt) return null;
    var d = s.channels.some(function (c) { return THEMES[c.theme].gearDiscount; }) ? 0.15 : 0;
    return Math.round(nxt.cost * (1 - d));
  }
  function buyGear(s, kind) {
    var c = gearCost(s, kind);
    if (c == null || s.money < c) return false;
    s.money -= c; s.gear[kind]++; return true;
  }
  function staffCost(s, kind) {
    if (s.staff[kind] >= STAFF[kind].max) return null;
    return Math.round(STAFF[kind].base * Math.pow(STAFF[kind].growth, s.staff[kind]));
  }
  function hire(s, kind) {
    var c = staffCost(s, kind);
    if (c == null || s.money < c) return false;
    s.money -= c; s.staff[kind]++; return true;
  }

  // Подгрузить сохранение поверх нового состояния (новые поля из будущих версий не ломают старые сейвы)
  function restore(data) {
    var s = newState();
    if (!data || typeof data !== 'object' || data.v !== 2) return s;
    for (var k in s) {
      if (!(k in data)) continue;
      if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) {
        for (var j in s[k]) if (typeof data[k][j] === 'number') s[k][j] = data[k][j];
      } else s[k] = data[k];
    }
    s.secondNotified = !!data.secondNotified;
    s.channels = (s.channels || []).filter(function (c) { return c && THEMES[c.theme]; });
    if (s.active >= s.channels.length) s.active = 0;
    return s;
  }

  var api = {
    GOAL_SUBS: GOAL_SUBS, SECOND_CHANNEL_AT: SECOND_CHANNEL_AT, MAX_STRIKES: MAX_STRIKES, STRIKE_TIME: STRIKE_TIME,
    WORK: WORK, THEMES: THEMES, THEME_IDS: THEME_IDS, GEAR: GEAR, GEAR_IDS: GEAR_IDS, STAFF: STAFF, MILESTONES: MILESTONES,
    newState: newState, restore: restore, startChannel: startChannel, canOpenSecond: canOpenSecond,
    channel: channel, theme: theme, totalSubs: totalSubs, totalViews: totalViews, totalVideos: totalVideos,
    quality: quality, power: power, workNeed: workNeed, canWork: canWork, trustMul: trustMul,
    strikes: strikes, strikesOn: strikesOn, broken: broken,
    addWork: addWork, tick: tick, staffRate: staffRate, passiveRate: passiveRate,
    resolveEvent: resolveEvent, gearCost: gearCost, buyGear: buyGear, staffCost: staffCost, hire: hire
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(this);
