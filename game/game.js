// ЮТУБЕРЫ — интерфейс: связывает логику, тексты, звук и отрисовку квартиры.
(function () {
'use strict';
var TITLES = window.TITLES, L = window.Logic, A = window.GameAudio, TX = window.TEXTS, ICON = window.ICON, THEME_ICON = window.THEME_ICON, THEME_TINT = window.THEME_TINT, EVENT_TINT = window.EVENT_TINT;
var SAVE_KEY = 'youtubers_save_v4', SET_KEY = 'youtubers_settings';
var STAGES = ['rec', 'edit', 'up'];
var STAFF_OF = { rec: 'op', edit: 'ed', up: 'mg' };
var TABS = ['gear', 'team', 'home', 'channel', 'comments'];
var $ = function (id) { return document.getElementById(id); };

/* ---------- Настройки, тексты, форматирование ---------- */
var settings = { lang: 'ru', sfx: true, music: true };
try { var st = JSON.parse(localStorage.getItem(SET_KEY) || '{}'); for (var k in st) settings[k] = st[k]; } catch (e) {}
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) {} }
A.setSfx(settings.sfx); A.setMusic(settings.music);

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

/* ---------- Состояние ---------- */
var S;
function load() {
  var hot = window.claude && window.claude.hot && window.claude.hot.data;
  if (hot && hot.state) return L.restore(hot.state);
  try { var raw = localStorage.getItem(SAVE_KEY); if (raw) return L.restore(JSON.parse(raw)); } catch (e) {}
  return L.newState();
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
S = load();
if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(function () { return { state: S }; });

var feedLines = [], lastClick = { rec: -9, edit: -9, up: -9 }, now = 0, shopTab = 'gear', lastPublish = -9, evShownAt = 0, movingUntil = 0;

function videoTitle(v) {
  var ch = S.channels[v.ch]; if (!ch) return '…';
  var G = TITLES[settings.lang][ch.theme], tt = v.tt || [v.n, v.n * 3, v.n * 7, v.n * 11];
  var tpl = G[tt[0] % G.length], pick = function (arr, k) { return arr && arr.length ? arr[tt[k] % arr.length] : ''; };
  var s = tpl[0].split('{a}').join(pick(tpl[1], 1)).split('{b}').join(pick(tpl[2], 2)).split('{n}').join(pick(TITLES.nums, 3));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function chName(i) { var ch = S.channels[i]; return ch ? (ch.name || th(ch.theme).name) : ''; }
function chStyle(ch) { return TITLES.styles[ch.theme][ch.style || 0]; }
function patternCss(st) {
  var a = st[0], b = st[1];
  if (st[3] === 'grid') return 'background:' + a + ';background-image:linear-gradient(' + b + '33 2px,transparent 2px),linear-gradient(90deg,' + b + '33 2px,transparent 2px);background-size:16px 16px';
  if (st[3] === 'dots') return 'background:' + a + ';background-image:radial-gradient(' + b + '66 3px,transparent 3.5px);background-size:16px 16px';
  if (st[3] === 'zig') return 'background:' + a + ';background-image:linear-gradient(135deg,' + b + '55 25%,transparent 25%),linear-gradient(225deg,' + b + '55 25%,transparent 25%);background-size:20px 20px';
  return 'background:repeating-linear-gradient(135deg,' + a + ' 0 12px,' + b + ' 12px 18px)';
}
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
  $('mSfxOn').setAttribute('aria-pressed', settings.sfx); $('mSfxOff').setAttribute('aria-pressed', !settings.sfx);
  $('mMusOn').setAttribute('aria-pressed', settings.music); $('mMusOff').setAttribute('aria-pressed', !settings.music);
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
    b.innerHTML = '<span class="ti" style="background:' + chStyle(ch)[2] + '">' + THEME_ICON[ch.theme] + '</span><span>' + esc(chName(i)) + '</span><small id="chs-' + i + '"></small>';
    b.addEventListener('click', function () { if (S.active !== i) { S.active = i; A.play('ui'); renderChans(); renderStageLabels(); buildTab(); renderAll(); save(); } });
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
  $('pickH').textContent = t(mode === 'first' ? 'pick_h' : 'pick_second_h');
  $('pickP').textContent = mode === 'first' ? t('pick_p', { n: fmt(L.SECOND_CHANNEL_AT) }) : t('pick_second_p');
  $('pickCancel').hidden = mode === 'first'; $('pickNext').disabled = true;
  var grid = $('tgrid'); grid.innerHTML = '';
  L.THEME_IDS.forEach(function (id) {
    var tt = th(id), b = document.createElement('button');
    b.type = 'button'; b.className = 'tcard'; b.setAttribute('aria-pressed', 'false');
    b.disabled = mode === 'second' && S.channels[0] && S.channels[0].theme === id;
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
  TITLES.styles[picked].forEach(function (st, i) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'scard'; b.setAttribute('aria-pressed', i === pickedStyle);
    b.innerHTML = '<div class="sb" style="' + patternCss(st) + '"></div><div class="sh"><span class="av" style="background:' + st[2] + '">' + THEME_ICON[picked] + '</span><span>' + esc($('nameIn').value || t('name_ph')) + '</span></div>';
    b.setAttribute('aria-label', t('style_n', { n: i + 1 }));
    b.addEventListener('click', function () { pickedStyle = i; A.play('ui'); renderStyles(); });
    g.appendChild(b);
  });
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
      floater('+' + fmt(e.views) + ' ' + t('unit_views'), e.viral ? 'viral' : '');
      if (e.money > 0) setTimeout(function () { floater('+' + fmtMoney(e.money)); }, 250);
      A.play(e.viral ? 'viral' : 'publish'); lastPublish = now;
      if (shopTab === 'channel') buildTab();
    } else if (e.type === 'recorded' || e.type === 'edited') A.play('step');
    else if (e.type === 'comment') { if (shopTab === 'comments') buildTab(); }
    else if (e.type === 'milestone') { addFeed('<b>' + esc(t('ms', { n: fmtFull(e.value) })) + '</b>', 'ms'); toast(t('ms', { n: fmtFull(e.value) })); A.play('milestone'); }
    else if (e.type === 'second_ready') { toast(t('second_ready')); addFeed('<b>' + esc(t('second_ready')) + '</b>', 'ms'); renderChans(); A.play('good'); }
    else if (e.type === 'event') { renderEventModal(true); A.play(e.event.kind === 'monetized' ? 'milestone' : 'card'); }
    else if (e.type === 'auto_event') { if (e.result) addFeed(esc(t('auto_event', { r: resultText(e.result, e.event) }))); }
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
  box.hidden = false; hideTip();
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
  if (['pickBox', 'menuBox', 'evBox', 'quitBox', 'vidsBox', 'moveBox'].some(function (id) { return !$(id).hidden; })) return;
  var map = { '1': 'rec', '2': 'edit', '3': 'up' };
  if (map[e.key]) { A.unlock(); work(map[e.key]); var b = $('btn-' + map[e.key]); b.style.transform = 'translateY(3px)'; setTimeout(function () { b.style.transform = ''; }, 80); }
});
document.addEventListener('pointerdown', function () { A.unlock(); }, { passive: true });

