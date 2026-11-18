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

  // ---- generált zene: napos reggel – csilingelő dallam, ukulele-szerű pengetés, csörgő és madárcsicsergés ----
  const BPM = 126, STEP = 60 / BPM / 2; // nyolcadok
  const MEL = [ // 64 nyolcad, G-dúr; 0 = szünet (MIDI)
    79,0,83,86, 84,83,81,0, 79,81,83,79, 76,0,74,0,
    76,79,81,83, 81,79,76,79, 81,0,79,76, 74,0,0,0,
    79,0,83,86, 88,86,84,83, 84,0,81,84, 83,81,79,0,
    76,79,83,81, 79,76,74,76, 79,0,74,71, 67,0,0,0 ];
  const CHORD = [[55,59,62],[52,55,59],[48,52,55],[50,54,57],[55,59,62],[52,55,59],[50,54,57],[55,59,62]]; // G e C D G e D G
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function voice(t, freq, vol, dur, type, bright) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    f.type = 'lowpass'; f.frequency.setValueAtTime(freq * (bright || 6), t); f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + 0.05);
  }
  function glock(t, freq, vol) { // csengettyű: alaphang + fémes felhang
    voice(t, freq, vol, 0.6, 'sine', 8);
    voice(t, freq * 2.76, vol * 0.35, 0.25, 'sine', 8);
  }
  function shaker(t, vol) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 6000;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(f); f.connect(g); g.connect(musicGain); s.start(t, Math.random() * 0.8); s.stop(t + 0.08);
  }
  function chirp(t, f0, f1, dur, vol) { // egy madárhang: gyors, trillázó füttyív
    const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    lfo.frequency.value = 30 + Math.random() * 25; lg.gain.value = f0 * 0.06;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicGain); o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
  }
  let nextBird = 0;
  function birdsong(t) { // véletlen dalocska: 3–7 csipogás, néha két madár „beszélget”
    const n = 3 + Math.floor(Math.random() * 5), base = 2600 + Math.random() * 1800, up = Math.random() < 0.5;
    for (let k = 0; k < n; k++) {
      const d = k * (0.07 + Math.random() * 0.05), f = base * (1 + (Math.random() - 0.5) * 0.25);
      chirp(t + d, up ? f * 0.8 : f * 1.2, up ? f * 1.25 : f * 0.75, 0.05 + Math.random() * 0.05, 0.05);
    }
  }
  function scheduleMusic() {
    if (!ctx) return;
    while (nextNote < ctx.currentTime + 0.15) {
      const i = step % 64, bar = Math.floor(i / 8), ch = CHORD[bar];
      if (MEL[i]) glock(nextNote, mtof(MEL[i]), 0.12);
      if (i % 4 === 0) voice(nextNote, mtof(ch[0] - 12), 0.2, STEP * 1.8, 'triangle', 4);          // bőgő 1 és 3-on
      if (i % 4 === 2 || i % 8 === 3) ch.forEach((m, k) => voice(nextNote + k * 0.012, mtof(m + 12), 0.045, STEP * 1.1, 'triangle', 10)); // ukulele-pengetés
      shaker(nextNote, i % 2 ? 0.05 : 0.025);
      nextNote += STEP; step++;
    }
    if (ctx.currentTime > nextBird) { birdsong(ctx.currentTime + 0.05); nextBird = ctx.currentTime + 1.8 + Math.random() * 3.5; }
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
  // szűrt zaj, amelynek a sávközepe lassan csúszik f0-ból f1-be (suhogás); halk felfutás, kitartás, elhalás
  function whoosh(dur, vol, f0, f1, q, delay) {
    const t0 = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass'; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t0);
    flt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.25);
    g.gain.setValueAtTime(vol, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(flt); flt.connect(g); g.connect(master);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }
  // azonnal induló zajdörrenés, aluláteresztő szűrővel, amely f0-ból f1-be sötétedik
  function bang(dur, vol, f0, f1, delay) {
    const t0 = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass'; flt.Q.value = 0.7;
    flt.frequency.setValueAtTime(f0, t0);
    flt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(flt); flt.connect(g); g.connect(master);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
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
    // lehulló alma: elnyújtott, halk suhogás, magasról mélyülő (mint egy zuhanó rakéta)
    fall()     { whoosh(1.6, 0.6, 2600, 320, 3.5); },
    // elkapás: kongó puffanás a lavórban + kis vidám csilingelés
    catch()    { tone(160, 0.22, 'sine', 0.4, 0, 70); burst(0.12, 0.35, 300, 1.2, 0); tone(988, 0.1, 'triangle', 0.22, 0.06); tone(1319, 0.14, 'triangle', 0.2, 0.12); },
    // leesett alma: rövid, tompa koppanás a füvön
    miss()     { burst(0.09, 1.0, 380, 1.0, 0); tone(115, 0.13, 'sine', 0.3, 0, 60); burst(0.12, 0.35, 1400, 0.8, 0.01, 600); },
    // lövés: rövid pukkanás
    shot()     {
      // éles csattanás + zajos dörrenés gyorsan sötétedő szűrővel + mély döndülés + rövid visszhang
      burst(0.04, 0.9, 3500, 0.8, 0);
      bang(0.45, 1.3, 7000, 250, 0);
      tone(150, 0.32, 'sine', 0.7, 0, 42);
      bang(0.35, 0.25, 1800, 200, 0.13);
    },
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
