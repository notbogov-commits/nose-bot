/**
 * YouTube-трекер для Google Таблицы.
 *
 * Что делает:
 *  - берёт ВСЕ видео канала (по умолчанию только длинные, без Shorts);
 *  - показывает прирост за 24 часа, 7 и 28 дней;
 *  - CTR обложки, показы, % досмотра, среднее время просмотра, длительность;
 *  - откуда приходят зрители (рекомендации, поиск, главная…);
 *  - ставит статус (растёт / стабильно / затухает / на стопе) и пишет вывод;
 *  - обновляется сам каждый час.
 *
 * Установка — см. ИНСТРУКЦИЯ.md рядом с этим файлом.
 */

// ===================== НАСТРОЙКИ (можно менять) =====================

/** true = показывать только длинные видео (без Shorts). */
const ONLY_LONG = true;

/** Видео короче стольких секунд считается Shorts. */
const SHORT_MAX_SECONDS = 180;

/** Меньше стольких просмотров за 7 дней — видео «на стопе». */
const STOP_WEEKLY_VIEWS = 50;

/** Видео моложе стольких дней помечается как «новое» (рано судить). */
const NEW_DAYS = 7;

/** Пороги статусов: во сколько раз неделя больше/меньше прошлой. */
const GROW_RATIO = 1.2;    // от этого и выше — «растёт»
const STABLE_RATIO = 0.8;  // от этого до GROW_RATIO — «стабильно»
const FADING_RATIO = 0.4;  // от этого до STABLE_RATIO — «затухает», ниже — «резко падает»

/** Показывать приватные видео. */
const INCLUDE_PRIVATE = false;

/**
 * Аналитика YouTube приходит с задержкой ~2 дня, поэтому неделя
 * считается с (сегодня − 8) по (сегодня − 2). «За 24 ч» считается
 * по снимкам общего счётчика просмотров — он почти в реальном времени.
 */
const ANALYTICS_LAG_DAYS = 2;

/** Сколько дней хранить почасовые снимки. */
const SNAPSHOT_KEEP_DAYS = 8;

// ====================================================================

const SHEET_VIDEOS = 'Видео';
const SHEET_SUMMARY = 'Сводка';
const SHEET_HISTORY = 'История';
const SHEET_SNAPSHOTS = '_Снимки';
const SHEET_CTR = '_CTR';

const STATUS = {
  NEW:      { label: '🆕 Новое',        color: '#e8eaf6' },
  GROW:     { label: '🚀 Растёт',       color: '#c8e6c9' },
  STABLE:   { label: '🟢 Стабильно',    color: '#e8f5e9' },
  FADING:   { label: '🟡 Затухает',     color: '#fff9c4' },
  DROPPING: { label: '🟠 Резко падает', color: '#ffe0b2' },
  STOP:     { label: '🔴 На стопе',     color: '#ffcdd2' },
};

const SOURCE_NAMES = {
  RELATED_VIDEO: 'Рекомендации',
  SUBSCRIBER: 'Главная и подписки',
  YT_SEARCH: 'Поиск YouTube',
  EXT_URL: 'Внешние сайты',
  NO_LINK_OTHER: 'Прямые заходы',
  NO_LINK_EMBEDDED: 'Встроенный плеер',
  PLAYLIST: 'Плейлисты',
  YT_PLAYLIST_PAGE: 'Страница плейлиста',
  YT_CHANNEL: 'Страница канала',
  YT_OTHER_PAGE: 'Другие страницы YouTube',
  NOTIFICATION: 'Уведомления',
  END_SCREEN: 'Конечные заставки',
  ANNOTATION: 'Подсказки',
  CAMPAIGN_CARD: 'Карточки',
  SHORTS: 'Лента Shorts',
  HASHTAGS: 'Хештеги',
  ADVERTISING: 'Реклама',
  PROMOTED: 'Продвижение',
  LIVE_REDIRECT: 'С трансляций',
  SOUND_PAGE: 'Страницы звуков',
  VIDEO_REMIXES: 'Ремиксы',
  PRODUCT_PAGE: 'Страницы товаров',
};

