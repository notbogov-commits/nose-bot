// ЮТУБЕРЫ — интерфейс: связывает логику, тексты, звук и отрисовку квартиры.
(function () {
'use strict';
var BANNERS = window.BANNERS, TITLES = window.TITLES, L = window.Logic, A = window.GameAudio, TX = window.TEXTS, ICON = window.ICON, THEME_ICON = window.THEME_ICON, THEME_TINT = window.THEME_TINT, EVENT_TINT = window.EVENT_TINT;
var SLOT_KEY = 'youtubers_slot_', META_KEY = 'youtubers_meta', SET_KEY = 'youtubers_settings', SLOTS = 3;
var DEV_HASH = '36b07348d7b7e38b41a3fb2e9e9dfd0a87b18f2682a981c03440f6ba30ab0e21'; // SHA-256 пароля разработчика
var STAGES = ['rec', 'edit', 'up'];
var STAFF_OF = { rec: 'op', edit: 'ed', up: 'mg' };
var TABS = ['gear', 'team', 'home', 'channel', 'comments'];
var $ = function (id) { return document.getElementById(id); };

/* ---------- Настройки, тексты, форматирование ---------- */
var settings = { lang: 'ru', sfx: true, music: true, sfxVol: 80, musicVol: 50, dev: false };
try { var st = JSON.parse(localStorage.getItem(SET_KEY) || '{}'); for (var k in st) settings[k] = st[k]; } catch (e) {}
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) {} }
A.setSfx(settings.sfx); A.setMusic(settings.music); A.setSfxVolume(settings.sfxVol / 100); A.setMusicVolume(settings.musicVol / 100);

