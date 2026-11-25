// ЮТУБЕРЫ — изометрическая квартира на холсте 640×400.
// Комната-«коробка» под углом: две стены и пол ромбом. Предметы — объёмные блоки, у каждого своё место.
// Каждое действие видно: съёмка (ютубер в кадре, горит REC), монтаж и публикация (ютубер за компьютером, на экране идёт работа).
(function () {
  'use strict';
  var W = 640, H = 410, INK = '#1f2338';
  var TW = 37, TH = 18.5, ZH = 32, OX = 283, OY = 108;   // размеры клетки и начало координат
  var RX = 9, RY = 7, WALL = 3.1;                      // размер комнаты в клетках и высота стен
  var ctx, now = 0;

  function P(x, y, z) { return [OX + (x - y) * TW, OY + (x + y) * TH - (z || 0) * ZH]; }
  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r * (1 - k)); g = Math.round(g * (1 - k)); b = Math.round(b * (1 - k));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function mix(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round((pa >> 16) * (1 - t) + (pb >> 16) * t), g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t), bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  function poly(pts, fill, lw) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (lw !== 0) { ctx.lineWidth = lw || 2.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  // Объёмный блок: x,y,z — угол, w,d,h — размеры по осям
  function box(x, y, z, w, d, h, c, lw) {
    poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], shade(c, 0.1), lw);
    poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], shade(c, 0.22), lw);
    poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], c, lw);
  }
  // 2D-помощники (для рисования на стенах и экранах)
  function shape(fill, lw) { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw || 3; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); }
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
  function line(pts, lw) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.lineWidth = lw || 3; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke(); }
  function seg(a, b, lw, col) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineWidth = lw || 3; ctx.strokeStyle = col || INK; ctx.lineCap = 'round'; ctx.stroke(); }
  // Рисование на правой стене (плоскость y=0) и левой (x=0). 1 пиксель картинки ≈ 0.018 клетки.
  var K = 0.018, VS = Math.hypot(TW, TH) * K;
  function onRightWall(x, z, fn) { var o = P(x, 0, z); ctx.save(); ctx.transform(TW * K, TH * K, 0, VS, o[0], o[1]); fn(); ctx.restore(); }
  function onLeftWall(y, z, fn) { var o = P(0, y, z); ctx.save(); ctx.transform(TW * K, -TH * K, 0, VS, o[0], o[1]); fn(); ctx.restore(); }
  // Экран на передней грани (x = const, смотрит на зрителя справа)
  function onScreenX(x, y, z, fn) { var o = P(x, y, z); ctx.save(); ctx.transform(-TW * K, TH * K, 0, VS, o[0], o[1]); fn(); ctx.restore(); }

  var APT = [
    { wallR: '#dfe7d8', wallL: '#cdd8c4', floor: '#d6c49e', grid: 'rgba(31,35,56,.10)', rug: '#c9b8f2' },
    { wallR: '#e6dff5', wallL: '#d4cbe9', floor: '#c49a6c', grid: 'rgba(31,35,56,.14)', rug: '#8fd3ff' },
    { wallR: '#cf8466', wallL: '#bb7258', floor: '#9aa3ae', grid: 'rgba(31,35,56,.14)', rug: '#ffc23d', brick: true },
    { wallR: '#e3ecf5', wallL: '#d0dbe8', floor: '#6b513e', grid: 'rgba(255,255,255,.10)', rug: '#ff8a3d', panel: true }
  ];
  var SKY = [[0, '#1d2550'], [5, '#1d2550'], [7, '#ffc9a3'], [9, '#9fd8ff'], [17, '#9fd8ff'], [19, '#ff9f80'], [21, '#1d2550'], [24, '#1d2550']];
  function skyAt(h) { for (var i = 0; i < SKY.length - 1; i++) if (h >= SKY[i][0] && h < SKY[i + 1][0]) return mix(SKY[i][1], SKY[i + 1][1], (h - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0])); return SKY[0][1]; }
  function darkness(h) { if (h >= 8 && h <= 18) return 0; if (h < 5 || h >= 21) return 1; if (h < 8) return (8 - h) / 3; return (h - 18) / 3; }

  function drawDecorRaw(theme, x, y) {
    switch (theme) {
      case 'games':
        rr(x + 10, y + 6, 100, 56, 12); shape('#2c3150');
        ctx.lineWidth = 4; ctx.strokeStyle = '#ff7ae0'; rr(x + 24, y + 18, 72, 32, 14); ctx.stroke();
        ctx.strokeStyle = '#7cf0ff'; line([x + 40, y + 28, x + 40, y + 40], 4); ctx.strokeStyle = '#7cf0ff'; ctx.beginPath(); ctx.moveTo(x + 34, y + 34); ctx.lineTo(x + 46, y + 34); ctx.stroke();
        circ(x + 76, y + 30, 3); ctx.fillStyle = '#7cf0ff'; ctx.fill(); circ(x + 82, y + 38, 3); ctx.fill();
        rr(x, y + 72, 120, 8, 3); shape('#a37b55', 2.5);
        break;
      case 'cooking':
        rr(x, y + 30, 120, 8, 3); shape('#a37b55', 2.5);
        [[x + 12, '#ff5d4f'], [x + 40, '#ffc23d'], [x + 68, '#2fbf94'], [x + 96, '#ff8a3d']].forEach(function (j) { rr(j[0], y + 8, 18, 22, 4); shape(j[1], 2.5); rr(j[0] - 1, y + 4, 20, 6, 2); shape('#fff', 2); });
        line([x + 30, y + 46, x + 30, y + 56], 2.5); circ(x + 30, y + 68, 12); shape('#c9d2de'); line([x + 80, y + 46, x + 80, y + 56], 2.5); circ(x + 80, y + 66, 9); shape('#c9d2de');
        break;
      case 'pranks':
        rr(x + 10, y + 2, 76, 74, 6); shape('#fff');
        circ(x + 48, y + 36, 22); shape('#ffc23d'); line([x + 38, y + 30, x + 44, y + 33, x + 38, y + 36], 2.5); line([x + 58, y + 30, x + 52, y + 33, x + 58, y + 36], 2.5);
        ctx.beginPath(); ctx.arc(x + 48, y + 42, 9, 0, Math.PI); shape('#c4453a', 2.5);
        rr(x + 96, y + 44, 26, 32, 4); shape('#7be0a8'); ctx.fillStyle = '#2fbf94'; ctx.fillRect(x + 98, y + 42, 22, 6);
        break;
      case 'tech':
        rr(x, y + 34, 120, 8, 3); shape('#a37b55', 2.5); rr(x, y + 74, 120, 8, 3); shape('#a37b55', 2.5);
        rr(x + 8, y + 12, 14, 22, 3); shape('#2c3150', 2.5); rr(x + 30, y + 16, 30, 18, 3); shape('#8fd3ff', 2.5); rr(x + 70, y + 8, 22, 26, 4); shape('#ffc23d', 2.5); rr(x + 98, y + 18, 16, 16, 8); shape('#c9d2de', 2.5);
        rr(x + 10, y + 52, 26, 22, 3); shape('#ff5d4f', 2.5); rr(x + 44, y + 56, 34, 18, 3); shape('#fff', 2.5); rr(x + 86, y + 50, 24, 24, 3); shape('#7c6cf2', 2.5);
        break;
      case 'truecrime':
        rr(x, y + 2, 122, 80, 6); shape('#c99b6b');
        [[x + 10, y + 10], [x + 48, y + 30], [x + 86, y + 12], [x + 20, y + 50], [x + 82, y + 50]].forEach(function (p) { rr(p[0], p[1], 24, 20, 2); shape('#fff', 2); });
        ctx.strokeStyle = '#ff5d4f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 22, y + 20); ctx.lineTo(x + 60, y + 40); ctx.lineTo(x + 98, y + 22); ctx.moveTo(x + 60, y + 40); ctx.lineTo(x + 32, y + 60); ctx.moveTo(x + 60, y + 40); ctx.lineTo(x + 94, y + 60); ctx.stroke();
        [[x + 22, y + 12], [x + 60, y + 32], [x + 98, y + 14], [x + 32, y + 52], [x + 94, y + 52]].forEach(function (p) { circ(p[0], p[1], 3); ctx.fillStyle = '#ff5d4f'; ctx.fill(); });
        break;
      case 'vlog':
        [[x + 4, y + 6, 40, 32, '#9fd8ff'], [x + 52, y + 2, 32, 40, '#ffc23d'], [x + 92, y + 10, 30, 28, '#2fbf94'], [x + 24, y + 48, 44, 30, '#ff8a3d'], [x + 78, y + 48, 36, 30, '#c9b8f2']].forEach(function (f) {
          rr(f[0], f[1], f[2], f[3], 3); shape('#fff', 2.5); rr(f[0] + 4, f[1] + 4, f[2] - 8, f[3] - 8, 2); shape(f[4], 2);
        });
        break;
      case 'music':
        for (var i = 0; i < 3; i++) for (var j = 0; j < 2; j++) { rr(x + 4 + i * 26, y + 4 + j * 26, 22, 22, 3); shape(i % 2 === j % 2 ? '#5b6180' : '#7a809c', 2); }
        ctx.save(); ctx.translate(x + 104, y + 44); ctx.rotate(0.25);
        rr(-3, -42, 6, 44, 2); shape('#6b4a2d', 2.5); ctx.beginPath(); ctx.ellipse(0, 12, 14, 18, 0, 0, Math.PI * 2); shape('#ff8a3d'); circ(0, 8, 5); shape('#2c3150', 2);
        ctx.restore();
        break;
      case 'science':
        rr(x + 4, y + 2, 64, 60, 4); shape('#fff');
        for (var a = 0; a < 4; a++) for (var b = 0; b < 4; b++) { ctx.fillStyle = ['#ffd3cf', '#d9f5ea', '#dff1ff', '#fff0c2'][(a + b) % 4]; ctx.fillRect(x + 10 + a * 14, y + 8 + b * 13, 11, 10); }
        rr(x + 76, y + 50, 46, 8, 3); shape('#a37b55', 2.5);
        ctx.beginPath(); ctx.moveTo(x + 86, y + 24); ctx.lineTo(x + 86, y + 34); ctx.lineTo(x + 78, y + 50); ctx.lineTo(x + 102, y + 50); ctx.lineTo(x + 94, y + 34); ctx.lineTo(x + 94, y + 24); ctx.closePath(); shape('#7be0a8', 2.5);
        rr(x + 106, y + 28, 10, 22, 4); shape('#ff8a3d', 2.5);
        break;
      case 'fitness':
        rr(x + 4, y + 60, 116, 8, 3); shape('#5b6180', 2.5);
        [x + 14, x + 52, x + 90].forEach(function (dx, i) { line([dx, y + 52, dx + 22, y + 52], 3); rr(dx - 6, y + 42 - i * 2, 8, 20 + i * 4, 2); shape('#ff5d4f', 2); rr(dx + 20, y + 42 - i * 2, 8, 20 + i * 4, 2); shape('#ff5d4f', 2); });
        circ(x + 60, y + 18, 15); shape('#fff'); line([x + 60, y + 18, x + 60, y + 9], 2.5); line([x + 60, y + 18, x + 67, y + 21], 2.5);
        break;
      case 'asmr':
        rr(x, y + 44, 120, 8, 3); shape('#a37b55', 2.5);
        [[x + 20, '#2fbf94'], [x + 60, '#7be0a8'], [x + 100, '#2fbf94']].forEach(function (p, i) {
          rr(p[0] - 10, y + 28, 20, 16, 4); shape('#e9c79f', 2.5);
          ctx.beginPath(); ctx.ellipse(p[0] - 6, y + 18 - i * 2, 6, 11, -0.4, 0, Math.PI * 2); shape(p[1], 2.5);
          ctx.beginPath(); ctx.ellipse(p[0] + 6, y + 18 - i * 2, 6, 11, 0.4, 0, Math.PI * 2); shape(p[1], 2.5);
        });
        for (var q = 0; q < 4; q++) { rr(x + 4 + q * 30, y + 62, 26, 20, 8); shape('#c9b8f2', 2); }
        break;
    }
  }

  function onPlaneY(x, y, z, fn) { var o = P(x, y, z); ctx.save(); ctx.transform(TW * K, TH * K, 0, VS, o[0], o[1]); fn(); ctx.restore(); }
  function onPlaneX(x, y, z, fn) { var o = P(x, y, z); ctx.save(); ctx.transform(TW * K, -TH * K, 0, VS, o[0], o[1]); fn(); ctx.restore(); }

  /* ---------- Персонажи ---------- */
  // Человечек в мультяшном стиле. (fx, fy) — точка на полу под ногами.
  function chibi(fx, fy, o) {
    var s = o.scale || 1;
    ctx.save(); ctx.translate(fx, fy + (o.bob || 0)); ctx.scale(s, s);
    if (!o.seated) {
      rr(-9, -16, 8, 16, 3); shape(o.pants || '#3a3f5c', 2.2);
      rr(1, -16, 8, 16, 3); shape(o.pants || '#3a3f5c', 2.2);
    }
    var by = o.seated ? -6 : -14;
    // руки
    var a = o.wave ? Math.sin(now * 9) * 0.5 : 0;
    ctx.save(); ctx.translate(-10, by - 20); ctx.rotate(0.25 + (o.back ? 0 : a)); rr(-3.5, 0, 7, 18, 3.5); shape(o.shirt, 2.2); ctx.restore();
    ctx.save(); ctx.translate(10, by - 20); ctx.rotate(-0.25 - (o.back ? 0 : a * 0.7) - (o.phone ? 0.9 : 0)); rr(-3.5, 0, 7, 18, 3.5); shape(o.shirt, 2.2); ctx.restore();
    rr(-11, by - 24, 22, 26, 9); shape(o.shirt, 2.5);
    if (o.lav && !o.back) { circ(5, by - 18, 2.2); shape('#2c3150', 1.5); }
    if (o.phone) { rr(10, by - 28, 7, 11, 2); shape('#2c3150', 1.8); }
    // голова
    var hy = by - 36;
    circ(0, hy, 13); shape(o.skin, 2.5);
    if (o.back) { circ(0, hy, 13); shape(o.hair, 2.5); }
    else {
      ctx.beginPath(); ctx.arc(0, hy - 2, 13, Math.PI * 1.02, Math.PI * 1.98); ctx.quadraticCurveTo(0, hy - 7, -13, hy - 3); ctx.closePath(); shape(o.hair, 2.2);
      ctx.fillStyle = INK;
      var bl = (now + (o.seed || 0)) % 4 < 0.12 ? 0.2 : 1;
      ctx.beginPath(); ctx.ellipse(-4.5, hy + 1, 1.7, 2.2 * bl, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4.5, hy + 1, 1.7, 2.2 * bl, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,120,120,.35)'; circ(-8, hy + 5, 2.4); ctx.fill(); circ(8, hy + 5, 2.4); ctx.fill();
      ctx.lineWidth = 1.8; ctx.strokeStyle = INK; ctx.lineCap = 'round';
      if (o.talk) { ctx.beginPath(); ctx.ellipse(0, hy + 7, 2.4, 1.6 + Math.abs(Math.sin(now * 14)) * 1.6, 0, 0, Math.PI * 2); ctx.fillStyle = '#c4453a'; ctx.fill(); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(0, hy + 5, 3.2, 0.25, Math.PI - 0.25); ctx.stroke(); }
    }
    hat(o.hat, hy);
    ctx.restore();
  }
  function hat(h, hy) {
    if (!h) return;
    ctx.save(); ctx.translate(0, hy);
    if (h === 'cooking') { rr(-9, -20, 18, 8, 2); shape('#fff', 2); circ(-5, -22, 5); shape('#fff', 2); circ(5, -22, 5); shape('#fff', 2); circ(0, -25, 6); shape('#fff', 2); }
    else if (h === 'games' || h === 'music' || h === 'asmr') {
      var c = h === 'games' ? '#7c6cf2' : h === 'music' ? '#ff5d4f' : '#c9b8f2';
      ctx.beginPath(); ctx.arc(0, -1, 15, Math.PI * 1.1, Math.PI * 1.9); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      rr(-17, -5, 5, 9, 2); shape(c, 2); rr(12, -5, 5, 9, 2); shape(c, 2);
    } else if (h === 'fitness') { rr(-13, -9, 26, 5, 2); shape('#ff5d4f', 2); }
    else if (h === 'science') { rr(-10, -11, 8, 5, 2); shape('#8fd3ff', 1.8); rr(2, -11, 8, 5, 2); shape('#8fd3ff', 1.8); }
    else if (h === 'truecrime') { ctx.beginPath(); ctx.ellipse(0, -11, 17, 3.5, 0, 0, Math.PI * 2); shape('#6b5a46', 2); rr(-9, -21, 18, 10, 4); shape('#6b5a46', 2); }
    else if (h === 'pranks') { ctx.beginPath(); ctx.arc(0, -6, 13, Math.PI, 0); ctx.closePath(); shape('#ffc23d', 2); rr(0, -8, 17, 4, 2); shape('#ffc23d', 2); }
    ctx.restore();
  }

  /* ---------- Стены и пол ---------- */
  function drawShell(home, hour) {
    var A = APT[home];
    poly([P(0, RY, 0), P(0, 0, 0), P(0, 0, WALL), P(0, RY, WALL)], A.wallL);
    poly([P(0, 0, 0), P(RX, 0, 0), P(RX, 0, WALL), P(0, 0, WALL)], A.wallR);
    if (A.brick) {
      [[onRightWall, 0, RX], [onLeftWall, RY, RY]].forEach(function (w, wi) {
        w[0](w[1], WALL, function () {
          var len = w[2] / K * (wi ? 1 : 1), hpx = WALL * ZH / VS;
          ctx.strokeStyle = 'rgba(31,35,56,.16)'; ctx.lineWidth = 1.2;
          for (var y = 9; y < hpx; y += 9) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(len * 0.0 + w[2] / K, y); ctx.stroke(); for (var x = (y / 9) % 2 ? 0 : 11; x < w[2] / K; x += 22) { ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x, y); ctx.stroke(); } }
        });
      });
    }
    if (A.panel) {
      onLeftWall(RY, WALL, function () { ctx.fillStyle = 'rgba(169,128,88,.55)'; ctx.fillRect(0, 0, RY / K, WALL * ZH / VS); ctx.strokeStyle = 'rgba(31,35,56,.18)'; ctx.lineWidth = 1.2; for (var x = 18; x < RY / K; x += 18) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 200); ctx.stroke(); } });
    }
    // плинтус
    seg(P(0, RY, 0.12), P(0, 0, 0.12), 2, 'rgba(31,35,56,.35)'); seg(P(0, 0, 0.12), P(RX, 0, 0.12), 2, 'rgba(31,35,56,.35)');
    // пол
    poly([P(0, 0, 0), P(RX, 0, 0), P(RX, RY, 0), P(0, RY, 0)], A.floor);
    ctx.strokeStyle = A.grid; ctx.lineWidth = 1.2;
    for (var i = 1; i < RX; i++) seg(P(i, 0, 0), P(i, RY, 0), 1.2, A.grid);
    for (var j = 1; j < RY; j++) seg(P(0, j, 0), P(RX, j, 0), 1.2, A.grid);
    poly([P(0, 0, 0), P(RX, 0, 0), P(RX, RY, 0), P(0, RY, 0)], null);
    // верхняя кромка стен
    seg(P(0, RY, WALL), P(0, 0, WALL), 4); seg(P(0, 0, WALL), P(RX, 0, WALL), 4);
    seg(P(0, 0, 0), P(0, 0, WALL), 2.5);
  }

  function drawWindow(home, hour) {
    var big = home >= 3, x0 = big ? 4.3 : 4.7, wpx = big ? 160 : 126, hpx = big ? 104 : 76, z0 = big ? 2.95 : 2.8;
    var sky = skyAt(hour), night = darkness(hour);
    onRightWall(x0, z0, function () {
      rr(0, 0, wpx, hpx, 5); shape(sky, 3);
      var t = ((hour - 6 + 24) % 24) / 12;
      if (hour >= 6 && hour < 19) { circ(14 + (wpx - 28) * Math.min(1, t), 16 + Math.abs(t - 0.5) * 22, 7); ctx.fillStyle = '#fff6d6'; ctx.fill(); }
      else { circ(wpx - 18, 16, 6); ctx.fillStyle = '#f4f1d0'; ctx.fill(); ctx.fillRect(wpx * 0.2, hpx * 0.25, 2, 2); ctx.fillRect(wpx * 0.45, hpx * 0.12, 2, 2); ctx.fillRect(wpx * 0.6, hpx * 0.35, 2, 2); }
      if (home >= 2) {
        [[0.02, 0.45], [0.16, 0.3], [0.3, 0.6], [0.47, 0.4], [0.63, 0.66], [0.79, 0.36], [0.9, 0.5]].forEach(function (b, i) {
          var bx = wpx * b[0], bw = wpx * 0.12, bh = hpx * b[1];
          ctx.fillStyle = night > 0.5 ? '#2c3150' : '#86aecf'; ctx.fillRect(bx, hpx - bh, bw, bh);
          if (night > 0.5) { ctx.fillStyle = '#ffd86b'; for (var k = 0; k < 4; k++) if ((i + k) % 2) ctx.fillRect(bx + 3 + (k % 2) * 6, hpx - bh + 4 + Math.floor(k / 2) * 8, 3, 4); }
        });
      }
      ctx.lineWidth = 3; ctx.strokeStyle = home >= 3 ? '#d9b56a' : '#fff'; rr(2, 2, wpx - 4, hpx - 4, 4); ctx.stroke();
      var cols = big ? 3 : 2;
      for (var c = 1; c < cols; c++) line([wpx * c / cols, 0, wpx * c / cols, hpx], 2.5);
      rr(0, 0, wpx, hpx, 5); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      rr(-5, hpx, wpx + 10, 6, 2); shape(home >= 3 ? '#d9b56a' : '#f4f6fb', 2);
    });
  }

  function drawArt(home) {
    rr(14, 6, 90, 64, 4); shape(home >= 3 ? '#d9b56a' : '#fff');
    rr(22, 14, 74, 48, 2); shape('#d9f5ea', 2);
    ctx.beginPath(); ctx.moveTo(22, 62); ctx.lineTo(48, 32); ctx.lineTo(64, 48); ctx.lineTo(76, 38); ctx.lineTo(96, 62); ctx.closePath(); shape('#2fbf94', 2);
    circ(80, 24, 6); ctx.fillStyle = '#ffc23d'; ctx.fill();
  }

  function drawAwards(ms, MS) {
    var colors = ['#e5a46b', '#c9d2de', '#ffc23d', '#8fd3ff', '#ff5d4f'];
    onLeftWall(4.45, 3.12, function () {
      for (var i = 0; i < 5; i++) {
        var x = i * 42;
        if (i >= ms.length) { rr(x, 0, 34, 42, 5); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.8; ctx.strokeStyle = 'rgba(31,35,56,.28)'; ctx.stroke(); ctx.setLineDash([]); continue; }
        rr(x, 0, 34, 42, 5); shape(colors[i], 2.4);
        rr(x + 5, 5, 24, 17, 4); shape('#fff', 2);
        ctx.beginPath();
        for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? 3 : 6.5; ctx.lineTo(x + 17 + Math.cos(a) * rad, 13.5 + Math.sin(a) * rad); }
        ctx.closePath(); ctx.fillStyle = INK; ctx.fill();
        var v = MS[i]; ctx.font = '700 10px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = INK;
        ctx.fillText(v >= 1e6 ? '1M' : v >= 1000 ? (v / 1000) + 'K' : v, x + 17, 36);
      }
    });
  }

  /* ---------- Предметы ---------- */
  // Содержимое экрана: 52×32 пикселя
  function screenContent(mode, i, opt) {
    rr(0, 0, 52, 32, 2); shape(mode === 'off' ? '#2c3150' : '#20264a', 1.5);
    if (mode === 'off') return;
    if (mode === 'editor') {
      ctx.fillStyle = '#7c6cf2'; ctx.fillRect(2, 2, 48, 28);
      circ(26, 14, 7); shape('#c99b74', 1.5); ctx.beginPath(); ctx.arc(26, 12, 7, Math.PI, 0); ctx.closePath(); shape('#1f2338', 1.2);
      rr(17, 21, 18, 9, 4); shape('#ffc23d', 1.5);
      circ(46, 6, 2.5); ctx.fillStyle = '#2fbf94'; ctx.fill();
      return;
    }
    if (mode === 'edit') {
      [['#ff5d4f', 4, 6, 20], ['#ffc23d', 26, 6, 14], ['#2fbf94', 8, 13, 26], ['#7c6cf2', 4, 20, 16], ['#8fd3ff', 22, 20, 22]].forEach(function (b) { ctx.fillStyle = b[0]; ctx.fillRect(b[1], b[2], b[3], 5); });
      var ph = 4 + ((now * 22 + i * 9) % 44); ctx.fillStyle = '#fff'; ctx.fillRect(ph, 3, 1.5, 26);
      return;
    }
    if (mode === 'upload') {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(26, 5); ctx.lineTo(33, 13); ctx.lineTo(29, 13); ctx.lineTo(29, 19); ctx.lineTo(23, 19); ctx.lineTo(23, 13); ctx.lineTo(19, 13); ctx.closePath(); ctx.fill();
      rr(6, 23, 40, 5, 2); ctx.fillStyle = '#3a3f5c'; ctx.fill(); rr(6, 23, Math.max(2, 40 * (opt.upProgress || 0)), 5, 2); ctx.fillStyle = '#2fbf94'; ctx.fill();
      return;
    }
    // канал: сетка превью
    for (var r = 0; r < 2; r++) for (var c = 0; c < 3; c++) { ctx.fillStyle = ['#ff5d4f', '#ffc23d', '#2fbf94', '#7c6cf2', '#8fd3ff', '#ff8a3d'][(r * 3 + c + i) % 6]; ctx.fillRect(4 + c * 16, 5 + r * 13, 13, 8); }
  }

  function drawDesk(S, opt, home) {
    var dc = home >= 2 ? '#3a3f5c' : '#e3bf91';
    // ножки и столешница
    box(0.15, 1.0, 0, 0.12, 0.12, 0.95, dc, 2); box(0.15, 3.68, 0, 0.12, 0.12, 0.95, dc, 2);
    box(1.15, 1.0, 0, 0.12, 0.12, 0.95, dc, 2); box(1.15, 3.68, 0, 0.12, 0.12, 0.95, dc, 2);
    box(0.12, 0.95, 0.95, 1.2, 2.9, 0.1, dc);
    var pc = S.gear.pc, mode = opt.uploading ? 'upload' : opt.editing ? 'edit' : 'idle';
    var mons = pc === 0 ? [] : pc === 1 ? [[1.85, 0.95]] : pc === 2 ? [[1.25, 0.95], [2.45, 0.95]] : [[1.1, 0.8], [2.0, 0.8], [2.9, 0.8]];
    if (pc === 0) { // ноутбук
      box(0.55, 1.9, 1.05, 0.45, 0.8, 0.04, '#c9d2de', 2);
      box(0.42, 1.9, 1.05, 0.06, 0.8, 0.5, '#c9d2de', 2);
      onPlaneX(0.48, 2.65, 1.5, function () { ctx.save(); ctx.scale(0.75, 0.75); screenContent(mode, 0, opt); ctx.restore(); });
    }
    mons.forEach(function (m, i) {
      var y0 = m[0], w = m[1];
      box(0.38, y0 + w / 2 - 0.1, 1.05, 0.2, 0.2, 0.18, '#2c3150', 2);
      box(0.3, y0, 1.2, 0.1, w, 0.62, '#2c3150', 2);
      var content = (S.staff.ed > 0 && i === 0 && (opt.editing || opt.edOnline)) ? 'editor' : mode;
      onPlaneX(0.4, y0 + w - 0.05, 1.78, function () { ctx.save(); ctx.scale((w - 0.1) / K / 52, 0.52 * ZH / VS / 32); screenContent(content, i, opt); ctx.restore(); });
    });
    // клавиатура
    box(0.75, 1.9, 1.05, 0.3, 0.9, 0.04, pc >= 2 ? '#7c6cf2' : '#f4f6fb', 1.8);
    // облако над столом во время загрузки
    if (opt.uploading) {
      var c = P(0.6, 2.3, 2.35 + Math.sin(now * 4) * 0.05);
      ctx.save(); ctx.translate(c[0], c[1]);
      ctx.beginPath(); ctx.arc(-8, 2, 7, Math.PI * 0.5, Math.PI * 1.5); ctx.arc(0, -4, 9, Math.PI, 0); ctx.arc(9, 2, 7, Math.PI * 1.5, Math.PI * 0.5); ctx.closePath(); shape('#fff', 2.2);
      ctx.fillStyle = '#2fbf94'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(2, 0); ctx.lineTo(2, 5); ctx.lineTo(-2, 5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (opt.sinceUpload < 1.4) { // новое видео вышло
      var b = P(0.6, 2.3, 2.6 + opt.sinceUpload * 0.4);
      ctx.globalAlpha = Math.max(0, 1 - opt.sinceUpload / 1.4);
      rr(b[0] - 16, b[1] - 12, 32, 22, 7); shape('#ff5d4f', 2.2);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(b[0] - 4, b[1] - 6); ctx.lineTo(b[0] + 6, b[1] - 1); ctx.lineTo(b[0] - 4, b[1] + 4); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawTower(pc) {
    if (pc === 0) return;
    if (pc === 3) { box(0.15, 4.1, 0, 0.75, 0.8, 1.9, '#2c3150'); onPlaneX(0.9, 4.88, 1.8, function () { for (var i = 0; i < 6; i++) { ctx.fillStyle = '#3a3f5c'; ctx.fillRect(4, 4 + i * 13, 34, 9); circ(32, 8.5 + i * 13, 2); ctx.fillStyle = Math.sin(now * 6 + i) > 0 ? '#2fbf94' : '#1b6e55'; ctx.fill(); } }); return; }
    box(1.4, 3.3, 0, 0.32, 0.5, 0.75 + pc * 0.1, '#2c3150');
    var p = P(1.72, 3.55, 0.6); circ(p[0], p[1], 2.5); ctx.fillStyle = Math.sin(now * 6) > 0 ? '#2fbf94' : '#1b6e55'; ctx.fill();
  }

  function drawChair(withHost, S) {
    box(1.65, 2.15, 0, 0.1, 0.1, 0.45, '#5b6180', 1.8);
    box(1.4, 1.9, 0.45, 0.6, 0.6, 0.14, '#5b6180', 2);
    if (withHost) {
      var p = P(1.7, 2.2, 0.5);
      chibi(p[0], p[1], { seated: true, back: true, skin: '#ffd9b8', shirt: '#ff5d4f', hair: '#3b2a22', hat: withHost.hat, bob: Math.sin(now * 6) * 0.8 });
    }
    box(1.95, 1.9, 0.45, 0.12, 0.6, 0.75, '#5b6180', 2);
  }

  function drawBookshelf(net) {
    box(7.3, 0.08, 0, 1.5, 0.5, 2.3, '#e3bf91');
    onPlaneY(7.3, 0.58, 2.25, function () {
      ctx.fillStyle = '#c99b6b';
      [42, 84].forEach(function (y) { ctx.fillRect(0, y, 83, 4); });
      var cols = ['#ff5d4f', '#7c6cf2', '#2fbf94', '#ffc23d', '#8fd3ff', '#ff8a3d'];
      for (var r = 0; r < 3; r++) for (var i = 0; i < 6; i++) { if ((i + r) % 4 === 3) continue; rr(6 + i * 12, 14 + r * 42, 9, 26, 1.5); shape(cols[(i + r * 2) % 6], 1.5); }
    });
    // роутер на шкафу
    box(7.6, 0.18, 2.3, 0.55, 0.3, 0.12, '#f4f6fb', 2);
    var p = P(7.9, 0.48, 2.36);
    for (var i = 0; i <= net; i++) { circ(p[0] - 6 + i * 5, p[1] - 1, 1.6); ctx.fillStyle = Math.sin(now * (5 + i * 3)) > 0 ? '#2fbf94' : '#c9d2de'; ctx.fill(); }
    var a = P(7.65, 0.25, 2.42), b = P(8.1, 0.25, 2.42);
    if (net >= 1) seg(a, [a[0] - 2, a[1] - 14], 2.2);
    if (net >= 2) seg(b, [b[0] + 2, b[1] - 14], 2.2);
    if (net >= 3) { var d = P(7.9, 0.3, 2.9); ctx.beginPath(); ctx.ellipse(d[0], d[1], 12, 7, -0.4, 0, Math.PI * 2); shape('#c9d2de', 2); seg(d, [d[0] + 4, d[1] + 12], 2); }
  }

  function drawPlant(x, y) {
    box(x, y, 0, 0.45, 0.45, 0.45, '#e5a46b', 2);
    var p = P(x + 0.22, y + 0.22, 0.45);
    [[-7, -14, -0.5], [7, -14, 0.5], [0, -20, 0], [-11, -8, -1], [11, -8, 1]].forEach(function (l) { ctx.beginPath(); ctx.ellipse(p[0] + l[0], p[1] + l[1], 5, 11, l[2], 0, Math.PI * 2); shape('#2fbf94', 2); });
  }

  function drawCouch(home) {
    var c = home >= 3 ? '#7c6cf2' : '#ff8a3d';
    box(8.0, 2.7, 0, 0.9, 2.6, 0.45, c);
    box(8.55, 2.7, 0.45, 0.35, 2.6, 0.5, c);
    box(8.0, 2.55, 0, 0.9, 0.2, 0.75, c); box(8.0, 5.3, 0, 0.9, 0.2, 0.75, c);
  }

  function drawRug(home) {
    poly([P(2.7, 0.9, 0), P(6.0, 0.9, 0), P(6.0, 3.5, 0), P(2.7, 3.5, 0)], APT[home].rug, 2);
    poly([P(3.0, 1.15, 0), P(5.7, 1.15, 0), P(5.7, 3.25, 0), P(3.0, 3.25, 0)], null, 1.5);
  }

  // Свет: пара стоек по бокам от места съёмки
  function drawLight(x, y, tier, on) {
    if (tier === 0) return;
    var f = P(x, y, 0), h = tier === 1 ? 46 : 78, top = [f[0], f[1] - h];
    seg([f[0] - 9, f[1] + 3], top, 2.5); seg([f[0] + 9, f[1] + 3], top, 2.5); seg([f[0], f[1] + 6], top, 2.5);
    ctx.save(); ctx.translate(top[0], top[1]);
    var glow = on ? '#fffbe0' : '#f4f1e4';
    if (tier === 1) { ctx.beginPath(); ctx.moveTo(-9, 2); ctx.lineTo(9, 2); ctx.lineTo(5, -10); ctx.lineTo(-5, -10); ctx.closePath(); shape('#ffc23d', 2.2); }
    else if (tier === 2) { circ(0, -12, 13); ctx.lineWidth = 6; ctx.strokeStyle = glow; ctx.stroke(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; circ(0, -12, 16); ctx.stroke(); circ(0, -12, 10); ctx.stroke(); }
    else { var w = tier === 4 ? 34 : 28, hh = tier === 4 ? 28 : 24; rr(-w / 2, -hh - 4, w, hh, 4); shape(glow, 2.4); if (tier === 4) { seg([-w / 2, -hh - 4], [-w / 2 - 6, -hh - 12], 2); seg([w / 2, -hh - 4], [w / 2 + 6, -hh - 12], 2); } }
    ctx.restore();
  }

  function drawMic(tier) {
    if (tier < 2) return;
    var f = P(5.0, 2.55, 0);
    if (tier === 4) {
      var top = [f[0], f[1] - 74];
      seg([f[0] - 8, f[1] + 3], [f[0], f[1] - 4], 2.5); seg([f[0] + 8, f[1] + 3], [f[0], f[1] - 4], 2.5);
      seg([f[0], f[1]], top, 2.5); seg(top, [top[0] - 22, top[1] + 10], 2.5);
      ctx.save(); ctx.translate(top[0] - 24, top[1] + 10); ctx.rotate(0.4); rr(-5, -2, 10, 20, 5); shape('#2c3150', 2); ctx.restore();
      return;
    }
    var mt = [f[0], f[1] - 56];
    seg([f[0] - 8, f[1] + 3], [f[0], f[1] - 4], 2.5); seg([f[0] + 8, f[1] + 3], [f[0], f[1] - 4], 2.5); seg([f[0], f[1]], mt, 2.5);
    if (tier === 2) { rr(mt[0] - 4, mt[1] - 14, 8, 15, 4); shape('#c9d2de', 2); }
    else { circ(mt[0], mt[1] - 4, 8); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); rr(mt[0] - 5, mt[1] - 18, 10, 20, 5); shape('#ffc23d', 2); }
  }

  // Камера на штативе смотрит на ютубера; нам видна её задняя сторона с экраном
  function drawCamera(tier, rec) {
    var f = P(6.0, 4.5, 0), top = [f[0], f[1] - 44];
    seg([f[0] - 13, f[1] + 4], top, 2.5); seg([f[0] + 13, f[1] + 4], top, 2.5); seg([f[0] + 2, f[1] + 9], top, 2.5);
    var sizes = [[0.1, 0.32, 0.5], [0.3, 0.3, 0.3], [0.5, 0.36, 0.34], [0.7, 0.44, 0.44], [0.85, 0.5, 0.54]][tier];
    var x = 6.0 - sizes[0] / 2, y = 4.5 - sizes[1] / 2, z = 1.45;
    if (tier === 1) { var c = P(6.0, 4.5, 1.6); circ(c[0], c[1], 10); shape('#f4f6fb', 2.4); circ(c[0] - 3, c[1] - 2, 4); shape('#2c3150', 2); return; }
    box(x, y, z, sizes[0], sizes[1], sizes[2], tier >= 3 ? '#3a3f5c' : '#2c3150');
    // экран на задней стороне
    onPlaneX(x + sizes[0], y + sizes[1] - 0.04, z + sizes[2] - 0.04, function () {
      var sw = (sizes[1] - 0.08) / K, sh = (sizes[2] - 0.08) * ZH / VS;
      rr(0, 0, sw, sh, 2); shape('#9fd8ff', 1.5);
      circ(sw / 2, sh * 0.58, Math.min(sw, sh) * 0.26); shape('#ffd9b8', 1.2);
    });
    var tally = P(x + sizes[0], y + 0.05, z + sizes[2] + 0.06);
    circ(tally[0], tally[1], 3); ctx.fillStyle = rec && Math.sin(now * 8) > 0 ? '#ff5d4f' : '#5b6180'; ctx.fill();
    if (tier === 4) { box(x - 0.05, y + 0.05, z + sizes[2], 0.3, sizes[1] - 0.1, 0.14, '#ffc23d', 2); }
    if (tier >= 3) { box(x + sizes[0] - 0.15, y + sizes[1] + 0.02, z + sizes[2] - 0.05, 0.08, 0.35, 0.25, '#2c3150', 2); }
  }

  /* ---------- Главная функция ---------- */
  function draw(c, S, L, t, opt) {
    ctx = c; now = t;
    ctx.fillStyle = '#eef3f8'; ctx.fillRect(0, 0, W, H);
    if (!S.channels.length) return;
    var clk = L.clock(S), hour = clk.hour + clk.minute / 60, dark = darkness(hour), home = S.home;
    var ch1 = S.channels[0].theme, ch2 = S.channels[1] && S.channels[1].theme;

    drawShell(home, hour);
    drawWindow(home, hour);
    onRightWall(1.25, 2.75, function () { drawDecorRaw(ch1, 0, 0); });
    onLeftWall(6.6, 2.45, function () { if (ch2) drawDecorRaw(ch2, 0, 0); else drawArt(home); });
    drawAwards(S.milestones, L.MILESTONES);
    drawRug(home);

    var atDesk = !opt.atJob && opt.selfDesk;
    var onSet = !opt.atJob && !atDesk;
    var items = [];
    function add(d, fn) { items.push([d, fn]); }
    add(3.1, function () { drawDesk(S, opt, home); });
    add(5.2, function () { drawTower(S.gear.pc); });
    add(4.2, function () { drawChair(atDesk ? { hat: ch1 } : null, S); });
    add(7.9, function () { drawBookshelf(S.gear.net); });
    if (home >= 1) add(9.2, function () { drawPlant(8.2, 0.9); });
    if (home >= 1) add(2.0, function () { drawPlant(0.25, 0.2); });
    if (home >= 2) add(12.0, function () { drawCouch(home); });
    add(4.1, function () { drawLight(3.0, 1.1, S.gear.light, opt.recording); });
    add(6.7, function () { drawLight(5.6, 1.1, S.gear.light, opt.recording); });
    if (onSet) add(6.15, function () {
      var p = P(4.25, 1.9, 0);
      chibi(p[0], p[1], { skin: '#ffd9b8', shirt: '#ff5d4f', hair: '#3b2a22', hat: ch1, lav: S.gear.mic === 1, talk: opt.recording, wave: opt.recording, bob: opt.recording ? Math.sin(now * 9) * 1.5 : Math.sin(now * 2) * 0.6, seed: 1 });
    });
    add(7.55, function () { drawMic(S.gear.mic); });
    add(10.5, function () { drawCamera(S.gear.cam, opt.recording); });
    if (S.staff.op > 0) add(12.1, function () { var p = P(6.75, 5.3, 0); chibi(p[0], p[1], { skin: '#f1c8a0', shirt: '#ff8a3d', hair: '#1f2338', back: true, bob: Math.sin(now * 3 + 1) * 0.8, seed: 2 }); });
    if (S.staff.mg > 0) add(7.2, function () { var p = P(1.6, 5.6, 0); chibi(p[0], p[1], { skin: '#c99b74', shirt: '#2fbf94', hair: '#8a4b2d', phone: true, talk: Math.sin(now * 0.8) > 0.3, bob: Math.sin(now * 3 + 3) * 0.8, seed: 3 }); });
    items.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (it) { it[1](); });

    if (opt.atJob) {
      var s = P(4.3, 2.0, 1.1);
      rr(s[0] - 52, s[1] - 13, 104, 24, 6); shape('#ffc23d', 2.4);
      ctx.fillStyle = INK; ctx.font = '700 12px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(opt.jobLabel, s[0], s[1] + 3);
    }
    // ночь: комната темнеет, свет частично спасает
    if (dark > 0) { ctx.fillStyle = 'rgba(16,20,56,' + (dark * 0.36 * (1 - S.gear.light * 0.14)) + ')'; ctx.fillRect(0, 0, W, H); }
    if (S.gear.light > 0 && opt.recording) {
      var g = P(4.25, 1.9, 1.2), gr = ctx.createRadialGradient(g[0], g[1], 10, g[0], g[1], 110 + S.gear.light * 20);
      gr.addColorStop(0, 'rgba(255,246,214,' + (0.12 + 0.05 * S.gear.light) + ')'); gr.addColorStop(1, 'rgba(255,246,214,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    if (opt.recording && !opt.atJob) {
      rr(12, 10, 62, 24, 12); shape('#fff', 2.5);
      circ(27, 22, 6); ctx.fillStyle = Math.sin(now * 8) > 0 ? '#ff5d4f' : '#ffb3ab'; ctx.fill();
      ctx.fillStyle = INK; ctx.font = '700 12px Rubik, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('REC', 38, 26.5);
    }
  }

  window.Room = { draw: draw, W: W, H: H };
})();