const SOURCE_MEANING = {
  RELATED_VIDEO: 'YouTube советует его рядом с другими видео',
  SUBSCRIBER: 'его показывают на главной и в подписках',
  YT_SEARCH: 'его находят через поиск — название и теги работают',
  EXT_URL: 'зрители приходят по ссылкам с других сайтов',
  NO_LINK_OTHER: 'прямые заходы и ссылки из мессенджеров',
  PLAYLIST: 'его смотрят из плейлистов',
  NOTIFICATION: 'зрители приходят из уведомлений',
  END_SCREEN: 'на него переходят с конечных заставок',
  YT_CHANNEL: 'его открывают со страницы канала',
};

// ---------------------------- Меню ----------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 YouTube')
    .addItem('Обновить сейчас', 'updateAll')
    .addItem('Какой канал подключён?', 'showChannel')
    .addSeparator()
    .addItem('Включить автообновление (каждый час)', 'enableAutoUpdate')
    .addItem('Выключить автообновление', 'disableAutoUpdate')
    .addToUi();
}

/** Первый запуск: обновить данные и включить автообновление. */
function setup() {
  updateAll();
  enableAutoUpdate();
}

function enableAutoUpdate() {
  disableAutoUpdate();
  ScriptApp.newTrigger('updateAll').timeBased().everyHours(1).create();
  toast_('Автообновление включено: каждый час.');
}

function disableAutoUpdate() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'updateAll')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

// Старые названия из первой версии — чтобы прежнее меню не сломалось.
function enableDailyUpdate() { enableAutoUpdate(); }
function disableDailyUpdate() { disableAutoUpdate(); }

function showChannel() {
  const ch = getMyChannel_();
  SpreadsheetApp.getUi().alert(
    'Подключён канал: «' + ch.snippet.title + '»\n' +
    'Подписчиков: ' + ch.statistics.subscriberCount + ', видео: ' + ch.statistics.videoCount + '\n\n' +
    'Если это не тот канал — см. раздел «Подключился не тот канал» в инструкции.');
}

// ------------------------ Главная функция ---------------------------

function updateAll() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // обновление уже идёт
  try {
    update_();
  } finally {
    lock.releaseLock();
  }
}

function update_() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  toast_('Загружаю данные с YouTube…');

  const channel = getMyChannel_();
  const videos = getAllVideos_(channel.contentDetails.relatedPlaylists.uploads)
    .filter(v => INCLUDE_PRIVATE || v.status.privacyStatus !== 'private');

  const end = daysAgo_(ANALYTICS_LAG_DAYS);
  const p7 = { start: daysAgo_(ANALYTICS_LAG_DAYS + 6), end: end };
  const prev7 = { start: daysAgo_(ANALYTICS_LAG_DAYS + 13), end: daysAgo_(ANALYTICS_LAG_DAYS + 7) };
  const p28 = { start: daysAgo_(ANALYTICS_LAG_DAYS + 27), end: end };

  const a7 = getVideoAnalytics_(p7, tz, 'views');
  const aPrev = getVideoAnalytics_(prev7, tz, 'views');
  const a28 = getVideoAnalytics_(p28, tz,
    'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained');

  const now = new Date();
  const snap = saveSnapshotAndGetBaseline_(ss, videos, now);

  const allRows = videos.map(v => {
    const id = v.id;
    const published = new Date(v.snippet.publishedAt);
    const seconds = parseDuration_(v.contentDetails.duration);
    const total = Number(v.statistics.viewCount || 0);
    const r = {
      id: id,
      title: v.snippet.title,
      isShort: seconds <= SHORT_MAX_SECONDS,
      seconds: seconds,
      published: published,
      ageDays: Math.floor((now - published) / 86400000),
      total: total,
      d24: snap.base[id] != null ? total - snap.base[id] : '',
      v7: (a7[id] && a7[id].views) || 0,
      prev7: (aPrev[id] && aPrev[id].views) || 0,
      v28: (a28[id] && a28[id].views) || 0,
      subs28: (a28[id] && a28[id].subscribersGained) || 0,
      avgPct: a28[id] ? a28[id].averageViewPercentage : '',
      avgDur: a28[id] ? a28[id].averageViewDuration : '',
      likes: Number(v.statistics.likeCount || 0),
      comments: Number(v.statistics.commentCount || 0),
      impr: '',
      ctr: '',
      sources: null,
    };
    r.change = r.prev7 > 0 ? r.v7 / r.prev7 - 1 : '';
    r.status = getStatus_(r);
    return r;
  });

  const rows = ONLY_LONG ? allRows.filter(r => !r.isShort) : allRows;

  // Откуда приходят зрители (раз в день, кэшируется)
  const sources = getTrafficSources_(rows.filter(r => r.v28 > 0), p28, tz);
  // CTR обложки и показы (через YouTube Reporting API)
  const ctr = getCtrSafe_(ss, channel.id, tz);

  rows.forEach(r => {
    r.sources = sources[r.id] || null;
    const c = ctr.byVideo[r.id];
    if (c && c.impr > 0) { r.impr = c.impr; r.ctr = c.clicks / c.impr; }
  });

  const med = {
    avgPct: median_(rows.filter(r => r.v28 >= 100 && r.avgPct !== '').map(r => r.avgPct)),
    ctr: median_(rows.filter(r => r.impr >= 1000).map(r => r.ctr)),
  };
  rows.forEach(r => { r.conclusion = buildConclusion_(r, med); });
  rows.sort((a, b) => b.v7 - a.v7 || b.total - a.total);

  writeVideosSheet_(ss, rows);
  writeSummarySheet_(ss, channel, rows, allRows, { p7: p7, prev7: prev7, snap: snap, ctrNote: ctr.note, med: med }, tz);
  appendHistory_(ss, rows, tz);

  toast_('Готово! Канал «' + channel.snippet.title + '», видео: ' + rows.length);
}

