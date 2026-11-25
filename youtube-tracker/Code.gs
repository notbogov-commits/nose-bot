/**
 * YouTube-трекер для Google Таблицы.
 *
 * Что делает:
 *  - берёт все видео вашего канала и их статистику;
 *  - сравнивает просмотры за последние 7 дней с предыдущими 7 днями;
 *  - ставит каждому видео статус: растёт / стабильно / затухает / на стопе;
 *  - пишет сводку с подсказками;
 *  - ведёт историю, чтобы видеть прирост между обновлениями.
 *
 * Установка — см. ИНСТРУКЦИЯ.md рядом с этим файлом.
 */

// ===================== НАСТРОЙКИ (можно менять) =====================

/** Меньше стольких просмотров за 7 дней — видео считается «на стопе». */
const STOP_WEEKLY_VIEWS = 50;

/** Видео моложе стольких дней помечается как «новое» (рано судить). */
const NEW_DAYS = 7;

/** Порог «растёт»: просмотров за неделю больше, чем за прошлую, в столько раз. */
const GROW_RATIO = 1.2;

/** Порог «стабильно» (от этого значения до GROW_RATIO). Ниже — «затухает». */
const STABLE_RATIO = 0.8;

/** Ниже этого — «резко падает». */
const FADING_RATIO = 0.4;

/** Показывать приватные видео (false = только открытые и по ссылке). */
const INCLUDE_PRIVATE = false;

/** Во сколько часов обновлять таблицу каждый день (по времени таблицы). */
const DAILY_HOUR = 7;

/**
 * Данные аналитики YouTube приходят с задержкой ~2 дня,
 * поэтому неделя считается так: с (сегодня - 2 - 6) по (сегодня - 2).
 */
const ANALYTICS_LAG_DAYS = 2;

// ====================================================================

const SHEET_VIDEOS = 'Видео';
const SHEET_SUMMARY = 'Сводка';
const SHEET_HISTORY = 'История';

const STATUS = {
  NEW:      { label: '🆕 Новое',          color: '#e8eaf6' },
  GROW:     { label: '🚀 Растёт',         color: '#c8e6c9' },
  STABLE:   { label: '🟢 Стабильно',      color: '#e8f5e9' },
  FADING:   { label: '🟡 Затухает',       color: '#fff9c4' },
  DROPPING: { label: '🟠 Резко падает',   color: '#ffe0b2' },
  STOP:     { label: '🔴 На стопе',       color: '#ffcdd2' },
};

// ---------------------------- Меню ----------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 YouTube')
    .addItem('Обновить сейчас', 'updateAll')
    .addSeparator()
    .addItem('Включить ежедневное обновление', 'enableDailyUpdate')
    .addItem('Выключить ежедневное обновление', 'disableDailyUpdate')
    .addToUi();
}

/** Первый запуск: обновить данные и включить ежедневное обновление. */
function setup() {
  updateAll();
  enableDailyUpdate();
}

function enableDailyUpdate() {
  disableDailyUpdate();
  ScriptApp.newTrigger('updateAll').timeBased().everyDays(1).atHour(DAILY_HOUR).create();
  toast_('Ежедневное обновление включено (около ' + DAILY_HOUR + ':00).');
}

function disableDailyUpdate() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'updateAll')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

// ------------------------ Главная функция ---------------------------

