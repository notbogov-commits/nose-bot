// ЮТУБЕРЫ 3D — мир от первого лица на three.js.
// Комната строится один раз; дальше каждый кадр меняются свет, техника, люди и экраны.
// Управление: WASD — ходить, мышь — смотреть, ЛКМ по вещи — действие (камера, компьютер).
(function () {
  'use strict';
  var THREE = window.THREE;

  var RX = 9, RZ = 7, WH = 2.8, WT = 0.16, EYE = 1.6, RADIUS = 0.3, REACH = 3.8;
  var WIN = { x0: 4.5, x1: 7.0, y0: 0.95, y1: 2.25 };
  var DOOR = { x0: 6.9, x1: 7.9 };
  var renderer, scene, camera, raycaster, canvasEl, built = false;
  var M = {}, G = {}, now = 0;
  var sun, hemi, moon, ceilLamp, deskLamp, monitorLight, studioL, studioR;
  var SPAWN = { x: 3.4, z: 6.1, yaw: -1.08, pitch: -0.1 };   // у двери, лицом к камере
  var player = { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw, pitch: SPAWN.pitch, vx: 0, vz: 0 };
  var keys = {}, locked = false, freeLook = false, sens = 1, hovered = null, interactables = [];
  // freeLook — запасной режим, если браузер не дал захватить мышь: смотрим, просто двигая мышь над игрой

  /* ---------- Материалы и текстуры ---------- */
  function mat(color, opts) {
    var m = new THREE.MeshStandardMaterial({ color: color, roughness: 0.85, metalness: 0, flatShading: true });
    if (opts) for (var k in opts) m[k] = opts[k];
    return m;
  }
  function canvasTex(w, h, paint, repeat) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.userData = { canvas: c }; return t;
  }
  var TEX = {
    wallpaper0: function () { return canvasTex(64, 64, function (g) {
      g.fillStyle = '#efe3c8'; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = 'rgba(160,120,70,.45)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(32, 8); g.lineTo(50, 32); g.lineTo(32, 56); g.lineTo(14, 32); g.closePath(); g.stroke();
      g.fillStyle = 'rgba(150,95,60,.55)'; g.beginPath(); g.arc(32, 32, 4, 0, 7); g.fill();
    }, [10, 3.5]); },
    wallpaper1: function () { return canvasTex(64, 64, function (g) { g.fillStyle = '#eef2f7'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#e3e9f1'; g.fillRect(0, 0, 18, 64); }, [12, 3.5]); },
    brick: function () { return canvasTex(128, 64, function (g) {
      g.fillStyle = '#9c5843'; g.fillRect(0, 0, 128, 64);
      var c = ['#c4775b', '#b96d52', '#cc8264', '#bd7257'];
      for (var r = 0; r < 4; r++) for (var k = -1; k < 3; k++) { g.fillStyle = c[(r + k + 4) % 4]; g.fillRect(k * 64 + (r % 2) * 32 + 2, r * 16 + 2, 60, 12); }
    }, [6, 5]); },
    wood: function () { return canvasTex(64, 128, function (g) { g.fillStyle = '#caa071'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#b98d5f'; g.fillRect(0, 0, 3, 128); g.fillRect(32, 0, 2, 128); }, [9, 2]); },
    parquet: function () { return canvasTex(128, 128, function (g) {
      var c = ['#b9844f', '#a97543', '#c28d58', '#9f6c3c'];
      for (var r = 0; r < 4; r++) for (var k = 0; k < 4; k++) { g.fillStyle = c[(r + k) % 4]; if ((r + k) % 2) g.fillRect(k * 32, r * 32, 32, 15), g.fillRect(k * 32, r * 32 + 16, 32, 16); else g.fillRect(k * 32, r * 32, 15, 32), g.fillRect(k * 32 + 16, r * 32, 16, 32); }
    }, [5, 4]); },
    laminate: function () { return canvasTex(128, 64, function (g) { g.fillStyle = '#dcbf95'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#cfb085'; [0, 21, 42].forEach(function (y) { g.fillRect(0, y, 128, 2); }); g.fillRect(40, 0, 2, 21); g.fillRect(96, 21, 2, 21); g.fillRect(20, 42, 2, 22); }, [5, 5]); },
    concrete: function () { return canvasTex(64, 64, function (g) { g.fillStyle = '#aab2bc'; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(31,35,56,.08)'; for (var i = 0; i < 18; i++) g.fillRect((i * 37) % 64, (i * 23) % 64, 3, 3); }, [5, 4]); },
    darkwood: function () { return canvasTex(128, 64, function (g) { g.fillStyle = '#5f4634'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#523b2c'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 32, 128, 2); g.fillRect(70, 0, 2, 32); g.fillRect(20, 32, 2, 32); }, [5, 5]); },
    ceiling: function () { return canvasTex(64, 64, function (g) { g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(31,35,56,.04)'; g.fillRect(0, 0, 64, 1); }, [6, 5]); }
  };
  var APT = [
    { wall: 'wallpaper0', floor: 'parquet', rug: '#8e2f2f', trim: '#8a5a35' },
    { wall: 'wallpaper1', floor: 'laminate', rug: '#7fb8d9', trim: '#f4f6fb' },
    { wall: 'brick', floor: 'concrete', rug: '#e8b23a', trim: '#2c3150' },
    { wall: 'wood', floor: 'darkwood', rug: '#e07a3a', trim: '#d9b56a' }
  ];
  var texCache = {};
  function tex(name) { if (!texCache[name]) texCache[name] = TEX[name](); return texCache[name]; }

  /* ---------- Помощники ---------- */
  function box(w, h, d, material, x, y, z, parent) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || scene).add(m); return m;
  }
  function cyl(rt, rb, h, material, x, y, z, parent, seg) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 14), material);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || scene).add(m); return m;
  }
  function sphere(r, material, x, y, z, parent) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), material); m.position.set(x, y, z); m.castShadow = true; (parent || scene).add(m); return m;
  }
  function group(x, y, z, parent) { var g = new THREE.Group(); g.position.set(x, y || 0, z); (parent || scene).add(g); return g; }
  function picture(w, h, pxW, pxH, parent) {
    var t = canvasTex(pxW * 3, pxH * 3, function () {});
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9 }));
    m.receiveShadow = true; (parent || scene).add(m); m.userData.tex = t; m.userData.px = [pxW, pxH]; return m;
  }
  function repaint(mesh, paint) {
    var t = mesh.userData.tex, c = t.userData.canvas, g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.scale(3, 3); paint(g); t.needsUpdate = true;
  }
  // Предмет, на который можно навести и кликнуть
  function interactable(obj, kind) { obj.traverse(function (o) { if (o.isMesh) o.userData.kind = kind; }); interactables.push(obj); obj.userData.kind = kind; }

  /* ---------- Люди (сотрудники) ---------- */
  function person(colors) {
    var root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    var shirt = mat(colors.shirt), pants = mat('#3a3f5c'), skin = mat(colors.skin), hair = mat(colors.hair), black = mat('#1f2338');
    box(0.16, 0.8, 0.18, pants, -0.1, 0.4, 0, body); box(0.16, 0.8, 0.18, pants, 0.1, 0.4, 0, body);
    var torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.4, 4, 10), shirt); torso.position.y = 1.1; torso.castShadow = true; body.add(torso);
    var armL = new THREE.Group(), armR = new THREE.Group(); armL.position.set(-0.26, 1.35, 0); armR.position.set(0.26, 1.35, 0); body.add(armL); body.add(armR);
    var a = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.4, 3, 8), shirt); a.position.y = -0.25; armL.add(a); armR.add(a.clone());
    var head = group(0, 1.62, 0, body); sphere(0.2, skin, 0, 0, 0, head);
    var hr = new THREE.Mesh(new THREE.SphereGeometry(0.215, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hair); hr.rotation.x = -0.35; head.add(hr);
    sphere(0.025, black, -0.07, 0.02, 0.185, head); sphere(0.025, black, 0.07, 0.02, 0.185, head);
    root.userData = { body: body, armL: armL, armR: armR };
    return root;
  }

  /* ---------- Постройка комнаты ---------- */
  function build() {
    scene = new THREE.Scene(); scene.background = new THREE.Color('#9fd8ff');
    camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 80); camera.rotation.order = 'YXZ';
    raycaster = new THREE.Raycaster(); raycaster.far = REACH;

    hemi = new THREE.HemisphereLight('#ffffff', '#b9a88f', 0.5); scene.add(hemi);
    sun = new THREE.DirectionalLight('#fff3dc', 1.0); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -8; sun.shadow.camera.right = 8; sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8; sun.shadow.bias = -0.0015;
    scene.add(sun); scene.add(sun.target); sun.target.position.set(4.5, 0, 3.5);
    moon = new THREE.DirectionalLight('#8fa6ff', 0); moon.position.set(6, 8, -6); scene.add(moon);
    ceilLamp = new THREE.PointLight('#ffe2b0', 0, 12, 1.4); ceilLamp.position.set(RX / 2, WH - 0.45, RZ / 2); ceilLamp.castShadow = true; ceilLamp.shadow.mapSize.set(512, 512); scene.add(ceilLamp);
    deskLamp = new THREE.PointLight('#ffcf8a', 0, 5, 1.8); deskLamp.position.set(0.6, 1.4, 1.3); scene.add(deskLamp);
    monitorLight = new THREE.PointLight('#9fb4ff', 0, 3.5, 2); monitorLight.position.set(1.0, 1.3, 2.4); scene.add(monitorLight);
    studioL = new THREE.PointLight('#fff6e0', 0, 5, 2); studioR = new THREE.PointLight('#fff6e0', 0, 5, 2); scene.add(studioL); scene.add(studioR);

    // пол, потолок
    G.floor = new THREE.Mesh(new THREE.BoxGeometry(RX, 0.1, RZ), mat('#fff', { flatShading: false })); G.floor.position.set(RX / 2, -0.05, RZ / 2); G.floor.receiveShadow = true; scene.add(G.floor);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(RX, RZ), mat('#fff', { flatShading: false, map: tex('ceiling') })); ceil.rotation.x = Math.PI / 2; ceil.position.set(RX / 2, WH, RZ / 2); scene.add(ceil);
    // люстра
    G.lamp = group(RX / 2, WH, RZ / 2); cyl(0.01, 0.01, 0.35, mat('#2c3150'), 0, -0.17, 0, G.lamp);
    M.shade = mat('#f4efe4', { emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0, side: THREE.DoubleSide });
    var shade = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.25, 18, 1, true), M.shade); shade.position.y = -0.42; G.lamp.add(shade);

    // стены: задняя с окном, левая, правая, передняя с дверью
    M.wall = mat('#fff', { flatShading: false }); M.wallL = mat('#ececec', { flatShading: false }); M.wallR = mat('#e4e4e4', { flatShading: false }); M.wallF = mat('#f2f2f2', { flatShading: false });
    [[0, WIN.x0, 0, WH], [WIN.x1, RX, 0, WH], [WIN.x0, WIN.x1, 0, WIN.y0], [WIN.x0, WIN.x1, WIN.y1, WH]].forEach(function (r) {
      var w = r[1] - r[0], h = r[3] - r[2]; box(w, h, WT, M.wall, r[0] + w / 2, r[2] + h / 2, -WT / 2).castShadow = false;
    });
    box(WT, WH, RZ, M.wallL, -WT / 2, WH / 2, RZ / 2).castShadow = false;
    box(WT, WH, RZ, M.wallR, RX + WT / 2, WH / 2, RZ / 2).castShadow = false;
    [[0, DOOR.x0, 0, WH], [DOOR.x1, RX, 0, WH], [DOOR.x0, DOOR.x1, 2.1, WH]].forEach(function (r) {
      var w = r[1] - r[0], h = r[3] - r[2]; box(w, h, WT, M.wallF, r[0] + w / 2, r[2] + h / 2, RZ + WT / 2).castShadow = false;
    });
    M.door = mat('#a8794c'); box(DOOR.x1 - DOOR.x0, 2.1, 0.06, M.door, (DOOR.x0 + DOOR.x1) / 2, 1.05, RZ - 0.01);
    sphere(0.04, mat('#d9b56a'), DOOR.x0 + 0.15, 1.0, RZ - 0.06);
    M.trim = mat('#8a5a35');
    box(RX, 0.1, 0.03, M.trim, RX / 2, 0.05, 0.02); box(0.03, 0.1, RZ, M.trim, 0.02, 0.05, RZ / 2); box(0.03, 0.1, RZ, M.trim, RX - 0.02, 0.05, RZ / 2); box(RX, 0.1, 0.03, M.trim, RX / 2, 0.05, RZ - 0.02);

    // окно и вид наружу
    M.frame = mat('#f4efe4');
    var fx = (WIN.x0 + WIN.x1) / 2, fw = WIN.x1 - WIN.x0, fh = WIN.y1 - WIN.y0, fy = (WIN.y0 + WIN.y1) / 2;
    box(fw, 0.07, 0.18, M.frame, fx, WIN.y0, 0.02); box(fw, 0.07, 0.12, M.frame, fx, WIN.y1, -0.02);
    box(0.07, fh, 0.12, M.frame, WIN.x0, fy, -0.02); box(0.07, fh, 0.12, M.frame, WIN.x1, fy, -0.02); box(0.05, fh, 0.1, M.frame, fx, fy, -0.02);
    box(fw + 0.3, 0.05, 0.3, M.frame, fx, WIN.y0 - 0.04, 0.12);
    M.sky = new THREE.MeshBasicMaterial({ color: '#9fd8ff' });
    var sky = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), M.sky); sky.position.set(fx, 3, -12); scene.add(sky);
    M.building = mat('#d9d4c7'); M.bwin = new THREE.MeshBasicMaterial({ color: '#8fb5d6' }); M.bwinLit = new THREE.MeshBasicMaterial({ color: '#ffd86b' });
    G.outside = group(0, 0, 0); G.outWins = [];
    G.panelka = group(0, 0, 0, G.outside); box(14, 8, 2, M.building, fx, 0.5, -8, G.panelka);
    for (var r = 0; r < 6; r++) for (var c = 0; c < 10; c++) { var wm = box(0.8, 0.9, 0.05, M.bwin, fx - 5.4 + c * 1.2, -2.2 + r * 1.4, -6.97, G.panelka); wm.userData.lit = (r * 7 + c * 3) % 4 === 0; G.outWins.push(wm); }
    G.tree = group(fx + 2.2, -3, -4.5, G.outside); cyl(0.12, 0.16, 3, mat('#6b4a2d'), 0, 1.5, 0, G.tree); sphere(1.4, mat('#2f8f6a'), 0, 3.8, 0, G.tree);
    G.city = group(0, 0, 0, G.outside);
    [[-6, 9], [-3.8, 13], [-1.5, 7], [1, 15], [3.4, 10], [5.8, 12], [8, 8]].forEach(function (b) { box(2, b[1], 2, M.building, fx + b[0], b[1] / 2 - 6, -12, G.city); });
    G.radiator = group(5.75, 0, 0.2);
    box(1.4, 0.5, 0.14, mat('#eef0f2'), 0, 0.5, 0, G.radiator); for (var k = 0; k < 9; k++) box(0.04, 0.52, 0.16, mat('#dfe3e8'), -0.6 + k * 0.15, 0.5, 0, G.radiator);

    // картинки на стенах
    G.decor1 = picture(1.8, 1.21, 122, 82); G.decor1.position.set(2.2, 1.65, 0.01);
    G.decor2 = picture(1.9, 1.26, 130, 86); G.decor2.position.set(0.01, 1.55, 5.55); G.decor2.rotation.y = Math.PI / 2;
    G.awards = picture(2.9, 0.61, 210, 44); G.awards.position.set(0.01, 2.3, 2.45); G.awards.rotation.y = Math.PI / 2;
    G.poster = picture(1.4, 0.94, 122, 82); G.poster.position.set(RX - 0.01, 1.6, 3.5); G.poster.rotation.y = -Math.PI / 2;

    // ковёр в зоне съёмки
    M.rug = mat('#8e2f2f'); G.rug = box(3.0, 0.02, 2.4, M.rug, 4.3, 0.01, 2.3); G.rug.castShadow = false;
    G.rugIn = box(2.4, 0.025, 1.8, mat('#2c3a66'), 4.3, 0.012, 2.3); G.rugIn.castShadow = false;
    G.mark = box(0.5, 0.03, 0.08, mat('#ffc23d'), 4.3, 0.02, 2.3); G.mark2 = box(0.08, 0.03, 0.5, mat('#ffc23d'), 4.3, 0.02, 2.3);

    // стол и компьютер у левой стены — сюда кликать для монтажа и публикации
    M.desk = mat('#8a5a35');
    G.desk = group(0, 0, 0);
    box(0.95, 0.06, 2.8, M.desk, 0.62, 0.76, 2.4, G.desk);
    [[0.2, 1.05], [1.04, 1.05], [0.2, 3.75], [1.04, 3.75]].forEach(function (p) { box(0.06, 0.74, 0.06, M.desk, p[0], 0.37, p[1], G.desk); });
    G.pc = group(0, 0, 0, G.desk);
    G.screens = [];
    function screen(w, h) { var t = canvasTex(256, 160, function () {}); var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t })); m.userData.tex = t; G.screens.push(m); return m; }
    G.laptop = group(0.55, 0.79, 2.4, G.pc);
    box(0.4, 0.03, 0.55, mat('#c9d2de'), 0.1, 0.015, 0, G.laptop);
    var lid = group(-0.1, 0.02, 0, G.laptop); lid.rotation.z = 0.25; box(0.03, 0.34, 0.55, mat('#c9d2de'), 0, 0.17, 0, lid);
    var ls = screen(0.5, 0.3); ls.position.set(0.02, 0.17, 0); ls.rotation.y = Math.PI / 2; lid.add(ls);
    G.monitors = [];
    [1.65, 3.15, 2.4].forEach(function (z) {
      var g = group(0.32, 0.79, z, G.pc);
      box(0.18, 0.03, 0.26, mat('#2c3150'), 0, 0.015, 0, g); box(0.04, 0.28, 0.04, mat('#2c3150'), 0, 0.16, 0, g);
      box(0.05, 0.5, 0.82, mat('#2c3150'), 0.02, 0.52, 0, g);
      var sc = screen(0.76, 0.44); sc.position.set(0.05, 0.52, 0); sc.rotation.y = Math.PI / 2; g.add(sc); G.monitors.push(g);
    });
    G.upper = [];
    [1.65, 3.15].forEach(function (z) { var g = group(0.32, 1.55, z, G.pc); box(0.05, 0.5, 0.82, mat('#2c3150'), 0.02, 0.3, 0, g); var sc = screen(0.76, 0.44); sc.position.set(0.05, 0.3, 0); sc.rotation.y = Math.PI / 2; g.add(sc); G.upper.push(g); });
    G.keyboard = box(0.25, 0.03, 0.75, mat('#f4f6fb'), 0.85, 0.8, 2.4, G.pc);
    G.deskLamp = group(0.35, 0.79, 1.1, G.desk); cyl(0.1, 0.12, 0.04, mat('#2c3150'), 0, 0.02, 0, G.deskLamp); cyl(0.02, 0.02, 0.45, mat('#2c3150'), 0, 0.25, 0, G.deskLamp);
    G.lampHead = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.16, 12, 1, true), mat('#ffc23d', { side: THREE.DoubleSide })); G.lampHead.position.set(0.08, 0.5, 0); G.lampHead.rotation.z = 0.8; G.deskLamp.add(G.lampHead);
    G.tower = box(0.3, 0.62, 0.5, mat('#2c3150'), 1.3, 0.31, 3.45); G.rack = box(0.7, 1.9, 0.8, mat('#2c3150'), 0.45, 0.95, 4.35);
    G.chair = group(1.55, 0, 2.4); cyl(0.05, 0.05, 0.42, mat('#5b6180'), 0, 0.21, 0, G.chair); box(0.5, 0.08, 0.5, mat('#5b6180'), 0, 0.45, 0, G.chair); box(0.08, 0.6, 0.5, mat('#5b6180'), 0.25, 0.8, 0, G.chair);
    interactable(G.pc, 'pc');

    // шкаф: «стенка» или стеллаж; роутер сверху
    G.wardrobe = group(8.0, 0, 0.32); box(1.6, 2.3, 0.55, mat('#7a4a2a'), 0, 1.15, 0, G.wardrobe);
    box(0.7, 0.9, 0.02, new THREE.MeshStandardMaterial({ color: '#bfe3f2', roughness: 0.2, transparent: true, opacity: 0.85 }), -0.38, 1.75, 0.285, G.wardrobe);
    for (var d = 0; d < 3; d++) sphere(0.07, mat('#fff'), -0.6 + d * 0.22, 1.6, 0.2, G.wardrobe);
    box(1.5, 0.95, 0.02, mat('#6b3f23'), 0, 0.55, 0.285, G.wardrobe);
    G.shelf = group(8.0, 0, 0.32); box(1.6, 2.3, 0.5, mat('#e3bf91'), 0, 1.15, 0, G.shelf);
    var bookC = ['#ff5d4f', '#7c6cf2', '#2fbf94', '#ffc23d', '#8fd3ff', '#ff8a3d'];
    for (var sh = 0; sh < 3; sh++) { box(1.5, 0.04, 0.46, mat('#c99b6b'), 0, 0.45 + sh * 0.7, 0.03, G.shelf); for (var bk = 0; bk < 7; bk++) if ((bk + sh) % 4 !== 3) box(0.14, 0.42, 0.34, mat(bookC[(bk + sh * 2) % 6]), -0.6 + bk * 0.19, 0.68 + sh * 0.7, 0.04, G.shelf); }
    G.router = group(7.95, 2.32, 0.32); box(0.5, 0.08, 0.28, mat('#f4f6fb'), 0, 0.04, 0, G.router);
    G.antA = box(0.025, 0.28, 0.025, mat('#2c3150'), -0.2, 0.22, -0.1, G.router); G.antB = box(0.025, 0.28, 0.025, mat('#2c3150'), 0.2, 0.22, -0.1, G.router);
    G.dish = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.4), mat('#c9d2de', { side: THREE.DoubleSide })); G.dish.position.set(0, 0.35, 0); G.dish.rotation.x = -0.9; G.router.add(G.dish);

    // кровать / диван, холодильник, растение
    G.bed = group(0.75, 0, 5.55);
    box(1.3, 0.38, 2.5, M.desk, 0, 0.19, 0, G.bed); box(1.2, 0.16, 2.4, mat('#f4f6fb'), 0, 0.46, 0, G.bed);
    M.plaid = mat('#3f7d5c'); box(1.24, 0.06, 1.5, M.plaid, 0, 0.56, 0.45, G.bed); box(0.9, 0.14, 0.45, mat('#fff'), 0, 0.6, -0.9, G.bed); box(1.3, 0.85, 0.08, M.desk, 0, 0.42, -1.25, G.bed);
    G.couch = group(8.4, 0, 4.0); M.couch = mat('#7c6cf2');
    box(0.9, 0.42, 2.6, M.couch, 0, 0.21, 0, G.couch); box(0.3, 0.55, 2.6, M.couch, 0.3, 0.7, 0, G.couch); box(0.9, 0.62, 0.2, M.couch, 0, 0.31, -1.3, G.couch); box(0.9, 0.62, 0.2, M.couch, 0, 0.31, 1.3, G.couch);
    G.fridge = group(0.45, 0, 0.5); box(0.7, 1.5, 0.66, mat('#f4f6fb'), 0, 0.75, 0, G.fridge); box(0.02, 0.5, 0.04, mat('#c9d2de'), 0.36, 1.05, 0.2, G.fridge); box(0.71, 0.02, 0.67, mat('#c9d2de'), 0, 0.95, 0, G.fridge);
    G.plant = group(8.5, 0, 1.3); cyl(0.2, 0.16, 0.38, mat('#e5a46b'), 0, 0.19, 0, G.plant); for (var l = 0; l < 5; l++) { var leaf = sphere(0.14, mat('#2fbf94'), Math.cos(l * 1.3) * 0.12, 0.5 + (l % 2) * 0.12, Math.sin(l * 1.3) * 0.12, G.plant); leaf.scale.set(0.7, 1.6, 0.7); }

    // свет для съёмки
    G.lights = [];
    [[3.0, 1.3], [5.6, 1.3]].forEach(function (p) {
      var g = group(p[0], 0, p[1]);
      for (var k2 = 0; k2 < 3; k2++) { var leg = box(0.03, 0.5, 0.03, mat('#2c3150'), Math.cos(k2 * 2.1) * 0.15, 0.22, Math.sin(k2 * 2.1) * 0.15, g); leg.rotation.z = Math.cos(k2 * 2.1) * 0.5; leg.rotation.x = -Math.sin(k2 * 2.1) * 0.5; }
      g.userData.pole = cyl(0.02, 0.02, 1.4, mat('#2c3150'), 0, 0.9, 0, g);
      var emiss = mat('#fffbe8', { emissive: new THREE.Color('#fff3c4'), emissiveIntensity: 0 });
      g.userData.ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 8, 24), emiss); g.userData.ring.position.y = 1.65; g.add(g.userData.ring);
      g.userData.box = box(0.55, 0.45, 0.1, emiss, 0, 1.65, 0, g);
      g.userData.small = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.2, 12, 1, true), mat('#ffc23d', { side: THREE.DoubleSide, emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0 })); g.userData.small.position.y = 0.95; g.add(g.userData.small);
      g.userData.mat = emiss; g.lookAt(4.3, 0, 2.3); G.lights.push(g);
    });
    // микрофон
    G.mic = group(4.95, 0, 2.75);
    G.micStand = cyl(0.02, 0.02, 1.35, mat('#2c3150'), 0, 0.68, 0, G.mic); cyl(0.14, 0.14, 0.03, mat('#2c3150'), 0, 0.015, 0, G.mic);
    G.micUsb = cyl(0.05, 0.05, 0.2, mat('#c9d2de'), 0, 1.42, 0, G.mic);
    G.micCond = cyl(0.07, 0.07, 0.26, mat('#ffc23d'), 0, 1.44, 0, G.mic);
    G.micBroad = group(0, 0, 0, G.mic); var arm = box(0.03, 0.03, 0.55, mat('#2c3150'), -0.12, 1.52, -0.25, G.micBroad); arm.rotation.y = 0.5; cyl(0.06, 0.06, 0.3, mat('#2c3150'), -0.25, 1.52, -0.48, G.micBroad);

    // камера на штативе — сюда кликать для съёмки
    G.cam = group(6.2, 0, 4.7); G.cam.lookAt(4.3, 0, 2.3);
    for (var k3 = 0; k3 < 3; k3++) { var tl = box(0.035, 1.35, 0.035, mat('#2c3150'), Math.cos(k3 * 2.1) * 0.2, 0.65, Math.sin(k3 * 2.1) * 0.2, G.cam); tl.rotation.z = Math.cos(k3 * 2.1) * 0.25; tl.rotation.x = -Math.sin(k3 * 2.1) * 0.25; }
    G.camBodies = [];
    [[0.08, 0.32, 0.18], [0.2, 0.2, 0.2], [0.34, 0.24, 0.42], [0.42, 0.32, 0.6], [0.55, 0.42, 0.75]].forEach(function (s, i) {
      var g = group(0, 1.42, 0, G.cam);
      if (i === 1) sphere(0.14, mat('#f4f6fb'), 0, 0, 0, g); else box(s[0], s[1], s[2], mat(i >= 3 ? '#3a3f5c' : '#2c3150'), 0, 0, 0, g);
      if (i >= 2) { var lens = cyl(0.08 + i * 0.02, 0.08 + i * 0.02, 0.2, mat('#1f2338'), 0, 0, s[2] / 2 + 0.08, g); lens.rotation.x = Math.PI / 2; }
      if (i === 4) box(0.4, 0.3, 0.06, mat('#ffc23d'), 0, 0.05, s[2] / 2 + 0.22, g);
      g.userData.tally = sphere(0.035, new THREE.MeshBasicMaterial({ color: '#5b6180' }), 0, s[1] / 2 + 0.04, -s[2] / 2 + 0.05, g);
      G.camBodies.push(g);
    });
    // большая невидимая «зона клика» вокруг штатива, чтобы было легко попасть
    var camHit = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.8), new THREE.MeshBasicMaterial({ visible: false })); camHit.position.y = 0.9; G.cam.add(camHit);
    interactable(G.cam, 'camera');

    // сотрудники
    G.op = person({ shirt: '#ff8a3d', skin: '#f1c8a0', hair: '#1f2338' }); scene.add(G.op);
    G.mg = person({ shirt: '#2fbf94', skin: '#c99b74', hair: '#8a4b2d' }); scene.add(G.mg);
    box(0.1, 0.16, 0.02, mat('#2c3150'), 0.3, 1.25, 0.25, G.mg.userData.body);
    built = true;
  }

  // Столкновения: прямоугольники на полу, сквозь которые нельзя пройти
  function obstacles(S) {
    var o = [[0.05, 1.15, 0.9, 3.9], [0.05, 0.85, 0.1, 0.9], [7.15, 8.85, 0.0, 0.65], [5.0, 6.5, 0.0, 0.35], [6.2 - 0.35, 6.2 + 0.35, 4.7 - 0.35, 4.7 + 0.35]];
    if (S.home <= 1) o.push([0.05, 1.45, 4.25, 6.85]); else o.push([7.9, 8.95, 2.6, 5.4]);
    if (G.rack && G.rack.visible) o.push([0.05, 0.85, 3.9, 4.8]);
    if (G.lights[0].visible) { o.push([2.75, 3.25, 1.05, 1.55]); o.push([5.35, 5.85, 1.05, 1.55]); }
    if (G.mic.visible) o.push([4.8, 5.1, 2.6, 2.9]);
    if (G.op.visible) o.push([6.45, 7.05, 4.9, 5.5]);
    if (G.mg.visible) o.push([7.3, 7.9, 1.8, 2.4]);
    return o;
  }
  function blocked(x, z, obs) {
    if (x < RADIUS || x > RX - RADIUS || z < RADIUS || z > RZ - RADIUS) return true;
    for (var i = 0; i < obs.length; i++) { var b = obs[i]; if (x > b[0] - RADIUS && x < b[1] + RADIUS && z > b[2] - RADIUS && z < b[3] + RADIUS) return true; }
    return false;
  }

  /* ---------- Экраны ---------- */
  var lastScreen = 0;
  function paintScreen(g, mode, i, opt) {
    g.fillStyle = '#20264a'; g.fillRect(0, 0, 256, 160);
    if (mode === 'editor') {
      g.fillStyle = '#7c6cf2'; g.fillRect(8, 8, 240, 144); g.fillStyle = '#c99b74'; g.beginPath(); g.arc(128, 68, 32, 0, 7); g.fill();
      g.fillStyle = '#1f2338'; g.beginPath(); g.arc(128, 60, 32, Math.PI, 0); g.fill(); g.fillStyle = '#ffc23d'; g.fillRect(88, 108, 80, 44);
      g.fillStyle = '#2fbf94'; g.beginPath(); g.arc(228, 24, 10, 0, 7); g.fill(); return;
    }
    if (mode === 'edit') {
      [['#ff5d4f', 16, 28, 100], ['#ffc23d', 128, 28, 68], ['#2fbf94', 36, 64, 128], ['#7c6cf2', 16, 100, 80], ['#8fd3ff', 108, 100, 112]].forEach(function (b) { g.fillStyle = b[0]; g.fillRect(b[1], b[2], b[3], 24); });
      g.fillStyle = '#fff'; g.fillRect(16 + ((now * 90 + i * 40) % 220), 12, 5, 132);
      g.fillStyle = '#fff'; g.font = '700 16px sans-serif'; g.fillText(opt.editLabel || '', 16, 150); return;
    }
    if (mode === 'upload') {
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(128, 24); g.lineTo(160, 64); g.lineTo(140, 64); g.lineTo(140, 92); g.lineTo(116, 92); g.lineTo(116, 64); g.lineTo(96, 64); g.closePath(); g.fill();
      g.fillStyle = '#3a3f5c'; g.fillRect(28, 116, 200, 20); g.fillStyle = '#2fbf94'; g.fillRect(28, 116, Math.max(8, 200 * (opt.upProgress || 0)), 20); return;
    }
    for (var r = 0; r < 2; r++) for (var c = 0; c < 3; c++) { g.fillStyle = ['#ff5d4f', '#ffc23d', '#2fbf94', '#7c6cf2', '#8fd3ff', '#ff8a3d'][(r * 3 + c + i) % 6]; g.fillRect(20 + c * 76, 24 + r * 64, 64, 44); }
  }

  /* ---------- Свет по времени суток ---------- */
  var SKY = [[0, '#1d2550'], [5, '#1d2550'], [7, '#ffc9a3'], [9, '#9fd8ff'], [17, '#9fd8ff'], [19, '#ff9f80'], [21, '#1d2550'], [24, '#1d2550']];
  function lerpColor(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), t); }
  function skyAt(h) { for (var i = 0; i < SKY.length - 1; i++) if (h >= SKY[i][0] && h < SKY[i + 1][0]) return lerpColor(SKY[i][1], SKY[i + 1][1], (h - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0])); return new THREE.Color(SKY[0][1]); }
  function daylight(h) { if (h >= 8 && h <= 18) return 1; if (h < 5 || h >= 21) return 0; if (h < 8) return (h - 5) / 3; return (21 - h) / 3; }

  /* ---------- Применение состояния ---------- */
  var cur = {};
  function applyHome(home) {
    if (cur.home === home) return; cur.home = home;
    var A = APT[home];
    [M.wall, M.wallL, M.wallR, M.wallF].forEach(function (m) { m.map = tex(A.wall); m.needsUpdate = true; });
    G.floor.material.map = tex(A.floor); G.floor.material.needsUpdate = true;
    M.trim.color.set(A.trim); M.rug.color.set(A.rug); M.desk.color.set(home >= 2 ? '#3a3f5c' : home === 0 ? '#8a5a35' : '#d8b386');
    M.frame.color.set(home >= 3 ? '#d9b56a' : home === 2 ? '#2c3150' : '#f4efe4');
    M.couch.color.set(home >= 3 ? '#7c6cf2' : '#ff8a3d'); M.plaid.color.set(home === 0 ? '#3f7d5c' : '#7c6cf2');
    M.door.color.set(home >= 2 ? '#2c3150' : '#a8794c');
    G.rugIn.visible = home === 0; G.radiator.visible = home <= 1; G.bed.visible = home <= 1; G.couch.visible = home >= 2;
    G.wardrobe.visible = home === 0; G.shelf.visible = home > 0; G.plant.visible = home >= 1;
    G.panelka.visible = home <= 1; G.tree.visible = home <= 1; G.city.visible = home >= 2;
    cur.decor2 = null;
  }
  function applyPictures(S, L) {
    var ch1 = S.channels[0] && S.channels[0].theme, ch2 = S.channels[1] && !S.channels[1].banned ? S.channels[1].theme : null;
    if (cur.decor1 !== ch1) { cur.decor1 = ch1; repaint(G.decor1, function (g) { if (ch1) window.Room.paintDecor(g, ch1); }); }
    var key2 = (ch2 || '') + '/' + S.home;
    if (cur.decor2 !== key2) { cur.decor2 = key2; repaint(G.decor2, function (g) { if (ch2) window.Room.paintDecor(g, ch2); else if (S.home <= 1) window.Room.paintCarpet(g); else window.Room.paintArt(g, S.home); }); }
    if (cur.poster !== S.home) { cur.poster = S.home; repaint(G.poster, function (g) { window.Room.paintArt(g, S.home); }); }
    var ak = S.milestones.length;
    if (cur.awards !== ak) { cur.awards = ak; repaint(G.awards, function (g) { window.Room.paintAwards(g, S.milestones, L.MILESTONES); }); }
  }

  /* ---------- Кадр ---------- */
  function update(S, L, t, dt, opt) {
    now = t; if (!built) build();
    if (!S.channels.length) { renderer.render(scene, camera); return; }
    var ch = L.channel(S), gear = ch.gear, staff = ch.staff;
    applyHome(S.home); applyPictures(S, L);
    var clk = L.clock(S), hour = clk.hour + clk.minute / 60, day = daylight(hour), dark = 1 - day;

    // небо, солнце, ночь
    M.sky.color.copy(skyAt(hour)); scene.background = M.sky.color;
    var sunAng = ((hour - 6) / 12) * Math.PI;
    sun.position.set(5.75 + Math.cos(sunAng) * 5, 1.5 + Math.sin(Math.max(0.12, sunAng)) * 6, -7);
    sun.intensity = 1.0 * day; sun.color.copy(lerpColor('#ffb27a', '#fff3dc', Math.min(1, day * 1.5)));
    hemi.intensity = 0.15 + 0.45 * day; hemi.color.copy(lerpColor('#6f7fc9', '#ffffff', day));
    moon.intensity = 0.25 * dark;
    G.outWins.forEach(function (w) { w.material = dark > 0.5 && w.userData.lit ? M.bwinLit : M.bwin; });
    M.building.color.set(dark > 0.5 ? '#4a5070' : '#d9d4c7');
    var lampOn = dark > 0.25 && !opt.atJob;
    ceilLamp.intensity = lampOn ? 1.1 : 0; M.shade.emissiveIntensity = lampOn ? 0.9 : 0;

    // техника текущего канала
    G.laptop.visible = gear.pc === 0;
    G.monitors[0].visible = gear.pc >= 2; G.monitors[1].visible = gear.pc >= 2; G.monitors[2].visible = gear.pc === 1;
    G.upper.forEach(function (u) { u.visible = gear.pc >= 3; });
    G.pc.visible = gear.pc >= 0; G.keyboard.visible = gear.pc >= 1;
    G.tower.visible = gear.pc >= 1 && gear.pc < 3; G.rack.visible = gear.pc >= 3 && S.home >= 2;
    G.router.visible = gear.net >= 0; G.antA.visible = gear.net >= 1; G.antB.visible = gear.net >= 2; G.dish.visible = gear.net >= 3;
    G.mic.visible = gear.mic >= 2; G.micUsb.visible = gear.mic === 2; G.micCond.visible = gear.mic === 3; G.micBroad.visible = gear.mic === 4;
    G.cam.visible = gear.cam >= 0;
    G.camBodies.forEach(function (b, i) { b.visible = i === gear.cam; b.userData.tally.material.color.set(opt.recording && Math.sin(now * 8) > 0 ? '#ff5d4f' : '#5b6180'); });
    var lt = gear.light;
    G.lights.forEach(function (g) {
      var u = g.userData; g.visible = lt >= 1;
      u.pole.visible = lt >= 2; u.small.visible = lt === 1; u.ring.visible = lt === 2; u.box.visible = lt >= 3;
      u.box.scale.set(lt === 4 ? 1.3 : 1, lt === 4 ? 1.3 : 1, 1);
      var glow = opt.recording ? 1 : 0.25; u.mat.emissiveIntensity = glow; u.small.material.emissiveIntensity = glow;
    });
    var studio = lt >= 2 && opt.recording && !opt.atJob ? 0.4 + lt * 0.25 : 0;
    studioL.intensity = studio; studioR.intensity = studio; studioL.position.set(3.0, 1.7, 1.3); studioR.position.set(5.6, 1.7, 1.3);
    deskLamp.intensity = dark > 0.2 && !opt.atJob ? 0.6 + dark * 0.5 : 0;
    G.lampHead.material.emissive = new THREE.Color(deskLamp.intensity > 0 ? '#ffb347' : '#000000');
    monitorLight.intensity = (opt.editing || opt.uploading) ? 0.5 + dark : 0.15 * dark;

    // сотрудники: оператор у камеры, менеджер у двери (монтажёр — онлайн на мониторе)
    G.op.visible = staff.op.n > 0; G.op.position.set(6.75, 0, 5.2); G.op.rotation.y = Math.PI * 1.22;
    G.op.userData.body.position.y = Math.sin(now * 2) * 0.01;
    G.mg.visible = staff.mg.n > 0; G.mg.position.set(7.6, 0, 2.1); G.mg.rotation.y = -Math.PI * 0.6;
    G.mg.userData.armR.rotation.x = -1.4; G.mg.userData.body.position.y = Math.sin(now * 2 + 1) * 0.01;

    // экраны
    if (now - lastScreen > 0.08) {
      lastScreen = now;
      var mode = opt.uploading ? 'upload' : opt.editing ? 'edit' : 'idle';
      var edIdx = gear.pc === 0 ? 0 : gear.pc === 1 ? 3 : 1;
      G.screens.forEach(function (sc, i) {
        var m = (staff.ed.n > 0 && i === edIdx && opt.edOnline) ? 'editor' : mode;
        var tx = sc.userData.tex; paintScreen(tx.userData.canvas.getContext('2d'), m, i, opt); tx.needsUpdate = true;
      });
    }

    // игрок: движение с упором в мебель и стены
    if (opt.canMove) {
      var fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      var side = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      var speed = (keys.ShiftLeft || keys.ShiftRight ? 4.2 : 2.6) * dt;
      player.yaw += ((keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0)) * 2.2 * dt;
      var len = Math.hypot(fwd, side) || 1;
      var sx = -Math.sin(player.yaw), sz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
      var mx = (sx * fwd + rx * side) / len * speed, mz = (sz * fwd + rz * side) / len * speed;
      var obs = obstacles(S);
      if (!blocked(player.x + mx, player.z, obs)) player.x += mx;
      if (!blocked(player.x, player.z + mz, obs)) player.z += mz;
      player.bob = (fwd || side) ? (player.bob || 0) + dt * 9 : 0;
    }
    camera.position.set(player.x, EYE + Math.sin(player.bob || 0) * 0.025, player.z);
    camera.rotation.y = player.yaw; camera.rotation.x = player.pitch;

    // на что смотрит игрок
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    var hits = raycaster.intersectObjects(interactables, true), kind = null;
    for (var h = 0; h < hits.length; h++) { var k = hits[h].object.userData.kind; if (k) { kind = k; break; } }
    if (kind === 'camera' && gear.cam < 0) kind = null;
    if (kind === 'pc' && gear.pc < 0) kind = null;
    hovered = opt.canMove ? kind : null;
    highlight(hovered);

    renderer.render(scene, camera);
  }
  // Подсветка предмета под прицелом
  var lit = null;
  function highlight(kind) {
    var target = kind === 'camera' ? G.cam : kind === 'pc' ? G.pc : null;
    if (lit === target) return;
    function set(obj, on) { if (!obj) return; obj.traverse(function (o) { if (o.isMesh && o.material && o.material.emissive && o.material !== M.shade) { if (on) { o.userData.em = o.material.emissive.getHex(); o.material = o.material.clone(); o.material.emissive.set('#3a3000'); } else if (o.userData.em !== undefined) { o.material.emissive.setHex(o.userData.em); } } }); }
    set(lit, false); set(target, true); lit = target;
  }

  function resize(w, h) {
    if (!renderer) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function init(canvas) {
    canvasEl = canvas;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); } catch (e) { return false; }
    if (!renderer.getContext()) return false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    build();
    document.addEventListener('keydown', function (e) { keys[e.code] = true; });
    document.addEventListener('keyup', function (e) { keys[e.code] = false; });
    window.addEventListener('blur', function () { keys = {}; });
    document.addEventListener('pointerlockchange', function () { locked = document.pointerLockElement === canvasEl; if (locked) freeLook = false; if (!locked && !freeLook) keys = {}; });
    document.addEventListener('pointerlockerror', function () { freeLook = true; });
    document.addEventListener('mousemove', function (e) {
      if (!locked && !(freeLook && e.target === canvasEl)) return;
      if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;   // браузер иногда присылает огромный рывок при захвате мыши
      player.yaw -= e.movementX * 0.0022 * sens;
      player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch - e.movementY * 0.0022 * sens));
    });
    return true;
  }

  window.World = {
    init: init, update: update, resize: resize,
    lock: function () {
      try { var p = canvasEl.requestPointerLock(); if (p && p.catch) p.catch(function () { freeLook = true; }); } catch (e) { freeLook = true; }
      setTimeout(function () { if (!locked) freeLook = true; }, 400);   // не дали захватить мышь — включаем запасной режим
    },
    unlock: function () { freeLook = false; if (document.pointerLockElement) document.exitPointerLock(); },
    isLocked: function () { return locked || freeLook; },
    isFreeLook: function () { return freeLook && !locked; },
    hovered: function () { return hovered; },
    setSensitivity: function (v) { sens = v; },
    resetPlayer: function () { player.x = SPAWN.x; player.z = SPAWN.z; player.yaw = SPAWN.yaw; player.pitch = SPAWN.pitch; },
    player: player
  };
})();