// --------------------------- Статусы и выводы -----------------------

function getStatus_(r) {
  if (r.ageDays < NEW_DAYS) return STATUS.NEW;
  if (r.v7 < STOP_WEEKLY_VIEWS) return STATUS.STOP;
  if (r.prev7 === 0) return STATUS.GROW;
  const ratio = r.v7 / r.prev7;
  if (ratio >= GROW_RATIO) return STATUS.GROW;
  if (ratio >= STABLE_RATIO) return STATUS.STABLE;
  if (ratio >= FADING_RATIO) return STATUS.FADING;
  return STATUS.DROPPING;
}

function buildConclusion_(r, med) {
  const p = [];
  switch (r.status) {
    case STATUS.NEW:
      p.push('Новое видео (' + r.ageDays + ' дн.), рано судить.' +
        (r.d24 !== '' ? ' За сутки +' + fmtNum_(r.d24) + '.' : ''));
      break;
    case STATUS.STOP:
      p.push('Отработало: почти не набирает (' + r.v7 + ' за неделю, всего ' + fmtNum_(r.total) + ').');
      break;
    case STATUS.GROW:
      p.push('На подъёме: ' + fmtChange_(r) + '.');
      break;
    case STATUS.STABLE:
      p.push('Стабильно набирает ≈' + fmtNum_(Math.round(r.v7 / 7)) + ' в день.');
      break;
    case STATUS.FADING:
      p.push('Затухает: ' + fmtChange_(r) + '.');
      break;
    case STATUS.DROPPING:
      p.push('Резко упало: ' + fmtChange_(r) + '.');
      break;
  }

  if (r.sources && r.sources.length && r.status !== STATUS.STOP) {
    const src = r.sources[0][0], pct = r.sources[0][1];
    p.push('Главный источник — ' + (SOURCE_NAMES[src] || src) + ' (' + pct + '%)' +
      (SOURCE_MEANING[src] ? ': ' + SOURCE_MEANING[src] : '') + '.');
  }

  if (r.avgPct !== '' && med.avgPct && r.v28 >= 100) {
    const a = Math.round(r.avgPct), m = Math.round(med.avgPct);
    if (r.avgPct >= med.avgPct * 1.15) p.push('Досматривают лучше среднего по каналу (' + a + '% против ' + m + '%).');
    else if (r.avgPct <= med.avgPct * 0.85) p.push('Досматривают хуже среднего (' + a + '% против ' + m + '%): проверь вступление и затянутые места.');
  }

  if (r.ctr !== '' && med.ctr && r.impr >= 1000) {
    const c = pct1_(r.ctr), m = pct1_(med.ctr);
    if (r.ctr >= med.ctr * 1.15) p.push('Обложку и название кликают охотнее среднего (CTR ' + c + ' против ' + m + ').');
    else if (r.ctr <= med.ctr * 0.85) p.push('CTR ниже среднего (' + c + ' против ' + m + '): можно попробовать другую обложку или название.');
  }

  return p.join(' ');
}

