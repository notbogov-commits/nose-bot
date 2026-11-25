// ЮТУБЕРЫ — 3D-квартира на three.js (low-poly, мягкий свет и тени, день и ночь).
// Комната строится один раз; дальше каждый кадр меняется только видимость предметов, позы людей и свет.
// Если WebGL недоступен, игра использует 2D-комнату из room.js.
(function () {
  'use strict';
  var THREE = window.THREE;
  if (!THREE) return;

  var RX = 9, RZ = 7, WH = 3.0, WT = 0.16;           // размер комнаты, высота и толщина стен
  var WIN = { x0: 4.5, x1: 7.0, y0: 1.0, y1: 2.45 };  // проём окна в задней стене
  var renderer, scene, camera, canvasEl, built = false, ok = true;
  var M = {}, G = {}, built3d = {}, now = 0, yaw = 0, yawTarget = 0;
  var sun, hemi, moon, deskLamp, monitorLight, studioL, studioR;

  /* ---------- Материалы и текстуры ---------- */
  function mat(color, opts) {
    var m = new THREE.MeshStandardMaterial({ color: color, roughness: 0.85, metalness: 0.0, flatShading: true });
    if (opts) for (var k in opts) m[k] = opts[k];
    return m;
  }
  function canvasTex(w, h, paint, repeat) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.userData = { canvas: c };
    return t;
  }
  // Повторяющиеся текстуры стен и пола (мягкие, чтобы предметы не сливались с фоном)
  var TEX = {
    wallpaper0: function () { return canvasTex(64, 64, function (g) {
      g.fillStyle = '#efe3c8'; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = 'rgba(160,120,70,.45)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(32, 8); g.lineTo(50, 32); g.lineTo(32, 56); g.lineTo(14, 32); g.closePath(); g.stroke();
      g.fillStyle = 'rgba(150,95,60,.55)'; g.beginPath(); g.arc(32, 32, 4, 0, 7); g.fill();
    }, [12, 4]); },
    wallpaper1: function () { return canvasTex(64, 64, function (g) { g.fillStyle = '#eef2f7'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#e3e9f1'; g.fillRect(0, 0, 18, 64); }, [14, 4]); },
    brick: function () { return canvasTex(128, 64, function (g) {
      g.fillStyle = '#9c5843'; g.fillRect(0, 0, 128, 64);
      var c = ['#c4775b', '#b96d52', '#cc8264', '#bd7257'];
      for (var r = 0; r < 4; r++) for (var k = -1; k < 3; k++) { g.fillStyle = c[(r + k + 4) % 4]; g.fillRect(k * 64 + (r % 2) * 32 + 2, r * 16 + 2, 60, 12); }
    }, [7, 6]); },
    wood: function () { return canvasTex(64, 128, function (g) { g.fillStyle = '#caa071'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#b98d5f'; g.fillRect(0, 0, 3, 128); g.fillRect(32, 0, 2, 128); }, [10, 2]); },
    parquet: function () { return canvasTex(128, 128, function (g) {
      var c = ['#b9844f', '#a97543', '#c28d58', '#9f6c3c'];
      for (var r = 0; r < 4; r++) for (var k = 0; k < 4; k++) { g.fillStyle = c[(r + k) % 4]; if ((r + k) % 2) g.fillRect(k * 32, r * 32, 32, 15), g.fillRect(k * 32, r * 32 + 16, 32, 16); else g.fillRect(k * 32, r * 32, 15, 32), g.fillRect(k * 32 + 16, r * 32, 16, 32); }
    }, [5, 4]); },
    laminate: function () { return canvasTex(128, 64, function (g) { g.fillStyle = '#dcbf95'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#cfb085'; [0, 21, 42].forEach(function (y) { g.fillRect(0, y, 128, 2); }); g.fillRect(40, 0, 2, 21); g.fillRect(96, 21, 2, 21); g.fillRect(20, 42, 2, 22); }, [5, 5]); },
    concrete: function () { return canvasTex(64, 64, function (g) { g.fillStyle = '#aab2bc'; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(31,35,56,.08)'; for (var i = 0; i < 18; i++) g.fillRect((i * 37) % 64, (i * 23) % 64, 3, 3); }, [5, 4]); },
    darkwood: function () { return canvasTex(128, 64, function (g) { g.fillStyle = '#5f4634'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#523b2c'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 32, 128, 2); g.fillRect(70, 0, 2, 32); g.fillRect(20, 32, 2, 32); }, [5, 5]); }
  };
  var APT = [
    { wall: 'wallpaper0', floor: 'parquet', rug: '#8e2f2f', trim: '#8a5a35' },
    { wall: 'wallpaper1', floor: 'laminate', rug: '#7fb8d9', trim: '#f4f6fb' },
    { wall: 'brick', floor: 'concrete', rug: '#e8b23a', trim: '#2c3150' },
    { wall: 'wood', floor: 'darkwood', rug: '#e07a3a', trim: '#d9b56a' }
  ];
  var texCache = {};
  function tex(name) { if (!texCache[name]) texCache[name] = TEX[name](); return texCache[name]; }

  /* ---------- Помощники построения ---------- */
  function box(w, h, d, material, x, y, z, parent) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    (parent || scene).add(m); return m;
  }
  function cyl(rt, rb, h, material, x, y, z, parent, seg) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), material);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    (parent || scene).add(m); return m;
  }
  function sphere(r, material, x, y, z, parent) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), material);
    m.position.set(x, y, z); m.castShadow = true; (parent || scene).add(m); return m;
  }
  function group(x, y, z, parent) { var g = new THREE.Group(); g.position.set(x, y || 0, z); (parent || scene).add(g); return g; }
  // Картинка на стене (плоскость с текстурой из 2D-холста)
  function picture(w, h, pxW, pxH, paint, parent) {
    var t = canvasTex(pxW * 2, pxH * 2, function (g) { g.scale(2, 2); paint(g); });
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9 }));
    m.receiveShadow = true; (parent || scene).add(m); m.userData.tex = t; return m;
  }
  function repaint(mesh, pxW, pxH, paint) {
    var t = mesh.userData.tex, c = t.userData.canvas, g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.scale(2, 2); paint(g); t.needsUpdate = true;
  }

  /* ---------- Человечек (low-poly) ---------- */
  function person(colors) {
    var root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    var shirt = mat(colors.shirt), pants = mat(colors.pants || '#3a3f5c'), skin = mat(colors.skin), hair = mat(colors.hair), black = mat('#1f2338');
    var legL = box(0.16, 0.5, 0.18, pants, -0.1, 0.25, 0, body), legR = box(0.16, 0.5, 0.18, pants, 0.1, 0.25, 0, body);
    var torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.32, 4, 10), shirt); torso.position.y = 0.78; torso.castShadow = true; body.add(torso);
    var armL = new THREE.Group(), armR = new THREE.Group(); armL.position.set(-0.26, 0.98, 0); armR.position.set(0.26, 0.98, 0); body.add(armL); body.add(armR);
    var aL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 3, 8), shirt); aL.position.y = -0.2; aL.castShadow = true; armL.add(aL);
    var aR = aL.clone(); armR.add(aR);
    var head = new THREE.Group(); head.position.y = 1.32; body.add(head);
    sphere(0.23, skin, 0, 0, 0, head);
    var hr = new THREE.Mesh(new THREE.SphereGeometry(0.245, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hair); hr.rotation.x = -0.35; hr.position.set(0, 0.02, -0.02); hr.castShadow = true; head.add(hr);
    var eyeL = sphere(0.03, black, -0.08, 0.02, 0.21, head), eyeR = sphere(0.03, black, 0.08, 0.02, 0.21, head);
    var mouth = box(0.08, 0.02, 0.02, mat('#c4453a'), 0, -0.09, 0.215, head); mouth.castShadow = false;
    root.userData = { body: body, legL: legL, legR: legR, armL: armL, armR: armR, head: head, mouth: mouth, eyes: [eyeL, eyeR], hat: null };
    return root;
  }
  function setHat(p, theme) {
    var u = p.userData; if (u.hatTheme === theme) return;
    if (u.hat) u.head.remove(u.hat);
    u.hatTheme = theme; var h = new THREE.Group(); u.hat = h; u.head.add(h);
    if (theme === 'cooking') { cyl(0.18, 0.2, 0.12, mat('#fff'), 0, 0.22, 0, h); sphere(0.2, mat('#fff'), 0, 0.36, 0, h); }
    else if (theme === 'games' || theme === 'music' || theme === 'asmr') {
      var c = mat(theme === 'games' ? '#7c6cf2' : theme === 'music' ? '#ff5d4f' : '#c9b8f2');
      var band = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 6, 16, Math.PI), mat('#2c3150')); band.position.y = 0.02; h.add(band);
      box(0.08, 0.14, 0.12, c, -0.26, 0, 0, h); box(0.08, 0.14, 0.12, c, 0.26, 0, 0, h);
    } else if (theme === 'fitness') { var b = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.035, 6, 20), mat('#ff5d4f')); b.rotation.x = Math.PI / 2; b.position.y = 0.1; h.add(b); }
    else if (theme === 'science') { box(0.12, 0.06, 0.04, mat('#8fd3ff'), -0.08, 0.12, 0.2, h); box(0.12, 0.06, 0.04, mat('#8fd3ff'), 0.08, 0.12, 0.2, h); }
    else if (theme === 'truecrime') { cyl(0.34, 0.34, 0.03, mat('#6b5a46'), 0, 0.17, 0, h, 16); cyl(0.19, 0.21, 0.18, mat('#6b5a46'), 0, 0.27, 0, h); }
    else if (theme === 'pranks') { var cap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mat('#ffc23d')); cap.position.y = 0.04; h.add(cap); box(0.2, 0.03, 0.2, mat('#ffc23d'), 0, 0.06, 0.25, h); }
  }
  function animatePerson(p, o) {
    var u = p.userData, t = now + (o.seed || 0);
    u.body.position.y = o.bob ? Math.abs(Math.sin(t * 9)) * 0.03 : Math.sin(t * 2) * 0.008;
    var wave = o.wave ? Math.sin(t * 9) * 0.6 : 0;
    u.armL.rotation.x = o.typing ? -1.1 + Math.sin(t * 18) * 0.08 : wave * 0.5; u.armR.rotation.x = o.typing ? -1.1 + Math.cos(t * 18) * 0.08 : -wave;
    u.armL.rotation.z = o.typing ? 0 : 0.12; u.armR.rotation.z = o.typing ? 0 : -0.12 - (o.phone ? 0 : 0);
    if (o.phone) { u.armR.rotation.x = -1.4; u.armR.rotation.z = 0.3; }
    u.mouth.scale.y = o.talk ? 1 + Math.abs(Math.sin(t * 14)) * 3 : 1;
    var blink = (t % 4) < 0.12 ? 0.15 : 1; u.eyes[0].scale.y = blink; u.eyes[1].scale.y = blink;
    if (o.seated) { u.legL.rotation.x = u.legR.rotation.x = -Math.PI / 2; u.legL.position.set(-0.1, 0.42, 0.22); u.legR.position.set(0.1, 0.42, 0.22); }
    else { u.legL.rotation.x = u.legR.rotation.x = 0; u.legL.position.set(-0.1, 0.25, 0); u.legR.position.set(0.1, 0.25, 0); }
  }

  /* ---------- Постройка комнаты ---------- */
  function build() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#e7eff6');
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    // свет
    hemi = new THREE.HemisphereLight('#ffffff', '#b9a88f', 0.55); scene.add(hemi);
    sun = new THREE.DirectionalLight('#fff3dc', 1.2); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -8; sun.shadow.camera.right = 8; sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
    sun.shadow.bias = -0.0015; sun.shadow.radius = 4; scene.add(sun); scene.add(sun.target); sun.target.position.set(4.5, 0, 3.5);
    moon = new THREE.DirectionalLight('#8fa6ff', 0); moon.position.set(6, 8, -6); scene.add(moon);
    deskLamp = new THREE.PointLight('#ffcf8a', 0, 7, 1.6); deskLamp.position.set(0.6, 1.4, 1.3); deskLamp.castShadow = true; deskLamp.shadow.mapSize.set(512, 512); scene.add(deskLamp);
    monitorLight = new THREE.PointLight('#9fb4ff', 0, 3.5, 2); monitorLight.position.set(1.0, 1.25, 2.4); scene.add(monitorLight);
    studioL = new THREE.PointLight('#fff6e0', 0, 5, 2); studioR = new THREE.PointLight('#fff6e0', 0, 5, 2); scene.add(studioL); scene.add(studioR);

    // пол и стены
    G.floor = new THREE.Mesh(new THREE.BoxGeometry(RX, 0.12, RZ), mat('#fff', { flatShading: false })); G.floor.position.set(RX / 2, -0.06, RZ / 2); G.floor.receiveShadow = true; scene.add(G.floor);
    var wallMat = M.wall = mat('#fff', { flatShading: false }), wallMatL = M.wallL = mat('#eeeeee', { flatShading: false });
    // задняя стена с проёмом окна
    G.back = new THREE.Group(); scene.add(G.back);
    [[0, WIN.x0, 0, WH], [WIN.x1, RX, 0, WH], [WIN.x0, WIN.x1, 0, WIN.y0], [WIN.x0, WIN.x1, WIN.y1, WH]].forEach(function (r) {
      var w = r[1] - r[0], h = r[3] - r[2], m = box(w, h, WT, wallMat, r[0] + w / 2, r[2] + h / 2, -WT / 2, G.back); m.castShadow = false;
    });
    G.left = box(WT, WH, RZ + WT, wallMatL, -WT / 2, WH / 2, RZ / 2 - WT / 2); G.left.castShadow = false;
    M.trim = mat('#8a5a35');
    box(RX, 0.12, 0.04, M.trim, RX / 2, 0.06, 0.02); box(0.04, 0.12, RZ, M.trim, 0.02, 0.06, RZ / 2);
    // окно: рама, подоконник, стекло, вид снаружи
    M.frame = mat('#f4efe4');
    var fx = (WIN.x0 + WIN.x1) / 2, fw = WIN.x1 - WIN.x0, fh = WIN.y1 - WIN.y0, fy = (WIN.y0 + WIN.y1) / 2;
    box(fw, 0.08, 0.2, M.frame, fx, WIN.y0, 0.02); box(fw, 0.08, 0.12, M.frame, fx, WIN.y1, -0.02);
    box(0.08, fh, 0.12, M.frame, WIN.x0, fy, -0.02); box(0.08, fh, 0.12, M.frame, WIN.x1, fy, -0.02); box(0.06, fh, 0.1, M.frame, fx, fy, -0.02);
    box(fw + 0.3, 0.05, 0.32, M.frame, fx, WIN.y0 - 0.04, 0.12);
    M.sky = new THREE.MeshBasicMaterial({ color: '#9fd8ff' });
    var skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(fw + 0.6, fh + 0.5), M.sky); skyPlane.position.set(fx, fy, -0.4); scene.add(skyPlane);
    G.outside = new THREE.Group(); scene.add(G.outside);
    M.building = mat('#d9d4c7'); M.bwin = new THREE.MeshBasicMaterial({ color: '#8fb5d6' }); M.bwinLit = new THREE.MeshBasicMaterial({ color: '#ffd86b' });
    // вид из окна: маленькая сцена прямо за стеной, видна только через проём
    G.panelka = box(fw - 0.3, 1.1, 0.1, M.building, fx - 0.15, WIN.y0 + 0.45, -0.34, G.outside); G.panelka.castShadow = false;
    for (var r = 0; r < 2; r++) for (var c = 0; c < 5; c++) { var wm = box(0.22, 0.2, 0.02, (r * 7 + c * 3) % 4 === 0 ? M.bwinLit : M.bwin, fx - 0.95 + c * 0.42, WIN.y0 + 0.25 + r * 0.42, -0.28, G.outside); wm.castShadow = false; wm.userData.litable = (r * 7 + c * 3) % 4 === 0; }
    G.tree = group(fx + 0.95, WIN.y0 - 0.2, -0.3, G.outside); cyl(0.04, 0.05, 0.6, mat('#6b4a2d'), 0, 0.3, 0, G.tree); sphere(0.32, mat('#2f8f6a'), 0, 0.75, 0, G.tree);
    G.city = group(0, 0, 0, G.outside);
    [[-1.0, 0.9], [-0.6, 1.25], [-0.2, 0.7], [0.25, 1.35], [0.7, 0.95], [1.05, 1.15]].forEach(function (b) { var m = box(0.34, b[1], 0.2, M.building, fx + b[0], WIN.y0 + b[1] / 2 - 0.05, -0.32, G.city); m.castShadow = false; });
    G.radiator = group(5.75, 0, 0.18);
    box(1.4, 0.5, 0.14, mat('#eef0f2'), 0, 0.55, 0, G.radiator); for (var k = 0; k < 9; k++) box(0.04, 0.52, 0.16, mat('#dfe3e8'), -0.6 + k * 0.15, 0.55, 0, G.radiator);

    // картинки на стенах
    G.decor1 = picture(2.2, 1.48, 122, 82, function () {}); G.decor1.position.set(2.2, 1.85, 0.01);
    G.decor2 = picture(2.2, 1.48, 130, 86, function () {}); G.decor2.position.set(0.01, 1.75, 5.55); G.decor2.rotation.y = Math.PI / 2;
    G.awards = picture(3.6, 0.76, 210, 44, function () {}); G.awards.position.set(0.01, 2.6, 2.45); G.awards.rotation.y = Math.PI / 2;
    G.socket = box(0.12, 0.16, 0.02, mat('#f4f6fb'), 0.6, 0.35, 0.01);

    // ковёр на полу
    M.rug = mat('#8e2f2f'); G.rug = box(3.3, 0.02, 2.6, M.rug, 4.35, 0.01, 2.3); G.rug.castShadow = false;
    G.rugIn = box(2.7, 0.025, 2.0, mat('#2c3a66'), 4.35, 0.012, 2.3); G.rugIn.castShadow = false;

    // стол и компьютер у левой стены
    M.desk = mat('#8a5a35');
    G.desk = group(0, 0, 0);
    box(0.95, 0.06, 2.8, M.desk, 0.62, 0.76, 2.4, G.desk);
    [[0.2, 1.05], [1.04, 1.05], [0.2, 3.75], [1.04, 3.75]].forEach(function (p) { box(0.06, 0.74, 0.06, M.desk, p[0], 0.37, p[1], G.desk); });
    G.laptop = group(0.55, 0.79, 2.4, G.desk);
    box(0.4, 0.03, 0.55, mat('#c9d2de'), 0.1, 0.015, 0, G.laptop);
    G.screens = [];
    function screen(w, h) {
      var t = canvasTex(128, 80, function () {});
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t })); m.userData.tex = t; G.screens.push(m); return m;
    }
    var lid = group(-0.1, 0.02, 0, G.laptop); lid.rotation.z = 0.25; box(0.03, 0.34, 0.55, mat('#c9d2de'), 0, 0.17, 0, lid);
    var ls = screen(0.5, 0.3); ls.position.set(0.02, 0.17, 0); ls.rotation.y = Math.PI / 2; lid.add(ls);
    G.monitors = [];
    [[1.65], [3.15], [2.4]].forEach(function (p, i) {
      var g = group(0.32, 0.79, p[0], G.desk);
      box(0.18, 0.03, 0.26, mat('#2c3150'), 0, 0.015, 0, g); box(0.04, 0.28, 0.04, mat('#2c3150'), 0, 0.16, 0, g);
      box(0.05, 0.5, 0.82, mat('#2c3150'), 0.02, 0.52, 0, g);
      var sc = screen(0.76, 0.44); sc.position.set(0.05, 0.52, 0); sc.rotation.y = Math.PI / 2; g.add(sc);
      G.monitors.push(g);
    });
    G.upper = [];
    [[1.65], [3.15]].forEach(function (p) { var g = group(0.32, 1.55, p[0], G.desk); box(0.05, 0.5, 0.82, mat('#2c3150'), 0.02, 0.3, 0, g); var sc = screen(0.76, 0.44); sc.position.set(0.05, 0.3, 0); sc.rotation.y = Math.PI / 2; g.add(sc); G.upper.push(g); });
    G.keyboard = box(0.25, 0.03, 0.75, mat('#f4f6fb'), 0.85, 0.8, 2.4, G.desk);
    G.lamp = group(0.35, 0.79, 1.1, G.desk); cyl(0.1, 0.12, 0.04, mat('#2c3150'), 0, 0.02, 0, G.lamp); cyl(0.02, 0.02, 0.45, mat('#2c3150'), 0, 0.25, 0, G.lamp);
    G.lampHead = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.16, 12, 1, true), mat('#ffc23d', { side: THREE.DoubleSide })); G.lampHead.position.set(0.08, 0.5, 0); G.lampHead.rotation.z = 0.8; G.lamp.add(G.lampHead);
    G.tower = box(0.3, 0.62, 0.5, mat('#2c3150'), 1.3, 0.31, 3.45); G.rack = box(0.7, 1.9, 0.8, mat('#2c3150'), 0.45, 0.95, 4.35);
    G.router = group(7.95, 2.32, 0.32); box(0.5, 0.08, 0.28, mat('#f4f6fb'), 0, 0.04, 0, G.router);
    G.antA = box(0.025, 0.28, 0.025, mat('#2c3150'), -0.2, 0.22, -0.1, G.router); G.antB = box(0.025, 0.28, 0.025, mat('#2c3150'), 0.2, 0.22, -0.1, G.router);
    G.dish = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.4), mat('#c9d2de', { side: THREE.DoubleSide })); G.dish.position.set(0, 0.35, 0); G.dish.rotation.x = -0.9; G.router.add(G.dish);
    G.chair = group(1.65, 0, 2.4); cyl(0.05, 0.05, 0.42, mat('#5b6180'), 0, 0.21, 0, G.chair); box(0.5, 0.08, 0.5, mat('#5b6180'), 0, 0.45, 0, G.chair); G.chairBack = box(0.08, 0.6, 0.5, mat('#5b6180'), 0.25, 0.8, 0, G.chair);

    // шкаф: советская «стенка» или книжный шкаф
    G.wardrobe = group(8.0, 0, 0.32); box(1.6, 2.3, 0.55, mat('#7a4a2a'), 0, 1.15, 0, G.wardrobe);
    box(0.7, 0.9, 0.02, new THREE.MeshStandardMaterial({ color: '#bfe3f2', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 }), -0.38, 1.75, 0.285, G.wardrobe);
    for (var d = 0; d < 3; d++) sphere(0.07, mat('#fff'), -0.6 + d * 0.22, 1.6, 0.2, G.wardrobe);
    box(1.5, 0.95, 0.02, mat('#6b3f23'), 0, 0.55, 0.285, G.wardrobe);
    G.shelf = group(8.0, 0, 0.32); box(1.6, 2.3, 0.5, mat('#e3bf91'), 0, 1.15, 0, G.shelf);
    var bookC = ['#ff5d4f', '#7c6cf2', '#2fbf94', '#ffc23d', '#8fd3ff', '#ff8a3d'];
    for (var sh = 0; sh < 3; sh++) { box(1.5, 0.04, 0.46, mat('#c99b6b'), 0, 0.45 + sh * 0.7, 0.03, G.shelf); for (var bk = 0; bk < 7; bk++) if ((bk + sh) % 4 !== 3) box(0.14, 0.42, 0.34, mat(bookC[(bk + sh * 2) % 6]), -0.6 + bk * 0.19, 0.68 + sh * 0.7, 0.04, G.shelf); }

    // кровать или диван
    G.bed = group(0.75, 0, 5.55);
    box(1.3, 0.38, 2.5, M.desk, 0, 0.19, 0, G.bed); box(1.2, 0.16, 2.4, mat('#f4f6fb'), 0, 0.46, 0, G.bed);
    M.plaid = mat('#3f7d5c'); box(1.24, 0.06, 1.5, M.plaid, 0, 0.56, 0.45, G.bed); box(0.9, 0.14, 0.45, mat('#fff'), 0, 0.6, -0.9, G.bed); box(1.3, 0.85, 0.08, M.desk, 0, 0.42, -1.25, G.bed);
    G.couch = group(8.4, 0, 4.0); M.couch = mat('#7c6cf2');
    box(0.9, 0.42, 2.6, M.couch, 0, 0.21, 0, G.couch); box(0.3, 0.55, 2.6, M.couch, 0.3, 0.7, 0, G.couch); box(0.9, 0.62, 0.2, M.couch, 0, 0.31, -1.3, G.couch); box(0.9, 0.62, 0.2, M.couch, 0, 0.31, 1.3, G.couch);
    G.plants = [];
    [[8.5, 1.3], [0.45, 0.45]].forEach(function (p) { var g = group(p[0], 0, p[1]); cyl(0.2, 0.16, 0.38, mat('#e5a46b'), 0, 0.19, 0, g); for (var l = 0; l < 5; l++) { var leaf = sphere(0.14, mat('#2fbf94'), Math.cos(l * 1.3) * 0.12, 0.5 + (l % 2) * 0.12, Math.sin(l * 1.3) * 0.12, g); leaf.scale.set(0.7, 1.6, 0.7); } G.plants.push(g); });

    // свет для съёмки: пары стоек по бокам ютубера
    G.lights = [];
    [[2.9, 1.2], [5.7, 1.2]].forEach(function (p) {
      var g = group(p[0], 0, p[1]);
      for (var k2 = 0; k2 < 3; k2++) { var leg = box(0.03, 0.5, 0.03, mat('#2c3150'), Math.cos(k2 * 2.1) * 0.15, 0.22, Math.sin(k2 * 2.1) * 0.15, g); leg.rotation.z = Math.cos(k2 * 2.1) * 0.5; leg.rotation.x = -Math.sin(k2 * 2.1) * 0.5; }
      g.userData.pole = cyl(0.02, 0.02, 1.4, mat('#2c3150'), 0, 0.9, 0, g);
      var emiss = mat('#fffbe8', { emissive: new THREE.Color('#fff3c4'), emissiveIntensity: 0 });
      g.userData.ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 8, 24), emiss); g.userData.ring.position.y = 1.65; g.add(g.userData.ring);
      g.userData.box = box(0.55, 0.45, 0.1, emiss, 0, 1.65, 0, g);
      g.userData.small = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 12, 1, true), mat('#ffc23d', { side: THREE.DoubleSide, emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0 })); g.userData.small.position.y = 0.95; g.add(g.userData.small);
      g.userData.mat = emiss;
      g.lookAt(4.3, 0, 2.3);
      G.lights.push(g);
    });

    // микрофоны
    G.mic = group(4.95, 0, 2.75);
    G.micStand = cyl(0.02, 0.02, 1.15, mat('#2c3150'), 0, 0.58, 0, G.mic); cyl(0.14, 0.14, 0.03, mat('#2c3150'), 0, 0.015, 0, G.mic);
    G.micUsb = cyl(0.05, 0.05, 0.2, mat('#c9d2de'), 0, 1.22, 0, G.mic);
    G.micCond = cyl(0.07, 0.07, 0.26, mat('#ffc23d'), 0, 1.24, 0, G.mic);
    G.micBroad = group(0, 0, 0, G.mic); var arm = box(0.03, 0.03, 0.55, mat('#2c3150'), -0.12, 1.32, -0.25, G.micBroad); arm.rotation.y = 0.5; cyl(0.06, 0.06, 0.3, mat('#2c3150'), -0.25, 1.32, -0.48, G.micBroad);

    // камера на штативе (смотрит на ютубера)
    G.cam = group(6.3, 0, 4.9); G.cam.lookAt(4.3, 0, 2.3);
    for (var k3 = 0; k3 < 3; k3++) { var tl = box(0.035, 1.25, 0.035, mat('#2c3150'), Math.cos(k3 * 2.1) * 0.18, 0.6, Math.sin(k3 * 2.1) * 0.18, G.cam); tl.rotation.z = Math.cos(k3 * 2.1) * 0.25; tl.rotation.x = -Math.sin(k3 * 2.1) * 0.25; }
    G.camBodies = [];
    [[0.08, 0.32, 0.18], [0.2, 0.2, 0.2], [0.34, 0.24, 0.42], [0.42, 0.32, 0.6], [0.55, 0.42, 0.75]].forEach(function (s, i) {
      var g = group(0, 1.3, 0, G.cam);
      if (i === 1) sphere(0.14, mat('#f4f6fb'), 0, 0, 0, g); else box(s[0], s[1], s[2], mat(i >= 3 ? '#3a3f5c' : '#2c3150'), 0, 0, 0, g);
      if (i >= 2) { var lens = cyl(0.08 + i * 0.02, 0.08 + i * 0.02, 0.2, mat('#1f2338'), 0, 0, s[2] / 2 + 0.08, g); lens.rotation.x = Math.PI / 2; }
      if (i === 4) box(0.4, 0.3, 0.06, mat('#ffc23d'), 0, 0.05, s[2] / 2 + 0.22, g);
      g.userData.tally = sphere(0.035, new THREE.MeshBasicMaterial({ color: '#5b6180' }), 0, s[1] / 2 + 0.04, -s[2] / 2 + 0.05, g);
      G.camBodies.push(g);
    });

    // люди
    G.host = person({ shirt: '#ff5d4f', skin: '#ffd9b8', hair: '#3b2a22' });
    G.op = person({ shirt: '#ff8a3d', skin: '#f1c8a0', hair: '#1f2338' });
    G.mg = person({ shirt: '#2fbf94', skin: '#c99b74', hair: '#8a4b2d' });
    [G.host, G.op, G.mg].forEach(function (p) { scene.add(p); });
    G.phone = box(0.1, 0.16, 0.02, mat('#2c3150'), 0.3, 0.75, 0.25, G.mg.userData.body);
    built = true;
  }

  /* ---------- Экраны мониторов ---------- */
  var lastScreen = 0;
  function paintScreen(g, mode, i, opt) {
    g.fillStyle = '#20264a'; g.fillRect(0, 0, 128, 80);
    if (mode === 'editor') {
      g.fillStyle = '#7c6cf2'; g.fillRect(4, 4, 120, 72);
      g.fillStyle = '#c99b74'; g.beginPath(); g.arc(64, 34, 16, 0, 7); g.fill(); g.fillStyle = '#1f2338'; g.beginPath(); g.arc(64, 30, 16, Math.PI, 0); g.fill();
      g.fillStyle = '#ffc23d'; g.fillRect(44, 54, 40, 22); g.fillStyle = '#2fbf94'; g.beginPath(); g.arc(114, 12, 5, 0, 7); g.fill();
      return;
    }
    if (mode === 'edit') {
      [['#ff5d4f', 8, 14, 50], ['#ffc23d', 64, 14, 34], ['#2fbf94', 18, 32, 64], ['#7c6cf2', 8, 50, 40], ['#8fd3ff', 54, 50, 56]].forEach(function (b) { g.fillStyle = b[0]; g.fillRect(b[1], b[2], b[3], 12); });
      g.fillStyle = '#fff'; g.fillRect(8 + ((now * 50 + i * 20) % 110), 6, 3, 66); return;
    }
    if (mode === 'upload') {
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(64, 12); g.lineTo(80, 32); g.lineTo(70, 32); g.lineTo(70, 46); g.lineTo(58, 46); g.lineTo(58, 32); g.lineTo(48, 32); g.closePath(); g.fill();
      g.fillStyle = '#3a3f5c'; g.fillRect(14, 58, 100, 10); g.fillStyle = '#2fbf94'; g.fillRect(14, 58, Math.max(4, 100 * (opt.upProgress || 0)), 10); return;
    }
    for (var r = 0; r < 2; r++) for (var c = 0; c < 3; c++) { g.fillStyle = ['#ff5d4f', '#ffc23d', '#2fbf94', '#7c6cf2', '#8fd3ff', '#ff8a3d'][(r * 3 + c + i) % 6]; g.fillRect(10 + c * 38, 12 + r * 32, 32, 22); }
  }

  /* ---------- Свет по времени суток ---------- */
  var SKY = [[0, '#1d2550'], [5, '#1d2550'], [7, '#ffc9a3'], [9, '#9fd8ff'], [17, '#9fd8ff'], [19, '#ff9f80'], [21, '#1d2550'], [24, '#1d2550']];
  function lerpColor(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), t); }
  function skyAt(h) { for (var i = 0; i < SKY.length - 1; i++) if (h >= SKY[i][0] && h < SKY[i + 1][0]) return lerpColor(SKY[i][1], SKY[i + 1][1], (h - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0])); return new THREE.Color(SKY[0][1]); }
  function daylight(h) { if (h >= 8 && h <= 18) return 1; if (h < 5 || h >= 21) return 0; if (h < 8) return (h - 5) / 3; return (21 - h) / 3; }

  /* ---------- Применение состояния игры ---------- */
  var cur = {};
  function applyHome(home) {
    if (cur.home === home) return; cur.home = home;
    var A = APT[home];
    M.wall.map = tex(A.wall); M.wallL.map = tex(A.wall); M.wall.needsUpdate = M.wallL.needsUpdate = true;
    M.wallL.color.set(home === 3 ? '#e9e2d8' : '#e6e6e6');
    G.floor.material.map = tex(A.floor); G.floor.material.needsUpdate = true;
    M.trim.color.set(A.trim); M.rug.color.set(A.rug); M.desk.color.set(home >= 2 ? '#3a3f5c' : home === 0 ? '#8a5a35' : '#d8b386');
    M.frame.color.set(home >= 3 ? '#d9b56a' : home === 2 ? '#2c3150' : '#f4efe4');
    M.couch.color.set(home >= 3 ? '#7c6cf2' : '#ff8a3d'); M.plaid.color.set(home === 0 ? '#3f7d5c' : '#7c6cf2');
    G.rugIn.visible = home === 0; G.radiator.visible = home <= 1; G.bed.visible = home <= 1; G.couch.visible = home >= 2;
    G.wardrobe.visible = home === 0; G.shelf.visible = home > 0; G.plants.forEach(function (p) { p.visible = home >= 1; });
    G.panelka.visible = home <= 1; G.tree.visible = home <= 1; G.city.visible = home >= 2;
    G.outside.children.forEach(function (m) { if (m.userData.litable !== undefined) m.visible = home <= 1; });
    cur.decor2 = null;
  }
  function applyPictures(S, L) {
    var ch1 = S.channels[0] && S.channels[0].theme, ch2 = S.channels[1] && !S.channels[1].banned ? S.channels[1].theme : null;
    if (cur.decor1 !== ch1) { cur.decor1 = ch1; repaint(G.decor1, 122, 82, function (g) { if (ch1) window.Room.paintDecor(g, ch1); }); }
    var key2 = (ch2 || '') + '/' + S.home;
    if (cur.decor2 !== key2) { cur.decor2 = key2; repaint(G.decor2, 130, 86, function (g) { if (ch2) window.Room.paintDecor(g, ch2); else if (S.home <= 1) window.Room.paintCarpet(g); else window.Room.paintArt(g, S.home); }); }
    var ak = S.milestones.length;
    if (cur.awards !== ak) { cur.awards = ak; repaint(G.awards, 210, 44, function (g) { window.Room.paintAwards(g, S.milestones, L.MILESTONES); }); }
  }

  function draw(S, L, t, opt) {
    now = t;
    if (!built) build();
    if (!S.channels.length) { renderer.render(scene, camera); return; }
    var ch = L.channel(S), gear = ch.gear, staff = ch.staff;
    applyHome(S.home); applyPictures(S, L);
    var clk = L.clock(S), hour = clk.hour + clk.minute / 60, day = daylight(hour), dark = 1 - day;

    // небо и солнце
    var sky = skyAt(hour); M.sky.color.copy(sky);
    scene.background = new THREE.Color('#e7eff6').lerp(new THREE.Color('#1c2140'), dark * 0.85);
    var sunAng = ((hour - 6) / 12) * Math.PI;
    sun.position.set(5.75 + Math.cos(sunAng) * 4, 2 + Math.sin(Math.max(0.15, sunAng)) * 5, -6);
    sun.intensity = 1.35 * day; sun.color.copy(lerpColor('#ffb27a', '#fff3dc', Math.min(1, day * 1.5)));
    hemi.intensity = 0.18 + 0.5 * day; hemi.color.copy(lerpColor('#6f7fc9', '#ffffff', day));
    moon.intensity = 0.35 * dark;
    G.outside.children.forEach(function (m) { if (m.userData.litable) m.material = dark > 0.5 ? M.bwinLit : M.bwin; });
    M.building.color.set(dark > 0.5 ? '#4a5070' : '#d9d4c7');

    // кто где: съёмка — на ковре, монтаж/публикация — за столом, на работе — дома никого
    var atDesk = !opt.atJob && opt.selfDesk, onSet = !opt.atJob && !atDesk;
    G.host.visible = !opt.atJob; setHat(G.host, S.channels[0].theme);
    if (onSet) { G.host.position.set(4.3, 0, 2.3); G.host.rotation.y = Math.PI * 0.28; }
    else if (atDesk) { G.host.position.set(1.62, 0.08, 2.4); G.host.rotation.y = -Math.PI / 2; }
    animatePerson(G.host, { talk: onSet && opt.recording, wave: onSet && opt.recording, bob: onSet && opt.recording, seated: atDesk, typing: atDesk, seed: 1 });
    G.chair.rotation.y = 0;

    // техника на канале
    G.laptop.visible = gear.pc === 0;
    G.monitors[0].visible = gear.pc >= 2; G.monitors[1].visible = gear.pc >= 2; G.monitors[2].visible = gear.pc === 1;
    G.upper.forEach(function (u) { u.visible = gear.pc >= 3; });
    G.tower.visible = gear.pc >= 1 && gear.pc < 3; G.rack.visible = gear.pc >= 3 && S.home >= 2;
    G.router.visible = gear.net >= 0; G.antA.visible = gear.net >= 1; G.antB.visible = gear.net >= 2; G.dish.visible = gear.net >= 3;
    G.mic.visible = gear.mic >= 2; G.micUsb.visible = gear.mic === 2; G.micCond.visible = gear.mic === 3; G.micBroad.visible = gear.mic === 4; G.micStand.visible = gear.mic >= 2;
    G.cam.visible = gear.cam >= 0;
    G.camBodies.forEach(function (b, i) { b.visible = i === gear.cam; b.userData.tally.material.color.set(opt.recording && Math.sin(now * 8) > 0 ? '#ff5d4f' : '#5b6180'); });
    var lt = gear.light;
    G.lights.forEach(function (g) {
      var u = g.userData; g.visible = lt >= 1;
      u.pole.visible = lt >= 2; u.small.visible = lt === 1; u.ring.visible = lt === 2; u.box.visible = lt >= 3;
      u.box.scale.set(lt === 4 ? 1.3 : 1, lt === 4 ? 1.3 : 1, 1);
      var glow = opt.recording ? 1 : 0.25; u.mat.emissiveIntensity = glow; u.small.material.emissiveIntensity = glow;
    });
    var studio = lt >= 2 && opt.recording && !opt.atJob ? 0.5 + lt * 0.25 : 0;
    studioL.intensity = studio; studioR.intensity = studio;
    studioL.position.set(2.9, 1.7, 1.2); studioR.position.set(5.7, 1.7, 1.2);

    // команда (монтажёр работает онлайн — его видно на мониторе)
    G.op.visible = staff.op.n > 0; G.op.position.set(6.95, 0, 5.45); G.op.rotation.y = Math.PI * 1.25;
    animatePerson(G.op, { seed: 2 });
    G.mg.visible = staff.mg.n > 0; G.mg.position.set(2.3, 0, 5.7); G.mg.rotation.y = Math.PI * 0.2;
    animatePerson(G.mg, { phone: true, talk: Math.sin(now * 0.8) > 0.3, seed: 3 });

    // мониторы: что на экране
    var mode = opt.uploading ? 'upload' : opt.editing ? 'edit' : 'idle';
    if (now - lastScreen > 0.1) {
      lastScreen = now;
      G.screens.forEach(function (sc, i) {
        var edIdx = gear.pc === 0 ? 0 : gear.pc === 1 ? 3 : 1;
        var m = (staff.ed.n > 0 && i === edIdx && (opt.editing || opt.edOnline)) ? 'editor' : mode;
        var tx = sc.userData.tex; paintScreen(tx.userData.canvas.getContext('2d'), m, i, opt); tx.needsUpdate = true;
      });
    }
    // настольная лампа и свет экранов: вечером и ночью
    deskLamp.intensity = dark > 0.2 && !opt.atJob ? 0.9 + dark * 0.6 : 0;
    G.lampHead.material.emissive = new THREE.Color(deskLamp.intensity > 0 ? '#ffb347' : '#000000'); G.lampHead.material.emissiveIntensity = 0.8;
    monitorLight.intensity = (opt.editing || opt.uploading) && !opt.atJob ? 0.5 + dark : 0.1 * dark;

    // камера сцены: изометрический ракурс, можно чуть повернуть мышью
    yaw += (yawTarget - yaw) * 0.12;
    var cx = RX / 2 + 0.3, cz = RZ / 2, r = 14, ang = Math.PI / 4 + yaw;
    camera.position.set(cx + Math.sin(ang) * r, 9.5, cz + Math.cos(ang) * r); camera.lookAt(cx, 0.9, cz);
    renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (!renderer) return;
    renderer.setSize(w, h, false);
    var aspect = w / h, view = 4.5;
    camera.left = -view * aspect; camera.right = view * aspect; camera.top = view; camera.bottom = -view; camera.updateProjectionMatrix();
  }

  function init(canvas) {
    canvasEl = canvas;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: false });
    } catch (e) { ok = false; return false; }
    if (!renderer.getContext()) { ok = false; return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    build();
    // поворот комнаты мышью или пальцем (немного, чтобы не потерять ракурс)
    var dragging = false, x0 = 0, y0 = 0;
    canvas.addEventListener('pointerdown', function (e) { dragging = true; x0 = e.clientX; y0 = yawTarget; });
    window.addEventListener('pointerup', function () { dragging = false; });
    window.addEventListener('pointermove', function (e) { if (!dragging) return; yawTarget = Math.max(-0.45, Math.min(0.45, y0 + (e.clientX - x0) * 0.004)); });
    canvas.addEventListener('dblclick', function () { yawTarget = 0; });
    return true;
  }

  window.Room3D = { init: init, draw: draw, resize: resize, ok: function () { return ok; } };
})();
