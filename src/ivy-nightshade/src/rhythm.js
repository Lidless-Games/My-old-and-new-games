(function () {
  const G = window.G;
  const CFG = G.CFG;

  const BPM = CFG.BPM || 108;
  const SPB = 60 / BPM;            // seconds per beat
  const LOOKAHEAD = 0.1;           // schedule this far ahead (s)
  const TICK_MS = 25;

  // ---------- state ----------
  let ctx = null;
  let master = null, comp = null, musicGain = null, songBus = null, sfxBus = null, echoIn = null, noiseBuf = null;
  let audioSync = false;           // clock currently driven by AudioContext
  let aOff = 0;                    // ctx.currentTime - clockSeconds
  const pT0 = { v: performance.now() }; // perf clock origin (ms): clockSeconds = (now - v)/1000
  let musicEnabled = !!G.save.get('music', true);
  let wantedSong = null;           // requested song name (or null)
  let playingSong = null;          // song actually being scheduled
  let timer = null;
  let nextN = 0;                   // next absolute beat index to schedule
  const debug = { notes: 0, beats: 0, sfx: 0, sfxErrors: 0, sfxNoop: 0 };

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- clock ----------
  function perfClock() { return (performance.now() - pT0.v) / 1000; }
  function syncClock() {
    if (!ctx) return;
    const running = ctx.state === 'running';
    if (running && !audioSync) {
      aOff = ctx.currentTime - perfClock();   // seamless: clock value unchanged at switch
      audioSync = true;
    } else if (!running && audioSync) {
      const last = ctx.currentTime - aOff;    // freeze-continuity: perf clock continues from here
      pT0.v = performance.now() - last * 1000;
      audioSync = false;
    }
  }
  function clockSec() {
    syncClock();
    return audioSync ? ctx.currentTime - aOff : perfClock();
  }
  function beat() { return clockSec() / SPB; }

  // ---------- audio graph ----------
  function buildGraph() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.85;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 8;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.001; limiter.release.value = 0.08;
    master.connect(comp); comp.connect(limiter); limiter.connect(ctx.destination);

    musicGain = ctx.createGain(); musicGain.gain.value = musicEnabled ? CFG.MUSIC_VOL : 0;
    songBus = ctx.createGain(); songBus.gain.value = 1;
    songBus.connect(musicGain); musicGain.connect(master);

    sfxBus = ctx.createGain(); sfxBus.gain.value = CFG.SFX_VOL;
    sfxBus.connect(master);

    // soft echo for the music-box melody
    echoIn = ctx.createGain(); echoIn.gain.value = 1;
    const delay = ctx.createDelay(1.5); delay.delayTime.value = SPB * 1.5;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    echoIn.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(wet); wet.connect(songBus);

    // shared noise buffer
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    ctx.onstatechange = syncClock;
    return true;
  }

  // ---------- voice helpers ----------
  // tone: {type,f,f2,t,dur,vol,a,lp,q,wob:{rate,cents},dest}
  function tone(o) {
    const os = ctx.createOscillator();
    os.type = o.type || 'sine';
    os.frequency.setValueAtTime(o.f, o.t);
    if (o.f2) os.frequency.exponentialRampToValueAtTime(o.f2, o.t + o.dur);
    const g = ctx.createGain();
    const a = Math.min(o.a || 0.005, o.dur * 0.8);
    g.gain.setValueAtTime(0.0001, o.t);
    g.gain.linearRampToValueAtTime(o.vol, o.t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
    let n = os;
    if (o.lp) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 0.7;
      os.connect(f); n = f;
    }
    n.connect(g); g.connect(o.dest || sfxBus);
    if (o.wob) {
      const l = ctx.createOscillator(); l.frequency.value = o.wob.rate;
      const lg = ctx.createGain(); lg.gain.value = o.wob.cents;
      l.connect(lg); lg.connect(os.detune); l.start(o.t); l.stop(o.t + o.dur + 0.05);
    }
    os.start(o.t); os.stop(o.t + o.dur + 0.05);
    return os;
  }
  // noise: {t,dur,vol,a,type,f,f2,q,dest}
  function noise(o) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f, o.t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, o.t + o.dur);
    const g = ctx.createGain();
    const a = Math.min(o.a || 0.005, o.dur * 0.8);
    g.gain.setValueAtTime(0.0001, o.t);
    g.gain.linearRampToValueAtTime(o.vol, o.t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
    src.connect(f); f.connect(g); g.connect(o.dest || sfxBus);
    src.start(o.t, Math.random() * 1.5); src.stop(o.t + o.dur + 0.05);
  }

  // ---------- SFX ----------
  const SFX = {
    step(t, v) {
      noise({ t, dur: 0.06, vol: 0.22 * v, type: 'lowpass', f: 700, f2: 300, q: 0.5 });
      tone({ t, dur: 0.07, vol: 0.18 * v, f: 130, f2: 70 });
    },
    creak(t, v) {
      noise({ t, dur: 0.55, vol: 0.14 * v, a: 0.12, type: 'bandpass', f: 320, f2: 760, q: 9 });
      tone({ t, dur: 0.55, vol: 0.07 * v, a: 0.1, f: 170, f2: 250, wob: { rate: 24, cents: 60 } });
      tone({ t: t + 0.3, dur: 0.25, vol: 0.05 * v, a: 0.05, f: 300, f2: 210, type: 'triangle' });
    },
    land(t, v) {
      tone({ t, dur: 0.2, vol: 0.5 * v, f: 115, f2: 42 });
      noise({ t, dur: 0.09, vol: 0.3 * v, type: 'lowpass', f: 400, f2: 150, q: 0.5 });
    },
    jump(t, v) {
      noise({ t, dur: 0.2, vol: 0.14 * v, a: 0.07, type: 'bandpass', f: 400, f2: 1500, q: 0.9 });
      tone({ t, dur: 0.12, vol: 0.08 * v, f: 280, f2: 430, type: 'triangle' });
    },
    snore(t, v) {
      // inhale (rising) + exhale (falling), very soft
      noise({ t, dur: 0.6, vol: 0.2 * v, a: 0.35, type: 'lowpass', f: 180, f2: 420, q: 0.8 });
      noise({ t: t + 0.65, dur: 0.8, vol: 0.24 * v, a: 0.2, type: 'lowpass', f: 380, f2: 140, q: 0.8 });
      tone({ t: t + 0.65, dur: 0.7, vol: 0.05 * v, a: 0.15, f: 62, f2: 52, type: 'sawtooth', lp: 160, wob: { rate: 28, cents: 80 } });
    },
    stir(t, v) {
      // grumbly "hmm"
      tone({ t, dur: 0.55, vol: 0.22 * v, a: 0.08, f: 112, f2: 92, type: 'sawtooth', lp: 420, q: 2, wob: { rate: 6, cents: 25 } });
      tone({ t, dur: 0.55, vol: 0.1 * v, a: 0.08, f: 224, f2: 184, type: 'triangle', lp: 700 });
    },
    wake(t, v) {
      // surprised "huh?!"
      tone({ t, dur: 0.14, vol: 0.2 * v, a: 0.02, f: 200, f2: 250, type: 'sawtooth', lp: 900, q: 2 });
      tone({ t: t + 0.16, dur: 0.34, vol: 0.22 * v, a: 0.03, f: 230, f2: 460, type: 'sawtooth', lp: 1100, q: 3 });
      noise({ t, dur: 0.12, vol: 0.05 * v, type: 'bandpass', f: 1500, q: 1 });
    },
    door(t, v) {
      noise({ t, dur: 0.85, vol: 0.15 * v, a: 0.2, type: 'bandpass', f: 220, f2: 900, q: 10 });
      tone({ t, dur: 0.85, vol: 0.07 * v, a: 0.2, f: 90, f2: 150, type: 'sawtooth', lp: 600, wob: { rate: 18, cents: 70 } });
      tone({ t: t + 0.7, dur: 0.1, vol: 0.18 * v, f: 140, f2: 80 });
    },
    slippers(t, v) {
      noise({ t, dur: 0.13, vol: 0.13 * v, a: 0.03, type: 'bandpass', f: 1800, f2: 1000, q: 0.8 });
      noise({ t: t + 0.24, dur: 0.13, vol: 0.11 * v, a: 0.03, type: 'bandpass', f: 1700, f2: 900, q: 0.8 });
    },
    hide(t, v) {
      tone({ t, dur: 0.12, vol: 0.3 * v, f: 170, f2: 80, type: 'triangle' });
      noise({ t, dur: 0.05, vol: 0.25 * v, type: 'bandpass', f: 900, q: 1.5 });
      tone({ t: t + 0.09, dur: 0.07, vol: 0.12 * v, f: 130, f2: 90, type: 'triangle' });
    },
    checkpoint(t, v) {
      [880, 1318.5, 1760].forEach((f, i) => {
        tone({ t: t + i * 0.09, dur: 1.0, vol: 0.14 * v, a: 0.004, f });
        tone({ t: t + i * 0.09, dur: 0.5, vol: 0.05 * v, a: 0.004, f: f * 2.01 });
      });
    },
    caught(t, v) {
      // comic "wah wah wah womp"
      [[311, 0], [294, 0.22], [277, 0.44]].forEach(([f, d]) => {
        tone({ t: t + d, dur: 0.2, vol: 0.2 * v, a: 0.02, f, f2: f * 0.97, type: 'triangle', lp: 1200, wob: { rate: 7, cents: 30 } });
      });
      tone({ t: t + 0.68, dur: 0.85, vol: 0.28 * v, a: 0.03, f: 247, f2: 92, type: 'sawtooth', lp: 900, wob: { rate: 6, cents: 40 } });
      // cymbal-ish tickle
      noise({ t: t + 0.7, dur: 0.7, vol: 0.06 * v, a: 0.01, type: 'highpass', f: 6500, q: 0.7 });
    },
    spark(t, v) {
      const os = tone({ t, dur: 0.28, vol: 0.12 * v, a: 0.005, f: 1800, type: 'square', lp: 5000 });
      for (let i = 1; i < 14; i++) os.frequency.setValueAtTime(900 + Math.random() * 2600, t + i * 0.02);
      noise({ t, dur: 0.22, vol: 0.14 * v, type: 'highpass', f: 3000, q: 0.7 });
    },
    chandelier(t, v) {
      noise({ t, dur: 0.6, vol: 0.14 * v, a: 0.2, type: 'bandpass', f: 3200, f2: 1400, q: 1.5 });
      tone({ t, dur: 0.7, vol: 0.03 * v, a: 0.15, f: 1500, wob: { rate: 9, cents: 25 } });
      tone({ t, dur: 0.7, vol: 0.025 * v, a: 0.15, f: 2310, wob: { rate: 11, cents: 25 } });
    },
    plant(t, v) {
      [0, 0.11].forEach((d, i) => {
        tone({ t: t + d, dur: 0.1, vol: 0.28 * v, f: 210 - i * 20, f2: 80, type: 'square', lp: 700 });
        noise({ t: t + d, dur: 0.07, vol: 0.14 * v, type: 'lowpass', f: 900, f2: 300 });
      });
    },
    flask(t, v) {
      [[0, 320, 900], [0.09, 260, 780], [0.17, 400, 1100]].forEach(([d, f, f2]) => {
        tone({ t: t + d, dur: 0.08, vol: 0.2 * v, a: 0.004, f, f2 });
      });
      noise({ t: t + 0.1, dur: 0.35, vol: 0.09 * v, a: 0.05, type: 'bandpass', f: 2200, f2: 1200, q: 0.8 });
    },
    crow(t, v) {
      // two heads, two caws
      [[0, 560], [0.27, 650]].forEach(([d, f]) => {
        tone({ t: t + d, dur: 0.22, vol: 0.2 * v, a: 0.02, f, f2: f * 0.7, type: 'sawtooth', lp: 2200, q: 2, wob: { rate: 42, cents: 90 } });
        noise({ t: t + d, dur: 0.2, vol: 0.05 * v, a: 0.02, type: 'bandpass', f: 1400, q: 2 });
      });
    },
    ui_move(t, v) { tone({ t, dur: 0.045, vol: 0.14 * v, f: 1250, type: 'triangle' }); },
    ui_ok(t, v) {
      tone({ t, dur: 0.18, vol: 0.18 * v, f: 660, type: 'triangle' });
      tone({ t: t + 0.07, dur: 0.3, vol: 0.18 * v, f: 990, type: 'triangle' });
      tone({ t: t + 0.07, dur: 0.15, vol: 0.05 * v, f: 1980 });
    },
    win(t, v) {
      [587.3, 740, 880, 1174.7, 880, 1174.7].forEach((f, i) => {
        const last = i === 5;
        tone({ t: t + i * 0.11, dur: last ? 0.9 : 0.35, vol: 0.17 * v, a: 0.004, f, type: 'triangle' });
        tone({ t: t + i * 0.11, dur: last ? 0.5 : 0.2, vol: 0.05 * v, a: 0.004, f: f * 2 });
      });
    },
    whoosh(t, v) {
      noise({ t, dur: 0.38, vol: 0.22 * v, a: 0.14, type: 'bandpass', f: 300, f2: 2600, q: 0.8 });
    },
  };

  G.sfx = {
    names: Object.keys(SFX),
    play(name, opts) {
      const fn = SFX[name];
      if (!fn) return;
      if (!ctx || ctx.state !== 'running') { debug.sfxNoop++; return; }
      try {
        const v = (opts && typeof opts.vol === 'number') ? opts.vol : 1;
        fn(ctx.currentTime + 0.005, v);
        debug.sfx++;
      } catch (e) { debug.sfxErrors++; console.error('sfx ' + name, e); }
    },
  };

  // ---------- music ----------
  // D minor waltz, 16-bar progression. Chords: root (bass midi), pluck voicing (midi).
  const CH = {
    Dm: { r: 38, v: [62, 65, 69] },
    Gm: { r: 43, v: [62, 67, 70] },
    Bb: { r: 46, v: [62, 65, 70] },
    F:  { r: 41, v: [60, 65, 69] },
    A:  { r: 45, v: [61, 64, 69] },
  };
  const PROG = ['Dm', 'Dm', 'Gm', 'Dm', 'Bb', 'F', 'A', 'Dm', 'Dm', 'Gm', 'Bb', 'F', 'Gm', 'Dm', 'A', 'A'];
  // melody per bar: [beatOffset, midi, durBeats]
  const MEL = [
    [[1, 77, 1], [2, 81, 1]],
    [[0, 82, 1.5], [2, 81, 1]],
    [[0, 79, 1], [1, 77, 1], [2, 74, 1]],
    [[0, 77, 2.5]],
    [[1, 82, 1], [2, 79, 1]],
    [[0, 81, 1], [1, 77, 1], [2, 72, 1]],
    [[0, 76, 1], [1, 73, 1], [2, 69, 1]],
    [[0, 74, 3]],
    [[0, 81, 1], [1, 84, 1], [2, 82, 1]],
    [[0, 82, 1.5], [2, 79, 1]],
    [[0, 86, 1], [1, 82, 1], [2, 79, 1]],
    [[0, 84, 1], [1, 81, 1], [2, 77, 1]],
    [[1, 79, 0.5], [1.5, 81, 0.5], [2, 82, 1]],
    [[0, 81, 1.5], [2, 77, 1]],
    [[0, 85, 1], [1, 81, 1], [2, 76, 1]],
    [[1, 76, 1], [2, 73, 1]],
  ];

  function cello(t, midi, beats, vol, slow) {
    const dur = beats * SPB;
    const att = slow ? 0.28 : 0.11;
    const f = mtof(midi);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.linearRampToValueAtTime(slow ? 620 : 900, t + att + 0.15);
    lp.frequency.linearRampToValueAtTime(420, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.setValueAtTime(vol * 0.85, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = f; o1.detune.value = -4;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f; o2.detune.value = 5;
    const m1 = ctx.createGain(); m1.gain.value = 0.55; const m2 = ctx.createGain(); m2.gain.value = 0.9;
    o1.connect(m1); o2.connect(m2); m1.connect(lp); m2.connect(lp); lp.connect(g); g.connect(songBus);
    // gentle vibrato that blooms
    const l = ctx.createOscillator(); l.frequency.value = 5.2;
    const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(9, t + dur * 0.6);
    l.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune);
    [o1, o2, l].forEach((o) => { o.start(t); o.stop(t + dur + 0.05); });
    debug.notes++;
  }
  function pluck(t, midi, vol, len) {
    const f = mtof(midi), d = len || 0.28;
    tone({ t, dur: d, vol, a: 0.003, f, type: 'triangle', lp: 2400, dest: songBus });
    tone({ t, dur: d * 0.5, vol: vol * 0.35, a: 0.002, f: f * 2, type: 'sine', dest: songBus });
    debug.notes++;
  }
  function bell(t, midi, beats, vol) {
    const f = mtof(midi), d = Math.max(0.5, beats * SPB * 0.9 + 0.5);
    const send = ctx.createGain(); send.gain.value = 0.55; send.connect(echoIn);
    const parts = [[1, 1], [2.0, 0.28], [4.2, 0.1]];
    parts.forEach(([mul, a]) => {
      const dd = d / (mul > 1 ? mul * 0.6 : 1);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * a, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dd);
      o.connect(g); g.connect(songBus); g.connect(send);
      o.start(t); o.stop(t + dd + 0.05);
    });
    debug.notes++;
  }

  // Schedule everything that falls on absolute beat n, at audio time t.
  function scheduleBeat(n, t) {
    const song = playingSong;
    const bb = n % 3;
    const bar = Math.floor(n / 3);
    const bi = ((bar % 16) + 16) % 16;
    const ch = CH[PROG[bi]];
    debug.beats++;
    if (song === 'castle') {
      if (bb === 0) {
        cello(t - 0.03, ch.r, 2.7, 0.2, false);
        // melody notes for this bar are scheduled from beat 1 (exact offsets)
        MEL[bi].forEach(([off, m, d]) => bell(t + off * SPB, m, d, 0.075));
      }
      if (bb === 1 || bb === 2) {
        const roll = bi % 4 === 3 && bb === 2;        // little rolled chord at phrase ends
        const vol = bb === 1 ? 0.085 : 0.065;
        ch.v.forEach((m, i) => pluck(t + (roll ? i * 0.045 : 0), m, vol));
        if (bi % 8 === 7 && bb === 2) pluck(t + SPB * 0.5, ch.v[2] + 12, 0.04, 0.2); // tiny tail flourish
      }
    } else if (song === 'menu') {
      if (bb === 0) {
        cello(t - 0.05, ch.r, 2.8, 0.13, true);
        if (bi % 2 === 0) MEL[bi].slice(0, 2).forEach(([off, m, d]) => bell(t + off * SPB, m, d, 0.05));
      }
      if (bb === 1) pluck(t, ch.v[bar % 3], 0.07, 0.4);
    }
  }

  function tick() {
    if (!ctx) return;
    syncClock();
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (let guard = 0; guard < 16; guard++) {
      const t = aOff + nextN * SPB;
      if (t > now + LOOKAHEAD) break;
      // apply requested song at bar boundary (or immediately when idle)
      if (nextN % 3 === 0 || !playingSong) {
        if (wantedSong !== playingSong) {
          if (!wantedSong) { stopTimer(); playingSong = null; return; }
          playingSong = wantedSong;
          songBus.gain.cancelScheduledValues(now); songBus.gain.setValueAtTime(1, now);
        }
      }
      if (t >= now - 0.03 && playingSong && musicEnabled) {
        try { scheduleBeat(nextN, Math.max(t, now)); } catch (e) { console.error('music', e); }
      }
      nextN++;
    }
  }
  function startTimer() {
    if (timer || !ctx) return;
    nextN = Math.ceil(beat() - 0.02);
    timer = setInterval(tick, TICK_MS);
    tick();
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  // ---------- public API ----------
  G.rhythm = {
    unlock() {
      try {
        if (!ctx) { if (!buildGraph()) return; }
        if (ctx.state !== 'running' && ctx.resume) {
          const p = ctx.resume();
          if (p && p.then) p.then(() => { syncClock(); if (wantedSong) startTimer(); }).catch(() => {});
        }
        syncClock();
        if (wantedSong && ctx.state === 'running') startTimer();
      } catch (e) { console.error('unlock', e); }
    },
    startMusic(name) {
      if (name !== 'castle' && name !== 'menu') return;
      wantedSong = name;
      if (ctx && ctx.state === 'running') { if (!timer) startTimer(); }
    },
    stopMusic() {
      wantedSong = null;
      if (ctx) {
        const now = ctx.currentTime;
        songBus.gain.cancelScheduledValues(now);
        songBus.gain.setValueAtTime(songBus.gain.value, now);
        songBus.gain.linearRampToValueAtTime(0.0001, now + 0.2);
      }
      stopTimer();
      playingSong = null;
    },
    setMusicEnabled(on) {
      musicEnabled = !!on;
      G.save.set('music', musicEnabled);
      if (ctx) musicGain.gain.setTargetAtTime(musicEnabled ? CFG.MUSIC_VOL : 0, ctx.currentTime, 0.12);
    },
    isMusicEnabled() { return musicEnabled; },
    beat,
    beatPhase() { const b = beat(); return b - Math.floor(b); },
    barBeat() { return ((Math.floor(beat()) % 3) + 3) % 3; },
    nearBeat(win) {
      const w = win === undefined ? CFG.BEAT_WINDOW : win;
      const d = this.beatPhase() * SPB;
      return d <= w || (SPB - d) <= w;
    },
    state() { return ctx ? ctx.state : 'locked'; },
    audioClockActive() { syncClock(); return audioSync; },
    _debug: debug,
    _ctx() { return ctx; },
  };
})();
