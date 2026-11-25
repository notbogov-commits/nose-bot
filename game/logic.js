// ЮТУБЕРЫ — игровая логика (без интерфейса).
// Работает и в браузере (window.Logic), и в Node (module.exports) для тестов баланса.
(function (root) {
  'use strict';

  var GOAL_SUBS = 1000000;
  var SUB_RATE = 0.012;   // подписчиков с одного просмотра
  var MONEY_RATE = 0.01;  // денег с одного просмотра

  // Сколько "работы" нужно на каждый этап одного видео
  var WORK = { rec: 10, edit: 12, up: 6 };

  // Техника: покупается по ступеням. power — сила клика на этапе, q — качество видео.
  var CAMS = [
    { id: 'phone',  cost: 0,      power: 1,  q: 1.0 },
    { id: 'webcam', cost: 40,     power: 2,  q: 1.4 },
    { id: 'dslr',   cost: 600,    power: 4,  q: 2.0 },
    { id: 'cinema', cost: 9000,   power: 8,  q: 3.0 },
    { id: 'studio', cost: 120000, power: 16, q: 4.5 }
  ];
  var PCS = [
    { id: 'laptop',      cost: 0,     power: 1, q: 1.0 },
    { id: 'gamingpc',    cost: 60,    power: 2, q: 1.25 },
    { id: 'workstation', cost: 900,   power: 4, q: 1.6 },
    { id: 'renderfarm',  cost: 15000, power: 8, q: 2.1 }
  ];
  var NETS = [
    { id: 'adsl',    cost: 0,     power: 1 },
    { id: 'fiber',   cost: 50,    power: 2 },
    { id: 'gigabit', cost: 1200,  power: 4 },
    { id: 'satlink', cost: 20000, power: 8 }
  ];
  var TIERS = { cam: CAMS, pc: PCS, net: NETS };

  // Прокачка по уровням: бонус к качеству
  var LEVELED = {
    mic:   { base: 30, growth: 1.9, max: 6, qPer: 0.15 },
    light: { base: 80, growth: 1.9, max: 6, qPer: 0.15 }
  };

  // Команда: автоматизирует этапы (см. staffRate).
  var STAFF = {
    op: { stage: 'rec',  base: 150, growth: 2.0 },
    ed: { stage: 'edit', base: 200, growth: 2.0 },
    mg: { stage: 'up',   base: 120, growth: 2.0 }
  };

  // Награды за подписчиков
  var MILESTONES = [100, 1000, 10000, 100000, 1000000];

  function newState() {
    return {
      v: 1,
      money: 0, subs: 0, views: 0,
      videos: 0, raw: 0, edited: 0,
      work: { rec: 0, edit: 0, up: 0 },
      cam: 0, pc: 0, net: 0,
      mic: 0, light: 0,
      staff: { op: 0, ed: 0, mg: 0 },
      catalog: 0,      // суммарные стартовые просмотры всех видео (даёт пассивные просмотры)
      best: null,      // лучшее видео {views, viral}
      milestones: [],
      played: 0,
      won: false, wonAt: 0
    };
  }

  function quality(s) {
    return CAMS[s.cam].q * PCS[s.pc].q *
      (1 + LEVELED.mic.qPer * s.mic) * (1 + LEVELED.light.qPer * s.light);
  }

  function power(s, stage) {
    if (stage === 'rec') return CAMS[s.cam].power;
    if (stage === 'edit') return PCS[s.pc].power;
    return NETS[s.net].power;
  }

  // Можно ли сейчас работать над этапом
  function canWork(s, stage) {
    if (stage === 'edit') return s.raw > 0;
    if (stage === 'up') return s.edited > 0;
    return true;
  }

  function levelCost(kind, lvl) {
    var d = LEVELED[kind];
    return Math.round(d.base * Math.pow(d.growth, lvl));
  }
  function staffCost(kind, lvl) {
    var d = STAFF[kind];
    return Math.round(d.base * Math.pow(d.growth, lvl));
  }
  function nextTier(s, kind) {
    return TIERS[kind][s[kind] + 1] || null;
  }

  // Вложить работу в этап. Возвращает список событий.
  function addWork(s, stage, amount, rng, events) {
    events = events || [];
    var need = WORK[stage];
    var guard = 0;
    while (amount > 0 && canWork(s, stage) && guard++ < 1000) {
      var room = need - s.work[stage];
      if (amount < room) { s.work[stage] += amount; amount = 0; break; }
      amount -= room;
      s.work[stage] = 0;
      if (stage === 'rec') { s.raw++; events.push({ type: 'recorded' }); }
      else if (stage === 'edit') { s.raw--; s.edited++; events.push({ type: 'edited' }); }
      else { s.edited--; publish(s, rng, events); }
    }
    // Нечего монтировать/загружать — остаток работы сгорает (не копится)
    return events;
  }

  function publish(s, rng, events) {
    var q = quality(s);
    var base = (300 + 2 * Math.sqrt(s.subs)) * q;
    var viral = rng() < 0.04;
    var views = Math.floor(base * (0.7 + 0.6 * rng()) * (viral ? 6 + rng() * 6 : 1));
    var subs = views * SUB_RATE;
    var money = views * MONEY_RATE;
    s.videos++;
    s.catalog += views;
    gain(s, views, subs, money);
    if (!s.best || views > s.best.views) s.best = { views: views, viral: viral };
    events.push({ type: 'published', views: views, subs: subs, money: money, viral: viral });
  }

  function gain(s, views, subs, money) {
    s.views += views;
    s.subs += subs;
    s.money += money;
  }

  // Сколько работы в секунду делает сотрудник: уровни × (корень из силы техники)
  function staffRate(s, kind) {
    return s.staff[kind] * 0.6 * Math.sqrt(power(s, STAFF[kind].stage));
  }

  // Пассивные просмотры старых видео в секунду
  function passiveRate(s) { return s.catalog * 0.0015; }

  function tick(s, dt, rng) {
    var events = [];
    s.played += dt;
    // Команда работает сама
    for (var k in STAFF) {
      var lvl = s.staff[k];
      if (lvl > 0) addWork(s, STAFF[k].stage, staffRate(s, k) * dt, rng, events);
    }
    // Старые видео продолжают набирать просмотры
    var pv = passiveRate(s) * dt;
    if (pv > 0) gain(s, pv, pv * SUB_RATE * 0.3, pv * MONEY_RATE);
    // Награды
    for (var i = 0; i < MILESTONES.length; i++) {
      var m = MILESTONES[i];
      if (s.subs >= m && s.milestones.indexOf(m) < 0) {
        s.milestones.push(m);
        events.push({ type: 'milestone', value: m });
      }
    }
    if (!s.won && s.subs >= GOAL_SUBS) {
      s.won = true; s.wonAt = s.played;
      events.push({ type: 'won' });
    }
    return events;
  }

  function buyTier(s, kind) {
    var t = nextTier(s, kind);
    if (!t || s.money < t.cost) return false;
    s.money -= t.cost; s[kind]++;
    return true;
  }
  function buyLevel(s, kind) {
    if (s[kind] >= LEVELED[kind].max) return false;
    var c = levelCost(kind, s[kind]);
    if (s.money < c) return false;
    s.money -= c; s[kind]++;
    return true;
  }
  function hire(s, kind) {
    var c = staffCost(kind, s.staff[kind]);
    if (s.money < c) return false;
    s.money -= c; s.staff[kind]++;
    return true;
  }

  // Подгрузить сохранение поверх нового состояния (на случай новых полей в будущих версиях)
  function restore(data) {
    var s = newState();
    if (!data || typeof data !== 'object') return s;
    for (var k in s) {
      if (!(k in data)) continue;
      if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) {
        for (var j in s[k]) if (typeof data[k][j] === 'number') s[k][j] = data[k][j];
      } else s[k] = data[k];
    }
    return s;
  }

  var api = {
    GOAL_SUBS: GOAL_SUBS, WORK: WORK, CAMS: CAMS, PCS: PCS, NETS: NETS, TIERS: TIERS,
    LEVELED: LEVELED, STAFF: STAFF, MILESTONES: MILESTONES,
    newState: newState, restore: restore, quality: quality, power: power, canWork: canWork,
    levelCost: levelCost, staffCost: staffCost, nextTier: nextTier,
    addWork: addWork, tick: tick, staffRate: staffRate, passiveRate: passiveRate,
    buyTier: buyTier, buyLevel: buyLevel, hire: hire
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(this);