function T() { return TX[settings.lang]; }
function t(key, vars) {
  var s = T()[key]; if (s == null) s = key;
  if (vars) for (var v in vars) s = s.split('{' + v + '}').join(vars[v]);
  return s;
}
function th(id) { return T().themes[id]; }
function dec(x) { return settings.lang === 'ru' ? String(x).replace('.', ',') : String(x); }
function fmt(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  var u = [['B', 1e9], ['M', 1e6], ['K', 1e3]];
  for (var i = 0; i < u.length; i++) if (n >= u[i][1]) { var v = n / u[i][1]; return dec(v >= 100 ? Math.floor(v) : Math.floor(v * 10) / 10) + u[i][0]; }
}
function fmtMoney(n) { return '$' + fmt(n); }
function fmtFull(n) { return Math.floor(n).toLocaleString(settings.lang === 'ru' ? 'ru-RU' : 'en-US'); }
function fmtClock(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2); }
function fmtTime(sec) {
  var m = Math.floor(sec / 60), h = Math.floor(m / 60);
  if (settings.lang === 'ru') return h ? h + ' ч ' + (m % 60) + ' мин' : m + ' мин';
  return h ? h + 'h ' + (m % 60) + 'm' : m + ' min';
}
function hhmm(h, m) { return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function signed(x) { x = Math.round(x * 10) / 10; return (x > 0 ? '+' : x < 0 ? '−' : '±') + dec(Math.abs(x)); }

/* ---------- Состояние и слоты сохранений ---------- */
var S = L.newState(), slot = 0;   // slot = 0 — игра не запущена (открыто главное меню)
function readSlot(n) { try { var raw = localStorage.getItem(SLOT_KEY + n); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
function writeSlot(n, data) { try { localStorage.setItem(SLOT_KEY + n, JSON.stringify(data)); return true; } catch (e) { return false; } }
function meta() { try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch (e) { return {}; } }
function setMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {} }
function save() { if (!slot) return; S.savedAt = Date.now(); writeSlot(slot, S); var m = meta(); m.last = slot; setMeta(m); }
var hotData = window.claude && window.claude.hot && window.claude.hot.data;
if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(function () { return { state: S, slot: slot }; });

var feedLines = [], lastClick = { rec: -9, edit: -9, up: -9 }, now = 0, shopTab = 'gear', lastPublish = -9, evShownAt = 0, movingUntil = 0;

function videoTitle(v) {
  var ch = S.channels[v.ch]; if (!ch) return '…';
  var G = TITLES[settings.lang][ch.theme], tt = v.tt || [v.n, v.n * 3, v.n * 7, v.n * 11];
  var tpl = G[tt[0] % G.length], pick = function (arr, k) { return arr && arr.length ? arr[tt[k] % arr.length] : ''; };
  var s = tpl[0].split('{a}').join(pick(tpl[1], 1)).split('{b}').join(pick(tpl[2], 2)).split('{n}').join(pick(TITLES.nums, 3)).split('{m}').join(pick(TITLES.mins, 3));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function chName(i) { var ch = S.channels[i]; return ch ? (ch.name || th(ch.theme).name) : ''; }
function C() { return L.channel(S); }
function bannerCss(ch) { return BANNERS.css(ch.theme, ch.style || 0); }
function avatarColor(ch) { return BANNERS.avatar(ch.theme, ch.style || 0); }
function fmtLen(sec) { var m = Math.floor(sec / 60); return m + ':' + ('0' + (sec % 60)).slice(-2); }

/* ---------- Мелочи ---------- */
var toastTimer;
function toast(msg) { var el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2600); }
function floater(text, cls) {
  var el = document.createElement('div');
  el.className = 'floater ' + (cls || ''); el.textContent = text;
  el.style.left = (32 + Math.random() * 36) + '%'; el.style.top = (22 + Math.random() * 22) + '%';
  $('floaters').appendChild(el); setTimeout(function () { el.remove(); }, 1900);
}
function addFeed(html, cls) { feedLines.unshift({ html: html, cls: cls || '' }); if (feedLines.length > 4) feedLines.pop(); renderFeed(); }
function renderFeed() {
  var box = $('feed'); box.innerHTML = '<div class="label">' + esc(t('feed')) + '</div>';
  if (!feedLines.length) { var p = document.createElement('p'); p.textContent = t('first'); box.appendChild(p); }
  feedLines.forEach(function (l) { var p = document.createElement('p'); p.className = l.cls; p.innerHTML = l.html; box.appendChild(p); });
}

/* ---------- Тексты на странице ---------- */
function applyTexts() {
  document.documentElement.lang = settings.lang; document.title = t('title'); $('logoTxt').textContent = t('title');
  var els = document.querySelectorAll('[data-t]');
  for (var i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-t'));
  $('sfxBtn').setAttribute('aria-label', t('sound')); $('musicBtn').setAttribute('aria-label', t('music')); $('menuBtn').setAttribute('aria-label', t('menu'));
  $('menuBtn').innerHTML = ICON.menu; $('jobIco').innerHTML = ICON.job;
  renderToggles(); renderFeed(); renderChans(); buildTab(); renderStageLabels(); renderEventModal(true);
}
function renderToggles() {
  $('sfxBtn').innerHTML = settings.sfx ? ICON.sfxOn : ICON.sfxOff; $('sfxBtn').setAttribute('aria-pressed', settings.sfx);
  $('musicBtn').innerHTML = settings.music ? ICON.musicOn : ICON.musicOff; $('musicBtn').setAttribute('aria-pressed', settings.music);
  $('mRu').setAttribute('aria-pressed', settings.lang === 'ru'); $('mEn').setAttribute('aria-pressed', settings.lang === 'en');
}
function renderStageLabels() {
  STAGES.forEach(function (st) { $('lbl-' + st).textContent = t('st_' + st); $('txt-' + st).textContent = t('btn_' + st); });
}

/* ---------- Каналы ---------- */
function renderChans() {
  var box = $('chans'); box.innerHTML = '';
  S.channels.forEach(function (ch, i) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'chan'; b.setAttribute('aria-pressed', i === S.active);
    b.innerHTML = '<span class="ti" style="background:' + avatarColor(ch) + '">' + THEME_ICON[ch.theme] + '</span><span>' + esc(chName(i)) + '</span><small id="chs-' + i + '"></small>';
    if (ch.banned) { b.classList.add('banned'); b.title = t('ch_banned'); }
    b.addEventListener('click', function () {
      if (S.active !== i) { S.active = i; A.play('ui'); renderChans(); renderStageLabels(); buildTab(); renderAll(); save(); }
      else if (ch.banned) openPicker('replace');
    });
    box.appendChild(b);
  });
  if (S.channels.length === 1) {
    var g = document.createElement('button'); g.type = 'button'; g.id = 'secondBtn';
    var ready = L.canOpenSecond(S);
    g.className = 'chan ghost' + (ready ? ' ready' : ''); g.disabled = !ready;
    g.textContent = ready ? t('ch_second_open') : t('ch_second_locked', { n: fmt(L.SECOND_CHANNEL_AT) });
    g.addEventListener('click', function () { openPicker('second'); });
    box.appendChild(g);
  }
  updateChanSubs();
}
function updateChanSubs() {
  S.channels.forEach(function (ch, i) { var el = $('chs-' + i); if (el) el.textContent = fmt(ch.subs); });
  var g = $('secondBtn'); if (g && g.disabled && L.canOpenSecond(S)) renderChans();
}

/* ---------- Создание канала: тема → название и оформление ---------- */
var pickMode = 'first', picked = null, pickedStyle = 0;
function openPicker(mode) {
  pickMode = mode; picked = null; pickedStyle = 0;
  $('pickStep1').hidden = false; $('pickStep2').hidden = true;
  $('pickH').textContent = t(mode === 'first' ? 'pick_h' : mode === 'replace' ? 'pick_replace_h' : 'pick_second_h');
  $('pickP').textContent = mode === 'first' ? t('pick_p', { n: fmt(L.SECOND_CHANNEL_AT) }) : mode === 'replace' ? t('pick_replace_p') : t('pick_second_p');
  $('pickCancel').hidden = mode === 'first'; $('pickNext').disabled = true;
  var grid = $('tgrid'); grid.innerHTML = '';
  L.THEME_IDS.forEach(function (id) {
    var tt = th(id), b = document.createElement('button');
    b.type = 'button'; b.className = 'tcard'; b.setAttribute('aria-pressed', 'false');
    b.disabled = mode !== 'first' && S.channels.some(function (c) { return !c.banned && c.theme === id; });
    var r = L.THEMES[id].rpm;
    b.innerHTML = '<span class="ti" style="background:' + THEME_TINT[id] + '">' + THEME_ICON[id] + '</span><b>' + esc(tt.name) + '</b><span><em>+</em> ' + esc(tt.plus) + '</span><span><em>−</em> ' + esc(tt.minus) + '</span><span><em>RPM</em> ~$' + dec(r) + '</span>';
    b.addEventListener('click', function () {
      picked = id; A.unlock(); A.play('ui');
      grid.querySelectorAll('.tcard').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      $('pickNext').disabled = false;
    });
    grid.appendChild(b);
  });
  $('pickBox').hidden = false;
}
function renderPickStep2() {
  var names = TITLES.names[settings.lang][picked], box = $('sugg'); box.innerHTML = '';
  names.forEach(function (n) { var b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.addEventListener('click', function () { $('nameIn').value = n; renderStyles(); A.play('ui'); }); box.appendChild(b); });
  if (!$('nameIn').value) $('nameIn').value = names[Math.floor(Math.random() * names.length)];
  renderStyles();
}
function renderStyles() {
  var g = $('sgrid'); g.innerHTML = '';
  for (var i = 0; i < BANNERS.count; i++) (function (i) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'scard'; b.setAttribute('aria-pressed', i === pickedStyle);
    b.innerHTML = '<div class="sb" style="' + BANNERS.css(picked, i) + '"></div><div class="sh"><span class="av" style="background:' + BANNERS.avatar(picked, i) + '">' + THEME_ICON[picked] + '</span><span>' + esc($('nameIn').value || t('name_ph')) + '</span></div>';
    b.setAttribute('aria-label', t('style_n', { n: i + 1 }));
    b.addEventListener('click', function () { pickedStyle = i; A.play('ui'); renderStyles(); });
    g.appendChild(b);
  })(i);
}
$('pickNext').addEventListener('click', function () {
  if (!picked) return;
  $('nameIn').value = ''; $('nameIn').placeholder = t('name_ph');
  $('pickStep1').hidden = true; $('pickStep2').hidden = false; renderPickStep2(); A.play('ui');
  setTimeout(function () { $('nameIn').focus(); $('nameIn').select(); }, 50);
});
$('nameIn').addEventListener('input', function () { renderStyles(); });
$('pickBack').addEventListener('click', function () { $('pickStep1').hidden = false; $('pickStep2').hidden = true; });
$('pickGo').addEventListener('click', function () {
  var name = $('nameIn').value.trim() || TITLES.names[settings.lang][picked][0];
  if (!picked || !L.startChannel(S, picked, name, pickedStyle)) return;
  $('pickBox').hidden = true; if (S.tut === 0) S.tut = 1;
  A.play('good'); save();
  renderChans(); renderStageLabels(); buildTab(); renderAll();
});
$('pickCancel').addEventListener('click', function () { $('pickBox').hidden = true; });

/* ---------- События логики ---------- */
function handle(events) {
  events.forEach(function (e) {
    if (e.type === 'published') {
      var key = e.viral ? 'viral' : e.boost === 'collab' ? 'boosted_collab' : e.boost === 'trend' ? 'boosted_trend' : 'published';
      addFeed(t(key, { title: esc(videoTitle(e.video)), v: '<b>' + fmt(e.views) + '</b>', s: fmt(e.subs) }), e.viral ? 'viral' : '');
      if (e.ch === S.active) {
        floater('+' + fmt(e.views) + ' ' + t('unit_views'), e.viral ? 'viral' : '');
        if (e.money > 0) setTimeout(function () { floater('+' + fmtMoney(e.money)); }, 250);
      }
      A.play(e.viral ? 'viral' : 'publish'); lastPublish = now;
      if (shopTab === 'channel') buildTab();
    } else if (e.type === 'recorded' || e.type === 'edited') A.play('step');
    else if (e.type === 'comment') { if (shopTab === 'comments') buildTab(); }
    else if (e.type === 'comment_ignored') { addFeed(esc(t('cm_ignored_feed', { name: commentAuthor(e.comment) })), 'bad'); A.play('bad'); if (shopTab === 'comments') buildTab(); }
    else if (e.type === 'milestone') { addFeed('<b>' + esc(t('ms', { n: fmtFull(e.value) })) + '</b>', 'ms'); toast(t('ms', { n: fmtFull(e.value) })); A.play('milestone'); }
    else if (e.type === 'second_ready') { toast(t('second_ready')); addFeed('<b>' + esc(t('second_ready')) + '</b>', 'ms'); renderChans(); A.play('good'); }
    else if (e.type === 'event') { renderEventModal(true); A.play(e.event.kind === 'monetized' ? 'milestone' : 'card'); }
    else if (e.type === 'auto_event') { if (e.result) addFeed(esc(t('auto_event', { r: resultText(e.result, e.event) }))); }
    else if (e.type === 'speed_unlocked') { toast(t('speed_unlocked')); addFeed('<b>' + esc(t('speed_unlocked')) + '</b>', 'ms'); A.play('good'); renderSpeed(); }
    else if (e.type === 'shift_start') { addFeed(esc(t('shift_start'))); A.play('ui'); }
    else if (e.type === 'shift_done') { toast(t('job_done', { pay: fmtMoney(e.pay) })); addFeed(esc(t('job_done', { pay: fmtMoney(e.pay) }))); floater('+' + fmtMoney(e.pay)); A.play('buy'); }
    else if (e.type === 'effect_end') { if (e.effect === 'strike' || e.effect === 'broken') addFeed(esc(t('effect_end_' + e.effect))); }
    else if (e.type === 'won') {
      var best = 0; S.channels.forEach(function (c, i) { if (c.subs > S.channels[best].subs) best = i; });
      $('winTxt').textContent = t('win_txt', { ch: chName(best), t: fmtTime(S.wonAt), v: fmtFull(L.totalVideos(S)) });
      $('winBox').hidden = false; A.play('milestone'); save();
    }
  });
}

/* ---------- Событие на весь экран ---------- */
var shownEvent = null;
function evVars(ev) {
  var tt = th(ev.theme), v = ev.vid ? L.findVideo(S, ev.vid) : null;
  return {
    ch: chName(ev.ch), brand: tt.brands[(ev.pick || 0) % tt.brands.length], m: fmtMoney(ev.amount || 0), m70: fmtMoney(Math.round((ev.amount || 0) * 0.7)),
    reason: tt.strike, title: v ? videoTitle(v) : '…', name: ev.name, n: fmt(ev.partner || 0), mult: dec(ev.mult || 0),
    c: fmtMoney(ev.cost || 0), cost: ev.cost ? t('cost_part', { c: fmtMoney(ev.cost) }) : '', trend: T().trends[(ev.pick || 0) % T().trends.length]
  };
}
function renderEventModal(force) {
  var ev = S.event, box = $('evBox');
  if (!ev) { box.hidden = true; shownEvent = null; return; }
  if (ev === shownEvent && !force) { updateEventButtons(); return; }
  shownEvent = ev;
  var v = evVars(ev), k = ev.kind;
  var p = k === 'strike' ? t(ev.cuttable ? 'ev_strike_p_cut' : 'ev_strike_p_whole', v) : t('ev_' + k + '_p', v);
  var html = '<div class="evtop" style="background:' + (EVENT_TINT[k] || '#fff') + '"><div class="eico">' + (ICON[k] || ICON.monetized) + '</div>' +
    '<h2>' + esc(t('ev_' + k + '_h', v)) + '</h2><p>' + esc(p) + '</p></div><div class="evopts">';
  L.eventOptions(S, ev).forEach(function (o) {
    var hint = t('hint_' + k + '_' + o, v);
    html += '<button class="opt" type="button" data-opt="' + o + '"><b>' + esc(t('opt_' + k + '_' + o, v)) + '</b>' + (hint ? '<span>' + esc(hint) + '</span>' : '') + '</button>';
  });
  html += '</div><div class="evfoot"><span id="evFootTxt">' + esc(t('ev_wait')) + '</span><div class="evlock"><div id="evLock"></div></div></div>';
  $('evCard').innerHTML = html;
  $('evCard').querySelectorAll('.opt').forEach(function (b) { b.addEventListener('click', function () { answer(b.getAttribute('data-opt')); }); });
  evShownAt = performance.now();
  updateEventButtons();
  box.hidden = false;
}
var EV_LOCK = 1500;
function updateEventButtons() {
  if (!S.event) return;
  var waited = performance.now() - evShownAt, locked = waited < EV_LOCK;
  $('evCard').querySelectorAll('.opt').forEach(function (b) { b.disabled = locked || !L.canChoose(S, S.event, b.getAttribute('data-opt')); });
  var lk = $('evLock'); if (lk) { lk.style.width = Math.min(100, waited / EV_LOCK * 100) + '%'; lk.parentNode.hidden = !locked; }
  var ft = $('evFootTxt'); if (ft) ft.textContent = locked ? t('ev_wait') : t('ev_paused');
}
function answer(opt) {
  var ev = S.event; if (!ev || performance.now() - evShownAt < EV_LOCK) return;
  var res = L.resolveEvent(S, opt, Math.random); if (!res) return;
  var txt = resultText(res, ev);
  var bad = (res.kind === 'strike' && opt === 'ignore') || (res.kind === 'drama' && opt === 'attack') || (res.kind === 'broken' && opt === 'keep');
  addFeed(esc(txt), bad ? 'bad' : ''); toast(txt);
  A.play(bad ? 'bad' : (opt === 'decline' || opt === 'skip' || opt === 'ignore') ? 'ui' : 'good');
  renderEventModal(true); buildTab(); renderAll(); save();
  if (res.kind === 'banned') openPicker('replace');
}
function resultText(r, ev) {
  return t('r_' + r.kind + '_' + r.opt, { m: fmtMoney(r.money || 0), s: fmt(Math.abs(r.subs || 0)) });
}

/* ---------- Действия ---------- */
function work(stage) {
  if (!L.canWork(S, stage)) return;
  lastClick[stage] = now; A.play(stage);
  handle(L.addWork(S, stage, L.power(S, stage), Math.random));
  renderStages();
}
STAGES.forEach(function (st) { $('btn-' + st).addEventListener('click', function () { work(st); }); });
document.addEventListener('keydown', function (e) {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (paused() || !$('evBox').hidden || !$('pickBox').hidden || !$('quitBox').hidden || !$('vidsBox').hidden) return;
  var map = { '1': 'rec', '2': 'edit', '3': 'up' };
  if (map[e.key]) { A.unlock(); work(map[e.key]); var b = $('btn-' + map[e.key]); b.style.transform = 'translateY(3px)'; setTimeout(function () { b.style.transform = ''; }, 80); }
});
document.addEventListener('pointerdown', function () { A.unlock(); }, { passive: true });

$('jobBtn').addEventListener('click', function () { if (!S.job.employed) return; $('quitWarn').hidden = !!(S.channels.length && S.channels.some(function (c) { return c.monetized; })); $('quitBox').hidden = false; A.play('card'); });
$('quitNo').addEventListener('click', function () { $('quitBox').hidden = true; });
$('quitYes').addEventListener('click', function () { if (L.quitJob(S)) { $('quitBox').hidden = true; toast(t('job_quit_done')); addFeed('<b>' + esc(t('job_quit_done')) + '</b>', 'ms'); A.play('milestone'); renderAll(); save(); } });
$('vidsClose').addEventListener('click', function () { $('vidsBox').hidden = true; });
$('sfxBtn').addEventListener('click', function () { settings.sfx = !settings.sfx; A.setSfx(settings.sfx); renderToggles(); saveSettings(); A.play('ui'); });
$('musicBtn').addEventListener('click', function () { settings.music = !settings.music; A.setMusic(settings.music); renderToggles(); saveSettings(); });
$('mRu').addEventListener('click', function () { settings.lang = 'ru'; saveSettings(); applyTexts(); renderAll(); renderTitle(); });
$('mEn').addEventListener('click', function () { settings.lang = 'en'; saveSettings(); applyTexts(); renderAll(); renderTitle(); });
$('winGo').addEventListener('click', function () { $('winBox').hidden = true; });
TABS.forEach(function (k) { $('tab-' + k).addEventListener('click', function () { setTab(k); A.play('ui'); }); });
function setTab(k) {
  if (shopTab === k) return;
  shopTab = k;
  TABS.forEach(function (x) { $('tab-' + x).setAttribute('aria-selected', x === k); });
  buildTab();
}

/* ---------- Вкладки: техника, команда, жильё ---------- */
function shopItems() {
  var out = []; if (!S.channels.length) return out;
  var tt = th(L.channel(S).theme);
  if (shopTab === 'gear') {
    L.GEAR_IDS.forEach(function (kind) {
      var tiers = L.GEAR[kind], lvl = C().gear[kind], cur = tiers[Math.max(0, lvl)], nxt = tiers[lvl + 1], cost = L.gearCost(S, kind), blocked = L.gearBlocked(S, kind);
      out.push({
        id: kind, icon: ICON[kind], name: lvl < 0 ? t('gear_none', { n: t(kind) }) : t(cur.id), dots: [Math.max(0, lvl), tiers.length - 1],
        sub: lvl < 0 ? t('gear_need_' + kind, { n: t(nxt.id) }) : !nxt ? t('d_max') : blocked ? t('need_home', { home: t(L.HOMES[L.gearNeedsHome(kind, lvl + 1)].id) }) : t('d_' + kind, { p: nxt.power, q: dec(nxt.q) }),
        warn: (!!nxt && blocked) || lvl < 0, cost: cost, max: !nxt, blocked: blocked,
        seen: !nxt || lvl !== 0 || cost <= 60 || S.money >= cost * 0.35,
        buy: function () { if (L.buyGear(S, kind)) { toast(t('bought', { n: t(L.GEAR[kind][C().gear[kind]].id) })); return true; } }
      });
    });
  } else if (shopTab === 'team') {
    ['op', 'ed', 'mg'].forEach(function (kind) {
      var r = C().staff[kind], hc = L.hireCost(S, kind), tc = L.trainCost(S, kind);
      out.push({
        id: kind, icon: ICON[kind], name: t(kind), staff: r,
        sub: t('d_' + kind, { a: L.MG_AUTO_COMMENTS, b: L.MG_AUTO_EVENTS }),
        cost: hc, max: hc == null, seen: true, cost2: tc, max2: r.n > 0 && tc == null,
        buy: function () { if (L.hire(S, kind)) { toast(t('hired_n', { n: t(kind), c: C().staff[kind].n })); return true; } },
        buy2: function () { if (L.train(S, kind)) { toast(t('trained', { n: t(kind), l: C().staff[kind].lvl })); return true; } }
      });
    });
  } else if (shopTab === 'home') {
    L.HOMES.forEach(function (h, i) {
      out.push({
        id: 'home' + i, icon: ICON.home(i), name: t(h.id), current: i === S.home, past: i < S.home,
        sub: t('home_d', { q: dec(h.q), n: i + 1 }),
        cost: i === S.home + 1 ? h.cost : null, max: i <= S.home, seen: i <= S.home + 1 || S.money >= h.cost * 0.35,
        buy: function () { if (L.moveHome(S)) { startMove(); return true; } }
      });
    });
  }
  return out;
}
var itemEls = {};
function buildTab() {
  var box = $('items'); box.innerHTML = ''; itemEls = {};
  if (shopTab === 'channel') { renderChannelPage(); return; }
  if (shopTab === 'comments') { renderComments(); return; }
  if (shopTab === 'team') { var note = document.createElement('p'); note.className = 'note'; note.textContent = t('team_note'); box.appendChild(note); }
  shopItems().forEach(function (it) {
    var row = document.createElement('div'); row.className = 'item'; row.id = 'item-' + it.id;
    row.innerHTML = '<div class="ico">' + it.icon + '</div><div class="txt"><b></b><span></span></div><div class="btns"><button class="buy" type="button" id="buy-' + it.id + '"></button>' +
      (it.staff ? '<button class="buy alt" type="button" id="train-' + it.id + '"></button>' : '') + '</div>';
    var click = function (which) {
      var cur = shopItems().filter(function (x) { return x.id === it.id; })[0]; if (!cur) return;
      var cost = which === 2 ? cur.cost2 : cur.cost, fn = which === 2 ? cur.buy2 : cur.buy;
      if (cost != null && !cur.blocked && S.money >= cost && fn()) { A.play('buy'); save(); buildTab(); renderAll(); }
    };
    row.querySelector('#buy-' + it.id).addEventListener('click', function () { click(1); });
    if (it.staff) row.querySelector('#train-' + it.id).addEventListener('click', function () { click(2); });
    box.appendChild(row); itemEls[it.id] = row;
  });
  renderShop();
}
function renderShop() {
  if (shopTab !== 'gear' && shopTab !== 'team' && shopTab !== 'home') return;
  shopItems().forEach(function (it) {
    var row = itemEls[it.id]; if (!row) return;
    var b = row.querySelector('.txt b'), sp = row.querySelector('.txt > span'), btn = row.querySelector('#buy-' + it.id), btn2 = row.querySelector('#train-' + it.id);
    row.classList.toggle('locked', !it.seen); row.classList.toggle('current', !!it.current);
    var html;
    if (!it.seen) html = t('locked');
    else {
      html = esc(it.name);
      if (it.dots) { html += '<span class="dots">'; for (var i = 1; i <= it.dots[1]; i++) html += '<i class="' + (i <= it.dots[0] ? 'on' : '') + '"></i>'; html += '</span>'; }
      if (it.staff) html += it.staff.n ? '<span class="lvl">' + esc(t('staff_lvl', { c: it.staff.n, m: L.MAX_PEOPLE, l: it.staff.lvl })) + '</span>' : '<span class="lvl off">' + esc(t('not_hired')) + '</span>';
      if (it.current) html += '<span class="lvl now">' + esc(t('home_now')) + '</span>';
    }
    if (b.innerHTML !== html) b.innerHTML = html;
    sp.textContent = it.seen ? it.sub : ''; sp.className = it.warn ? 'warn' : '';
    if (it.max) { btn.textContent = shopTab === 'home' ? '✓' : it.staff ? t('max_people') : t('max'); btn.disabled = true; btn.classList.add('max'); btn.hidden = !!it.current; }
    else if (it.cost == null) { btn.hidden = true; }
    else { btn.hidden = false; btn.classList.remove('max'); btn.textContent = (it.staff ? t('hire_btn') + ' ' : '') + fmtMoney(it.cost); btn.disabled = S.money < it.cost || !it.seen || it.blocked; }
    if (btn2) {
      btn2.hidden = !it.staff.n;
      if (it.max2) { btn2.textContent = t('max_lvl'); btn2.disabled = true; btn2.classList.add('max'); }
      else if (it.cost2 != null) { btn2.classList.remove('max'); btn2.textContent = t('train_btn') + ' ' + fmtMoney(it.cost2); btn2.disabled = S.money < it.cost2; }
    }
  });
}

/* ---------- Переезд ---------- */
var MOVE_TIME = 3200;
function startMove() {
  movingUntil = performance.now() + MOVE_TIME;
  $('moveP').textContent = t('move_p', { home: t(L.HOMES[S.home].id) });
  var tr = $('moveBox').querySelector('.truck'); tr.style.animation = 'none'; void tr.offsetWidth; tr.style.animation = '';
  $('moveBox').hidden = false; A.play('card');
}
function updateMove() {
  if ($('moveBox').hidden) return;
  var left = movingUntil - performance.now(), p = 1 - Math.max(0, left) / MOVE_TIME, steps = T().move_steps;
  $('moveBar').style.width = (p * 100) + '%';
  $('moveStep').textContent = steps[Math.min(steps.length - 1, Math.floor(p * steps.length))];
  if (left <= 0) { $('moveBox').hidden = true; toast(t('moved', { n: t(L.HOMES[S.home].id) })); addFeed('<b>' + esc(t('moved', { n: t(L.HOMES[S.home].id) })) + '</b>', 'ms'); A.play('milestone'); }
}

/* ---------- Вкладка канала (как на видеохостинге) ---------- */
function agoText(sec) {
  var hours = Math.max(0, sec) / L.HOUR;
  if (hours < 1 / 6) return t('ago_now');
  if (hours < 1) return t('ago_m', { n: Math.floor(hours * 60) });
  if (hours < 24) return t('ago_h', { n: Math.floor(hours) });
  return t('ago_d', { n: Math.floor(hours / 24) });
}
function thumbHtml(v, ch) {
  return '<div class="thumb" style="' + bannerCss(ch) + '"><span class="tico" style="background:' + avatarColor(ch) + '">' + THEME_ICON[ch.theme] + '</span><small>' + fmtLen(v.len || 600) + '</small></div>';
}
function badgesHtml(v) {
  return (!v.mon ? '<span class="nomon">' + esc(t('b_nomon')) + '</span>' : '') + (v.cut ? '<span class="cut">' + esc(t('b_cut')) + '</span>' : '') +
    (v.viral ? '<span class="viral">' + esc(t('b_viral')) + '</span>' : '') + (v.src ? '<span class="' + v.src + '">' + esc(t('b_' + v.src)) + '</span>' : '');
}
function renderChannelPage() {
  var box = $('items'); if (!S.channels.length) { box.innerHTML = ''; return; }
  var ch = L.channel(S), id = ch.theme, n = ch.strikes;
  var vids = S.videos.filter(function (v) { return v.ch === S.active; }).slice().reverse();
  var html = '<div class="chpage"><div class="banner" style="' + bannerCss(ch) + '"></div>' +
    '<div class="chhead"><div class="avatar" style="background:' + avatarColor(ch) + '">' + THEME_ICON[id] + '</div>' +
    '<div><h4>' + esc(chName(S.active)) + '</h4><p>' + esc(th(id).name) + ' · ' + esc(t('ch_subs', { n: fmt(ch.subs) })) + ' · ' + esc(t('ch_videos', { n: fmt(ch.videos) })) + ' · ' + esc(t('ch_views', { n: fmt(ch.views) })) + '</p></div></div>' +
    '<div class="chmeta"><span class="' + (ch.monetized ? 'on' : '') + '">' + esc(ch.monetized ? t('mon_on') : t('mon_off', { n: fmtFull(L.MONETIZE_AT) })) + '</span>' +
    '<span>' + esc(t('ch_earned', { n: fmtMoney(ch.earned || 0) })) + '</span>' +
    '<span class="' + (n ? 'bad' : '') + '">' + esc(t('strikes_now', { n: n, m: L.MAX_STRIKES })) + '</span>' +
    '<span>' + esc(t('trust')) + ': ' + Math.round(ch.trust) + '%</span></div>' + (ch.banned ? '<p class="note" style="color:#c4453a;font-weight:800">' + esc(t('ch_banned_note')) + '</p>' : '') +
    '<div class="label">' + esc(t('last3')) + '</div><div class="vlist">';
  if (!vids.length) html += '<p class="note">' + esc(t('no_videos')) + '</p>';
  vids.slice(0, 3).forEach(function (v) {
    var views = L.videoViews(S, v);
    html += '<div class="vid">' + thumbHtml(v, ch) + '<div><b>' + esc(videoTitle(v)) + '</b><div class="vm">' + esc(t('vid_views', { n: fmt(views) })) + ' · ' + esc(agoText(S.played - v.t)) + '</div><div class="vbadges">' + badgesHtml(v) + '</div></div></div>';
  });
  html += '</div>';
  if (vids.length) html += '<button class="more" type="button" id="allVids">' + esc(t('all_videos', { n: fmt(ch.videos) })) + '</button>';
  html += '</div>';
  box.innerHTML = html;
  var b = $('allVids'); if (b) b.addEventListener('click', function () { openAllVideos(); A.play('ui'); });
}
function openAllVideos() {
  var ch = L.channel(S);
  $('vidsH').textContent = t('vids_h', { name: chName(S.active) });
  $('vidsNote').textContent = '';
  var vids = S.videos.filter(function (v) { return v.ch === S.active; }).slice().reverse(), html = '';
  vids.forEach(function (v) {
    var views = L.videoViews(S, v), cell = function (k, val, hot) { return '<div' + (hot ? ' class="hot"' : '') + '><span>' + esc(t(k)) + '</span><strong>' + val + '</strong></div>'; };
    html += '<div class="vcard">' + thumbHtml(v, ch) + '<div><b>' + esc(videoTitle(v)) + '</b><div class="vm">' + esc(agoText(S.played - v.t)) + '</div><div class="vbadges">' + badgesHtml(v) + '</div>' +
      '<div class="vstats">' + cell('st_views', fmt(views)) + cell('st_earned', fmtMoney(L.videoEarned(S, v))) + cell('st_comments', fmt(v.cm || 0)) + '</div></div></div>';
  });
  if (!vids.length) html = '<p class="note">' + esc(t('no_videos')) + '</p>';
  $('vidsList').innerHTML = html; $('vidsBox').hidden = false;
}

/* ---------- Комментарии ---------- */
var AVA = ['#ffd3cf', '#d9f5ea', '#dff1ff', '#fff0c2', '#e4dfff', '#ffe3cc'];
function commentAuthor(c) { var a = T().authors; return a[(c.pick * 7 + c.id) % a.length]; }
function commentHtml(c, ignored) {
  var name = commentAuthor(c), text = T().cm_text[c.kind][c.pick % 8], v = L.findVideo(S, c.vid);
  var left = L.commentLeft(S, c), total = L.COMMENT_HOURS * L.HOUR, pct = Math.max(0, left / total * 100);
  return '<div class="cm' + (ignored ? ' ign' : '') + '" data-cid="' + c.id + '"><div class="cm-head"><span class="cm-ava" style="background:' + AVA[c.pick % AVA.length] + '">' + esc(name.charAt(0).toUpperCase()) + '</span><b>@' + esc(name) + '</b>' +
    '<span class="kind ' + c.kind + '">' + esc(t('kind_' + c.kind)) + '</span></div><p>' + esc(text) + '</p>' +
    (v ? '<small>' + esc(t('cm_to', { title: videoTitle(v) })) + '</small>' : '') +
    (ignored ? '' : '<div class="cm-time' + (pct < 30 ? ' low' : '') + '"><div style="width:' + pct + '%"></div></div><small class="cm-left">' + esc(t('cm_left', { t: fmtClock(left) })) + '</small>' +
      '<div class="row"><button class="rbtn pos" type="button" data-c="' + c.id + '" data-tone="pos">' + esc(t('cm_pos')) + '</button>' +
      '<button class="rbtn" type="button" data-c="' + c.id + '" data-tone="neu">' + esc(t('cm_neu')) + '</button>' +
      '<button class="rbtn neg" type="button" data-c="' + c.id + '" data-tone="neg">' + esc(t('cm_neg')) + '</button></div>') + '</div>';
}
function renderComments() {
  var box = $('items'), list = S.comments.slice().reverse(), html = '';
  html += '<p class="note">' + esc(t('cm_deadline')) + ' ' + esc(L.mgAuto(C(), L.MG_AUTO_COMMENTS) ? t('cm_auto_on') : t('cm_auto', { n: L.MG_AUTO_COMMENTS })) + '</p>';
  if (!list.length) html += '<p class="note">' + esc(t('cm_empty')) + '</p>';
  list.forEach(function (c) { html += commentHtml(c, false); });
  if (S.ignored.length) {
    html += '<div class="label">' + esc(t('cm_ignored_h', { n: S.ignoredCount })) + '</div>';
    S.ignored.slice(-5).reverse().forEach(function (c) { html += commentHtml(c, true); });
  }
  box.innerHTML = html;
  box.querySelectorAll('.rbtn').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = L.replyComment(S, +b.getAttribute('data-c'), b.getAttribute('data-tone')); if (!d) return;
      toast(t('cm_res', { t: signed(d.trust), s: d.subs >= 1 ? t('cm_res_subs', { n: fmt(d.subs) }) : '' }));
      A.play(d.trust < 0 ? 'bad' : 'ui'); renderComments(); renderAll(); save();
    });
  });
}
// Обновить только таймеры комментариев, не перерисовывая список (чтобы не сбивать клики)
function tickCommentTimers() {
  if (shopTab !== 'comments') return;
  var total = L.COMMENT_HOURS * L.HOUR;
  S.comments.forEach(function (c) {
    var el = document.querySelector('.cm[data-cid="' + c.id + '"]'); if (!el) return;
    var left = L.commentLeft(S, c), pct = Math.max(0, left / total * 100), bar = el.querySelector('.cm-time');
    bar.className = 'cm-time' + (pct < 30 ? ' low' : ''); bar.firstChild.style.width = pct + '%';
    el.querySelector('.cm-left').textContent = t('cm_left', { t: fmtClock(left) });
  });
}

