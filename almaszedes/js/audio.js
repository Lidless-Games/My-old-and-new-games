// AS.Audio – hangfájlok (assets/snd) + WebAudio-szintetizált hangok. Minden hívás try/catch-ben.
(function (root) {
  const AS = (root.AS = root.AS || {});
  const DIR = 'assets/snd/';

  // fájlos hangok: hangerő, minimális ismétlési köz (mp) – a fall/wing ne halmozódjon
  const FILES = {
    fall:   { src: 'fall.mp3',   vol: 0.35, gap: 0.12, pool: 3 },
    catch:  { src: 'catch.mp3',  vol: 0.8,  gap: 0.04, pool: 3 },
    miss:   { src: 'miss.mp3',   vol: 0.8,  gap: 0.08, pool: 2 },
    shot:   { src: 'shot.mp3',   vol: 0.8,  gap: 0.1,  pool: 2 },
    squawk: { src: 'squawk.mp3', vol: 0.7,  gap: 0.4,  pool: 2 },
    wing:   { src: 'wing.mp3',   vol: 0.3,  gap: 0.35, pool: 2 },
  };
  // szintetizált hangok minimális ismétlési köze
  const SYNTH_GAP = { bonus: 0.1, worm: 0.1, levelup: 0.5, combo: 0.15, gameover: 1, shoo: 0.2, clap: 0.05, flutter: 0.2, steal: 0.3, wind: 2.5, click: 0.04 };

  let sfxOn = true, musicOn = true, unlocked = false, suspended = false;
  let ctx = null, master = null, noiseBuf = null, music = null;
  const pools = {};
  const lastPlayed = {};

  function nowSec() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; }

  function init() {
    try {
      if (typeof Audio === 'undefined') return;
      for (const k in FILES) {
        if (pools[k]) continue;
        const f = FILES[k];
        pools[k] = { i: 0, list: [] };
        for (let n = 0; n < f.pool; n++) {
          const a = new Audio(DIR + f.src);
          a.preload = 'auto';
          a.volume = f.vol;
          pools[k].list.push(a);
        }
      }
      if (!music) {
        music = new Audio(DIR + 'music.mp3');
        music.loop = true;
        music.preload = 'auto';
        music.volume = 0.5;
      }
    } catch (e) { /* hang nélkül is megy */ }
  }

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 1.2);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
    return ctx;
  }

  // első felhasználói kattintás/érintés/billentyű után hívandó
  function unlock() {
    try {
      init();
      const c = ensureCtx();
      if (c && c.state === 'suspended') { const p = c.resume(); if (p && p.catch) p.catch(() => {}); }
      unlocked = true;
      applyMusic();
    } catch (e) { /* ignore */ }
  }

  function applyMusic() {
    try {
      if (!music) return;
      if (unlocked && musicOn && !suspended) {
        const p = music.play();
        if (p && p.catch) p.catch(() => {});
      } else {
        music.pause();
      }
    } catch (e) { /* ignore */ }
  }

  function setMusic(on) { musicOn = !!on; applyMusic(); }
  function setSfx(on) { sfxOn = !!on; }

  // a lap háttérbe kerülésekor / visszatértekor
  function suspend() {
    suspended = true;
    try { if (music) music.pause(); } catch (e) { /* ignore */ }
    try { if (ctx && ctx.state === 'running') ctx.suspend(); } catch (e) { /* ignore */ }
  }
  function resume() {
    suspended = false;
    try { if (ctx && unlocked && ctx.state === 'suspended') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } } catch (e) { /* ignore */ }
    applyMusic();
  }

  // ---- szintetizátor ----
  function tone(freq, dur, type, vol, delay, slideTo) {
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, f0, f1, delay) {
    const t0 = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass'; flt.Q.value = 1.2;
    flt.frequency.setValueAtTime(f0, t0);
    flt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(flt); flt.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }
  // éles, sávszűrt zajlöket gyors lecsengéssel (taps, szárnylebbenés)
  function burst(dur, vol, freq, q, delay, f1) {
    const t0 = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass'; flt.Q.value = q;
    flt.frequency.setValueAtTime(freq, t0);
    if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(flt); flt.connect(g); g.connect(master);
    // a zaj-puffer különböző pontjáról indul, hogy a lökések ne legyenek egyformák
    s.start(t0, Math.random() * 0.8); s.stop(t0 + dur + 0.03);
  }
  const SYNTH = {
    // két éles tapsolás ~110 ms különbséggel
    clap()     {
      [0, 0.11].forEach((d) => {
        burst(0.09, 1.0, 1500, 1.6, d, 1000);
        burst(0.05, 0.7, 3200, 2.5, d);
      });
    },
    // gyors, puha szárnyzizegés: 9 rövid szűrt zajlöket ~0,5 s alatt
    flutter()  { for (let i = 0; i < 9; i++) burst(0.045, 0.3 - i * 0.015, 650 + (i % 2) * 250, 1.1, i * 0.056); },
    bonus()    { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.28, i * 0.07)); },
    worm()     { tone(220, 0.35, 'sawtooth', 0.18, 0, 90); tone(165, 0.35, 'square', 0.08, 0.04, 70); },
    levelup()  { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i === 4 ? 0.5 : 0.18, 'triangle', 0.3, i * 0.1)); },
    combo()    { tone(880, 0.09, 'sine', 0.25, 0); tone(1319, 0.14, 'sine', 0.25, 0.08); },
    gameover() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.32, 'triangle', 0.3, i * 0.22)); },
    shoo()     { noise(0.35, 0.5, 500, 3000, 0); },
    steal()    { tone(440, 0.45, 'sawtooth', 0.16, 0, 110); },
    wind()     { noise(1.1, 0.16, 300, 900, 0); },
    click()    { tone(700, 0.05, 'square', 0.1, 0, 520); },
  };

  // force = true: a minimális ismétlési köz nem nyeli el (pl. a második rikoltás)
  function play(name, force) {
    try {
      if (!sfxOn || !unlocked || suspended) return;
      const t = nowSec();
      const gap = FILES[name] ? FILES[name].gap : (SYNTH_GAP[name] || 0);
      if (!force && lastPlayed[name] !== undefined && t - lastPlayed[name] < gap) return;
      lastPlayed[name] = t;
      const pool = pools[name];
      if (pool) {
        const a = pool.list[pool.i++ % pool.list.length];
        try { a.currentTime = 0; } catch (e) { /* ignore */ }
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
        return;
      }
      if (SYNTH[name]) {
        if (!ensureCtx()) return;
        if (ctx.state === 'suspended') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
        SYNTH[name]();
      }
    } catch (e) { /* ignore */ }
  }

  AS.Audio = { init, unlock, play, setMusic, setSfx, suspend, resume, isUnlocked: () => unlocked };
})(typeof window !== 'undefined' ? window : globalThis);
