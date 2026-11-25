// ЮТУБЕРЫ — отрисовка квартиры на холсте 640×320.
// Вид спереди, всё симметрично: в центре стол и ютубер, по бокам свет и техника, на переднем плане камера.
(function () {
  'use strict';
  var W = 640, H = 320, FLOOR = 258, INK = '#1f2338';
  var ctx, now = 0;

  function shape(fill, lw) { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw || 3; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); }
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
  function line(pts, lw) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.lineWidth = lw || 3; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke(); }
  function mix(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round((pa >> 16) * (1 - t) + (pb >> 16) * t), g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t), bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }

  // Жильё: цвета и размер окна
  var APT = [
    { wall: '#dfe7d8', floor: '#c7b48f', win: [266, 62, 108, 78], frame: '#f4f6fb' },
    { wall: '#e3dcf3', floor: '#b98b62', win: [258, 60, 124, 82], frame: '#ffffff' },
    { wall: '#c97b5d', floor: '#8f98a3', win: [248, 56, 144, 88], frame: '#2c3150' },
    { wall: '#dbe6f2', floor: '#5b4636', win: [240, 56, 160, 90], frame: '#d9b56a' }
  ];

  // Небо по времени суток
  var SKY = [[0, '#1d2550'], [5, '#1d2550'], [7, '#ffc9a3'], [9, '#9fd8ff'], [17, '#9fd8ff'], [19, '#ff9f80'], [21, '#1d2550'], [24, '#1d2550']];
  function skyAt(h) {
    for (var i = 0; i < SKY.length - 1; i++) if (h >= SKY[i][0] && h < SKY[i + 1][0]) return mix(SKY[i][1], SKY[i + 1][1], (h - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]));
    return SKY[0][1];
  }
  function darkness(h) { if (h >= 8 && h <= 18) return 0; if (h < 5 || h >= 21) return 1; if (h < 8) return (8 - h) / 3; return (h - 18) / 3; }

  function person(x, y, o) {
    var s = o.scale || 1;
    ctx.save(); ctx.translate(x, y + (o.bob || 0)); ctx.scale(s, s);
    rr(-21, -10, 42, 56, 17); shape(o.shirt);
    ctx.save(); ctx.translate(-19, 2); ctx.rotate(-0.25 - (o.arm || 0)); rr(-6, 0, 12, 32, 6); shape(o.shirt); ctx.restore();
    ctx.save(); ctx.translate(19, 2); ctx.rotate(0.25 + (o.arm || 0)); rr(-6, 0, 12, 32, 6); shape(o.shirt); ctx.restore();
    if (o.lav) { circ(9, 2, 3.5); shape('#2c3150', 2); }
    circ(0, -33, 23); shape(o.skin);
    ctx.beginPath(); ctx.arc(0, -37, 23, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(15, -43); ctx.quadraticCurveTo(0, -49, -17, -41); ctx.closePath(); shape(o.hair);
    ctx.fillStyle = INK;
    var bl = o.blink ? 0.15 : 1;
    ctx.beginPath(); ctx.ellipse(-8, -31, 2.5, 3.3 * bl, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8, -31, 2.5, 3.3 * bl, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.lineCap = 'round';
    if (o.talk) { ctx.beginPath(); ctx.ellipse(0, -21, 4, 3 + Math.abs(Math.sin(now * 14)) * 2.3, 0, 0, Math.PI * 2); ctx.fillStyle = '#c4453a'; ctx.fill(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(0, -24, 6, 0.2, Math.PI - 0.2); ctx.stroke(); }
    var hat = o.hat;
    if (hat === 'cooking') { rr(-16, -66, 32, 14, 4); shape('#fff'); circ(-9, -68, 9); shape('#fff'); circ(9, -68, 9); shape('#fff'); circ(0, -73, 10); shape('#fff'); }
    else if (hat === 'games' || hat === 'music' || hat === 'asmr') {
      var hc = hat === 'games' ? '#7c6cf2' : hat === 'music' ? '#ff5d4f' : '#c9b8f2';
      ctx.beginPath(); ctx.arc(0, -35, 27, Math.PI * 1.1, Math.PI * 1.9); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
      rr(-31, -42, 9, 16, 4); shape(hc); rr(22, -42, 9, 16, 4); shape(hc);
    } else if (hat === 'fitness') { rr(-23, -50, 46, 8, 4); shape('#ff5d4f', 2.5); }
    else if (hat === 'science') { rr(-17, -52, 14, 9, 4); shape('#8fd3ff', 2.5); rr(3, -52, 14, 9, 4); shape('#8fd3ff', 2.5); }
    else if (hat === 'truecrime') { ctx.beginPath(); ctx.ellipse(0, -52, 28, 5, 0, 0, Math.PI * 2); shape('#6b5a46'); rr(-15, -68, 30, 16, 6); shape('#6b5a46'); }
    ctx.restore();
  }

  // Декор по теме канала. Исходная зона 122×82, рисуется в масштабе 0.9
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

  function drawDecor(theme, x, y) {
    ctx.save(); ctx.translate(x, y); ctx.scale(0.9, 0.9); drawDecorRaw(theme, 0, 0); ctx.restore();
  }
  // Картина-заглушка, пока второго канала нет
  function drawArt(x, y, home) {
    rr(x + 14, y + 4, 82, 62, 4); shape(home >= 3 ? '#d9b56a' : '#fff');
    rr(x + 22, y + 12, 66, 46, 2); shape('#d9f5ea', 2);
    ctx.beginPath(); ctx.moveTo(x + 22, y + 58); ctx.lineTo(x + 46, y + 30); ctx.lineTo(x + 62, y + 46); ctx.lineTo(x + 72, y + 36); ctx.lineTo(x + 88, y + 58); ctx.closePath(); shape('#2fbf94', 2);
    circ(x + 74, y + 22, 6); ctx.fillStyle = '#ffc23d'; ctx.fill();
  }

  function drawWall(home) {
    var A = APT[home];
    ctx.fillStyle = A.wall; ctx.fillRect(0, 0, W, FLOOR);
    if (home === 0) { // общага: пятна на стене
      ctx.fillStyle = 'rgba(31,35,56,.06)';
      [[60, 70, 18], [560, 40, 14], [470, 200, 20], [150, 210, 12]].forEach(function (p) { circ(p[0], p[1], p[2]); ctx.fill(); });
    } else if (home === 1) { // квартира: панель снизу
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(0, 196, W, FLOOR - 196); line([0, 196, W, 196], 2);
    } else if (home === 2) { // лофт: кирпич
      ctx.strokeStyle = 'rgba(31,35,56,.18)'; ctx.lineWidth = 1.5;
      for (var y = 14; y < FLOOR; y += 14) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        for (var x = (y / 14) % 2 ? 0 : 20; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x, y); ctx.stroke(); }
      }
    } else { // пентхаус: деревянные панели
      ctx.fillStyle = '#c9a77c'; ctx.fillRect(0, 0, 60, FLOOR); ctx.fillRect(W - 60, 0, 60, FLOOR);
      ctx.strokeStyle = 'rgba(31,35,56,.2)'; ctx.lineWidth = 1.5;
      for (var px = 12; px < 60; px += 12) { ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, FLOOR); ctx.moveTo(W - px, 0); ctx.lineTo(W - px, FLOOR); ctx.stroke(); }
    }
    ctx.fillStyle = A.floor; ctx.fillRect(0, FLOOR, W, H - FLOOR);
    if (home === 1 || home === 3) { ctx.strokeStyle = 'rgba(31,35,56,.15)'; ctx.lineWidth = 2; for (var fx = -40; fx < W + 40; fx += 48) { ctx.beginPath(); ctx.moveTo(320 + (fx - 320) * 0.6, FLOOR); ctx.lineTo(fx, H); ctx.stroke(); } }
    line([0, FLOOR, W, FLOOR]);
  }

  function drawWindow(home, hour) {
    var w = APT[home].win, sky = skyAt(hour), night = darkness(hour);
    rr(w[0], w[1], w[2], w[3], 6); shape(sky);
    // солнце или луна
    var t = ((hour - 6 + 24) % 24) / 12;
    if (hour >= 6 && hour < 19) { circ(w[0] + 14 + (w[2] - 28) * Math.min(1, t), w[1] + 18 + Math.abs(t - 0.5) * 24, 8); ctx.fillStyle = '#fff6d6'; ctx.fill(); }
    else { circ(w[0] + w[2] - 22, w[1] + 18, 7); ctx.fillStyle = '#f4f1d0'; ctx.fill(); ctx.fillStyle = '#f4f1d0'; [[0.2, 0.3], [0.4, 0.15], [0.55, 0.4]].forEach(function (p) { ctx.fillRect(w[0] + w[2] * p[0], w[1] + w[3] * p[1], 2, 2); }); }
    // город за окном (лофт и пентхаус)
    if (home >= 2) {
      var base = w[1] + w[3];
      [[0.02, 0.5], [0.16, 0.35], [0.3, 0.6], [0.46, 0.42], [0.62, 0.7], [0.78, 0.38], [0.9, 0.55]].forEach(function (b, i) {
        var bx = w[0] + w[2] * b[0], bw = w[2] * 0.13, bh = w[3] * b[1];
        ctx.fillStyle = night > 0.5 ? '#2c3150' : '#7fa7c9'; ctx.fillRect(bx, base - bh, bw, bh);
        if (night > 0.5) { ctx.fillStyle = '#ffd86b'; for (var k = 0; k < 4; k++) if ((i + k) % 2) ctx.fillRect(bx + 3 + (k % 2) * 7, base - bh + 5 + Math.floor(k / 2) * 9, 3, 4); }
      });
    }
    ctx.lineWidth = 4; ctx.strokeStyle = APT[home].frame; rr(w[0] + 2, w[1] + 2, w[2] - 4, w[3] - 4, 5); ctx.stroke();
    var cols = home >= 2 ? 3 : 2;
    for (var c = 1; c < cols; c++) line([w[0] + w[2] * c / cols, w[1], w[0] + w[2] * c / cols, w[1] + w[3]], 3);
    line([w[0], w[1] + w[3] / 2, w[0] + w[2], w[1] + w[3] / 2], home >= 2 ? 3 : 0.01);
    rr(w[0], w[1], w[2], w[3], 6); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    rr(w[0] - 6, w[1] + w[3], w[2] + 12, 6, 2); shape(APT[home].frame, 2.5);
  }

  // Шкаф слева, дверь справа
  function drawEdges(home, mgHere, net) {
    // шкаф
    rr(6, 116, 48, 142, 4); shape(home >= 3 ? '#8a6a48' : home === 2 ? '#5b6180' : '#e9c79f');
    line([6, 164, 54, 164], 2.5); line([6, 210, 54, 210], 2.5);
    [['#ff5d4f', 10], ['#7c6cf2', 18], ['#2fbf94', 26], ['#ffc23d', 34]].forEach(function (b) { rr(b[1], 142, 7, 22, 1); shape(b[0], 2); });
    circ(30, 196, 9); shape('#2fbf94', 2.5);
    rr(12, 222, 36, 20, 3); shape('#fff', 2);
    // роутер на шкафу
    var rx = 12, ry = 104;
    rr(rx, ry, 36, 12, 3); shape('#f4f6fb', 2.5);
    for (var i = 0; i <= net; i++) { circ(rx + 7 + i * 7, ry + 6, 2); ctx.fillStyle = Math.sin(now * (5 + i * 3)) > 0 ? '#2fbf94' : '#c9d2de'; ctx.fill(); }
    if (net >= 1) line([rx + 4, ry, rx + 1, ry - 12], 2.5);
    if (net >= 2) line([rx + 32, ry, rx + 35, ry - 12], 2.5);
    if (net >= 3) { ctx.beginPath(); ctx.arc(rx + 18, ry - 2, 11, Math.PI * 1.15, Math.PI * 1.85); shape('#c9d2de', 2.5); line([rx + 18, ry - 2, rx + 18, ry - 12], 2); }
    // дверь
    rr(588, 108, 46, 150, 3); shape(mgHere ? '#3a3f5c' : (home >= 3 ? '#8a6a48' : '#c9a77c'));
    if (!mgHere) { rr(594, 116, 34, 54, 3); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); rr(594, 178, 34, 70, 3); ctx.stroke(); circ(626, 186, 3); ctx.fillStyle = INK; ctx.fill(); }
  }

  // Награды: 5 мест по центру сверху
  function drawAwards(ms, MS) {
    var colors = ['#e5a46b', '#c9d2de', '#ffc23d', '#8fd3ff', '#ff5d4f'];
    for (var i = 0; i < 5; i++) {
      var x = 218 + i * 42, y = 6;
      if (i >= ms.length) { rr(x, y, 36, 44, 5); ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(31,35,56,.25)'; ctx.stroke(); ctx.setLineDash([]); continue; }
      rr(x, y, 36, 44, 5); shape(colors[i], 2.5);
      rr(x + 6, y + 6, 24, 18, 5); shape('#fff', 2);
      ctx.beginPath();
      for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? 3 : 7; ctx.lineTo(x + 18 + Math.cos(a) * rad, y + 15 + Math.sin(a) * rad); }
      ctx.closePath(); ctx.fillStyle = INK; ctx.fill();
      var v = MS[i];
      ctx.font = '700 10px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = INK;
      ctx.fillText(v >= 1e6 ? '1M' : v >= 1000 ? (v / 1000) + 'K' : v, x + 18, y + 38);
    }
  }

  // Свет: пара по бокам
  function drawLights(tier) {
    if (tier === 0) return;
    var g = ctx.createRadialGradient(320, 170, 20, 320, 170, 170 + tier * 25);
    g.addColorStop(0, 'rgba(255,246,214,' + (0.12 + tier * 0.06) + ')'); g.addColorStop(1, 'rgba(255,246,214,0)');
    ctx.fillStyle = g; ctx.fillRect(60, 0, 520, FLOOR);
    [88, 552].forEach(function (x, side) {
      var dir = side ? -1 : 1;
      if (tier === 1) return; // настольные лампы рисуются на столе
      line([x, FLOOR, x, 150]); line([x - 14, FLOOR, x + 14, FLOOR]); line([x, FLOOR, x - 10 * dir, FLOOR - 2]);
      if (tier === 2) {
        circ(x, 140, 22); ctx.lineWidth = 9; ctx.strokeStyle = '#fffbe8'; ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = INK; circ(x, 140, 26); ctx.stroke(); circ(x, 140, 17); ctx.stroke();
      } else {
        var w = tier === 4 ? 54 : 44, h = tier === 4 ? 44 : 38;
        rr(x - w / 2, 112, w, h, 6); shape('#fffbe8');
        if (tier === 4) { line([x - w / 2, 112, x - w / 2 - 6, 102]); line([x + w / 2, 112, x + w / 2 + 6, 102]); }
      }
    });
  }

  function deskLamps() {
    [212, 428].forEach(function (x, side) {
      var d = side ? -1 : 1;
      line([x, 214, x, 196]); line([x, 196, x + 10 * d, 186]);
      ctx.beginPath(); ctx.moveTo(x + 4 * d, 182); ctx.lineTo(x + 20 * d, 180); ctx.lineTo(x + 16 * d, 194); ctx.closePath(); shape('#ffc23d', 2.5);
    });
  }

  // Системники по бокам стола
  function drawTowers(tier) {
    if (tier === 0) return;
    [170, 448].forEach(function (x) {
      var h = tier === 3 ? 96 : 44 + tier * 8, w = tier === 3 ? 26 : 22;
      rr(x, FLOOR - h, w, h, 3); shape('#2c3150');
      for (var i = 0; i < (tier === 3 ? 5 : 1); i++) { circ(x + w / 2, FLOOR - h + 10 + i * 16, 2.5); ctx.fillStyle = Math.sin(now * 6 + i + x) > 0 ? '#2fbf94' : '#1b6e55'; ctx.fill(); }
    });
  }

  function monitor(x, y, w, h, i) {
    rr(x, y, w, h, 4); shape('#2c3150');
    rr(x + 4, y + 4, w - 8, h - 8, 2); shape('#7c6cf2', 2);
    ctx.fillStyle = (now * 2 + i) % 2 < 1 ? '#ffc23d' : '#ff5d4f'; ctx.fillRect(x + 8, y + h - 14, 8 + ((now * 18 + i * 7) % (w - 20)), 4);
  }

  function drawDesk(pc, home) {
    var top = home >= 2 ? '#2c3150' : '#e9c79f', front = home >= 2 ? '#3a3f5c' : '#d9b48b';
    if (pc === 0) { rr(286, 188, 68, 28, 4); shape('#c9d2de'); circ(320, 202, 5); ctx.fillStyle = '#fff'; ctx.fill(); }
    if (pc >= 1) {
      var w = pc >= 2 ? 60 : 50, h = pc >= 2 ? 38 : 34;
      [[208, 1], [432 - w, 2]].forEach(function (m) { line([m[0] + w / 2, 214, m[0] + w / 2, 176 + h - 30], 3); monitor(m[0], 214 - h - 8, w, h, m[1]); });
      if (pc === 3) { monitor(208, 132, 60, 34, 3); monitor(372, 132, 60, 34, 4); }
    }
    rr(192, 212, 256, 10, 3); shape(top);
    rr(198, 222, 244, 38, 3); shape(front);
    line([320, 222, 320, 260], 2);
  }

  function drawMic(tier) {
    if (tier === 2) { rr(356, 206, 22, 8, 3); shape('#5b6180', 2.5); line([367, 206, 367, 196]); rr(360, 176, 14, 22, 7); shape('#c9d2de'); }
    else if (tier === 3) { line([368, 214, 368, 194]); rr(356, 210, 24, 6, 3); shape('#5b6180', 2.5); circ(368, 182, 12); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke(); rr(361, 166, 14, 30, 7); shape('#ffc23d'); }
    else if (tier === 4) { line([410, 214, 410, 150, 372, 160]); rr(354, 156, 18, 32, 9); shape('#2c3150'); line([354, 166, 372, 166], 2); line([354, 176, 372, 176], 2); circ(350, 172, 8); ctx.fillStyle = 'rgba(31,35,56,.25)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); }
  }

  // Камера на переднем плане (видна сзади, на экране — ютубер)
  function drawCamera(tier, rec) {
    var x = 320;
    line([x, 288, x - 26, H + 4]); line([x, 288, x + 26, H + 4]); line([x, 288, x, H + 4]);
    function screen(sx, sy, sw, sh) {
      rr(sx, sy, sw, sh, 3); shape('#9fd8ff', 2);
      circ(sx + sw / 2, sy + sh * 0.55, Math.min(sw, sh) * 0.28); shape('#ffd9b8', 1.5);
    }
    if (tier === 0) { rr(302, 248, 36, 40, 5); shape('#2c3150'); screen(307, 253, 26, 30); }
    else if (tier === 1) { circ(x, 270, 18); shape('#f4f6fb'); circ(x, 270, 8); shape('#2c3150'); }
    else if (tier === 2) { rr(290, 254, 60, 34, 6); shape('#2c3150'); rr(310, 246, 20, 9, 3); shape('#2c3150'); screen(296, 260, 34, 22); circ(340, 266, 4); shape('#5b6180', 2); }
    else {
      var big = tier === 4;
      rr(big ? 274 : 282, big ? 240 : 246, big ? 92 : 76, big ? 48 : 42, 6); shape('#2c3150');
      screen(big ? 286 : 292, big ? 248 : 252, big ? 50 : 40, big ? 32 : 28);
      line([big ? 366 : 358, 256, big ? 384 : 374, 240]); rr(big ? 376 : 366, 226, 30, 20, 3); shape('#2c3150'); rr(big ? 379 : 369, 229, 24, 14, 2); shape('#9fd8ff', 2);
      circ(big ? 350 : 344, big ? 262 : 266, 4); ctx.fillStyle = rec && Math.sin(now * 8) > 0 ? '#ff5d4f' : '#5b6180'; ctx.fill();
      if (big) { rr(300, 232, 40, 9, 3); shape('#ffc23d', 2); }
    }
  }

  function drawChair() {
    rr(296, 150, 48, 64, 14); shape('#5b6180');
    line([300, 166, 340, 166], 2);
  }

  /* ---------- Главная функция ---------- */
  function draw(c, S, L, t, opt) {
    ctx = c; now = t;
    if (!S.channels.length) { ctx.fillStyle = APT[0].wall; ctx.fillRect(0, 0, W, H); return; }
    var clock = L.clock(S), hour = clock.hour + clock.minute / 60, dark = darkness(hour), home = S.home;
    var ch1 = S.channels[0].theme, ch2 = S.channels[1] && S.channels[1].theme;

    drawWall(home);
    drawWindow(home, hour);
    drawAwards(S.milestones, L.MILESTONES);
    drawDecor(ch1, 124, 60);
    if (ch2) drawDecor(ch2, 406, 60); else drawArt(406, 60, home);
    drawEdges(home, S.staff.mg > 0, S.gear.net);
    drawLights(S.gear.light);
    drawTowers(S.gear.pc);
    if (home >= 1) { // растения у стола
      [140, 486].forEach(function (x) { rr(x, FLOOR - 26, 22, 26, 4); shape('#e5a46b', 2.5); ctx.beginPath(); ctx.ellipse(x + 6, FLOOR - 36, 7, 14, -0.4, 0, Math.PI * 2); shape('#2fbf94', 2.5); ctx.beginPath(); ctx.ellipse(x + 16, FLOOR - 36, 7, 14, 0.4, 0, Math.PI * 2); shape('#2fbf94', 2.5); });
    }

    // ютубер (или пустое кресло, если он на работе)
    if (opt.atJob) drawChair();
    else person(320, 196, {
      skin: '#ffd9b8', shirt: '#ff5d4f', hair: '#3b2a22', hat: ch1, lav: S.gear.mic === 1,
      bob: Math.sin(now * (opt.recording ? 9 : 2)) * (opt.recording ? 2.5 : 1.2),
      arm: opt.recording ? Math.sin(now * 9) * 0.3 + 0.15 : 0, talk: opt.recording, blink: (now % 4) < 0.12
    });
    drawDesk(S.gear.pc, home);
    if (S.gear.light === 1) deskLamps();
    drawMic(S.gear.mic);
    if (opt.atJob) {
      rr(270, 230, 100, 22, 4); shape('#ffc23d', 2.5);
      ctx.fillStyle = INK; ctx.font = '700 12px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(opt.jobLabel, 320, 245);
    }
    // команда
    if (S.staff.op > 0) person(214, 270, { skin: '#ffd9b8', shirt: '#ff8a3d', hair: '#1f2338', scale: 0.72, bob: Math.sin(now * 3 + 1) * 1.2 });
    if (S.staff.ed > 0) person(426, 270, { skin: '#c99b74', shirt: '#7c6cf2', hair: '#1f2338', scale: 0.72, bob: Math.sin(now * 3 + 2) * 1.2, arm: Math.sin(now * 12) * 0.08 });
    if (S.staff.mg > 0) person(611, 206, { skin: '#f1c8a0', shirt: '#2fbf94', hair: '#8a4b2d', scale: 0.62, bob: Math.sin(now * 3 + 3) * 1.2, talk: Math.sin(now * 0.7) > 0.4 });
    drawCamera(S.gear.cam, opt.recording);

    // ночь: комната темнеет, свет её спасает
    if (dark > 0) { ctx.fillStyle = 'rgba(16,20,56,' + (dark * 0.34 * (1 - S.gear.light * 0.15)) + ')'; ctx.fillRect(0, 0, W, H); }
    if (opt.recording && !opt.atJob) {
      rr(10, 8, 60, 22, 11); shape('#fff', 2.5);
      circ(24, 19, 5.5); ctx.fillStyle = Math.sin(now * 8) > 0 ? '#ff5d4f' : '#ffb3ab'; ctx.fill();
      ctx.fillStyle = INK; ctx.font = '700 12px Rubik, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('REC', 34, 23.5);
    }
  }

  window.Room = { draw: draw, W: W, H: H };
})();