function fmtChange_(r) {
  if (!r.prev7) return r.v7 + ' просмотров за неделю';
  const c = Math.round((r.v7 / r.prev7 - 1) * 100);
  return (c >= 0 ? '+' : '') + c + '% к прошлой неделе';
}

// --------------------------- YouTube API ----------------------------

function getMyChannel_() {
  const res = YouTube.Channels.list('snippet,statistics,contentDetails', { mine: true });
  if (!res.items || !res.items.length) {
    throw new Error('Канал не найден. Авторизуйтесь каналом (аккаунтом бренда), статистику которого хотите видеть.');
  }
  return res.items[0];
}

function getAllVideos_(uploadsPlaylistId) {
  const ids = [];
  let pageToken;
  do {
    const res = YouTube.PlaylistItems.list('contentDetails', {
      playlistId: uploadsPlaylistId, maxResults: 50, pageToken: pageToken,
    });
    (res.items || []).forEach(it => ids.push(it.contentDetails.videoId));
    pageToken = res.nextPageToken;
  } while (pageToken);

  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const res = YouTube.Videos.list('snippet,statistics,contentDetails,status', {
      id: ids.slice(i, i + 50).join(','), maxResults: 50,
    });
    (res.items || []).forEach(v => videos.push(v));
  }
  return videos;
}

/** { videoId: { metric: value } } за период. */
function getVideoAnalytics_(period, tz, metrics) {
  const res = YouTubeAnalytics.Reports.query({
    ids: 'channel==MINE',
    startDate: fmt_(period.start, tz),
    endDate: fmt_(period.end, tz),
    metrics: metrics,
    dimensions: 'video',
    sort: '-views',
    maxResults: 200,
  });
  const headers = (res.columnHeaders || []).map(h => h.name);
  const out = {};
  (res.rows || []).forEach(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    out[obj.video] = obj;
  });
  return out;
}

/** Источники трафика по каждому видео за 28 дней. Считается раз в день. */
function getTrafficSources_(rows, period, tz) {
  const props = PropertiesService.getScriptProperties();
  const today = fmt_(new Date(), tz);
  let cache = {};
  try { cache = JSON.parse(props.getProperty('SRC_CACHE') || '{}'); } catch (e) { cache = {}; }
  if (cache.date !== today || !cache.data) cache = { date: today, data: {} };

  rows.forEach(r => {
    if (cache.data[r.id]) return;
    try {
      const res = YouTubeAnalytics.Reports.query({
        ids: 'channel==MINE',
        startDate: fmt_(period.start, tz),
        endDate: fmt_(period.end, tz),
        metrics: 'views',
        dimensions: 'insightTrafficSourceType',
        filters: 'video==' + r.id,
        sort: '-views',
      });
      const list = res.rows || [];
      const total = list.reduce((s, x) => s + x[1], 0);
      cache.data[r.id] = total ? list.slice(0, 3).map(x => [x[0], Math.round(x[1] / total * 100)]) : [];
    } catch (e) {
      cache.data[r.id] = [];
    }
  });

  try { props.setProperty('SRC_CACHE', JSON.stringify(cache)); } catch (e) { /* слишком много видео для кэша */ }
  return cache.data;
}

// ---------------- CTR и показы (YouTube Reporting API) --------------

const REPORTING = 'https://youtubereporting.googleapis.com/v1';

/**
 * Возвращает { byVideo: { id: { impr, clicks } }, note: '...' }.
 * YouTube готовит эти отчёты раз в сутки, первые данные — через 1–2 дня
 * после первого запуска.
 */
function getCtrSafe_(ss, channelId, tz) {
  try {
    return getCtr_(ss, channelId, tz);
  } catch (e) {
    return { byVideo: {}, note: 'CTR пока недоступен: ' + String(e.message || e).slice(0, 200) };
  }
}

