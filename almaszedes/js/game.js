// Almaszedés – játéklogika (A). Tiszta logika: nincs DOM, nincs időzítő, minden véletlen az átadott rng-ből jön.
// Node-ban:  require('../js/config.js'); require('../js/game.js');
(function (root) {
  const AS = (root.AS = root.AS || {});
  const CFG = AS.CFG;
  if (!CFG) throw new Error('Az AS.CFG hiányzik: a config.js-t a game.js ELŐTT kell betölteni.');

  // --- helyi állandók (a szerződés szövege nevesíti őket, de a config.js-ben nincsenek) ---
  const MAX_STEP = 0.05;              // ennél nagyobb dt-t belül több részlépésre bontunk
  const SPAWN_DELAY = CFG.SPAWN_DELAY || [0.2, 0.9];     // új alma késleltetése (s)
  const BIRD_MIN_FALL = 250;          // a célalmának legalább ennyi px-e legyen még a földig
  const BIRD_SCALE_RATE = 0.9;        // a madár méretváltozásának sebessége (scale/s)
  const BIRD_SCALE_ADD = 0.2;         // bird.scale = scale(alma mélysége) + ez
  const BIRD_OFF_X = 15, BIRD_OFF_Y = 50; // a madár célpontja: alma.x + 15 s, alma.y - 50 s
  const BIRD_WOBBLE_AMP = 20, BIRD_WOBBLE_FREQ = 2.5; // vitel közbeni fel-le hullámzás
  const BIRD_SPIN = 300;              // °/s lövés után
  const BIRD_STEAL_MARGIN = 120;      // x > W + ez -> a madár ellopta az almát
  const BIRD_EXIT_MARGIN = 250;       // ennyivel a képernyőn kívül tűnik el a madár
  const BIRD_HIT_VX = -350, BIRD_HIT_VY = -500;       // lelőtt madár sebessége (felfelé-balra)
  const BIRD_SHOO_FACTOR = 1.6;       // elhessegetett madár: BIRD_LEAVE_SPEED * ez, felfelé-jobbra
  const HEDGEHOG_OFF_Y = 40;          // a sün y-ja: groundY + 40 * scale
  const HEDGEHOG_MARGIN = 80;         // belépési pont a képernyőn kívül
  const HEDGEHOG_EXIT = 100;
  const EFFECT_LIFE = 1.0;
  const HIT_SPIN = 600;               // hessegetés: egy fordulat 0,6 mp alatt (fok/s)
  const APPLE_DRIFT_SPEED = 420;      // a sávon kívüli (leejtett) alma ennyivel sodródik vissza (px/s)
  // elhessegetett (megrémült) madár
  const SCARE_JOLT_T = 0.14;          // ennyi ideig a megrökönyödött rándulás tart
  const SCARE_RAMP_T = 0.22;          // utána ennyi alatt gyorsul fel
  const SCARE_SPEED = 1.05;           // a korábbi távozási sebesség többszöröse
  const SCARE_ZIG_AMP = 520, SCARE_ZIG_W = 14;  // oldalirányú cikázás (px/s, rad/s)
  const SCARE_ANGLE = 18, SCARE_ANGLE_W = 17;   // billegés (fok, rad/s)
  const SCARE_WING_MULT = 2.5;
  const SCARE_WING_AT = [0.08, 0.22]; // extra szárnycsapás-események ideje (s)
  const FEATHER_COUNT = [7, 9], FEATHER_LIFE = 1.6;

  const GOOD = { red: true, green: true, gold: true };

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const lerp = (range, r) => range[0] + (range[1] - range[0]) * r;
  const diffOf = (s) => CFG.DIFF[s.opts.difficulty];
  const rnd = (s) => s._rng();

  function calcSpeed(s) {
    const d = diffOf(s);
    return Math.min(CFG.SPEED_CAP, d.speed + d.speedPerLevel * (s.level - 1));
  }

  function phaseOf(fill) {
    const p = CFG.FILL_PHASES;
    return fill < p[0] ? 0 : fill < p[1] ? 1 : fill < p[2] ? 2 : 3;
  }

  function updateFill(s) {
    const b = s.basin;
    b.fill = clamp(b.caught / CFG.BASIN_CAPACITY, 0, 1);
    b.phase = phaseOf(b.fill);
  }

  function rimY(depth) {
    return CFG.groundY(depth) + CFG.CATCH_RIM_OFFSET_Y * CFG.scale(depth);
  }

  function addEffect(s, x, y, text, color, size, life) {
    const e = { type: 'text', x, y, text, color, t: 0, life: life || EFFECT_LIFE };
    if (size) e.size = size;
    s.effects.push(e);
  }

  // a tollak mozgatása (csak látvány): kezdeti kirobbanás, majd lassú, ringó hullás
  function stepFeather(e, dt) {
    const k = Math.exp(-2.4 * dt);
    e.vx *= k;
    e.vy *= k;
    e.x += (e.vx + 45 * Math.cos(e.t * 6 + e.rot)) * dt;
    e.y += (e.vy + 70) * dt;
    e.rot += e.vr * dt;
  }

  // ---------- létrehozás ----------
  function create(opts, rng) {
    opts = opts || {};
    const difficulty = CFG.DIFF[opts.difficulty] ? opts.difficulty : 'normal';
    const birdMode = opts.birdMode === 'shoo' ? 'shoo' : 'shoot';
    const diff = CFG.DIFF[difficulty];
    const r = typeof rng === 'function' ? rng : Math.random;
    const s = {
      mode: 'playing',
      opts: { difficulty, birdMode },
      time: 0,
      score: 0,
      lives: diff.lives,
      maxLives: diff.lives,
      level: 1,
      combo: 0,
      comboMult: 1,
      speedMult: 1,
      basin: { x: CFG.BASIN_START.x, depth: CFG.BASIN_START.depth, caught: 0, fill: 0, phase: 0, wideT: 0 },
      slowT: 0,
      crates: 0,
      levelT: 0,
      apples: [],
      bird: null,
      hedgehog: null,
      wind: { active: false, dir: 1, speed: 0, t: 0 },
      flashT: 0,
      effects: [],
      // privát könyvelés
      _rng: r,
      _nextId: 1,
      _spawnT: [],     // várakozó almák hátralévő késleltetései (levegőben lévő + ez = DIFF.apples)
      _birdT: CFG.BIRD_FIRST,
      _wingT: 0,
      _windGap: null,
    };
    s.speedMult = calcSpeed(s);
    for (let i = 0; i < diff.apples; i++) s._spawnT.push(lerp(SPAWN_DELAY, rnd(s)));
    return s;
  }

  // ---------- almák ----------
  function inAir(a) { return a.state === 'falling' || a.state === 'carried'; }

  function queueSpawn(s) { s._spawnT.push(lerp(SPAWN_DELAY, rnd(s))); }

  // alma törlése; ha levegőben volt, új születik helyette
  function removeApple(s, a, replace) {
    const i = s.apples.indexOf(a);
    if (i >= 0) s.apples.splice(i, 1);
    if (replace) queueSpawn(s);
  }

  function bonusInAir(s) {
    return s.apples.some((a) => inAir(a) && a.kind.indexOf('bonus_') === 0);
  }

  function pickKind(s) {
    const wormRoll = rnd(s);
    const bonusRoll = rnd(s);
    const kindRoll = rnd(s);
    if (wormRoll < CFG.WORM_CHANCE(s.level)) return 'worm';
    if (bonusRoll < CFG.BONUS_CHANCE && !bonusInAir(s)) {
      const ks = CFG.BONUS_KINDS;
      return ks[Math.min(ks.length - 1, Math.floor(rnd(s) * ks.length))];
    }
    const w = CFG.KIND_WEIGHTS;
    let total = 0;
    for (const k in w) total += w[k];
    let x = kindRoll * total;
    let last = 'red';
    for (const k in w) {
      last = k;
      if (x < w[k]) return k;
      x -= w[k];
    }
    return last;
  }

  function spawnApple(s, ev) {
    const kind = pickKind(s);
    const a = {
      id: s._nextId++,
      x: lerp(CFG.SPAWN_X, rnd(s)),
      y: CFG.SPAWN_Y,
      depth: rnd(s),
      kind,
      state: 'falling',
      vy: lerp(CFG.APPLE_VY, rnd(s)),
      t: 0,
    };
    s.apples.push(a);
    ev.push({ type: 'spawn', id: a.id, kind: a.kind, x: a.x, depth: a.depth });
  }

  function updateSpawns(s, dt, ev) {
    const q = s._spawnT;
    for (let i = q.length - 1; i >= 0; i--) {
      q[i] -= dt;
      if (q[i] <= 0) {
        q.splice(i, 1);
        spawnApple(s, ev);
      }
    }
  }

  // ---------- életvesztés / vége ----------
  function checkOver(s, ev) {
    if (s.lives <= 0 && s.mode !== 'gameover') {
      s.mode = 'gameover';
      ev.push({ type: 'gameover', score: s.score, level: s.level });
    }
  }

  function loseLife(s, ev) {
    s.lives = Math.max(0, s.lives - 1);
    s.combo = 0;
    s.comboMult = 1;
    ev.push({ type: 'life_lost', lives: s.lives });
    checkOver(s, ev);
  }

  // ---------- elkapás ----------
  function isCaught(s, a) {
    const b = s.basin;
    const diff = diffOf(s);
    if (Math.abs(a.depth - b.depth) > diff.depthTol) return false;
    const wide = b.wideT > 0 ? CFG.BONUS_WIDE_FACTOR : 1;
    const half = Math.max(CFG.CATCH_MIN_HALF_W, CFG.CATCH_HALF_W * CFG.scale(b.depth) * wide);
    return Math.abs(a.x - b.x) <= half;
  }

  const KIND_COLOR = { red: '#ff5a4d', green: '#8be04e', gold: '#ffd23f', worm: '#c98b4a' };

  // visszaadja: true, ha szintlépés indult
  function applyCatch(s, a, ev) {
    removeApple(s, a, true);
    const k = a.kind;
    if (GOOD[k]) {
      const pts = CFG.POINTS[k] * s.comboMult; // a kombó növelése ELŐTTI szorzóval
      s.score += pts;
      s.combo++;
      s.basin.caught++;
      const newMult = Math.min(CFG.COMBO_MAX_MULT, 1 + Math.floor(s.combo / CFG.COMBO_STEP));
      const grew = newMult > s.comboMult;
      const shownMult = s.comboMult;
      s.comboMult = newMult;
      updateFill(s);
      ev.push({ type: 'catch', kind: k, points: pts, x: a.x, y: a.y });
      addEffect(s, a.x, a.y - 40, '+' + pts + (shownMult > 1 ? ' ×' + shownMult : ''), KIND_COLOR[k]);
      if (grew) ev.push({ type: 'combo', mult: newMult });
      if (s.basin.caught >= CFG.BASIN_CAPACITY) {
        doLevelUp(s, ev);
        return true;
      }
    } else if (k === 'worm') {
      s.score = Math.max(0, s.score - CFG.WORM_PENALTY);
      s.combo = 0;
      s.comboMult = 1;
      ev.push({ type: 'worm', x: a.x, y: a.y });
      addEffect(s, a.x, a.y - 40, '−' + CFG.WORM_PENALTY, KIND_COLOR.worm);
    } else {
      let label = '';
      let bonus = '';
      if (k === 'bonus_wide') { s.basin.wideT = CFG.BONUS_WIDE_T; bonus = 'wide'; label = 'Széles lavór!'; }
      else if (k === 'bonus_slow') { s.slowT = CFG.BONUS_SLOW_T; bonus = 'slow'; label = 'Lassítás!'; }
      else if (k === 'bonus_life') {
        s.lives = Math.min(s.maxLives + CFG.MAX_LIVES_BONUS, s.lives + 1);
        bonus = 'life';
        label = '+1 élet';
      }
      ev.push({ type: 'bonus', kind: k, bonus });
      addEffect(s, a.x, a.y - 40, label, '#7fd8ff');
    }
    return false;
  }

  function doLevelUp(s, ev) {
    const bonus = CFG.LEVELUP_BONUS(s.level);
    s.score += bonus;
    s.level++;
    s.crates++;
    s.mode = 'levelup';
    s.levelT = CFG.LEVELUP_T;
    s.basin.fill = 1;
    s.basin.phase = 3;
    s.speedMult = calcSpeed(s);
    // a levegőben lévő almák (a madár által vitt is) büntetlenül eltűnnek
    for (const a of s.apples.slice()) {
      if (inAir(a)) removeApple(s, a, true);
    }
    const b = s.bird;
    if (b && (b.state === 'approach' || b.state === 'carry')) startLeave(s, b);
    ev.push({ type: 'levelup', level: s.level, bonus });
    addEffect(s, CFG.W / 2, 300, 'Szint ' + s.level + '! +' + bonus, '#fff2a8');
  }

  function updateApples(s, dt, ev) {
    const slow = s.slowT > 0 ? CFG.BONUS_SLOW_FACTOR : 1;
    const w = s.wind;
    for (const a of s.apples.slice()) {
      if (s.mode !== 'playing') break;
      if (a.state !== 'falling') continue;
      const prevY = a.y;
      a.y += a.vy * s.speedMult * slow * dt;
      a.t += dt;
      const xlo = CFG.APPLE_X_CLAMP[0], xhi = CFG.APPLE_X_CLAMP[1];
      if (a.x < xlo || a.x > xhi) {
        // a sávon kívül (pl. a madárról leejtett alma): simán visszasodródik, a szél nem lökheti ki újra
        // elég gyorsan sodródik ahhoz, hogy a lavór peremének magasságáig biztosan beérjen
        const dist = a.x > xhi ? a.x - xhi : xlo - a.x;
        const fall = a.vy * s.speedMult * slow;
        const tRim = fall > 0 ? (rimY(a.depth) - a.y) / fall : 0;
        const need = tRim > 0.05 ? (dist / tRim) * 1.25 : APPLE_DRIFT_SPEED;
        const step = Math.min(1600, Math.max(APPLE_DRIFT_SPEED, need)) * dt;
        a.x = a.x > xhi ? Math.max(xhi, a.x - step) : Math.min(xlo, a.x + step);
      } else if (w.active) a.x = clamp(a.x + w.dir * w.speed * dt, xlo, xhi);

      // a perem átlépésének pillanata (egyszer, a korábbi és a mostani y alapján: nagy dt-nél sem alagutazik)
      const rim = rimY(a.depth);
      if (prevY < rim && a.y >= rim && isCaught(s, a)) {
        if (applyCatch(s, a, ev)) return;
        continue;
      }
      // a perem alatt elengedett alma: az átlépés nem történhet meg, ezért földetéréskor kapja a szokásos egyszeri próbát
      if (a._lateTest && a.y >= CFG.groundY(a.depth)) {
        a._lateTest = false;
        if (isCaught(s, a)) {
          if (applyCatch(s, a, ev)) return;
          continue;
        }
      }
      if (a.y >= CFG.groundY(a.depth)) {
        a.y = CFG.groundY(a.depth);
        a.state = 'landed';
        a.t = 0;
        a.vy = 0;
        queueSpawn(s); // már nincs a levegőben
        if (GOOD[a.kind]) {
          ev.push({ type: 'miss', x: a.x, y: a.y });
          loseLife(s, ev);
          if (s.mode === 'gameover') return;
        }
      }
    }
  }

  function updateLanded(s, dt) {
    for (const a of s.apples.slice()) {
      if (a.state !== 'landed') continue;
      a.t += dt;
      if (a.t > CFG.LANDED_FADE_T) removeApple(s, a, false);
    }
  }

  // ---------- szél ----------
  function updateWind(s, dt, ev) {
    const w = s.wind;
    if (w.active) {
      w.t -= dt;
      if (w.t <= 0) {
        w.active = false;
        w.t = 0;
        w.speed = 0;
        s._windGap = null;
      }
      return;
    }
    if (s.level < CFG.WIND_FROM_LEVEL) return;
    if (s._windGap == null) s._windGap = lerp(CFG.WIND_GAP, rnd(s));
    s._windGap -= dt;
    if (s._windGap <= 0) {
      w.active = true;
      w.dir = rnd(s) < 0.5 ? -1 : 1;
      w.speed = lerp(CFG.WIND_SPEED, rnd(s));
      w.t = CFG.WIND_T;
      s._windGap = null;
      ev.push({ type: 'wind', dir: w.dir });
    }
  }

  // ---------- madár ----------
  function findBirdTarget(s, fromX, fromY) {
    let best = null;
    let bestD = Infinity;
    for (const a of s.apples) {
      if (a.state !== 'falling' || !GOOD[a.kind]) continue;
      if (CFG.groundY(a.depth) - a.y < BIRD_MIN_FALL) continue;
      const d = Math.hypot(a.x - fromX, a.y - fromY);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  function birdTargetPos(a, scale) {
    return { x: a.x + BIRD_OFF_X * scale, y: a.y - BIRD_OFF_Y * scale };
  }

  function startLeave(s, b) {
    b.state = 'leave';
    b.targetId = null;
    b.angle = 0;
    b._vx = CFG.BIRD_LEAVE_SPEED * BIRD_SHOO_FACTOR * 0.7;
    b._vy = -CFG.BIRD_LEAVE_SPEED * BIRD_SHOO_FACTOR * 0.7;
  }

  function birdGone(s) {
    s.bird = null;
    s._birdT = diffOf(s).birdEvery;
  }

  function handleClick(s, click, ev) {
    const b = s.bird;
    if (!b || (b.state !== 'approach' && b.state !== 'carry')) return;
    if (!click || !isFinite(click.x) || !isFinite(click.y)) return;
    const r = Math.max(CFG.BIRD_HIT_RADIUS, 0.4 * CFG.BIRD_SIZE * b.scale);
    if (Math.hypot(click.x - b.x, click.y - b.y) > r) return;
    const mode = s.opts.birdMode;
    ev.push({ type: 'bird_hit', mode, x: b.x, y: b.y });
    s.score += CFG.BIRD_HIT_POINTS;
    addEffect(s, b.x, b.y, '+' + CFG.BIRD_HIT_POINTS, '#ffe27a');
    const carried = s.apples.find((a) => a.state === 'carried');
    if (carried) {
      carried.state = 'falling'; // onnan esik tovább, ahol van
      carried._lateTest = carried.y >= rimY(carried.depth); // a perem alatt: földetéréskor kap elkapás-próbát
    }
    b.targetId = null;
    if (mode === 'shoot') {
      b.state = 'hit';
      s.flashT = CFG.FLASH_T;
      b.angle = 0;
      b._vx = BIRD_HIT_VX;
      b._vy = BIRD_HIT_VY;
    } else {
      startScared(s, b, ev);
    }
  }

  // sikeres elhessegetés: megrémült menekülés + látványelemek
  function startScared(s, b, ev) {
    startLeave(s, b);
    b.scared = true;
    b._st = 0;
    b._sx = b.x;
    b._wingExtra = 0;
    addEffect(s, b.x, b.y - 105, 'Hess!', '#ffb02e', 1.8, 1.3);
    s.effects.push({ type: 'burst', x: b.x, y: b.y, t: 0, life: 0.55 });
    const n = FEATHER_COUNT[0] + Math.floor(rnd(s) * (FEATHER_COUNT[1] - FEATHER_COUNT[0] + 1));
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rnd(s) * 0.8;
      const sp = 260 + rnd(s) * 300;
      s.effects.push({
        type: 'feather', x: b.x + Math.cos(ang) * 20, y: b.y + Math.sin(ang) * 20,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 120,
        rot: rnd(s) * Math.PI * 2, vr: (rnd(s) - 0.5) * 8, t: 0, life: FEATHER_LIFE,
      });
    }
  }

  function updateBird(s, dt, ev) {
    let b = s.bird;
    if (!b) {
      if (s.mode !== 'playing') return; // szintlépés alatt a madár-időzítő áll
      s._birdT -= dt;
      if (s._birdT > 0) return;
      const tgt = findBirdTarget(s, CFG.BIRD_START.x, CFG.BIRD_START.y);
      if (!tgt) return; // megvárja a következő alkalmas almát
      b = s.bird = {
        x: CFG.BIRD_START.x,
        y: CFG.BIRD_START.y,
        scale: CFG.scale(0) + BIRD_SCALE_ADD, // távolról érkezik, és fokozatosan "jön közelebb"
        frame: 0,
        angle: 0,
        state: 'approach',
        targetId: tgt.id,
      };
      s._wingT = 0;
      ev.push({ type: 'bird_enter' });
      return;
    }

    // szárnyfázis
    s._wingT += dt * (b.scared ? SCARE_WING_MULT : 1);
    while (s._wingT >= CFG.BIRD_FRAME_T) {
      s._wingT -= CFG.BIRD_FRAME_T;
      b.frame = (b.frame + 1) % 9;
      if (b.frame === 5) ev.push({ type: 'wing' });
    }

    if (b.state === 'approach') {
      let tgt = s.apples.find((a) => a.id === b.targetId && a.state === 'falling');
      if (!tgt) {
        tgt = findBirdTarget(s, b.x, b.y);
        b.targetId = tgt ? tgt.id : null;
      }
      if (!tgt) return; // nincs cél: lebeg, amíg lesz
      // a méret rövid átmenettel közelít a célalma mélységéhez (nem ugrik)
      const wantScale = CFG.scale(tgt.depth) + BIRD_SCALE_ADD;
      const ds = wantScale - b.scale, maxStep = BIRD_SCALE_RATE * dt;
      b.scale += Math.abs(ds) <= maxStep ? ds : Math.sign(ds) * maxStep;
      const p = birdTargetPos(tgt, b.scale);
      const dx = p.x - b.x, dy = p.y - b.y;
      const dist = Math.hypot(dx, dy);
      const stepLen = CFG.BIRD_APPROACH_SPEED * dt;
      if (dist <= stepLen) {
        b.x = p.x;
        b.y = p.y;
        tgt.state = 'carried';
        b.state = 'carry';
        b._base = b.y;
        b._t0 = s.time;
      } else {
        b.x += (dx / dist) * stepLen;
        b.y += (dy / dist) * stepLen;
      }
    } else if (b.state === 'carry') {
      const a = s.apples.find((x) => x.id === b.targetId && x.state === 'carried');
      b.x += CFG.BIRD_CARRY_SPEED * dt;
      b.y = b._base + BIRD_WOBBLE_AMP * Math.sin(BIRD_WOBBLE_FREQ * (s.time - b._t0));
      if (!a) { startLeave(s, b); return; }
      a.x = b.x - BIRD_OFF_X * b.scale;
      a.y = b.y + BIRD_OFF_Y * b.scale;
      if (b.x > CFG.W + BIRD_STEAL_MARGIN) {
        ev.push({ type: 'bird_steal' });
        removeApple(s, a, true);
        birdGone(s);
        loseLife(s, ev);
      }
    } else {
      // 'leave' / 'hit'
      if (b.scared) {
        // megrémült menekülés: rándulás, majd gyors cikázó felfelé iramodás
        b._st += dt;
        const t = b._st;
        for (let i = b._wingExtra; i < SCARE_WING_AT.length; i++) {
          if (t >= SCARE_WING_AT[i]) { ev.push({ type: 'wing' }); b._wingExtra = i + 1; }
        }
        // szelíd hessegetés: egyet fordul a helyén, majd dupla sebességgel, véletlen (felfelé mutató) irányban kirepül
        if (!b._spun) {
          b._vx = 0;
          b._vy = 0;
          b.angle = Math.min(360, t * HIT_SPIN);
          if (b.angle >= 360) {
            b.angle = 0;
            b._spun = true;
            const th = (20 + 140 * rnd(s)) * Math.PI / 180;
            const sp = CFG.BIRD_LEAVE_SPEED * 2;
            b._vx = Math.cos(th) * sp;
            b._vy = -Math.sin(th) * sp;
          }
        }
      }
      b.x += b._vx * dt;
      b.y += b._vy * dt;
      if (b.state === 'hit') b.angle += BIRD_SPIN * dt;
      if (b.x < -BIRD_EXIT_MARGIN || b.x > CFG.W + BIRD_EXIT_MARGIN || b.y < -BIRD_EXIT_MARGIN) birdGone(s);
    }
  }

  // ---------- sün ----------
  function hedgehogY(depth) { return CFG.groundY(depth) + HEDGEHOG_OFF_Y * CFG.scale(depth); }

  function updateHedgehog(s, dt) {
    let h = s.hedgehog;
    if (!h) {
      const a = s.apples.find((x) => x.state === 'landed');
      if (!a) return;
      const fromLeft = a.x < CFG.W / 2;
      s.hedgehog = {
        x: fromLeft ? -HEDGEHOG_MARGIN : CFG.W + HEDGEHOG_MARGIN,
        y: hedgehogY(a.depth),
        depth: a.depth,
        dir: fromLeft ? 1 : -1,
        carrying: false,
        _targetId: a.id,
      };
      return;
    }
    h.x += h.dir * CFG.HEDGEHOG_SPEED * dt;
    if (!h.carrying) {
      let t = s.apples.find((a) => a.id === h._targetId && a.state === 'landed');
      if (!t) {
        // a célalma eltűnt: legközelebbi másik földön fekvő, ha nincs, kisétál
        let bd = Infinity;
        for (const a of s.apples) {
          if (a.state !== 'landed') continue;
          const d = Math.abs(a.x - h.x);
          if (d < bd) { bd = d; t = a; }
        }
        if (t) {
          h._targetId = t.id;
          h.depth = t.depth;
          h.y = hedgehogY(t.depth);
          h.dir = t.x >= h.x ? 1 : -1;
        }
      }
      if (t && (h.dir > 0 ? h.x >= t.x : h.x <= t.x)) {
        t.state = 'taken';
        h.carrying = true;
      }
    }
    if (h.carrying) {
      const t = s.apples.find((a) => a.id === h._targetId && a.state === 'taken');
      if (t) t.x = h.x;
    }
    if (h.x < -HEDGEHOG_EXIT || h.x > CFG.W + HEDGEHOG_EXIT) {
      const t = s.apples.find((a) => a.id === h._targetId && a.state === 'taken');
      if (t) removeApple(s, t, false);
      s.hedgehog = null;
    }
  }

  // ---------- fő léptetés ----------
  const NO_CLICK = { moveX: 0, moveY: 0, click: null };

  function step(s, dt, input, ev) {
    s.time += dt;
    const b = s.basin;
    const mx = clamp(num(input.moveX), -1, 1);
    const my = clamp(num(input.moveY), -1, 1);
    b.x = clamp(b.x + mx * CFG.BASIN_SPEED_X * dt, CFG.BASIN_X[0], CFG.BASIN_X[1]);
    b.depth = clamp(b.depth + my * CFG.BASIN_SPEED_D * dt, 0, 1);
    b.wideT = Math.max(0, b.wideT - dt);
    s.slowT = Math.max(0, s.slowT - dt);
    s.flashT = Math.max(0, s.flashT - dt);

    for (let i = s.effects.length - 1; i >= 0; i--) {
      const e = s.effects[i];
      e.t += dt;
      if (e.type === 'feather') stepFeather(e, dt);
      if (e.t > e.life) s.effects.splice(i, 1);
    }

    if (s.mode === 'levelup') {
      s.levelT -= dt;
      if (s.levelT <= 0) {
        s.levelT = 0;
        b.caught = 0;
        updateFill(s);
        s.mode = 'playing';
        // szintenként nő az egyszerre hulló almák száma
        const want = CFG.DIFF[s.opts.difficulty].apples +
          Math.min(CFG.APPLES_EXTRA_MAX, Math.floor((s.level - 1) / CFG.APPLES_EVERY_LEVELS));
        while (s.apples.filter(inAir).length + s._spawnT.length < want) queueSpawn(s);
      }
    }

    if (input.click) handleClick(s, input.click, ev);

    if (s.mode === 'playing') {
      updateWind(s, dt, ev);
      updateSpawns(s, dt, ev);
    }
    updateBird(s, dt, ev);
    if (s.mode === 'gameover') return;
    if (s.mode === 'playing') updateApples(s, dt, ev);
    if (s.mode === 'gameover') return;
    updateLanded(s, dt);
    updateHedgehog(s, dt);
  }

  function update(state, dt, input) {
    const ev = [];
    if (!state || state.mode === 'gameover') return ev;
    if (!(dt > 0) || !isFinite(dt)) return ev;
    input = input || NO_CLICK;
    let rem = dt;
    let first = true;
    while (rem > 1e-9 && state.mode !== 'gameover') {
      const h = Math.min(rem, MAX_STEP);
      step(state, h, first ? input : NO_CLICK, ev);
      rem -= h;
      first = false;
    }
    return ev;
  }

  AS.Game = { create, update };

  if (typeof module !== 'undefined' && module.exports) module.exports = AS;
})(typeof window !== 'undefined' ? window : globalThis);