/* ---------- Панели ---------- */
function renderJob() {
  var j = S.job, box = $('job');
  box.classList.toggle('quiet', !j.employed);
  if (!j.employed) {
    $('jobH').textContent = t('job_free_h'); $('jobP').textContent = t('job_free_p');
    $('jobBarWrap').hidden = true; $('jobBtn').hidden = true; return;
  }
  $('jobBtn').hidden = false; $('jobBtn').textContent = t('job_quit'); $('jobBtn').disabled = !!S.event;
  if (j.active) {
    var left = j.end - S.played, total = (L.JOB_TO - L.JOB_FROM) * L.HOUR;
    $('jobH').textContent = t('job_active', { pay: fmtMoney(L.salary(S)) });
    $('jobP').textContent = t('job_p_emp', { pay: fmtMoney(L.salary(S)) });
    $('jobBarWrap').hidden = false; $('jobBar').style.width = Math.max(0, 100 - left / total * 100) + '%';
  } else {
    $('jobH').textContent = t('job_h'); $('jobP').textContent = t('job_p_emp', { pay: fmtMoney(L.salary(S)) });
    $('jobBarWrap').hidden = true;
  }
}
function renderStages() {
  if (!S.channels.length) return;
  var ch = C();
  STAGES.forEach(function (st) {
    $('bar-' + st).style.width = Math.min(100, ch.work[st] / L.workNeed(S, st) * 100) + '%';
    var ok = L.canWork(S, st); $('btn-' + st).disabled = !ok;
    var meta = [], sk = STAFF_OF[st];
    if (ch.banned) meta.push(t('ch_banned'));
    else if (S.job.active) meta.push(t('at_job'));
    else if (!L.hasGear(ch, st)) meta.push(t('no_gear_' + st));
    else if (!L.stageOpen(S, st)) meta.push(t(st === 'edit' ? 'need_raw' : 'need_edit'));
    else meta.push(t('per_click', { n: L.power(S, st) }));
    if (ch.staff[sk].n > 0) meta.push(t('auto', { who: t('who_' + sk), n: dec(Math.round(L.staffRate(S, sk) * 10) / 10) }));
    $('meta-' + st).textContent = meta.join(' · ');
  });
  $('cnt-edit').textContent = ch.raw.length ? t('queue', { n: ch.raw.length }) : '';
  $('cnt-up').textContent = ch.edited.length ? t('queue', { n: ch.edited.length }) : '';
}
function renderFx() {
  var parts = [], n = C().strikes;
  if (n) parts.push('<span class="bad">' + esc(t('fx_strikes', { n: n, m: L.MAX_STRIKES })) + '</span>');
  S.effects.forEach(function (e) {
    if (e.type === 'broken' && e.ch === S.active) parts.push('<span class="bad">' + esc(t('fx_broken', { t: fmtClock(e.until - S.played) })) + '</span>');
    if (e.type === 'boost' && e.ch === S.active) parts.push('<span class="good">' + esc(e.src === 'collab' ? t('fx_collab', { m: dec(e.mult) }) : t('fx_trend')) + '</span>');
  });
  var html = parts.join(''); if ($('fx').innerHTML !== html) $('fx').innerHTML = html;
}
function renderAll() {
  if (!S.channels.length) return;
  var ch = L.channel(S), c = L.clock(S), day = c.hour >= 6 && c.hour < 20;
  var clockHtml = (day ? ICON.sun : ICON.moon) + '<span>' + esc(t('clock', { d: c.day, h: ('0' + c.hour).slice(-2), m: ('0' + Math.floor(c.minute / 10) * 10).slice(-2) })) + '</span>';
  if ($('clock').innerHTML !== clockHtml) $('clock').innerHTML = clockHtml;
  $('subsLabel').textContent = t('subs') + ' · ' + chName(S.active);
  $('subs').textContent = fmtFull(ch.subs);
  var mc = $('monChip'); mc.className = 'monchip' + (ch.monetized ? ' on' : ''); mc.textContent = ch.monetized ? t('mon_on') : t('mon_off', { n: fmt(L.MONETIZE_AT) });
  var p = Math.min(100, ch.subs / L.GOAL_SUBS * 100);
  $('goalBar').style.width = p + '%';
  $('goalTxt').textContent = t('goal', { p: p < 10 ? dec(p.toFixed(2)) : Math.floor(p) });
  $('money').textContent = fmtMoney(S.money); $('trust').textContent = Math.round(C().trust) + '%';
  $('quality').textContent = '×' + dec(Math.round(L.quality(S) * 10) / 10); $('videos').textContent = fmt(ch.videos);
  var cb = $('cmBadge'); cb.hidden = !S.comments.length; cb.textContent = S.comments.length > 9 ? '9+' : S.comments.length;
  updateChanSubs(); renderJob(); renderStages(); renderShop(); renderFx(); renderEventModal(false);
}