function getCtr_(ss, channelId, tz) {
  const props = PropertiesService.getScriptProperties();
  const key = 'REACH_JOB_' + channelId;
  let jobId = props.getProperty(key);
  let justCreated = false;

  if (!jobId) {
    const types = JSON.parse(reportingFetch_(REPORTING + '/reportTypes')).reportTypes || [];
    const type = types.find(t => /^channel_reach_basic/.test(t.id)) || types.find(t => /^channel_reach/.test(t.id));
    if (!type) throw new Error('YouTube не отдаёт отчёт о показах для этого канала');
    const jobs = JSON.parse(reportingFetch_(REPORTING + '/jobs')).jobs || [];
    const existing = jobs.find(j => j.reportTypeId === type.id);
    if (existing) {
      jobId = existing.id;
    } else {
      jobId = JSON.parse(reportingFetch_(REPORTING + '/jobs', 'post',
        { reportTypeId: type.id, name: 'YouTube tracker CTR' })).id;
      justCreated = true;
    }
    props.setProperty(key, jobId);
  }

  // Список дневных отчётов за ~32 дня
  const since = new Date(Date.now() - 32 * 86400000).toISOString();
  const latestByDay = {};
  let pageToken = '';
  do {
    const url = REPORTING + '/jobs/' + jobId + '/reports?startTimeAtOrAfter=' + encodeURIComponent(since) +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = JSON.parse(reportingFetch_(url));
    (res.reports || []).forEach(rep => {
      const day = rep.startTime.slice(0, 10);
      if (!latestByDay[day] || rep.createTime > latestByDay[day].createTime) latestByDay[day] = rep;
    });
    pageToken = res.nextPageToken || '';
  } while (pageToken);

  // Скачиваем только новые дни (не больше 10 за запуск)
  const sh = getOrCreateSheet_(ss, SHEET_CTR);
  if (!sh.isSheetHidden()) sh.hideSheet();
  const stored = sh.getLastRow() > 0 ? sh.getRange(1, 1, sh.getLastRow(), 4).getValues() : [];
  const haveDays = {};
  stored.forEach(r => { haveDays[String(r[0])] = true; });

  const newDays = Object.keys(latestByDay).filter(d => !haveDays[d]).sort().slice(0, 10);
  const toAppend = [];
  newDays.forEach(day => {
    const csv = Utilities.parseCsv(reportingFetch_(latestByDay[day].downloadUrl));
    const head = csv[0] || [];
    const iVid = head.indexOf('video_id');
    const iImp = head.indexOf('video_thumbnail_impressions');
    const iCtr = head.indexOf('video_thumbnail_impressions_ctr');
    const agg = {};
    if (iVid >= 0 && iImp >= 0 && iCtr >= 0) {
      for (let i = 1; i < csv.length; i++) {
        const imp = Number(csv[i][iImp]) || 0;
        let c = Number(csv[i][iCtr]) || 0;
        if (c > 1) c = c / 100; // на случай, если CTR пришёл в процентах
        const id = csv[i][iVid];
        if (!agg[id]) agg[id] = { impr: 0, clicks: 0 };
        agg[id].impr += imp;
        agg[id].clicks += imp * c;
      }
    }
    toAppend.push([day, '_', 0, 0]); // отметка «день загружен»
    Object.keys(agg).forEach(id => toAppend.push([day, id, agg[id].impr, agg[id].clicks]));
  });
  if (toAppend.length) {
    sh.getRange(sh.getLastRow() + 1, 1, toAppend.length, 4).setValues(toAppend);
  }

  // Сумма за последние 28 дней
  const cutoff = fmt_(daysAgo_(30), 'UTC');
  const all = stored.concat(toAppend);
  const byVideo = {};
  let anyData = false;
  all.forEach(r => {
    const day = String(r[0]), id = r[1];
    if (id === '_' || day < cutoff) return;
    anyData = true;
    if (!byVideo[id]) byVideo[id] = { impr: 0, clicks: 0 };
    byVideo[id].impr += Number(r[2]) || 0;
    byVideo[id].clicks += Number(r[3]) || 0;
  });

  // Чистим старое (> 40 дней)
  const old = fmt_(daysAgo_(40), 'UTC');
  if (all.some(r => String(r[0]) < old)) {
    const keep = all.filter(r => String(r[0]) >= old);
    sh.clear();
    if (keep.length) sh.getRange(1, 1, keep.length, 4).setValues(keep);
  }

  let note = '';
  if (!anyData) {
    note = justCreated || !Object.keys(latestByDay).length
      ? 'CTR и показы появятся через 1–2 дня: YouTube готовит отчёты.'
      : 'CTR догружается, обновится при следующих запусках.';
  }
  return { byVideo: byVideo, note: note };
}

function reportingFetch_(url, method, payload) {
  const opt = {
    method: method || 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  };
  if (payload) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(payload); }
  const resp = UrlFetchApp.fetch(url, opt);
  if (resp.getResponseCode() >= 300) {
    throw new Error('Reporting API ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200));
  }
  return resp.getContentText();
}