function updateAll() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  toast_('Загружаю данные с YouTube…');

  const channel = getMyChannel_();
  const videos = getAllVideos_(channel.contentDetails.relatedPlaylists.uploads);

  // Периоды для аналитики
  const end = daysAgo_(ANALYTICS_LAG_DAYS);
  const p7 = { start: daysAgo_(ANALYTICS_LAG_DAYS + 6), end: end };
  const prev7 = { start: daysAgo_(ANALYTICS_LAG_DAYS + 13), end: daysAgo_(ANALYTICS_LAG_DAYS + 7) };
  const p28 = { start: daysAgo_(ANALYTICS_LAG_DAYS + 27), end: end };

  const a7 = getVideoAnalytics_(p7, tz, 'views');
  const aPrev = getVideoAnalytics_(prev7, tz, 'views');
  const a28 = getVideoAnalytics_(p28, tz, 'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained');

  const lastSnapshot = getLastSnapshot_(tz);
  const now = new Date();

  const rows = videos
    .filter(v => INCLUDE_PRIVATE || v.status.privacyStatus !== 'private')
    .map(v => {
      const id = v.id;
      const published = new Date(v.snippet.publishedAt);
      const seconds = parseDuration_(v.contentDetails.duration);
      const total = Number(v.statistics.viewCount || 0);
      const r = {
        id: id,
        title: v.snippet.title,
        type: seconds <= 180 ? 'Short' : 'Видео',
        privacy: v.status.privacyStatus,
        published: published,
        ageDays: Math.floor((now - published) / 86400000),
        total: total,
        sinceLast: lastSnapshot[id] != null ? total - lastSnapshot[id] : '',
        v7: (a7[id] && a7[id].views) || 0,
        prev7: (aPrev[id] && aPrev[id].views) || 0,
        v28: (a28[id] && a28[id].views) || 0,
        subs28: (a28[id] && a28[id].subscribersGained) || 0,
        avgPct: a28[id] ? a28[id].averageViewPercentage : '',
        likes: Number(v.statistics.likeCount || 0),
        comments: Number(v.statistics.commentCount || 0),
      };
      r.change = r.prev7 > 0 ? r.v7 / r.prev7 - 1 : '';
      r.status = getStatus_(r);
      return r;
    })
    .sort((a, b) => b.v7 - a.v7 || b.total - a.total);

  writeVideosSheet_(ss, rows);
  writeSummarySheet_(ss, channel, rows, p7, prev7, tz);
  appendHistory_(ss, rows, tz);

  toast_('Готово! Обновлено видео: ' + rows.length);
}

// --------------------------- Статусы --------------------------------

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

// --------------------------- YouTube API ----------------------------