/* ---------- Обучение: плашка над игрой, подсвечивает нужное место и ничего не закрывает ---------- */
var tutTarget = null, TUT_STEPS = 11;
function cheapestGear() {
  var best = null, cost = Infinity;
  L.GEAR_IDS.forEach(function (k) { var c = L.gearCost(S, k); if (c != null && !L.gearBlocked(S, k) && c < cost) { cost = c; best = k; } });
  return { kind: best, cost: cost };
}
function tutStep() {
  var ch = C(), videos = L.totalVideos(S), gearSum = 0, staffSum = ch.staff.op.n + ch.staff.ed.n + ch.staff.mg.n;
  L.GEAR_IDS.forEach(function (k) { gearSum += Math.max(0, ch.gear[k]); });
  switch (S.tut) {
    case 1: return { done: ch.raw.length > 0 || ch.edited.length > 0 || videos > 0, el: $('btn-rec') };
    case 2: return { done: ch.edited.length > 0 || videos > 0, el: $('btn-edit') };
    case 3: return { done: videos > 0, el: $('btn-up') };
    case 4: return { el: $('stats'), ok: true };
    case 5: return { el: $('monChip'), ok: true };
    case 6: return S.job.employed ? { el: $('job'), ok: true } : { done: true };
    case 7: return { el: $('trustMini'), ok: true };
    case 8:
      if (S.replied > 0) return { done: true };
      if (!S.comments.length) return { wait: true };
      return { el: shopTab === 'comments' ? $('items').querySelector('.rbtn') : $('tab-comments') };
    case 9: {
      var cg = cheapestGear(); if (gearSum > 0) return { done: true };
      if (!cg.kind || S.money < cg.cost) return { wait: true };
      return { el: shopTab === 'gear' ? $('buy-' + cg.kind) : $('tab-gear') };
    }
    case 10:
      if (staffSum > 0) return { done: true };
      if (S.money < 120) return { wait: true };
      return { el: shopTab === 'team' ? $('buy-mg') : $('tab-team') };
    case 11:
      if (S.home > 0) return { done: true };
      if (S.money < L.HOMES[1].cost) return { wait: true };
      return { el: shopTab === 'home' ? $('buy-home1') : $('tab-home') };
    case 12: return { el: null, ok: true, final: true };
    default: return null;
  }
}
function renderTut() {
  if (!slot || !S.channels.length) { hideTut(); return; }
  var step = tutStep(), guard = 0;
  while (step && step.done && guard++ < 14) { S.tut++; step = tutStep(); }
  if (!step || step.wait) { hideTut(); return; }
  var bar = $('tutBar');
  $('tutNum').textContent = step.final ? '✓' : t('tut_step', { n: S.tut, m: TUT_STEPS });
  $('tutTxt').textContent = step.final ? t('tut_done') : t('tut_' + S.tut);
  $('tutNext').hidden = !step.ok; $('tutSkip').hidden = !!step.final;
  bar.hidden = false;
  if (tutTarget !== step.el) {
    if (tutTarget) tutTarget.classList.remove('pulse');
    tutTarget = step.el;
    if (tutTarget) {
      tutTarget.classList.add('pulse');
      var r = tutTarget.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) tutTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
}
function hideTut() { $('tutBar').hidden = true; if (tutTarget) { tutTarget.classList.remove('pulse'); tutTarget = null; } }
$('tutNext').addEventListener('click', function () { S.tut++; A.play('ui'); renderTut(); save(); });
$('tutSkip').addEventListener('click', function () { S.tut = 99; hideTut(); save(); });

/* ---------- Окна поверх игры: пока любое открыто, игра на паузе ---------- */
var PAUSING = ['mainMenu', 'menuBox', 'savesBox', 'settingsBox', 'howtoBox', 'codeBox', 'confirmBox', 'devGate', 'devBox'];
function paused() { return PAUSING.some(function (id) { return !$(id).hidden; }); }
function show(id) { $(id).hidden = false; }
function hide(id) { $(id).hidden = true; }
var confirmCb = null;
function ask(text, cb) { $('confirmTxt').textContent = text; confirmCb = cb; show('confirmBox'); }
$('confirmNo').addEventListener('click', function () { hide('confirmBox'); confirmCb = null; });
$('confirmYes').addEventListener('click', function () { hide('confirmBox'); var cb = confirmCb; confirmCb = null; if (cb) cb(); });

/* ---------- Главное меню ---------- */
function renderTitle() {
  var m = meta(), last = m.last && readSlot(m.last), btn = $('mmContinue');
  btn.disabled = !last;
  btn.innerHTML = esc(t('mm_continue')) + (last ? '<small>' + esc(slotInfo(last)) + '</small>' : '');
}
function slotInfo(d) {
  if (!d || !d.channels || !d.channels.length) return t('slot_empty');
  var best = d.channels.reduce(function (a, c) { return c.subs > a.subs ? c : a; }, d.channels[0]);
  var day = 1 + Math.floor((18 + d.played / L.HOUR) / 24);
  return t('slot_info', { ch: best.name || th(best.theme).name, subs: fmt(best.subs), d: day });
}
function openTitle() { slot = 0; S = L.newState(); hideTut(); ['menuBox', 'evBox', 'pickBox', 'winBox', 'quitBox', 'vidsBox'].forEach(hide); renderTitle(); show('mainMenu'); }
function playSlot(n) {
  var d = readSlot(n);
  S = d ? L.restore(d) : L.newState(); slot = n;
  var m = meta(); m.last = n; setMeta(m);
  feedLines = []; shownEvent = null; lastPublish = -9;
  ['mainMenu', 'savesBox', 'menuBox'].forEach(hide);
  applyTexts(); renderAll();
  if (!S.channels.length) openPicker('first');
}
$('mmContinue').addEventListener('click', function () { var m = meta(); if (m.last && readSlot(m.last)) { A.unlock(); A.play('ui'); playSlot(m.last); } });
$('mmNew').addEventListener('click', function () { A.unlock(); A.play('ui'); openSaves('new'); });
$('mmLoad').addEventListener('click', function () { A.unlock(); A.play('ui'); openSaves('load'); });
$('mmSettings').addEventListener('click', function () { A.unlock(); A.play('ui'); openSettings(); });
$('mmHowto').addEventListener('click', function () { A.unlock(); A.play('ui'); openHowto(); });

/* ---------- Меню паузы ---------- */
$('menuBtn').addEventListener('click', function () { show('menuBox'); A.play('ui'); });
$('pResume').addEventListener('click', function () { hide('menuBox'); });
$('pSave').addEventListener('click', function () { save(); toast(t('saved')); A.play('good'); });
$('pSaves').addEventListener('click', function () { openSaves('load'); });
$('pSettings').addEventListener('click', function () { openSettings(); });
$('pHowto').addEventListener('click', function () { openHowto(); });
$('pExit').addEventListener('click', function () { save(); openTitle(); });

/* ---------- Сохранения ---------- */
var savesMode = 'load';
function openSaves(mode) {
  savesMode = mode; $('savesH').textContent = t(mode === 'new' ? 'mm_new' : 'mm_load');
  $('importWrap').hidden = true; $('importIn').value = ''; renderSlots(); show('savesBox');
}
function fmtDate(ms) { try { return new Date(ms).toLocaleString(settings.lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
function renderSlots() {
  var box = $('slots'), html = '';
  for (var n = 1; n <= SLOTS; n++) {
    var d = readSlot(n), has = d && d.channels && d.channels.length;
    html += '<div class="slot' + (n === slot ? ' cur' : '') + '"><div><b>' + esc(t('slot_n', { n: n })) + '</b><span>' + esc(has ? slotInfo(d) : t('slot_empty')) + '</span>' +
      (has && d.savedAt ? '<span>' + esc(t('slot_saved', { time: fmtDate(d.savedAt) })) + '</span>' : '') + '</div><div class="row">';
    if (savesMode === 'new') html += '<button class="sbtn go" type="button" data-act="new" data-n="' + n + '">' + esc(t('slot_new')) + '</button>';
    else if (has) html += '<button class="sbtn go" type="button" data-act="play" data-n="' + n + '">' + esc(t('slot_play')) + '</button>';
    if (has) html += '<button class="sbtn" type="button" data-act="code" data-n="' + n + '">' + esc(t('slot_code')) + '</button><button class="sbtn del" type="button" data-act="del" data-n="' + n + '">' + esc(t('slot_delete')) + '</button>';
    html += '</div></div>';
  }
  box.innerHTML = html;
  box.querySelectorAll('.sbtn').forEach(function (b) {
    b.addEventListener('click', function () {
      var n = +b.getAttribute('data-n'), act = b.getAttribute('data-act'), d = readSlot(n), has = d && d.channels && d.channels.length;
      A.play('ui');
      if (act === 'play') { if (slot) save(); playSlot(n); }
      else if (act === 'new') {
        var go = function () { try { localStorage.removeItem(SLOT_KEY + n); } catch (e) {} if (slot && slot !== n) save(); playSlot(n); S.tut = 0; };
        if (has) ask(t('slot_overwrite_q', { n: n }), go); else go();
      } else if (act === 'del') ask(t('slot_delete_q', { n: n }), function () { try { localStorage.removeItem(SLOT_KEY + n); } catch (e) {} if (slot === n) { openTitle(); show('savesBox'); } renderSlots(); renderTitle(); });
      else if (act === 'code') { if (n === slot) save(); $('codeOut').value = btoa(unescape(encodeURIComponent(JSON.stringify(readSlot(n))))); show('codeBox'); }
    });
  });
}
$('savesBack').addEventListener('click', function () { hide('savesBox'); });
$('importBtn').addEventListener('click', function () {
  $('importWrap').hidden = false; var row = $('importSlots'); row.innerHTML = '';
  for (var n = 1; n <= SLOTS; n++) (function (n) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'sbtn go'; b.textContent = t('slot_n', { n: n });
    b.addEventListener('click', function () {
      var data = null;
      try { data = JSON.parse(decodeURIComponent(escape(atob($('importIn').value.trim())))); } catch (e) {}
      if (!data || data.v !== L.newState().v || !data.channels) { toast(t('import_bad')); A.play('bad'); return; }
      var go = function () { writeSlot(n, data); toast(t('import_ok', { n: n })); A.play('good'); $('importWrap').hidden = true; renderSlots(); renderTitle(); };
      var d = readSlot(n); if (d && d.channels && d.channels.length) ask(t('slot_overwrite_q', { n: n }), go); else go();
    });
    row.appendChild(b);
  })(n);
});
$('codeBack').addEventListener('click', function () { hide('codeBox'); });
$('codeCopy').addEventListener('click', function () {
  var el = $('codeOut');
  var fallback = function () { el.focus(); el.select(); toast(t('copy_fail')); };
  try { navigator.clipboard.writeText(el.value).then(function () { toast(t('copied')); }, fallback); } catch (e) { fallback(); }
});

/* ---------- Настройки и правила ---------- */
function openSettings() {
  $('volSfx').value = settings.sfxVol; $('volMusic').value = settings.musicVol;
  $('volSfxV').textContent = settings.sfxVol + '%'; $('volMusicV').textContent = settings.musicVol + '%';
  $('setTut').hidden = !slot; renderToggles(); show('settingsBox');
}
$('volSfx').addEventListener('input', function () { settings.sfxVol = +this.value; $('volSfxV').textContent = this.value + '%'; A.setSfxVolume(settings.sfxVol / 100); if (!settings.sfx && settings.sfxVol > 0) { settings.sfx = true; A.setSfx(true); renderToggles(); } saveSettings(); });
$('volSfx').addEventListener('change', function () { A.play('ui'); });
$('volMusic').addEventListener('input', function () { settings.musicVol = +this.value; $('volMusicV').textContent = this.value + '%'; A.setMusicVolume(settings.musicVol / 100); if (!settings.music && settings.musicVol > 0) { settings.music = true; A.setMusic(true); renderToggles(); } saveSettings(); });
$('settingsBack').addEventListener('click', function () { hide('settingsBox'); });
$('setTut').addEventListener('click', function () { S.tut = 1; ['settingsBox', 'menuBox'].forEach(hide); save(); renderTut(); });
function openHowto() {
  $('howtoList').innerHTML = T().howto.map(function (r) { return '<div><b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span></div>'; }).join('');
  show('howtoBox');
}
$('howtoBack').addEventListener('click', function () { hide('howtoBox'); });

/* ---------- Секретное меню разработчика: 5 кликов по логотипу + пароль ---------- */
var logoClicks = [], timeScale = 1;
function logoClick() {
  var nowMs = performance.now();
  logoClicks = logoClicks.filter(function (x) { return nowMs - x < 2000; }); logoClicks.push(nowMs);
  if (logoClicks.length >= 5) {
    logoClicks = [];
    if (settings.dev) openDev();
    else { $('devPass').value = ''; $('devWrong').hidden = true; show('devGate'); setTimeout(function () { $('devPass').focus(); }, 50); A.play('card'); }
  }
}
$('logoTxt').parentNode.addEventListener('click', logoClick);
$('titleLogo').addEventListener('click', logoClick);
function tryPass() {
  if (window.sha256($('devPass').value.trim()) === DEV_HASH) { settings.dev = true; saveSettings(); hide('devGate'); A.play('milestone'); openDev(); }
  else {
    var card = $('devGate').querySelector('.modal'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    $('devWrong').textContent = t('dev_wrong'); $('devWrong').hidden = false; A.play('bad');
  }
}
$('devGo').addEventListener('click', tryPass);
$('devPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryPass(); });
$('devGateBack').addEventListener('click', function () { hide('devGate'); });
$('devClose').addEventListener('click', function () { hide('devBox'); });
$('devLock').addEventListener('click', function () { settings.dev = false; timeScale = 1; saveSettings(); hide('devBox'); });
function devAct(fn) { return function () { if (!slot || !S.channels.length) { toast(t('slot_empty')); return; } fn(); A.play('buy'); renderChans(); buildTab(); renderAll(); save(); toast(t('dev_done')); }; }
function openDev() {
  var ch = function () { return L.channel(S); };
  var rows = [
    ['dev_money', [['+$1K', function () { S.money += 1e3; }], ['+$100K', function () { S.money += 1e5; }], ['+$10M', function () { S.money += 1e7; }]]],
    ['dev_subs', [['+1K', function () { ch().subs += 1e3; }], ['+100K', function () { ch().subs += 1e5; }], ['+900K', function () { ch().subs += 9e5; }]]],
    ['dev_speed', [['×1', function () { timeScale = 1; }], ['×5', function () { timeScale = 5; }], ['×20', function () { timeScale = 20; }]]],
    ['dev_misc', [
      [t('dev_trust'), function () { C().trust = 100; }],
      [t('dev_mon'), function () { ch().subs = Math.max(ch().subs, L.MONETIZE_AT); }],
      [t('dev_gear'), function () { S.home = L.HOMES.length - 1; L.GEAR_IDS.forEach(function (k) { C().gear[k] = L.GEAR[k].length - 1; }); }],
      [t('dev_team'), function () { for (var k in L.STAFF) C().staff[k] = { n: L.MAX_PEOPLE, lvl: L.MAX_LVL }; }],
      [t('dev_home'), function () { if (S.home < L.HOMES.length - 1) S.home++; }],
      [t('dev_day'), function () { S.played += 24 * L.HOUR; }],
      [t('dev_comments'), function () { var v = S.videos.filter(function (x) { return x.ch === S.active; }).pop(); if (!v) return; for (var i = 0; i < 5; i++) S.comments.push({ id: S.nextCid++, vid: v.id, ch: v.ch, kind: ['pos', 'q', 'hate'][i % 3], pick: Math.floor(Math.random() * 1000), t: S.played }); }],
      [t('dev_event'), function () { if (!S.event) { S.event = L.makeEvent(S, Math.random); hide('devBox'); } }],
      [t('dev_second'), function () { S.channels[0].subs = Math.max(S.channels[0].subs, L.SECOND_CHANNEL_AT); }]
    ]]
  ];
  var grid = $('devGrid'); grid.innerHTML = '';
  rows.forEach(function (r) {
    var div = document.createElement('div'); div.className = 'devrow';
    div.innerHTML = '<span>' + esc(t(r[0])) + '</span><div class="row"></div>';
    r[1].forEach(function (b) { var el = document.createElement('button'); el.type = 'button'; el.className = 'sbtn'; el.textContent = b[0]; el.addEventListener('click', devAct(b[1])); div.querySelector('.row').appendChild(el); });
    grid.appendChild(div);
  });
  show('devBox');
}

/* ---------- Скорость времени (открывается с 1000 подписчиков) ---------- */
function renderSpeed() {
  var unlocked = S.speedUnlocked;
  L.SPEEDS.forEach(function (v) {
    var b = $('spd-' + v); if (!b) return;
    b.setAttribute('aria-pressed', S.speed === v); b.disabled = v > 1 && !unlocked;
    b.title = v > 1 && !unlocked ? t('speed_locked', { n: fmtFull(L.SPEED_AT) }) : t('speed_' + v);
  });
  $('speedLock').hidden = unlocked;
}
L.SPEEDS.forEach(function (v) {
  $('spd-' + v).addEventListener('click', function () {
    if (L.setSpeed(S, v)) { A.play('ui'); renderSpeed(); save(); }
    else toast(t('speed_locked', { n: fmtFull(L.SPEED_AT) }));
  });
});

/* ---------- Холст: 3D-квартира, а если WebGL недоступен — 2D ---------- */
var cv = $('cv'), ctx = null, use3d = !!(window.Room3D && window.Room3D.init(cv));
if (!use3d) ctx = cv.getContext('2d');
function resize() {
  var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (use3d) { window.Room3D.resize(Math.max(1, r.width), Math.max(1, r.height)); return; }
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(cv.width / window.Room.W, 0, 0, cv.height / window.Room.H, 0, 0);
}
window.addEventListener('resize', resize);
$('roomHint').hidden = !use3d;

var last = performance.now(), uiTimer = 0, saveTimer = 0, chTimer = 0;
function frame(ts) {
  var dt = Math.min(0.25, (ts - last) / 1000); last = ts; now += dt;
  var running = slot && !paused();
  if (running) { if ($('moveBox').hidden) handle(L.tick(S, dt * (S.speed || 1) * timeScale, Math.random)); else updateMove(); }
  if (S.event && !$('evBox').hidden) updateEventButtons();
  uiTimer += dt; saveTimer += dt; chTimer += dt;
  if (uiTimer > 0.15 && slot) { uiTimer = 0; renderAll(); renderTut(); tickCommentTimers(); renderSpeed(); }
  if (chTimer > 2 && shopTab === 'channel' && $('vidsBox').hidden && slot) { chTimer = 0; renderChannelPage(); }
  if (saveTimer > 5 && running) { saveTimer = 0; save(); }
  var ch = S.channels.length ? C() : null;
  var selfRec = now - lastClick.rec < 0.6, selfEdit = now - lastClick.edit < 0.6, selfUp = now - lastClick.up < 0.6;
  var lastSelf = Math.max(lastClick.rec, lastClick.edit, lastClick.up);
  var opt = ch ? {
    selfDesk: (selfEdit || selfUp) && lastClick.rec < lastSelf,
    recording: !S.job.active && !ch.banned && (selfRec || (ch.staff.op.n > 0 && L.hasGear(ch, 'rec'))),
    editing: !S.job.active && (selfEdit || (ch.staff.ed.n > 0 && ch.raw.length > 0)),
    uploading: !S.job.active && (selfUp || (ch.staff.mg.n > 0 && ch.edited.length > 0)),
    edOnline: ch.staff.ed.n > 0, upProgress: ch.work.up / L.workNeed(S, 'up'), sinceUpload: now - lastPublish,
    atJob: S.job.active, jobLabel: settings.lang === 'ru' ? 'Ушёл на работу' : 'At work'
  } : {};
  $('recBadge').hidden = !opt.recording || opt.atJob;
  $('jobBadge').hidden = !opt.atJob; if (opt.atJob) $('jobBadge').textContent = t('at_job');
  if (use3d) window.Room3D.draw(S, L, now, opt);
  else if (ch) window.Room.draw(ctx, S, adapt2d(), now, opt);
  requestAnimationFrame(frame);
}
// 2D-комната ждёт старый формат состояния (техника и команда общие) — подставляем данные текущего канала
function adapt2d() {
  var ch = C(), shim = Object.create(L);
  shim.quality = function () { return L.quality(S); };
  S.gear = {}; L.GEAR_IDS.forEach(function (k) { S.gear[k] = Math.max(0, ch.gear[k]); });
  S.staff = { op: ch.staff.op.n, ed: ch.staff.ed.n, mg: ch.staff.mg.n }; S.raw = ch.raw; S.edited = ch.edited; S.work = ch.work;
  return shim;
}
document.addEventListener('visibilitychange', function () { if (document.hidden) save(); });
window.addEventListener('beforeunload', save);

function start() {
  resize(); applyTexts();
  if (hotData && hotData.slot) { S = L.restore(hotData.state); slot = hotData.slot; applyTexts(); renderAll(); }
  else openTitle();
  requestAnimationFrame(function (ts) { last = ts; frame(ts); });
}
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start); else start();
})();