// ---------------- Почасовые снимки (для «За 24 ч») ------------------

/**
 * Сохраняет текущие счётчики просмотров и возвращает снимок ~24 ч назад:
 * { base: { id: views }, baseTime: Date | null }.
 */
function saveSnapshotAndGetBaseline_(ss, videos, now) {
  const sh = getOrCreateSheet_(ss, SHEET_SNAPSHOTS);
  if (!sh.isSheetHidden()) sh.hideSheet();
  const nowMs = now.getTime();
  const values = sh.getLastRow() > 0 ? sh.getRange(1, 1, sh.getLastRow(), 3).getValues() : [];

  // Ищем самый свежий снимок, сделанный не позже чем 23,5 ч назад
  const target = nowMs - 23.5 * 3600000;
  let baseMs = null;
  values.forEach(r => {
    const t = Number(r[0]);
    if (t <= target && (baseMs === null || t > baseMs)) baseMs = t;
  });
  const base = {};
  if (baseMs !== null) values.forEach(r => { if (Number(r[0]) === baseMs) base[r[1]] = Number(r[2]); });

  // Чистим старые и дописываем новый снимок
  const keepFrom = nowMs - SNAPSHOT_KEEP_DAYS * 86400000;
  const kept = values.filter(r => Number(r[0]) >= keepFrom);
  const fresh = videos.map(v => [nowMs, v.id, Number(v.statistics.viewCount || 0)]);
  if (kept.length !== values.length) {
    sh.clear();
    const all = kept.concat(fresh);
    if (all.length) sh.getRange(1, 1, all.length, 3).setValues(all);
  } else if (fresh.length) {
    sh.getRange(sh.getLastRow() + 1, 1, fresh.length, 3).setValues(fresh);
  }
  return { base: base, baseTime: baseMs === null ? null : new Date(baseMs) };
}

// ------------------------- Лист «Видео» -----------------------------