function getMyChannel_() {
  const res = YouTube.Channels.list('snippet,statistics,contentDetails', { mine: true });
  if (!res.items || !res.items.length) {
    throw new Error('Канал не найден. Авторизуйтесь тем Google-аккаунтом (или каналом бренда), которому принадлежит канал.');
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

/** Возвращает { videoId: { metric: value, ... } } за период. */
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

// ------------------------- Лист «Видео» -----------------------------

function writeVideosSheet_(ss, rows) {
  const sh = getOrCreateSheet_(ss, SHEET_VIDEOS);
  sh.clear();
  if (sh.getFilter()) sh.getFilter().remove();

  const header = [
    'Статус', 'Название', 'Тип', 'Доступ', 'Опубликовано', 'Дней',
    'Всего просмотров', 'Прирост с прошлого обновления',
    'Просмотры 7 дн', 'Прошлые 7 дн', 'Изменение',
    'Просмотры 28 дн', 'Подписчики 28 дн', 'Ср. % досмотра (28 дн)',
    'Лайки', 'Комментарии',
  ];

  const data = rows.map(r => [
    r.status.label,
    '=HYPERLINK("https://youtu.be/' + r.id + '";"' + r.title.replace(/"/g, '""') + '")',
    r.type,
    r.privacy === 'public' ? 'открыто' : r.privacy === 'unlisted' ? 'по ссылке' : 'приватное',
    r.published,
    r.ageDays,
    r.total,
    r.sinceLast,
    r.v7,
    r.prev7,
    r.change,
    r.v28,
    r.subs28,
    r.avgPct === '' ? '' : r.avgPct / 100,
    r.likes,
    r.comments,
  ]);

  sh.getRange(1, 1, 1, header.length).setValues([header])
    .setFontWeight('bold').setBackground('#263238').setFontColor('#ffffff').setWrap(true);

  if (data.length) {
    sh.getRange(2, 1, data.length, header.length).setValues(data);
    sh.getRange(2, 5, data.length, 1).setNumberFormat('dd.MM.yyyy');
    [7, 8, 9, 10, 12, 13, 15, 16].forEach(c => sh.getRange(2, c, data.length, 1).setNumberFormat('#,##0'));
    sh.getRange(2, 8, data.length, 1).setNumberFormat('+#,##0;-#,##0;0');
    sh.getRange(2, 11, data.length, 1).setNumberFormat('+0%;-0%;0%');
    sh.getRange(2, 14, data.length, 1).setNumberFormat('0%');
    sh.getRange(2, 1, data.length, 1).setBackgrounds(rows.map(r => [r.status.color]));
    sh.getRange(1, 1, data.length + 1, header.length).createFilter();
  }

  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  sh.setColumnWidth(1, 130);
  sh.setColumnWidth(2, 360);
  sh.setColumnWidths(3, header.length - 2, 105);
  sh.setRowHeight(1, 42);
}

// ------------------------- Лист «Сводка» ----------------------------

function writeSummarySheet_(ss, channel, rows, p7, prev7, tz) {
  const sh = getOrCreateSheet_(ss, SHEET_SUMMARY);
  sh.clear();
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(1);

  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const v7 = sum(rows, r => r.v7);
  const vPrev = sum(rows, r => r.prev7);
  const chg = vPrev ? v7 / vPrev - 1 : 0;

  const out = [];
  const add = (a, b) => out.push([a, b === undefined ? '' : b]);

  add('📊 ' + channel.snippet.title);
  add('Обновлено', Utilities.formatDate(new Date(), tz, 'dd.MM.yyyy HH:mm'));
  add('Подписчиков', Number(channel.statistics.subscriberCount));
  add('Всего просмотров канала', Number(channel.statistics.viewCount));
  add('Просмотры за 7 дней (' + fmtRu_(p7.start, tz) + '–' + fmtRu_(p7.end, tz) + ')', v7);
  add('Прошлые 7 дней (' + fmtRu_(prev7.start, tz) + '–' + fmtRu_(prev7.end, tz) + ')', vPrev);
  add('Изменение за неделю', (chg >= 0 ? '+' : '') + Math.round(chg * 100) + '%');
  add('');

  add('СТАТУСЫ ВИДЕО');
  Object.keys(STATUS).forEach(k => {
    add(STATUS[k].label, rows.filter(r => r.status === STATUS[k]).length);
  });
  add('');

  add('💡 ПОДСКАЗКИ');
  buildHints_(rows, v7).forEach(h => add(h));
  add('');

  add('🏆 ТОП-5 ЗА НЕДЕЛЮ', 'просмотров за 7 дн');
  rows.slice(0, 5).forEach(r => add(r.title, r.v7));
  add('');

  add('ℹ️ Данные аналитики YouTube приходят с задержкой ~' + ANALYTICS_LAG_DAYS + ' дня.');
  add('Все видео и подробности — на листе «' + SHEET_VIDEOS + '». Фильтр по статусу — стрелочка в заголовке.');

  sh.getRange(1, 1, out.length, 2).setValues(out);
  sh.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  sh.getRange(1, 2, out.length, 1).setNumberFormat('#,##0').setHorizontalAlignment('left');
  out.forEach((row, i) => {
    const t = String(row[0]);
    if (/^(СТАТУСЫ|💡|🏆)/.test(t)) sh.getRange(i + 1, 1, 1, 2).setFontWeight('bold').setBackground('#eceff1');
    const st = Object.values(STATUS).find(s => s.label === t);
    if (st) sh.getRange(i + 1, 1).setBackground(st.color);
  });
  sh.setColumnWidth(1, 520);
  sh.setColumnWidth(2, 160);
  sh.getRange(1, 1, out.length, 1).setWrap(true);
}

function buildHints_(rows, totalV7) {
  const hints = [];
  const old = rows.filter(r => r.ageDays >= 30);

  // Что тянет канал
  if (rows.length && totalV7 > 0) {
    const top = rows[0];
    hints.push('• Канал сейчас тянет «' + top.title + '» — ' + Math.round(top.v7 / totalV7 * 100) +
      '% всех просмотров за неделю.');
  }

  // Ожившие старые видео
  old.filter(r => r.status === STATUS.GROW && r.v7 >= 200).slice(0, 3).forEach(r => {
    hints.push('• Старое видео снова набирает: «' + r.title + '» (' + fmtChange_(r) +
      '). Можно сделать продолжение, нарезку в Shorts или закрепить его.');
  });

  // Резко падающие
  rows.filter(r => r.status === STATUS.DROPPING && r.prev7 >= 1000).slice(0, 3).forEach(r => {
    hints.push('• «' + r.title + '» резко просело (' + fmtChange_(r) +
      '). Можно попробовать новую обложку или название.');
  });

  // Низкий досмотр у длинных видео
  rows.filter(r => r.type === 'Видео' && r.v28 >= 1000 && r.avgPct !== '' && r.avgPct < 30)
    .slice(0, 3).forEach(r => {
      hints.push('• У «' + r.title + '» досматривают в среднем только ' + Math.round(r.avgPct) +
        '%. Проверьте первые 30 секунд: зрители уходят рано.');
    });

  // Источник подписчиков
  const bySubs = rows.slice().sort((a, b) => b.subs28 - a.subs28)[0];
  if (bySubs && bySubs.subs28 > 0) {
    hints.push('• Больше всего подписчиков за 28 дней принесло «' + bySubs.title + '» (+' + bySubs.subs28 + ').');
  }

  // Shorts vs длинные
  const sV = rows.filter(r => r.type === 'Short').reduce((s, r) => s + r.v7, 0);
  const lV = rows.filter(r => r.type === 'Видео').reduce((s, r) => s + r.v7, 0);
  if (sV + lV > 0) {
    hints.push('• За неделю: длинные видео — ' + Math.round(lV / (sV + lV) * 100) + '% просмотров, Shorts — ' +
      Math.round(sV / (sV + lV) * 100) + '%.');
  }

  const stopped = rows.filter(r => r.status === STATUS.STOP).length;
  if (stopped) hints.push('• На стопе видео: ' + stopped + ' (меньше ' + STOP_WEEKLY_VIEWS + ' просмотров за неделю).');

  return hints.length ? hints : ['• Пока подсказок нет.'];
}

function fmtChange_(r) {
  return r.prev7 ? ((r.v7 / r.prev7 - 1) >= 0 ? '+' : '') + Math.round((r.v7 / r.prev7 - 1) * 100) +
    '% за неделю' : r.v7 + ' просмотров за неделю';
}

// ------------------------ Лист «История» ----------------------------

function appendHistory_(ss, rows, tz) {
  const sh = getOrCreateSheet_(ss, SHEET_HISTORY);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Дата', 'ID видео', 'Название', 'Всего просмотров', 'Просмотры 7 дн', 'Статус']);
    sh.getRange(1, 1, 1, 6).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  const today = fmt_(new Date(), tz);
  // Одна запись в день: если сегодня уже писали — удаляем старые строки за сегодня
  const last = sh.getLastRow();
  if (last > 1) {
    const dates = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
    let firstToday = -1;
    for (let i = dates.length - 1; i >= 0 && dates[i][0] === today; i--) firstToday = i;
    if (firstToday >= 0) sh.deleteRows(firstToday + 2, dates.length - firstToday);
  }
  const data = rows.map(r => [today, r.id, r.title, r.total, r.v7, r.status.label]);
  if (data.length) {
    sh.getRange(sh.getLastRow() + 1, 1, data.length, data[0].length).setValues(data);
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).setNumberFormat('@');
  }
}

/** Последний снимок до сегодняшнего дня: { videoId: totalViews }. */
function getLastSnapshot_(tz) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_HISTORY);
  if (!sh || sh.getLastRow() < 2) return {};
  const today = fmt_(new Date(), tz);
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues();
  let lastDate = null;
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i][0] !== today) { lastDate = values[i][0]; break; }
  }
  const out = {};
  if (!lastDate) return out;
  values.forEach(v => {
    if (v[0] === lastDate) out[v[1]] = Number(String(v[3]).replace(/[^\d]/g, ''));
  });
  return out;
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

/** ISO 8601 (PT1H2M3S) → секунды. */
function parseDuration_(iso) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || [];
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

function toast_(msg) {
  try { SpreadsheetApp.getActive().toast(msg, 'YouTube-трекер', 5); } catch (e) { /* запуск по расписанию */ }
}
