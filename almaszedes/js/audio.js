// AS.Audio – minden hang és a zene WebAudio-val, kódból generálva (nincs hangfájl). Minden hívás try/catch-ben.
(function (root) {
  const AS = (root.AS = root.AS || {});
  // minimális ismétlési köz (mp) – a fall/wing ne halmozódjon
  const SYNTH_GAP = { fall: 0.12, catch: 0.04, miss: 0.08, shot: 0.1, squawk: 0.4, wing: 0.35, bonus: 0.1, worm: 0.1, levelup: 0.5, combo: 0.15, gameover: 1, shoo: 0.2, clap: 0.05, flutter: 0.2, steal: 0.3, wind: 2.5, click: 0.04 };

  let sfxOn = true, musicOn = true, unlocked = false, suspended = false;
  let ctx = null, master = null, noiseBuf = null, musicGain = null, musicTimer = null, nextNote = 0, step = 0;
  const lastPlayed = {};

  function nowSec() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; }

  function init() { /* nincs előtöltendő fájl */ }

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      musicGain.connect(master);
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

  // ---- generált zene: vidám, könnyed dúr dallam pengetős hangszínnel, 8 ütemes körforgás ----
  const BPM = 112, STEP = 60 / BPM / 2; // nyolcadok
  const MEL = [ // 64 nyolcad; 0 = szünet (MIDI hangmagasság)
    72,0,76,79, 77,76,74,0, 72,0,74,76, 74,72,71,0,
    69,0,72,76, 74,72,71,72, 74,0,71,67, 69,71,72,0,
    72,0,76,79, 81,79,77,76, 77,0,74,77, 76,74,72,0,
    69,72,71,69, 67,0,71,74, 72,0,67,64, 60,0,0,0 ];
  const BASS = [48, 45, 41, 43, 48, 45, 43, 48]; // ütemenként (C a F G C a G C)
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function pluck(t, freq, vol, dur, type) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 6, t); f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + 0.05);
  }
  function scheduleMusic() {
    if (!ctx) return;
    while (nextNote < ctx.currentTime + 0.15) {
      const i = step % 64, bar = Math.floor(i / 8);
      if (MEL[i]) pluck(nextNote, mtof(MEL[i]), 0.16, STEP * 1.6, 'triangle');
      if (i % 8 === 0) pluck(nextNote, mtof(BASS[bar] - 12), 0.22, STEP * 3.5, 'sine');
      if (i % 8 === 4) pluck(nextNote, mtof(BASS[bar] - 5), 0.12, STEP * 2.5, 'sine');
      if (i % 2 === 1) { // halk pengetett kíséret
        [0, 4, 7].forEach((d) => pluck(nextNote, mtof(BASS[bar] + 12 + d), 0.035, STEP * 0.9, 'square'));
      }
      nextNote += STEP; step++;
    }
  }
  function applyMusic() {
    try {
      if (!ensureCtx()) return;
      const on = unlocked && musicOn && !suspended;
      const t = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(t);
      musicGain.gain.setTargetAtTime(on ? 0.55 : 0, t, 0.15);
      if (on && !musicTimer) { nextNote = ctx.currentTime + 0.05; musicTimer = setInterval(scheduleMusic, 30); }
      if (!on && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    } catch (e) { /* ignore */ }
  }

  function setMusic(on) { musicOn = !!on; applyMusic(); }
  function setSfx(on) { sfxOn = !!on; }

  // a lap háttérbe kerülésekor / visszatértekor
  function suspend() {
    suspended = true;
    try { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } } catch (e) { /* ignore */ }
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
    // lehulló alma: halk, lefelé csúszó fütty
    fall()     { tone(1200, 0.28, 'sine', 0.06, 0, 500); },
    // elkapás: puha koppanás + kis vidám csilingelés
    catch()    { burst(0.06, 0.5, 500, 1.5, 0); tone(988, 0.1, 'triangle', 0.22, 0.02); tone(1319, 0.14, 'triangle', 0.2, 0.08); },
    // leesett alma: tompa puffanás
    miss()     { tone(160, 0.22, 'sine', 0.4, 0, 70); burst(0.12, 0.35, 300, 1.2, 0); },
    // lövés: rövid pukkanás
    shot()     { burst(0.12, 1.0, 1800, 0.9, 0, 400); tone(220, 0.12, 'square', 0.12, 0, 60); },
    // madár-rikoltás: két éles, ereszkedő kárrogás
    squawk()   { [0, 0.16].forEach((d) => { tone(900, 0.13, 'sawtooth', 0.14, d, 520); burst(0.1, 0.25, 1400, 3, d); }); },
    // szárnycsapás: két puha suhogás
    wing()     { burst(0.09, 0.35, 700, 1.0, 0, 400); burst(0.09, 0.3, 650, 1.0, 0.14, 380); },
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
      const gap = SYNTH_GAP[name] || 0;
      if (!force && lastPlayed[name] !== undefined && t - lastPlayed[name] < gap) return;
      lastPlayed[name] = t;
      if (SYNTH[name]) {
        if (!ensureCtx()) return;
        if (ctx.state === 'suspended') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
        SYNTH[name]();
      }
    } catch (e) { /* ignore */ }
  }

  AS.Audio = { init, unlock, play, setMusic, setSfx, suspend, resume, isUnlocked: () => unlocked };
})(typeof window !== 'undefined' ? window : globalThis);