function writeVideosSheet_(ss, rows) {
  const sh = getOrCreateSheet_(ss, SHEET_VIDEOS);
  if (sh.getFilter()) sh.getFilter().remove();
  sh.clear();

  const header = [
    'Статус', 'Название', 'Длительность', 'Опубликовано', 'Дней',
    'Всего просмотров', 'За 24 ч', 'За 7 дн', 'Прошлые 7 дн', 'Изменение', 'За 28 дн',
    'CTR обложки (28 дн)', 'Показы (28 дн)', '% досмотра (28 дн)', 'Ср. время просмотра',
    'Подписчики (28 дн)', 'Лайки', 'Комментарии', 'Откуда смотрят (28 дн)', 'Вывод',
  ];

  const data = rows.map(r => [
    r.status.label,
    '=HYPERLINK("https://youtu.be/' + r.id + '";"' + r.title.replace(/"/g, '""') + '")',
    fmtDur_(r.seconds),
    r.published,
    r.ageDays,
    r.total,
    r.d24,
    r.v7,
    r.prev7,
    r.change,
    r.v28,
    r.ctr,
    r.impr === '' ? '' : Math.round(r.impr),
    r.avgPct === '' ? '' : r.avgPct / 100,
    r.avgDur === '' ? '' : fmtDur_(r.avgDur),
    r.subs28,
    r.likes,
    r.comments,
    r.sources ? r.sources.map(s => (SOURCE_NAMES[s[0]] || s[0]) + ' ' + s[1] + '%').join(' · ') : '',
    r.conclusion,
  ]);

  sh.getRange(1, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#263238').setFontColor('#ffffff').setWrap(true)
    .setVerticalAlignment('middle');

  if (data.length) {
    const n = data.length;
    // Текстовые колонки задаём заранее, иначе «45:30» превратится во время
    sh.getRange(2, 3, n, 1).setNumberFormat('@');
    sh.getRange(2, 15, n, 1).setNumberFormat('@');
    sh.getRange(2, 1, n, header.length).setValues(data).setVerticalAlignment('top');
    sh.getRange(2, 4, n, 1).setNumberFormat('dd.MM.yyyy');
    [6, 8, 9, 11, 13, 16, 17, 18].forEach(c => sh.getRange(2, c, n, 1).setNumberFormat('#,##0'));
    sh.getRange(2, 7, n, 1).setNumberFormat('+#,##0;-#,##0;0');
    sh.getRange(2, 10, n, 1).setNumberFormat('+0%;-0%;0%');
    sh.getRange(2, 12, n, 1).setNumberFormat('0.0%');
    sh.getRange(2, 14, n, 1).setNumberFormat('0%');
    sh.getRange(2, 19, n, 2).setWrap(true);
    sh.getRange(2, 1, n, 1).setBackgrounds(rows.map(r => [r.status.color]));
    sh.getRange(1, 1, n + 1, header.length).createFilter();
  }

  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  sh.setColumnWidth(1, 125);
  sh.setColumnWidth(2, 320);
  sh.setColumnWidths(3, 16, 95);
  sh.setColumnWidth(19, 230);
  sh.setColumnWidth(20, 460);
  sh.setRowHeight(1, 48);
}

// ------------------------- Лист «Сводка» ----------------------------

function writeSummarySheet_(ss, channel, rows, allRows, info, tz) {
  const sh = getOrCreateSheet_(ss, SHEET_SUMMARY);
  sh.clear();
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(1);

  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const v7 = sum(rows, r => r.v7);
  const vPrev = sum(rows, r => r.prev7);
  const chg = vPrev ? v7 / vPrev - 1 : 0;
  const what = ONLY_LONG ? ' (длинные видео)' : '';

  const out = [];
  const add = (a, b) => out.push([a, b === undefined ? '' : b]);

  add('📊 ' + channel.snippet.title);
  add('Обновлено', Utilities.formatDate(new Date(), tz, 'dd.MM.yyyy HH:mm'));
  add('Подписчиков', Number(channel.statistics.subscriberCount));
  add('Всего просмотров канала', Number(channel.statistics.viewCount));
  add('Видео в таблице' + what, rows.length);
  add('Просмотры за 24 ч' + what, info.snap.baseTime ? sum(rows, r => r.d24) : 'появится через сутки');
  add('Просмотры за 7 дней' + what + ' (' + fmtRu_(info.p7.start, tz) + '–' + fmtRu_(info.p7.end, tz) + ')', v7);
  add('Прошлые 7 дней (' + fmtRu_(info.prev7.start, tz) + '–' + fmtRu_(info.prev7.end, tz) + ')', vPrev);
  add('Изменение за неделю', (chg >= 0 ? '+' : '') + Math.round(chg * 100) + '%');
  if (info.med.avgPct) add('Средний % досмотра по каналу', Math.round(info.med.avgPct) + '%');
  if (info.med.ctr) add('Средний CTR обложек по каналу', pct1_(info.med.ctr));
  add('');

  add('СТАТУСЫ ВИДЕО');
  Object.keys(STATUS).forEach(k => add(STATUS[k].label, rows.filter(r => r.status === STATUS[k]).length));
  add('');

  add('💡 ПОДСКАЗКИ');
  buildHints_(rows, allRows, v7).forEach(h => add(h));
  add('');

  add('🏆 ТОП-5 ЗА НЕДЕЛЮ', 'просмотров за 7 дн');
  rows.slice(0, 5).forEach(r => add(r.title, r.v7));
  add('');

  add('ℹ️ Колонки «За 7/28 дн», % досмотра и источники — из аналитики YouTube, она отстаёт на ~' +
    ANALYTICS_LAG_DAYS + ' дня. «Всего» и «За 24 ч» — почти в реальном времени.');
  if (info.snap.baseTime) {
    add('«За 24 ч» считается от снимка ' + Utilities.formatDate(info.snap.baseTime, tz, 'dd.MM HH:mm') + '.');
  }
  if (info.ctrNote) add('ℹ️ ' + info.ctrNote);
  add('Подробности по каждому видео — на листе «' + SHEET_VIDEOS + '» (колонка «Вывод» в конце).');

  sh.getRange(1, 1, out.length, 2).setValues(out);
  sh.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  sh.getRange(1, 2, out.length, 1).setNumberFormat('#,##0').setHorizontalAlignment('left');
  out.forEach((row, i) => {
    const t = String(row[0]);
    if (/^(СТАТУСЫ|💡|🏆)/.test(t)) sh.getRange(i + 1, 1, 1, 2).setFontWeight('bold').setBackground('#eceff1');
    const st = Object.values(STATUS).find(s => s.label === t);
    if (st) sh.getRange(i + 1, 1).setBackground(st.color);
  });
  sh.setColumnWidth(1, 560);
  sh.setColumnWidth(2, 170);
  sh.getRange(1, 1, out.length, 1).setWrap(true);
}

function buildHints_(rows, allRows, totalV7) {
  const hints = [];

  if (rows.length && totalV7 > 0) {
    const top = rows[0];
    hints.push('• Сейчас канал тянет «' + top.title + '» — ' + Math.round(top.v7 / totalV7 * 100) +
      '% просмотров за неделю.');
  }

  rows.filter(r => r.ageDays >= 30 && r.status === STATUS.GROW && r.v7 >= 200).slice(0, 3).forEach(r => {
    hints.push('• Старое видео снова набирает: «' + r.title + '» (' + fmtChange_(r) +
      '). Можно сделать продолжение, нарезку в Shorts или закрепить его.');
  });

  rows.filter(r => r.status === STATUS.DROPPING && r.prev7 >= 1000).slice(0, 3).forEach(r => {
    hints.push('• «' + r.title + '» резко просело (' + fmtChange_(r) + '). Можно попробовать новую обложку или название.');
  });

  const bySubs = rows.slice().sort((a, b) => b.subs28 - a.subs28)[0];
  if (bySubs && bySubs.subs28 > 0) {
    hints.push('• Больше всего подписчиков за 28 дней принесло «' + bySubs.title + '» (+' + bySubs.subs28 + ').');
  }

  const sV = allRows.filter(r => r.isShort).reduce((s, r) => s + r.v7, 0);
  const lV = allRows.filter(r => !r.isShort).reduce((s, r) => s + r.v7, 0);
  if (sV + lV > 0) {
    hints.push('• За неделю: длинные видео — ' + Math.round(lV / (sV + lV) * 100) + '% просмотров канала, Shorts — ' +
      Math.round(sV / (sV + lV) * 100) + '%.');
  }

  const stopped = rows.filter(r => r.status === STATUS.STOP).length;
  if (stopped) hints.push('• На стопе видео: ' + stopped + ' (меньше ' + STOP_WEEKLY_VIEWS + ' просмотров за неделю).');

  return hints.length ? hints : ['• Пока подсказок нет.'];
}

// ------------------------ Лист «История» ----------------------------

/** Один снимок в день: дата, видео, всего просмотров, за 7 дней, статус. */
function appendHistory_(ss, rows, tz) {
  const sh = getOrCreateSheet_(ss, SHEET_HISTORY);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Дата', 'ID видео', 'Название', 'Всего просмотров', 'Просмотры 7 дн', 'Статус']);
    sh.getRange(1, 1, 1, 6).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  const today = fmt_(new Date(), tz);
  const last = sh.getLastRow();
  if (last > 1) {
    const dates = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
    let firstToday = -1;
    for (let i = dates.length - 1; i >= 0 && dates[i][0] === today; i--) firstToday = i;
    if (firstToday >= 0) sh.deleteRows(firstToday + 2, dates.length - firstToday);
  }
  const data = rows.map(r => [today, r.id, r.title, r.total, r.v7, r.status.label]);
  if (data.length) {
    const start = sh.getLastRow() + 1;
    sh.getRange(start, 1, data.length, 1).setNumberFormat('@');
    sh.getRange(start, 1, data.length, data[0].length).setValues(data);
  }
}

// --------------------------- Утилиты --------------------------------

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function daysAgo_(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function fmt_(d, tz) {
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

function fmtRu_(d, tz) {
  return Utilities.formatDate(d, tz, 'dd.MM');
}

function fmtNum_(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function pct1_(x) {
  return (Math.round(x * 1000) / 10).toString().replace('.', ',') + '%';
}

/** Секунды → «45:30» или «1:02:03». */
function fmtDur_(s) {
  s = Math.round(Number(s) || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = x => (x < 10 ? '0' : '') + x;
  return h ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec);
}

/** ISO 8601 (PT1H2M3S) → секунды. */
function parseDuration_(iso) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || [];
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

function median_(arr) {
  const a = arr.filter(x => typeof x === 'number' && !isNaN(x)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function toast_(msg) {
  try { SpreadsheetApp.getActive().toast(msg, 'YouTube-трекер', 5); } catch (e) { /* запуск по расписанию */ }
}
