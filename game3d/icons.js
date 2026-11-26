// ЮТУБЕРЫ — иконки (SVG-строки).
(function () {
  var STROKE = 'fill="none" stroke="#1f2338" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"';
  var ICON = {
    cam: '<svg viewBox="0 0 28 28" ' + STROKE + '><rect x="3" y="8" width="16" height="13" rx="3" fill="#ff5d4f"/><path d="M19 12l6-3v11l-6-3z" fill="#fff"/></svg>',
    pc: '<svg viewBox="0 0 28 28" ' + STROKE + '><rect x="3" y="4" width="22" height="15" rx="2" fill="#7c6cf2"/><path d="M10 24h8M14 19v5"/></svg>',
    net: '<svg viewBox="0 0 28 28" ' + STROKE + '><path d="M4 11a14 14 0 0 1 20 0M8 15a8.5 8.5 0 0 1 12 0M12 19a3 3 0 0 1 4 0"/><circle cx="14" cy="23" r="1.6" fill="#1f2338"/></svg>',
    mic: '<svg viewBox="0 0 28 28" ' + STROKE + '><rect x="10" y="3" width="8" height="14" rx="4" fill="#ffc23d"/><path d="M6 13a8 8 0 0 0 16 0M14 21v4"/></svg>',
    light: '<svg viewBox="0 0 28 28" ' + STROKE + '><circle cx="14" cy="12" r="8" fill="#fff6d6"/><circle cx="14" cy="12" r="4"/><path d="M14 20v6"/></svg>',
    op: '<svg viewBox="0 0 28 28" ' + STROKE + '><circle cx="14" cy="9" r="5" fill="#ffd9b8"/><path d="M5 25c1-6 5-8 9-8s8 2 9 8z" fill="#ff8a3d"/></svg>',
    ed: '<svg viewBox="0 0 28 28" ' + STROKE + '><circle cx="14" cy="9" r="5" fill="#c99b74"/><path d="M5 25c1-6 5-8 9-8s8 2 9 8z" fill="#7c6cf2"/></svg>',
    mg: '<svg viewBox="0 0 28 28" ' + STROKE + '><circle cx="14" cy="9" r="5" fill="#f1c8a0"/><path d="M5 25c1-6 5-8 9-8s8 2 9 8z" fill="#2fbf94"/></svg>',
    sfxOn: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 9h4l5-4v14l-5-4H4z" fill="#ffc23d"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    sfxOff: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 9h4l5-4v14l-5-4H4z" fill="#dfe6ee"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    musicOn: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.8" fill="#7c6cf2"/><circle cx="17.5" cy="16" r="2.8" fill="#7c6cf2"/></svg>',
    musicOff: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.8" fill="#dfe6ee"/><circle cx="17.5" cy="16" r="2.8" fill="#dfe6ee"/><path d="M3 3l18 18"/></svg>',
    menu: '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    // события
    sponsor: '<svg viewBox="0 0 28 28" ' + STROKE + '><circle cx="14" cy="14" r="10" fill="#ffc23d"/><path d="M17 10.5c-1-1-5-1.5-5.5 1s5.5 1.5 5 4.5c-.5 2.5-4.5 2-5.5 1M14 7.5v2M14 18.5v2"/></svg>',
    strike: '<svg viewBox="0 0 28 28" ' + STROKE + '><path d="M14 3l11 20H3z" fill="#ff5d4f"/><path d="M14 11v5M14 19.5v.5" stroke="#fff"/></svg>',
    collab: '<svg viewBox="0 0 28 28" ' + STROKE + '><circle cx="9" cy="10" r="4" fill="#ffd9b8"/><circle cx="19" cy="10" r="4" fill="#c99b74"/><path d="M2 24c1-5 4-7 7-7s6 2 7 7zM12 24c1-5 4-7 7-7s6 2 7 7z" fill="#7c6cf2"/></svg>',
    trend: '<svg viewBox="0 0 28 28" ' + STROKE + '><path d="M3 21l7-7 5 4 9-10" /><path d="M18 8h6v6"/></svg>',
    drama: '<svg viewBox="0 0 28 28" ' + STROKE + '><path d="M4 6h14v10H10l-4 4v-4H4z" fill="#ffd3cf"/><path d="M14 12h10v8h-2v3l-3-3h-5z" fill="#fff"/></svg>',
    broken: '<svg viewBox="0 0 28 28" ' + STROKE + '><rect x="3" y="8" width="17" height="13" rx="3" fill="#c9d2de"/><path d="M20 12l5-3v11l-5-3M9 8l3 6-4 2 3 5"/></svg>',
    fans: '<svg viewBox="0 0 28 28" ' + STROKE + '><path d="M14 24S4 18 4 11a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 7-10 13-10 13z" fill="#ff5d4f"/></svg>'
  };
  var THEME_ICON = {
    games: '<svg viewBox="0 0 28 28" ' + STROKE + '><rect x="2" y="8" width="24" height="13" rx="6" fill="#7c6cf2"/><path d="M8 12v5M5.5 14.5h5"/><circle cx="19" cy="13" r="1.3" fill="#fff"/><circle cx="21.5" cy="16" r="1.3" fill="#fff"/></svg>',
    cooking: '<svg viewBox="0 0 28 28" ' + STROKE + '><path d="M5 13h18v6a5 5 0 0 1-5 5h-8a5 5 0 0 1-5-5z" fill="#ff8a3d"/><path d="M2 13h24M10 4c-1 2 1 3 0 6M15 4c-1 2 1 3 0 6"/></svg>',
    pranks: '<svg viewBox="0 0 28 28" ' + STROKE + '><circle cx="14" cy="14" r="11" fill="#ffc23d"/><path d="M8 11l3 1.5L8 14M20 11l-3 1.5L20 14"/><path d="M8 17c2 5 10 5 12 0z" fill="#fff"/></svg>',
    tech: '<svg viewBox="0 0 28 28" ' + STROKE + '><rect x="8" y="2" width="12" height="24" rx="3" fill="#8fd3ff"/><path d="M12 22h4"/></svg>',
    truecrime: '<svg viewBox="0 0 28 28" ' + STROKE + '><circle cx="12" cy="12" r="7" fill="#dfe6ee"/><path d="M17 17l7 7"/></svg>',
    vlog: '<svg viewBox="0 0 28 28" ' + STROKE + '><path d="M14 25s-8-7-8-13a8 8 0 0 1 16 0c0 6-8 13-8 13z" fill="#2fbf94"/><circle cx="14" cy="12" r="3" fill="#fff"/></svg>',
    music: '<svg viewBox="0 0 28 28" ' + STROKE + '><path d="M10 21V6l12-3v15"/><circle cx="7" cy="21" r="3.2" fill="#ff5d4f"/><circle cx="19" cy="18" r="3.2" fill="#ff5d4f"/></svg>',
    science: '<svg viewBox="0 0 28 28" ' + STROKE + '><path d="M11 3h6M12 3v8l-7 12a2 2 0 0 0 2 3h14a2 2 0 0 0 2-3l-7-12V3"/><path d="M7.5 19h13l2 4H5.5z" fill="#2fbf94"/></svg>',
    fitness: '<svg viewBox="0 0 28 28" ' + STROKE + '><path d="M9 14h10"/><rect x="3" y="8" width="6" height="12" rx="2" fill="#ff5d4f"/><rect x="19" y="8" width="6" height="12" rx="2" fill="#ff5d4f"/></svg>',
    asmr: '<svg viewBox="0 0 28 28" ' + STROKE + '><path d="M5 17v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="15" width="5" height="9" rx="2" fill="#c9b8f2"/><rect x="20" y="15" width="5" height="9" rx="2" fill="#c9b8f2"/></svg>'
  };
  var THEME_TINT = { games: '#e4dfff', cooking: '#ffe3cc', pranks: '#fff0c2', tech: '#dff1ff', truecrime: '#e2e5ee', vlog: '#d9f5ea', music: '#ffe0dc', science: '#dcf5ee', fitness: '#ffe0dc', asmr: '#ece4ff' };
  var EVENT_TINT = { sponsor: '#fff0c2', strike: '#ffd3cf', collab: '#e4dfff', trend: '#d9f5ea', drama: '#ffe3cc', broken: '#e2e5ee', fans: '#ffe0dc', monetized: '#d9f5ea' };
  ICON.monetized = '<svg viewBox="0 0 28 28" ' + STROKE + '><circle cx="14" cy="14" r="11" fill="#2fbf94"/><path d="M17.5 10c-1-1.2-6-1.8-6.5 1s6.5 1.8 6 5c-.5 3-5.5 2.3-6.5 1M14 6.5v2.5M14 19v2.5" stroke="#fff"/></svg>';
  ICON.home = function (lvl) {
    var c = ['#dfe7d8', '#e3dcf3', '#c97b5d', '#dbe6f2'][lvl];
    if (lvl === 3) return '<svg viewBox="0 0 28 28" ' + STROKE + '><rect x="6" y="3" width="16" height="22" rx="1" fill="' + c + '"/><path d="M10 8h2M16 8h2M10 13h2M16 13h2M10 18h2M16 18h2M3 25h22"/></svg>';
    if (lvl === 2) return '<svg viewBox="0 0 28 28" ' + STROKE + '><rect x="4" y="9" width="20" height="16" rx="1" fill="' + c + '"/><path d="M4 9l4-5h12l4 5M9 14h4v4H9zM15 14h4v4h-4z"/></svg>';
    if (lvl === 1) return '<svg viewBox="0 0 28 28" ' + STROKE + '><path d="M4 13L14 4l10 9v12H4z" fill="' + c + '"/><path d="M11 25v-7h6v7"/></svg>';
    return '<svg viewBox="0 0 28 28" ' + STROKE + '><rect x="5" y="7" width="18" height="18" rx="1" fill="' + c + '"/><path d="M9 11h4v4H9zM15 11h4v4h-4zM12 25v-5h4v5"/></svg>';
  };
  ICON.sun = '<svg viewBox="0 0 24 24" ' + STROKE + '><circle cx="12" cy="12" r="4.5" fill="#ffc23d"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4"/></svg>';
  ICON.moon = '<svg viewBox="0 0 24 24" ' + STROKE + '><path d="M19 15.5A8 8 0 0 1 8.5 5a8 8 0 1 0 10.5 10.5z" fill="#c9b8f2"/></svg>';
  ICON.job = '<svg viewBox="0 0 28 28" ' + STROKE + '><rect x="3" y="9" width="22" height="15" rx="3" fill="#e9c79f"/><path d="M10 9V6h8v3M3 15h22"/></svg>';
  window.ICON = ICON; window.THEME_ICON = THEME_ICON; window.THEME_TINT = THEME_TINT; window.EVENT_TINT = EVENT_TINT;
})();