$('jobBtn').addEventListener('click', function () { if (!S.job.employed) return; $('quitWarn').hidden = !!(S.channels.length && S.channels.some(function (c) { return c.monetized; })); $('quitBox').hidden = false; A.play('card'); });
$('quitNo').addEventListener('click', function () { $('quitBox').hidden = true; });
$('quitYes').addEventListener('click', function () { if (L.quitJob(S)) { $('quitBox').hidden = true; toast(t('job_quit_done')); addFeed('<b>' + esc(t('job_quit_done')) + '</b>', 'ms'); A.play('milestone'); renderAll(); save(); } });
L.FORMAT_IDS.forEach(function (f) { $('fmt-' + f).addEventListener('click', function () { if (L.setFormat(S, f)) { A.play('ui'); renderFormat(); save(); } }); });
$('vidsClose').addEventListener('click', function () { $('vidsBox').hidden = true; });
$('sfxBtn').addEventListener('click', function () { settings.sfx = !settings.sfx; A.setSfx(settings.sfx); renderToggles(); saveSettings(); A.play('ui'); });
$('musicBtn').addEventListener('click', function () { settings.music = !settings.music; A.setMusic(settings.music); renderToggles(); saveSettings(); });
$('menuBtn').addEventListener('click', function () { $('mConfirm').hidden = true; $('menuBox').hidden = false; A.play('ui'); });
$('mClose').addEventListener('click', function () { $('menuBox').hidden = true; });
$('mSfxOn').addEventListener('click', function () { settings.sfx = true; A.setSfx(true); renderToggles(); saveSettings(); A.play('ui'); });
$('mSfxOff').addEventListener('click', function () { settings.sfx = false; A.setSfx(false); renderToggles(); saveSettings(); });
$('mMusOn').addEventListener('click', function () { settings.music = true; A.setMusic(true); renderToggles(); saveSettings(); });
$('mMusOff').addEventListener('click', function () { settings.music = false; A.setMusic(false); renderToggles(); saveSettings(); });
$('mRu').addEventListener('click', function () { settings.lang = 'ru'; saveSettings(); applyTexts(); renderAll(); });
$('mEn').addEventListener('click', function () { settings.lang = 'en'; saveSettings(); applyTexts(); renderAll(); });
$('mHowto').addEventListener('click', function () { S.tut = 1; $('menuBox').hidden = true; save(); });
$('mRestart').addEventListener('click', function () { $('mConfirm').hidden = false; });
$('mNo').addEventListener('click', function () { $('mConfirm').hidden = true; });
$('mYes').addEventListener('click', function () {
  S = L.newState(); feedLines = []; shownEvent = null; $('menuBox').hidden = true; $('evBox').hidden = true;
  save(); renderFeed(); renderChans(); buildTab(); renderAll(); openPicker('first');
});
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
      var tiers = L.GEAR[kind], lvl = S.gear[kind], cur = tiers[lvl], nxt = tiers[lvl + 1], cost = L.gearCost(S, kind), blocked = L.gearBlocked(S, kind);
      out.push({
        id: kind, icon: ICON[kind], name: t(cur.id), dots: [lvl, tiers.length - 1],
        sub: !nxt ? t('d_max') : blocked ? t('need_home', { home: t(L.HOMES[L.gearNeedsHome(kind, lvl + 1)].id) }) : t('d_' + kind, { p: nxt.power, q: dec(nxt.q) }),
        warn: !!nxt && blocked, cost: cost, max: !nxt, blocked: blocked,
        seen: !nxt || lvl > 0 || cost <= 60 || S.money >= cost * 0.35,
        buy: function () { if (L.buyGear(S, kind)) { toast(t('bought', { n: t(L.GEAR[kind][S.gear[kind]].id) })); return true; } }
      });
    });
  } else if (shopTab === 'team') {
    ['op', 'ed', 'mg'].forEach(function (kind) {
      var c = L.staffCost(S, kind), lvl = S.staff[kind];
      out.push({
        id: kind, icon: ICON[kind], name: t(kind), lvl: lvl,
        sub: t('d_' + kind, { stage: tt[L.STAFF[kind].stage], a: L.MG_AUTO_COMMENTS, b: L.MG_AUTO_EVENTS }),
        cost: c, max: c == null, seen: lvl > 0 || S.money >= (c || 0) * 0.35,
        buy: function () { if (L.hire(S, kind)) { toast(t('hired', { n: t(kind), l: S.staff[kind] })); return true; } }
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
  shopItems().forEach(function (it) {
    var row = document.createElement('div'); row.className = 'item'; row.id = 'item-' + it.id;
    row.innerHTML = '<div class="ico">' + it.icon + '</div><div class="txt"><b></b><span></span></div><button class="buy" type="button" id="buy-' + it.id + '"></button>';
    row.querySelector('.buy').addEventListener('click', function () {
      var cur = shopItems().filter(function (x) { return x.id === it.id; })[0];
      if (cur && cur.cost != null && !cur.blocked && S.money >= cur.cost && cur.buy()) { A.play('buy'); save(); buildTab(); renderAll(); }
    });
    box.appendChild(row); itemEls[it.id] = row;
  });
  renderShop();
}
function renderShop() {
  if (shopTab !== 'gear' && shopTab !== 'team' && shopTab !== 'home') return;
  shopItems().forEach(function (it) {
    var row = itemEls[it.id]; if (!row) return;
    var b = row.querySelector('.txt b'), sp = row.querySelector('.txt > span'), btn = row.querySelector('.buy');
    row.classList.toggle('locked', !it.seen); row.classList.toggle('current', !!it.current);
    var html;
    if (!it.seen) html = t('locked');
    else {
      html = esc(it.name);
      if (it.dots) { html += '<span class="dots">'; for (var i = 1; i <= it.dots[1]; i++) html += '<i class="' + (i <= it.dots[0] ? 'on' : '') + '"></i>'; html += '</span>'; }
      if (it.lvl != null) html += it.lvl ? '<span class="lvl">' + esc(t('lvl', { n: it.lvl })) + '</span>' : '<span class="lvl off">' + esc(t('not_hired')) + '</span>';
      if (it.current) html += '<span class="lvl now">' + esc(t('home_now')) + '</span>';
    }
    if (b.innerHTML !== html) b.innerHTML = html;
    sp.textContent = it.seen ? it.sub : ''; sp.className = it.warn ? 'warn' : '';
    if (it.max) { btn.textContent = shopTab === 'home' ? '✓' : t('max'); btn.disabled = true; btn.classList.add('max'); btn.hidden = !!it.current; }
    else if (it.cost == null) { btn.hidden = true; }
    else { btn.hidden = false; btn.classList.remove('max'); btn.textContent = fmtMoney(it.cost); btn.disabled = S.money < it.cost || !it.seen || it.blocked; }
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
  var st = chStyle(ch);
  return '<div class="thumb" style="' + patternCss(st) + '">' + THEME_ICON[ch.theme] + '<small>' + (v.fmt === 'short' ? 'SHORT · ' : '') + fmtLen(v.len || 600) + '</small></div>';
}
function badgesHtml(v) {
  return (!v.mon ? '<span class="nomon">' + esc(t('b_nomon')) + '</span>' : '') + (v.cut ? '<span class="cut">' + esc(t('b_cut')) + '</span>' : '') +
    (v.viral ? '<span class="viral">' + esc(t('b_viral')) + '</span>' : '') + (v.src ? '<span class="' + v.src + '">' + esc(t('b_' + v.src)) + '</span>' : '');
}
function renderChannelPage() {
  var box = $('items'); if (!S.channels.length) { box.innerHTML = ''; return; }
  var ch = L.channel(S), id = ch.theme, n = L.strikes(S), st = chStyle(ch);
  var vids = S.videos.filter(function (v) { return v.ch === S.active; }).slice().reverse();
  var html = '<div class="chpage"><div class="banner" style="' + patternCss(st) + '"></div>' +
    '<div class="chhead"><div class="avatar" style="background:' + st[2] + '">' + THEME_ICON[id] + '</div>' +
    '<div><h4>' + esc(chName(S.active)) + '</h4><p>' + esc(th(id).name) + ' · ' + esc(t('ch_subs', { n: fmt(ch.subs) })) + ' · ' + esc(t('ch_videos', { n: fmt(ch.videos) })) + ' · ' + esc(t('ch_views', { n: fmt(ch.views) })) + '</p></div></div>' +
    '<div class="chmeta"><span class="' + (ch.monetized ? 'on' : '') + '">' + esc(ch.monetized ? t('mon_on') : t('mon_off', { n: fmtFull(L.MONETIZE_AT) })) + '</span>' +
    '<span>' + esc(t('ch_earned', { n: fmtMoney(ch.earned || 0) })) + '</span>' +
    '<span class="' + (n ? 'bad' : '') + '">' + esc(t('strikes_now', { n: n, m: L.MAX_STRIKES })) + '</span>' +
    '<span>' + esc(t('trust')) + ': ' + Math.round(S.trust) + '%</span></div>' +
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
  $('vidsNote').textContent = t('perf_note') + ' ' + t('rpm_note');
  var vids = S.videos.filter(function (v) { return v.ch === S.active; }).slice().reverse(), html = '';
  vids.forEach(function (v) {
    var views = L.videoViews(S, v), cell = function (k, val, hot) { return '<div' + (hot ? ' class="hot"' : '') + '><span>' + esc(t(k)) + '</span><strong>' + val + '</strong></div>'; };
    html += '<div class="vcard">' + thumbHtml(v, ch) + '<div><b>' + esc(videoTitle(v)) + '</b><div class="vm">' + esc(t('f_' + (v.fmt || 'video'))) + ' · ' + esc(agoText(S.played - v.t)) + '</div><div class="vbadges">' + badgesHtml(v) + '</div>' +
      '<div class="vstats">' + cell('st_views', fmt(views)) + cell('st_earned', fmtMoney(L.videoEarned(S, v))) + cell('st_rpm', v.mon ? '$' + dec(v.rpm || 0) : '—') +
      cell('st_likes', fmt(views * L.likeRate(S))) + cell('st_dislikes', fmt(views * L.dislikeRate(S))) + cell('st_comments', fmt(v.cm || 0)) + cell('st_perf', (v.perf || 100) + '%', (v.perf || 100) >= 300) + '</div></div></div>';
  });
  if (!vids.length) html = '<p class="note">' + esc(t('no_videos')) + '</p>';
  $('vidsList').innerHTML = html; $('vidsBox').hidden = false;
}

/* ---------- Комментарии ---------- */
var AVA = ['#ffd3cf', '#d9f5ea', '#dff1ff', '#fff0c2', '#e4dfff', '#ffe3cc'];
function renderComments() {
  var box = $('items'), list = S.comments.slice().reverse(), html = '';
  html += '<p class="note">' + esc(S.staff.mg >= L.MG_AUTO_COMMENTS ? t('cm_auto_on') : t('cm_auto', { n: L.MG_AUTO_COMMENTS })) + '</p>';
  if (!list.length) html += '<p class="note">' + esc(t('cm_empty')) + '</p>';
  list.forEach(function (c) {
    var authors = T().authors, name = authors[(c.pick * 7 + c.id) % authors.length], text = T().cm_text[c.kind][c.pick % 8], v = L.findVideo(S, c.vid);
    html += '<div class="cm"><div class="cm-head"><span class="cm-ava" style="background:' + AVA[c.pick % AVA.length] + '">' + esc(name.charAt(0).toUpperCase()) + '</span><b>@' + esc(name) + '</b>' +
      '<span class="kind ' + c.kind + '">' + esc(t('kind_' + c.kind)) + '</span></div><p>' + esc(text) + '</p>' +
      (v ? '<small>' + esc(t('cm_to', { title: videoTitle(v) })) + ' · ' + esc(chName(c.ch)) + '</small>' : '') +
      '<div class="row"><button class="rbtn pos" type="button" data-c="' + c.id + '" data-tone="pos">' + esc(t('cm_pos')) + '</button>' +
      '<button class="rbtn" type="button" data-c="' + c.id + '" data-tone="neu">' + esc(t('cm_neu')) + '</button>' +
      '<button class="rbtn neg" type="button" data-c="' + c.id + '" data-tone="neg">' + esc(t('cm_neg')) + '</button></div></div>';
  });
  box.innerHTML = html;
  box.querySelectorAll('.rbtn').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = L.replyComment(S, +b.getAttribute('data-c'), b.getAttribute('data-tone')); if (!d) return;
      toast(t('cm_res', { t: signed(d.trust), s: d.subs >= 1 ? t('cm_res_subs', { n: fmt(d.subs) }) : '' }));
      A.play(d.trust < 0 ? 'bad' : 'ui'); renderComments(); renderAll(); save();
    });
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
function renderFormat() {
  if (!S.channels.length) return;
  L.FORMAT_IDS.forEach(function (f) { $('fmt-' + f).setAttribute('aria-pressed', S.format === f); });
  var rpm = L.theme(S).rpm * L.FORMATS[S.format].rpm;
  $('fmtDesc').textContent = t('fmt_d_' + S.format, { rpm: '$' + dec(Math.round(rpm * 100) / 100) });
}
function renderStages() {
  if (!S.channels.length) return;
  STAGES.forEach(function (st) {
    $('bar-' + st).style.width = Math.min(100, S.work[st] / L.workNeed(S, st) * 100) + '%';
    var ok = L.canWork(S, st); $('btn-' + st).disabled = !ok;
    var meta = [], sk = STAFF_OF[st];
    if (S.job.active) meta.push(t('at_job'));
    else if (!L.stageOpen(S, st)) meta.push(st === 'up' && S.edited.length > 0 ? t('blocked', { n: L.strikes(S) }) : t(st === 'edit' ? 'need_raw' : 'need_edit'));
    else meta.push(t('per_click', { n: L.power(S, st) }));
    if (S.staff[sk] > 0) meta.push(t('auto', { who: t('who_' + sk), n: dec(Math.round(L.staffRate(S, sk) * 10) / 10) }));
    $('meta-' + st).textContent = meta.join(' · ');
  });
  $('cnt-edit').textContent = S.raw.length ? t('queue', { n: S.raw.length }) : '';
  $('cnt-up').textContent = S.edited.length ? t('queue', { n: S.edited.length }) : '';
  var cf = L.itemFormat(S, 'rec'); $('cnt-rec').textContent = t('f_' + cf);
}
function renderFx() {
  var parts = [], n = L.strikes(S);
  if (n) { var left = 0; S.effects.forEach(function (e) { if (e.type === 'strike' && e.ch === S.active) left = Math.max(left, e.until - S.played); }); parts.push('<span class="bad">' + esc(t('fx_strike', { n: n, t: fmtClock(left) })) + '</span>'); }
  S.effects.forEach(function (e) {
    if (e.type === 'broken') parts.push('<span class="bad">' + esc(t('fx_broken', { t: fmtClock(e.until - S.played) })) + '</span>');
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
  $('money').textContent = fmtMoney(S.money); $('trust').textContent = Math.round(S.trust) + '%';
  $('quality').textContent = '×' + dec(Math.round(L.quality(S) * 10) / 10); $('videos').textContent = fmt(ch.videos);
  var cb = $('cmBadge'); cb.hidden = !S.comments.length; cb.textContent = S.comments.length > 9 ? '9+' : S.comments.length;
  updateChanSubs(); renderJob(); renderFormat(); renderStages(); renderShop(); renderFx(); renderEventModal(false); renderTip();
}

/* ---------- Обучение ---------- */
var tipTarget = null;
function cheapestGear() {
  var best = null, cost = Infinity;
  L.GEAR_IDS.forEach(function (k) { var c = L.gearCost(S, k); if (c != null && !L.gearBlocked(S, k) && c < cost) { cost = c; best = k; } });
  return { kind: best, cost: cost };
}
function tutStep() {
  var tt = th(L.channel(S).theme), videos = L.totalVideos(S), gearSum = 0, staffSum = S.staff.op + S.staff.ed + S.staff.mg;
  L.GEAR_IDS.forEach(function (k) { gearSum += S.gear[k]; });
  switch (S.tut) {
    case 1: return { done: S.raw.length > 0 || S.edited.length > 0 || videos > 0, el: $("btn-rec"), text: t("tut_1", { btn: t("btn_rec") }) };
    case 2: return { done: S.edited.length > 0 || videos > 0, el: $("btn-edit"), text: t("tut_2", { btn: t("btn_edit") }) };
    case 3: return { done: videos > 0, el: $('btn-up'), text: t('tut_3') };
    case 4: return { el: $('stats'), text: t('tut_4'), ok: true };
    case 5: {
      if (!S.job.employed) return { done: true };
      return { el: $('job'), text: t('tut_5'), ok: true };
    }
    case 6: {
      var cg = cheapestGear();
      if (gearSum > 0) return { done: true };
      if (!cg.kind || S.money < cg.cost) return { wait: true };
      if (shopTab !== 'gear') setTab('gear');
      return { el: $('buy-' + cg.kind), text: t('tut_6') };
    }
    case 7: {
      if (S.replied > 0) return { done: true };
      if (!S.comments.length) return { wait: true };
      return { el: shopTab === 'comments' ? $('items').querySelector('.rbtn') : $('tab-comments'), text: t('tut_7') };
    }
    case 8: {
      if (staffSum > 0) return { done: true };
      if (S.money < 120) return { wait: true };
      return { el: shopTab === 'team' ? $('buy-mg') : $('tab-team'), text: t('tut_8') };
    }
    case 9: {
      if (S.home > 0) return { done: true };
      if (S.money < L.HOMES[1].cost) return { wait: true };
      return { el: shopTab === 'home' ? $('buy-home1') : $('tab-home'), text: t('tut_9') };
    }
    default: return null;
  }
}
function renderTip() {
  if (!S.channels.length || ['pickBox', 'menuBox', 'winBox', 'evBox', 'quitBox', 'vidsBox', 'moveBox'].some(function (id) { return !$(id).hidden; })) { hideTip(); return; }
  var step = tutStep(), guard = 0;
  while (step && step.done && guard++ < 12) { S.tut++; step = tutStep(); }
  if (!step || step.wait || !step.el) { hideTip(); return; }
  if (tipTarget !== step.el) {
    if (tipTarget) tipTarget.classList.remove('pulse');
    tipTarget = step.el; tipTarget.classList.add('pulse');
    var tr = tipTarget.getBoundingClientRect();
    if (tr.top < 0 || tr.bottom > window.innerHeight - 140) tipTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  var tip = $('tip');
  $('tipTxt').textContent = step.text; $('tipOk').hidden = !step.ok; tip.hidden = false;
  var r = step.el.getBoundingClientRect(), tw = tip.offsetWidth, thh = tip.offsetHeight, vw = document.documentElement.clientWidth, vh = window.innerHeight;
  var left = Math.min(Math.max(16, r.left + r.width / 2 - tw / 2), vw - tw - 16), top = r.bottom + 12;
  if (top + thh > vh - 8 && r.top - thh - 12 > 8) top = r.top - thh - 12;
  tip.style.left = left + 'px'; tip.style.top = Math.max(8, Math.min(top, vh - thh - 8)) + 'px';
}
function hideTip() { $('tip').hidden = true; if (tipTarget) { tipTarget.classList.remove('pulse'); tipTarget = null; } }
$('tipOk').addEventListener('click', function () { S.tut++; A.play('ui'); renderTip(); save(); });
$('tipSkip').addEventListener('click', function () { S.tut = 99; hideTip(); save(); });
window.addEventListener('scroll', function () { if (!$('tip').hidden) renderTip(); }, { passive: true });

/* ---------- Холст и главный цикл ---------- */
var cv = $('cv'), ctx = cv.getContext('2d');
function resize() {
  var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(cv.width / window.Room.W, 0, 0, cv.height / window.Room.H, 0, 0);
}
window.addEventListener('resize', function () { resize(); renderTip(); });

var last = performance.now(), uiTimer = 0, saveTimer = 0, chTimer = 0;
function frame(ts) {
  var dt = Math.min(0.25, (ts - last) / 1000); last = ts; now += dt;
  if ($('moveBox').hidden) handle(L.tick(S, dt, Math.random)); else updateMove();
  if (S.event && !$('evBox').hidden) updateEventButtons();
  uiTimer += dt; saveTimer += dt; chTimer += dt;
  if (uiTimer > 0.15) { uiTimer = 0; renderAll(); }
  if (chTimer > 2 && shopTab === 'channel' && $('vidsBox').hidden) { chTimer = 0; renderChannelPage(); }
  if (saveTimer > 5) { saveTimer = 0; save(); }
  var selfRec = now - lastClick.rec < 0.6, selfEdit = now - lastClick.edit < 0.6, selfUp = now - lastClick.up < 0.6;
  var lastSelf = Math.max(lastClick.rec, lastClick.edit, lastClick.up);
  window.Room.draw(ctx, S, L, now, {
    selfDesk: (selfEdit || selfUp) && lastClick.rec < lastSelf,
    recording: !S.job.active && (selfRec || S.staff.op > 0),
    editing: !S.job.active && (selfEdit || (S.staff.ed > 0 && S.raw.length > 0)),
    uploading: !S.job.active && (selfUp || (S.staff.mg > 0 && S.edited.length > 0)),
    edOnline: S.staff.ed > 0, upProgress: S.work.up / L.workNeed(S, 'up'), sinceUpload: now - lastPublish,
    atJob: S.job.active, jobLabel: settings.lang === 'ru' ? 'Ушёл на работу' : 'At work'
  });
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', function () { if (document.hidden) save(); });
window.addEventListener('beforeunload', save);

function start() {
  resize(); applyTexts(); renderAll();
  if (!S.channels.length) openPicker('first');
  requestAnimationFrame(function (ts) { last = ts; frame(ts); });
}
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start); else start();
})();
