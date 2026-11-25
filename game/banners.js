// ЮТУБЕРЫ — оформления каналов: по 2 тематические шапки на каждую тему (SVG 600×150).
// avatar — цвет круга аватарки, art — рисунок шапки.
(function () {
  'use strict';
  var I = '#1f2338';
  function svg(body, bg) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 150" preserveAspectRatio="xMidYMid slice"><rect width="600" height="150" fill="' + bg + '"/>' + body + '</svg>'; }
  function rep(n, fn) { var s = ''; for (var i = 0; i < n; i++) s += fn(i); return s; }
  var B = {
    games: [
      { avatar: '#c9c3f2', art: function () { return svg(
        rep(26, function (i) { return '<rect x="' + (i * 53 % 600) + '" y="' + (i * 37 % 140) + '" width="4" height="4" fill="#7cf0ff" opacity=".7"/>'; }) +
        '<rect x="200" y="35" width="200" height="80" rx="40" fill="none" stroke="#ff7ae0" stroke-width="8"/><path d="M250 60v30M235 75h30" stroke="#7cf0ff" stroke-width="8"/><circle cx="345" cy="65" r="8" fill="#7cf0ff"/><circle cx="365" cy="85" r="8" fill="#ffc23d"/>' +
        '<path d="M0 135h600" stroke="#ff7ae0" stroke-width="3" opacity=".6"/>', '#2b1f5a'); } },
      { avatar: '#bff0de', art: function () { return svg(
        '<rect y="100" width="600" height="50" fill="#5bbf4a"/>' + rep(15, function (i) { return '<rect x="' + i * 40 + '" y="112" width="40" height="38" fill="' + (i % 2 ? '#8a5a35' : '#9c6a40') + '"/>'; }) +
        '<rect x="80" y="60" width="40" height="40" fill="#e3b04b" stroke="' + I + '" stroke-width="3"/><text x="100" y="88" font-size="26" text-anchor="middle" font-family="sans-serif" font-weight="800" fill="' + I + '">?</text>' +
        rep(4, function (i) { return '<circle cx="' + (240 + i * 50) + '" cy="70" r="11" fill="#ffc23d" stroke="' + I + '" stroke-width="3"/>'; }) +
        '<rect x="470" y="40" width="60" height="60" fill="#2fbf94" stroke="' + I + '" stroke-width="3"/><rect x="455" y="30" width="90" height="16" fill="#2fbf94" stroke="' + I + '" stroke-width="3"/>' +
        '<circle cx="540" cy="25" r="14" fill="#fff" opacity=".9"/><circle cx="60" cy="30" r="18" fill="#fff" opacity=".9"/>', '#8fd3ff'); } }
    ],
    cooking: [
      { avatar: '#ffe3cc', art: function () { return svg(
        rep(30, function (i) { return '<rect x="' + (i % 15) * 40 + '" y="' + Math.floor(i / 15) * 40 + '" width="38" height="38" fill="#ffffff" opacity=".35"/>'; }) +
        '<ellipse cx="300" cy="110" rx="110" ry="22" fill="#2c3150"/><rect x="400" y="102" width="110" height="14" rx="7" fill="#2c3150"/><ellipse cx="300" cy="104" rx="88" ry="14" fill="#ffc23d"/>' +
        '<path d="M260 70c-10-15 10-20 0-35M300 70c-10-15 10-20 0-35M340 70c-10-15 10-20 0-35" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>' +
        '<path d="M60 20v100M50 20v30M70 20v30M50 50h20" stroke="' + I + '" stroke-width="5"/><ellipse cx="545" cy="45" rx="14" ry="28" fill="#c9d2de" stroke="' + I + '" stroke-width="4"/><path d="M545 73v55" stroke="' + I + '" stroke-width="6"/>', '#ffb38a'); } },
      { avatar: '#d9f5ea', art: function () { return svg(
        '<rect x="90" y="40" width="420" height="90" rx="14" fill="#d9a066" stroke="' + I + '" stroke-width="4"/><circle cx="490" cy="60" r="9" fill="#a8723f"/>' +
        '<circle cx="210" cy="85" r="30" fill="#ff5d4f" stroke="' + I + '" stroke-width="4"/><path d="M200 58q10-12 20 0" stroke="#2fbf94" stroke-width="6" fill="none"/>' +
        '<ellipse cx="320" cy="88" rx="38" ry="22" fill="#ffc23d" stroke="' + I + '" stroke-width="4"/>' +
        rep(5, function (i) { return '<ellipse cx="' + (405 + i * 14) + '" cy="' + (78 + (i % 2) * 14) + '" rx="8" ry="15" fill="#2fbf94" stroke="' + I + '" stroke-width="2" transform="rotate(' + (i * 25 - 50) + ' ' + (405 + i * 14) + ' ' + (78 + (i % 2) * 14) + ')"/>'; }), '#d9f5ea'); } }
    ],
    pranks: [
      { avatar: '#fff0c2', art: function () { return svg(
        rep(40, function (i) { return '<rect x="' + (i * 61 % 600) + '" y="' + (i * 29 % 150) + '" width="10" height="5" fill="' + ['#ff5d4f', '#7c6cf2', '#2fbf94', '#ff7ae0'][i % 4] + '" transform="rotate(' + (i * 37) + ' ' + (i * 61 % 600) + ' ' + (i * 29 % 150) + ')"/>'; }) +
        '<circle cx="300" cy="75" r="48" fill="#ffc23d" stroke="' + I + '" stroke-width="5"/><path d="M276 64l12 6-12 6M324 64l-12 6 12 6" stroke="' + I + '" stroke-width="5" fill="none"/><path d="M272 88q28 30 56 0z" fill="#c4453a" stroke="' + I + '" stroke-width="4"/>' +
        '<ellipse cx="120" cy="100" rx="55" ry="26" fill="#ff7ae0" stroke="' + I + '" stroke-width="4"/><path d="M168 96l26-8v18z" fill="#ff7ae0" stroke="' + I + '" stroke-width="4"/>', '#ffe08a'); } },
      { avatar: '#d9f5ea', art: function () { return svg(
        '<path d="M0 0h600v40' + rep(12, function (i) { return 'q25 ' + (i % 2 ? 30 : 55) + ' 50 0'; }) + 'V0z" fill="#7be0a8" stroke="' + I + '" stroke-width="4"/>' +
        rep(4, function (i) { return '<ellipse cx="' + (120 + i * 120) + '" cy="' + (100 - (i % 2) * 15) + '" rx="26" ry="32" fill="' + ['#ff5d4f', '#ffc23d', '#7c6cf2', '#ff7ae0'][i] + '" stroke="' + I + '" stroke-width="4"/><path d="M' + (120 + i * 120) + ' ' + (132 - (i % 2) * 15) + 'q-6 12 4 22" stroke="' + I + '" stroke-width="2" fill="none"/>'; }), '#2c3150'); } }
    ],
    tech: [
      { avatar: '#bff0de', art: function () { return svg(
        rep(14, function (i) { var y = 15 + i * 9; return '<path d="M0 ' + y + 'h' + (80 + i * 23 % 140) + 'l15 15h' + (120 + i * 17 % 200) + '" stroke="#2fbf94" stroke-width="2.5" fill="none" opacity=".75"/><circle cx="' + (215 + i * 40 % 380) + '" cy="' + (y + 15) + '" r="4" fill="#2fbf94"/>'; }) +
        '<rect x="250" y="40" width="100" height="70" rx="6" fill="#2c3150" stroke="#2fbf94" stroke-width="4"/>' + rep(6, function (i) { return '<path d="M' + (262 + i * 15) + ' 40v-14M' + (262 + i * 15) + ' 110v14" stroke="#2fbf94" stroke-width="4"/>'; }) +
        '<text x="300" y="82" font-size="20" text-anchor="middle" font-family="monospace" font-weight="700" fill="#2fbf94">CPU</text>', '#132238'); } },
      { avatar: '#dff1ff', art: function () { return svg(
        rep(40, function (i) { return '<path d="M' + i * 20 + ' 0v150" stroke="#fff" stroke-width="1" opacity=".25"/>'; }) + rep(8, function (i) { return '<path d="M0 ' + i * 20 + 'h600" stroke="#fff" stroke-width="1" opacity=".25"/>'; }) +
        '<rect x="150" y="30" width="60" height="100" rx="10" fill="none" stroke="#fff" stroke-width="4"/><circle cx="180" cy="118" r="5" fill="#fff"/>' +
        '<rect x="260" y="40" width="160" height="90" rx="6" fill="none" stroke="#fff" stroke-width="4"/><path d="M240 130h200" stroke="#fff" stroke-width="5"/>' +
        '<path d="M470 60a30 30 0 1 1 0 .1M500 90l30 30" stroke="#fff" stroke-width="5" fill="none"/>', '#2b6cb0'); } }
    ],
    truecrime: [
      { avatar: '#c9cde0', art: function () { return svg(
        '<path d="M0 70c80 10 150-10 220 0s140 20 210 0 120-10 170 0" stroke="#fff" stroke-width="2" fill="none" opacity=".08"/>' +
        '<g transform="rotate(-8 300 75)"><rect x="-20" y="50" width="640" height="34" fill="#ffc23d" stroke="' + I + '" stroke-width="3"/>' +
        rep(4, function (i) { return '<text x="' + (30 + i * 160) + '" y="74" font-size="17" font-family="sans-serif" font-weight="900" fill="' + I + '">DO NOT CROSS</text>'; }) + '</g>' +
        '<g transform="translate(500 110)" stroke="#fff" stroke-width="2" fill="none" opacity=".35">' + rep(6, function (i) { return '<ellipse rx="' + (6 + i * 5) + '" ry="' + (8 + i * 6) + '"/>'; }) + '</g>', '#1a1d2e'); } },
      { avatar: '#e9dccb', art: function () { return svg(
        rep(5, function (i) { return '<rect x="' + (60 + i * 110) + '" y="' + (25 + (i % 2) * 40) + '" width="70" height="56" fill="#f4f1e4" stroke="' + I + '" stroke-width="3" transform="rotate(' + ((i % 3) * 6 - 6) + ' ' + (95 + i * 110) + ' ' + (53 + (i % 2) * 40) + ')"/><rect x="' + (68 + i * 110) + '" y="' + (33 + (i % 2) * 40) + '" width="54" height="32" fill="#8d93ab"/>'; }) +
        '<path d="M95 30L205 70L315 30L425 70L535 30" stroke="#e23b3b" stroke-width="3" fill="none"/>' + rep(5, function (i) { return '<circle cx="' + (95 + i * 110) + '" cy="' + (30 + (i % 2) * 40) + '" r="6" fill="#e23b3b" stroke="' + I + '" stroke-width="2"/>'; }), '#b8875c'); } }
    ],
    vlog: [
      { avatar: '#ffe3cc', art: function () { return svg(
        '<circle cx="300" cy="95" r="45" fill="#ffd86b"/><path d="M0 150L130 60l90 60 90-70 110 80 90-55 90 60v15z" fill="#7c6cf2" stroke="' + I + '" stroke-width="4"/>' +
        '<path d="M0 150l160-45 120 30 140-40 180 40v15z" fill="#4a3f8f"/><path d="M290 150l15-50h-10l-15 50z" fill="#ffc23d"/>', '#ffb38a'); } },
      { avatar: '#d9f5ea', art: function () { return svg(
        rep(12, function (i) { var h = 40 + (i * 37 % 70); return '<rect x="' + i * 50 + '" y="' + (150 - h) + '" width="44" height="' + h + '" fill="#2c3a66"/>' + rep(3, function (k) { return '<rect x="' + (i * 50 + 8 + k * 12) + '" y="' + (160 - h) + '" width="6" height="8" fill="#ffd86b" opacity="' + ((i + k) % 2 ? 1 : 0.3) + '"/>'; }); }) +
        '<rect x="250" y="20" width="100" height="62" rx="10" fill="#fff" stroke="' + I + '" stroke-width="4"/><circle cx="300" cy="51" r="18" fill="#2c3150"/><circle cx="300" cy="51" r="8" fill="#8fd3ff"/><circle cx="337" cy="31" r="5" fill="#ff5d4f"/>', '#9fd8ff'); } }
    ],
    music: [
      { avatar: '#ffd3cf', art: function () { return svg(
        rep(30, function (i) { var h = 20 + Math.abs(Math.sin(i * 1.7)) * 90; return '<rect x="' + (12 + i * 20) + '" y="' + (140 - h) + '" width="12" height="' + h + '" rx="3" fill="' + (i % 3 ? '#ff5d4f' : '#ff7ae0') + '"/>'; }) +
        '<path d="M470 30v50M470 30l40-10v50" stroke="#fff" stroke-width="5" fill="none"/><circle cx="462" cy="82" r="9" fill="#fff"/><circle cx="502" cy="72" r="9" fill="#fff"/>', '#151827'); } },
      { avatar: '#fff0c2', art: function () { return svg(
        '<circle cx="140" cy="75" r="62" fill="#1f2338"/>' + rep(4, function (i) { return '<circle cx="140" cy="75" r="' + (50 - i * 9) + '" fill="none" stroke="#3a3f5c" stroke-width="2"/>'; }) + '<circle cx="140" cy="75" r="16" fill="#ff8a3d"/>' +
        '<path d="M230 75' + rep(24, function (i) { return 'l7 ' + (i % 2 ? -1 : 1) * (10 + (i * 13) % 40); }) + 'l7 0' + rep(20, function (i) { return 'l7 ' + (i % 2 ? -1 : 1) * (6 + (i * 7) % 30); }) + '" stroke="' + I + '" stroke-width="4" fill="none" stroke-linejoin="round"/>', '#ffc23d'); } }
    ],
    science: [
      { avatar: '#d9f5ea', art: function () { return svg(
        '<text x="40" y="55" font-size="26" font-family="serif" fill="#fff" opacity=".8">E = mc²</text><text x="380" y="45" font-size="22" font-family="serif" fill="#fff" opacity=".7">F = ma</text><text x="420" y="120" font-size="20" font-family="serif" fill="#fff" opacity=".6">∫ x dx</text>' +
        '<g transform="translate(270 78)" fill="none" stroke="#7be0a8" stroke-width="3"><ellipse rx="60" ry="20"/><ellipse rx="60" ry="20" transform="rotate(60)"/><ellipse rx="60" ry="20" transform="rotate(-60)"/></g><circle cx="270" cy="78" r="9" fill="#ffc23d"/>' +
        '<path d="M60 110q40-30 80 0t80 0" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/>', '#2f4a3d'); } },
      { avatar: '#dff1ff', art: function () { return svg(
        '<path d="M250 20h40M260 20v40l-35 65a8 8 0 0 0 7 12h76a8 8 0 0 0 7-12l-35-65V20" stroke="' + I + '" stroke-width="4" fill="#fff"/><path d="M238 105h84l12 20a6 6 0 0 1-5 9h-98a6 6 0 0 1-5-9z" fill="#2fbf94"/>' +
        '<rect x="380" y="40" width="22" height="95" rx="11" fill="#fff" stroke="' + I + '" stroke-width="4"/><rect x="383" y="85" width="16" height="47" rx="8" fill="#ff5d4f"/>' +
        rep(10, function (i) { return '<circle cx="' + (180 + (i * 47) % 300) + '" cy="' + (20 + (i * 23) % 110) + '" r="' + (4 + i % 4) + '" fill="#fff" opacity=".7"/>'; }), '#8fd3ff'); } }
    ],
    fitness: [
      { avatar: '#ffd3cf', art: function () { return svg(
        rep(5, function (i) { return '<path d="M0 ' + (30 + i * 26) + 'h600" stroke="#fff" stroke-width="3" opacity=".8"/>'; }) +
        rep(5, function (i) { return '<text x="' + (520) + '" y="' + (50 + i * 26) + '" font-size="18" font-family="sans-serif" font-weight="900" fill="#fff" opacity=".85">' + (i + 1) + '</text>'; }) +
        '<path d="M60 30v130M90 30v130" stroke="#fff" stroke-width="5"/>', '#d9483b'); } },
      { avatar: '#d9f5ea', art: function () { return svg(
        '<path d="M0 85h170l20-45 30 90 25-70 20 25h335" stroke="#ff5d4f" stroke-width="6" fill="none" stroke-linejoin="round"/>' +
        '<g transform="translate(430 75)"><rect x="-70" y="-6" width="140" height="12" rx="4" fill="#c9d2de" stroke="' + I + '" stroke-width="3"/><rect x="-90" y="-30" width="24" height="60" rx="5" fill="' + I + '"/><rect x="66" y="-30" width="24" height="60" rx="5" fill="' + I + '"/></g>', '#7be0a8'); } }
    ],
    asmr: [
      { avatar: '#ece4ff', art: function () { return svg(
        rep(40, function (i) { return '<circle cx="' + (i * 71 % 600) + '" cy="' + (i * 31 % 150) + '" r="' + (i % 3 ? 1.5 : 2.5) + '" fill="#fff" opacity=".8"/>'; }) +
        '<circle cx="420" cy="70" r="42" fill="#f4f1d0"/><circle cx="440" cy="58" r="40" fill="#2c3a66"/>' +
        '<path d="M80 110q40-25 80 0t80 0" stroke="#c9b8f2" stroke-width="4" fill="none" opacity=".7"/>', '#2c3a66'); } },
      { avatar: '#dff1ff', art: function () { return svg(
        '<g fill="#fff" stroke="' + I + '" stroke-width="3"><path d="M120 70a30 30 0 0 1 58-10a24 24 0 0 1 22 40h-90a22 22 0 0 1 10-30z"/><path d="M380 50a34 34 0 0 1 66-10a26 26 0 0 1 24 44h-100a24 24 0 0 1 10-34z"/></g>' +
        rep(24, function (i) { return '<path d="M' + (110 + (i * 37) % 420) + ' ' + (105 + (i * 13) % 35) + 'l-4 10" stroke="#5aa7d8" stroke-width="3" stroke-linecap="round"/>'; }), '#c9e6f5'); } }
    ]
  };
  var cache = {};
  function url(theme, i) {
    var k = theme + i; if (!cache[k]) cache[k] = "url('data:image/svg+xml;charset=utf-8," + encodeURIComponent(B[theme][i].art()).replace(/'/g, '%27') + "')";
    return cache[k];
  }
  window.BANNERS = { count: 2, avatar: function (theme, i) { return B[theme][i % 2].avatar; }, css: function (theme, i) { return 'background-image:' + url(theme, i % 2) + ';background-size:cover;background-position:center'; } };
})();
