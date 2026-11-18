// main.js – betöltés, menü, főciklus, események -> hangok, szünet, játék vége.
(function (root) {
  const AS = (root.AS = root.AS || {});
  const CFG = AS.CFG;

  let canvas, ctx;
  let state = null;
  let mode = 'loading';          // loading | menu | playing | paused | ending | over
  let animT = 0;                 // animációs idő (mp), szünet alatt áll
  let lastTs = 0;
  let endTimer = 0;
  let loopFailed = false;

  function setMode(m) {
    mode = m;
    document.body.classList.toggle('playing', m === 'playing');
    AS.Input.setActive(m === 'playing');
  }
  function style() { return AS.UI.getSettings().graphics; }

  // ---- játékesemények -> hangok
  function handleEvents(evs) {
    if (!evs) return;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      switch (e.type) {
        case 'spawn': AS.Audio.play('fall'); break;
        case 'catch': AS.Audio.play('catch'); break;
        case 'worm': AS.Audio.play('worm'); break;
        case 'bonus': AS.Audio.play('bonus'); break;
        case 'miss': AS.Audio.play('miss'); break;
        case 'combo': AS.Audio.play('combo'); break;
        case 'levelup': AS.Audio.play('levelup'); break;
        case 'bird_enter': AS.Audio.play('squawk'); break;
        case 'wing': AS.Audio.play('wing'); break;
        case 'wind': AS.Audio.play('wind'); break;
        case 'bird_steal': AS.Audio.play('steal'); break;
        case 'bird_hit':
          if (e.mode === 'shoo') {
            AS.Audio.play('clap', true);
            AS.Audio.play('squawk', true);
            setTimeout(() => AS.Audio.play('flutter', true), 120);
            setTimeout(() => AS.Audio.play('squawk', true), 260);
          }
          else { AS.Audio.play('shot'); setTimeout(() => AS.Audio.play('squawk'), 140); }
          break;
        case 'gameover': AS.Audio.play('gameover'); onGameOver(); break;
        default: break;
      }
    }
  }

  function onGameOver() {
    if (mode !== 'playing') return;
    setMode('ending');
    clearTimeout(endTimer);
    endTimer = setTimeout(() => {
      if (mode !== 'ending') return;
      setMode('over');
      AS.UI.showHUD(false);
      AS.UI.showGameOver(state);
    }, 1100);
  }

  // ---- folyamat
  function startGame(settings) {
    try { AS.Audio.unlock(); } catch (e) { /* ignore */ }
    clearTimeout(endTimer);
    state = AS.Game.create({ difficulty: settings.difficulty, birdMode: settings.birdMode });
    AS.UI.resetHUD();
    AS.UI.hideAll();
    AS.UI.showHUD(true);
    AS.UI.updateHUD(state);
    setMode('playing');
    document.body.classList.toggle('shoo', settings.birdMode === 'shoo');
  }
  function pauseGame() {
    if (mode !== 'playing') return;
    setMode('paused');
    AS.UI.showPause();
  }
  function resumeGame() {
    if (mode !== 'paused') return;
    AS.UI.hideAll();
    setMode('playing');
  }
  function toMenu() {
    clearTimeout(endTimer);
    state = null;
    AS.UI.showHUD(false);
    AS.UI.showMenu();
    setMode('menu');
  }
  function onPauseKey() {
    if (mode === 'playing') pauseGame();
    else if (mode === 'paused') resumeGame();
  }

  // ---- főciklus
  function frame(ts) {
    root.requestAnimationFrame(frame);
    const now = ts / 1000;
    const dt = Math.min(0.05, Math.max(0, now - lastTs));
    lastTs = now;
    try {
      if (mode === 'playing') {
        animT += dt;
        const evs = AS.Game.update(state, dt, AS.Input.read());
        handleEvents(evs);
        AS.Render.draw(ctx, state, style(), animT);
        AS.UI.updateHUD(state);
      } else if (mode === 'ending') {
        animT += dt;
        AS.Render.draw(ctx, state, style(), animT);
      } else if (mode === 'paused' || mode === 'over') {
        AS.Render.draw(ctx, state, style(), animT);
      } else if (mode === 'menu') {
        animT += dt;
        AS.Render.drawIdle(ctx, style(), animT);
      }
    } catch (err) {
      if (!loopFailed) { loopFailed = true; console.error('Hiba a főciklusban:', err); }
    }
  }

  function boot() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8fd16a';
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    AS.Audio.init();
    AS.Input.init(canvas);
    AS.Input.onPause(onPauseKey);
    AS.UI.init({
      onStart: startGame,
      onResume: resumeGame,
      onMenu: toMenu,
      onPauseRequest: pauseGame,
      onSettings: (s) => { AS.Audio.setMusic(s.music); AS.Audio.setSfx(s.sfx); },
    });

    // hang csak felhasználói művelet után indulhat
    const unlockEvents = ['pointerdown', 'click', 'touchend', 'keydown'];
    const unlockOnce = () => {
      AS.Audio.unlock();
      if (AS.Audio.isUnlocked()) unlockEvents.forEach((n) => document.removeEventListener(n, unlockOnce, true));
    };
    unlockEvents.forEach((n) => document.addEventListener(n, unlockOnce, true));

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pauseGame(); AS.Audio.suspend(); AS.Input.reset(); }
      else AS.Audio.resume();
    });

    root.requestAnimationFrame((ts) => { lastTs = ts / 1000; frame(ts); });
    load();
  }

  function load() {
    AS.UI.setLoading(0, 'Betöltés…', null);
    let p;
    try { p = Promise.resolve(AS.Render.load((x) => AS.UI.setLoading(x, 'Betöltés…', null))); }
    catch (e) { p = Promise.reject(e); }
    p.then(() => {
      AS.UI.setLoading(1, 'Kész!', null);
      toMenu();
    }).catch((err) => {
      console.error('Betöltési hiba:', err);
      AS.UI.setLoading(0, 'Nem sikerült betölteni a képeket.', load);
    });
  }

  AS.Main = { getState: () => state, getMode: () => mode, startGame, pauseGame, resumeGame, toMenu };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
