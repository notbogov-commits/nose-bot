// ЮТУБЕРЫ — звуки и фоновая музыка. Всё синтезируется на лету (Web Audio), без файлов.
(function () {
  'use strict';
  var ctx = null, master = null, sfxBus = null, musicBus = null;
  var sfxOn = true, musicOn = true;
  var musicTimer = null, nextNoteTime = 0, step = 0;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 0.5 : 0; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.16 : 0; musicBus.connect(master);
    return true;
  }

  // Одна нота: тип волны, частота, начало, длительность, громкость, сдвиг частоты
  function tone(bus, type, freq, at, dur, vol, slideTo) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(bus);
    o.start(at); o.stop(at + dur + 0.02);
  }
  function seq(notes, type, gap, dur, vol) {
    if (!ensure() || !sfxOn) return;
    var t = ctx.currentTime;
    notes.forEach(function (f, i) { tone(sfxBus, type, f, t + i * gap, dur, vol); });
  }

  var SFX = {
    rec: function () { seq([520], 'square', 0, 0.05, 0.12); },
    edit: function () { seq([660], 'square', 0, 0.05, 0.12); },
    up: function () { seq([780], 'square', 0, 0.05, 0.12); },
    step: function () { seq([880, 1175], 'triangle', 0.06, 0.12, 0.25); },
    publish: function () { seq([784, 988, 1319], 'triangle', 0.07, 0.18, 0.3); },
    viral: function () { seq([523, 659, 784, 1047, 1319, 1568], 'square', 0.06, 0.16, 0.18); },
    buy: function () { seq([988, 1319], 'square', 0.07, 0.14, 0.18); },
    card: function () { seq([1175, 1568], 'sine', 0.12, 0.3, 0.35); },
    good: function () { seq([659, 880, 1109], 'triangle', 0.08, 0.2, 0.3); },
    bad: function () {
      if (!ensure() || !sfxOn) return;
      var t = ctx.currentTime;
      tone(sfxBus, 'sawtooth', 330, t, 0.35, 0.12, 120);
    },
    milestone: function () { seq([523, 659, 784, 1047, 784, 1047], 'triangle', 0.11, 0.28, 0.32); },
    ui: function () { seq([1400], 'sine', 0, 0.05, 0.12); }
  };

  // Фоновая музыка: спокойный цикл из 4 аккордов (C — Am — F — G), бас + перебор + случайная мелодия.
  var CHORDS = [
    [130.81, [261.63, 329.63, 392.0]],
    [110.0, [220.0, 261.63, 329.63]],
    [87.31, [174.61, 220.0, 261.63]],
    [98.0, [196.0, 246.94, 293.66]]
  ];
  var PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
  var BEAT = 60 / 96 / 2; // восьмые при 96 ударах в минуту

  function scheduleMusic() {
    if (!ctx) return;
    while (nextNoteTime < ctx.currentTime + 0.2) {
      var bar = Math.floor(step / 8) % 4, pos = step % 8, chord = CHORDS[bar];
      if (pos === 0 || pos === 4) tone(musicBus, 'triangle', chord[0], nextNoteTime, BEAT * 3.5, 0.5);
      tone(musicBus, 'sine', chord[1][pos % 3], nextNoteTime, BEAT * 1.6, 0.16);
      if ((pos === 2 || pos === 5 || pos === 7) && Math.random() < 0.55) {
        tone(musicBus, 'triangle', PENTA[Math.floor(Math.random() * PENTA.length)], nextNoteTime, BEAT * 1.8, 0.14);
      }
      nextNoteTime += BEAT; step++;
    }
  }
  function startMusic() {
    if (!ensure() || musicTimer) return;
    nextNoteTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(scheduleMusic, 80);
  }

  window.GameAudio = {
    // Вызывать из обработчика клика: браузер разрешает звук только после действия игрока
    unlock: function () { if (ensure() && musicOn) startMusic(); },
    play: function (name) { try { if (SFX[name]) SFX[name](); } catch (e) {} },
    setSfx: function (on) { sfxOn = on; if (sfxBus) sfxBus.gain.value = on ? 0.5 : 0; },
    setMusic: function (on) {
      musicOn = on;
      if (musicBus) musicBus.gain.value = on ? 0.16 : 0;
      if (on && ctx) startMusic();
    },
    get sfx() { return sfxOn; },
    get music() { return musicOn; }
  };
})();
