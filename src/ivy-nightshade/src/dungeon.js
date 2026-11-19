(function () {
  const G = window.G;
  const CFG = G.CFG;
  const T = CFG.TILE;

  const LOOP = 6;                       // skeleton / rock loop in beats
  const SK_W = 20, SK_H = 50;           // skeleton hitbox
  const ROCK = 28;                      // rock hitbox size
  const REACH = T;                      // how close Ivy must be to a torch / candle
  const DARK_FADE = 0.4;                // seconds to cross-fade the darkness
  const SOLVE_DELAY = 0.6, FAIL_DELAY = 0.5, DOOR_TIME = 1.2, DOOR_PASS = 0.8, PUFF_TIME = 0.8;
  const MAX_GHOSTS = 3;

  function sfx(name, opts) { if (G.sfx && G.sfx.play) G.sfx.play(name, opts); }
  function beatNow() { return (G.rhythm && G.rhythm.beat) ? G.rhythm.beat() : G.time * CFG.BPM / 60; }
  function mod(a, n) { return ((a % n) + n) % n; }

  class Dungeon {
    constructor(world, player, level, ghosts) {
      this.world = world; this.player = player; this.level = level; this.ghosts = ghosts || null;
      this.paused = false; this.t = 0;
      this.scrollReached = false;
      this.skeletons = []; this.rocks = []; this.webs = []; this.zones = []; this.torches = [];
      this.candles = []; this.door = null; this.scroll = null; this.spawns = [];
      this.puzzle = { lit: [], right: [], state: 'idle', timer: 0, solved: false };
      this._dark = 0;
      this._summoned = [];
      const ents = level.entities || [];

      ents.forEach((e) => {
        const p = world.entPos(e);
        if (e.type === 'skeletons') {
          const w = (e.width || 4) * T;
          this.skeletons.push({
            x0: e.tx * T, w, y: p.y, offset: e.offset || 0, phase: 0, c: e.tx * T + w / 2, facing: 1,
            a: { x: 0, y: p.y }, b: { x: 0, y: p.y }, contact: false,
          });
        } else if (e.type === 'rockfall') {
          const col = e.tx;
          let r = e.ty; while (r > 0 && !world.isSolid(col, r)) r--;
          const ceilY = world.isSolid(col, r) ? (r + 1) * T : 0;
          const floorY = (e.ty + 1) * T;
          const top = ceilY + ROCK, dist = Math.max(1, floorY - top);
          const fallSec = Math.min(0.55, Math.sqrt(2 * dist / 3000));
          this.rocks.push({
            x: p.x, ceilY, floorY, offset: e.offset || 0, state: 'hang', k: 0, y: top, top,
            fallBeats: fallSec * CFG.BPM / 60, contact: false, hit: null, landed: false,
          });
        } else if (e.type === 'web') {
          this.webs.push({ x: e.tx * T, y: (e.ty + 1) * T, len: e.len || 3, torn: false, tornT: 0 });
        } else if (e.type === 'dark') {
          this.zones.push({ x: e.tx * T, y: e.ty * T, w: (e.w || 12) * T, h: (e.h || 8) * T, lit: false, torches: [] });
        } else if (e.type === 'torch') {
          this.torches.push({ x: p.x, y: p.y, zone: e.zone || 0, lit: false, litT: 0 });
        } else if (e.type === 'candles') {
          for (let i = 0; i < 4; i++) this.candles.push({ x: (e.tx + 0.5 + 1.5 * i) * T, y: p.y, lit: false, puff: 0, i });
        } else if (e.type === 'door') {
          this.door = { tx: e.tx, ty: e.ty, x: (e.tx + 1) * T, y: p.y, open: 0, opening: false, sfxDone: false };
        } else if (e.type === 'scroll') {
          this.scroll = { x: p.x, y: p.y };
        } else if (e.type === 'ghostspawn') {
          this.spawns.push({ x: p.x, y: p.y });
        }
      });
      for (const tc of this.torches) if (this.zones[tc.zone]) this.zones[tc.zone].torches.push(tc);

      // random right set: 3 of the 4 candles
      const wrong = Math.floor(Math.random() * 4);
      this.puzzle.right = [0, 1, 2, 3].filter((i) => i !== wrong);

      const d = this.door;
      world.extraSolid = (tx, ty) => this.isSolid(tx, ty);
      this.update(0, true);
    }

    // ---------- queries ----------
    isSolid(tx, ty) {
      // a shut portcullis is a wall (only while fully down)
      for (const r of this.rocks) if (r.state === 'rest' && tx === Math.floor(r.x / T) && ty * T >= r.ceilY && ty * T < r.floorY) return true;
      const d = this.door;
      if (!d || d.open > DOOR_PASS) return false;
      return tx >= d.tx && tx <= d.tx + 1 && ty >= d.ty - 2 && ty <= d.ty;
    }

    _web(p) { // web under Ivy's feet, or null
      if (!p.onGround || p.onLadder) return null;
      for (const w of this.webs) if (p.x >= w.x && p.x <= w.x + w.len * T && Math.abs(p.y - w.y) < 6) return w;
      return null;
    }

    speedMul() {
      const w = this._web(this.player);
      return (w && !w.torn) ? (CFG.WEB_SLOW ?? 0.45) : 1;
    }

    _zoneAt(x, y) {
      for (const z of this.zones) if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) return z;
      return null;
    }

    lightStrength(base) {
      const dark = CFG.DARK_STRENGTH ?? 0.93;
      return base + (dark - base) * this._dark;
    }

    _near(o) {
      const p = this.player;
      return Math.abs(p.x - o.x) <= REACH && Math.abs(p.y - o.y) <= 1.5 * T;
    }
    _nearestTorch() {
      let best = null, bd = 1e9;
      for (const tc of this.torches) if (!tc.lit && this._near(tc)) { const d = Math.abs(this.player.x - tc.x); if (d < bd) { bd = d; best = tc; } }
      return best;
    }
    _nearestCandle() {
      if (this.puzzle.state !== 'idle' || this.puzzle.solved) return null;
      let best = null, bd = 1e9;
      for (const c of this.candles) if (!c.lit && this._near(c)) { const d = Math.abs(this.player.x - c.x); if (d < bd) { bd = d; best = c; } }
      return best;
    }

    nearestAction() {
      const p = this.player;
      if (p.state === 'hidden') return null;
      if (this._nearestTorch()) return 'hint_torch';
      if (this._nearestCandle()) return 'hint_candle';
      return null;
    }

    reset() {
      for (const s of this.skeletons) s.contact = false;
      for (const r of this.rocks) { r.contact = false; r.landed = false; }
    }

    // ---------- update ----------
    update(dt, init) {
      this.t += dt;
      const p = this.player, beat = beatNow();
      this._animate(beat);
      if (init || this.paused) return;
      this._idleGhosts(dt);
      const hidden = p.state === 'hidden';
      const pr = p.rect();

      // skeletons
      for (const s of this.skeletons) {
        const hit = !hidden && (G.util.overlap(pr, this._skRect(s.a)) || G.util.overlap(pr, this._skRect(s.b)));
        if (hit && !s.contact) {
          s.contact = true; sfx('wake');
          G.events.emit('caught', { by: 'skeleton', who: 'skeleton', x: p.x, y: p.y });
        } else if (!hit) s.contact = false;
      }
      // rocks
      for (const r of this.rocks) {
        const hit = !hidden && r.state === 'fall' && G.util.overlap(pr, { x: r.x - ROCK / 2, y: r.y - ROCK, w: ROCK, h: ROCK });
        if (hit && !r.contact) {
          r.contact = true;
          G.events.emit('caught', { by: 'trap', kind: 'rock', x: r.x, y: r.y });
        } else if (!hit) r.contact = false;
      }

      // webs
      const web = this._web(p);
      if (web && !web.torn) {
        const m = CFG.WEB_SLOW ?? 0.45;
        if (p.state === 'walk' && Math.abs(p.vx) > CFG.SNEAK_SPEED * 1.3 * m) {
          web.torn = true;
          sfx('creak');
          G.events.emit('noise', { x: p.x, y: p.y, radius: 6 * T, src: 'web' });
        }
      }

      // dark zone
      const z = this._zoneAt(p.x, p.y - p.h / 2);
      const target = (z && !z.lit) ? 1 : 0;
      const step = dt / DARK_FADE;
      this._dark += Math.max(-step, Math.min(step, target - this._dark));

      // interaction: torch / candle
      const act = !hidden && p.control !== false && (G.input.pressed('action') || G.input.pressed('down'));
      if (act) {
        const tc = this._nearestTorch();
        if (tc) {
          tc.lit = true; tc.litT = 0;
          const zone = this.zones[tc.zone];
          if (zone && zone.torches.every((q) => q.lit)) zone.lit = true;
        } else {
          const c = this._nearestCandle();
          if (c) this._lightCandle(c);
        }
      }
      this._puzzle(dt);

      // scroll
      if (this.scroll && this.door && this.door.open > DOOR_PASS && !this.scrollReached) {
        const sr = { x: this.scroll.x - 18, y: this.scroll.y - 50, w: 36, h: 50 };
        if (G.util.overlap(pr, sr)) { this.scrollReached = true; G.events.emit('scroll_reached', { x: this.scroll.x, y: this.scroll.y }); }
      }
    }

    _skRect(s) { return { x: s.x - SK_W / 2, y: s.y - SK_H, w: SK_W, h: SK_H }; }

    // beat-driven poses (pure function of the beat clock)
    _animate(beat) {
      for (const s of this.skeletons) {
        const u = mod(beat + s.offset, LOOP) / LOOP;
        s.phase = u;
        const k = 0.5 - 0.5 * Math.cos(u * Math.PI * 2);         // 0..1..0 over 6 beats (3 beats each way)
        const lo = s.x0 + Math.min(T, s.w / 2), hi = s.x0 + s.w - Math.min(T, s.w / 2);
        s.c = lo + (hi - lo) * k;
        const v = Math.sin(u * Math.PI * 2);
        if (Math.abs(v) > 0.05) s.facing = v > 0 ? 1 : -1;
        const sway = Math.sin(u * Math.PI * 12) * 2;               // waltz sway, 3 steps per direction
        s.a.x = s.c - 17 + sway; s.b.x = s.c + 17 + sway;
      }
      const beatSec = 60 / CFG.BPM;
      for (const r of this.rocks) {
        const b = mod(beat + r.offset, LOOP), fb = r.fallBeats;
        const was = r.state;
        // portcullis: chains rattle (1 beat) -> slams down -> stays shut (1 beat) -> rises again (1 beat) -> open
        if (b < 1) { r.state = 'warn'; r.k = b; r.y = r.top; }
        else if (b < 1 + fb) { r.state = 'fall'; r.k = (b - 1) / fb; r.y = r.top + (r.floorY - r.top) * r.k * r.k; }
        else if (b < 2 + fb) { r.state = 'rest'; r.k = (b - 1 - fb); r.y = r.floorY; }
        else if (b < 3 + fb) { r.state = 'rise'; r.k = (b - 2 - fb); r.y = r.floorY - (r.floorY - r.top) * (0.5 - 0.5 * Math.cos(r.k * Math.PI)); }
        else { r.state = 'hang'; r.k = 0; r.y = r.top; }
        if (was === 'fall' && r.state === 'rest') {
          const d = this.player ? Math.hypot(this.player.x - r.x, this.player.y - r.floorY) : 1e9;
          const vol = G.util.clamp(1 - d / (12 * T), 0, 1);
          if (vol > 0 && !this.paused) { sfx('land', { vol }); sfx('chandelier', { vol: vol * 0.7 }); }
        }
      }
      for (const c of this.candles) if (c.puff > 0) c.puff = Math.max(0, c.puff - (this._lastDt || 1 / 60) / PUFF_TIME);
      void beatSec;
    }

    // ---------- candle puzzle ----------
    _lightCandle(c) {
      const P = this.puzzle;
      this._calmT = 0;
      c.lit = true; sfx('creak', { vol: 0.35 });
      P.lit.push(c.i);
      while (P.lit.length > 3) { const o = P.lit.shift(); this.candles[o].lit = false; this.candles[o].puff = 1; }
      if (P.lit.length === 3) {
        const ok = P.lit.every((i) => P.right.indexOf(i) >= 0);
        P.state = ok ? 'solving' : 'failing';
        P.timer = ok ? SOLVE_DELAY : FAIL_DELAY;
      }
    }

    _puzzle(dt) {
      const P = this.puzzle;
      this._lastDt = dt;
      if (P.state === 'solving') {
        P.timer -= dt;
        if (P.timer <= 0) {
          const last = [0, 1, 2, 3].find((i) => P.lit.indexOf(i) < 0);
          this.candles[last].lit = true; P.lit.push(last);
          P.state = 'solved'; P.solved = true;
          if (this.door) { this.door.opening = true; sfx('door'); }
          this._dismissSummoned();
          G.events.emit('door_open', { x: this.door ? this.door.x : 0, y: this.door ? this.door.y : 0 });
        }
      } else if (P.state === 'failing') {
        P.timer -= dt;
        if (P.timer <= 0) {
          for (const c of this.candles) { if (c.lit) c.puff = 1; c.lit = false; }
          P.lit = []; P.state = 'idle';
          sfx('whoosh', { vol: 0.5 });
          this._summon();
        }
      }
      const d = this.door;
      if (d && d.opening && d.open < 1) d.open = Math.min(1, d.open + dt / DOOR_TIME);
      for (const tc of this.torches) tc.litT += dt;
    }

    // a wrong candle set summons a ghost anywhere on the level (max MAX_GHOSTS summoned at once – the 4th makes the
    // oldest summoned one vanish; the level's own ghosts don't count). Never on a hiding spot, at the door or next to Ivy,
    // and at most one summoned ghost near the candles so the puzzle stays solvable.
    _summonPoints() {
      if (this._pts) return this._pts;
      const w = this.world, pts = [];
      for (let ty = 1; ty < w.rows - 1; ty++) for (let tx = 2; tx < w.cols - 2; tx++) {
        const floor = w.isSolid(tx, ty + 1) || w.isOneWay(tx, ty + 1);
        if (floor && !w.isSolid(tx, ty) && !w.isSolid(tx, ty - 1) && !w.isLadder(tx, ty)) pts.push({ x: (tx + 0.5) * T, y: (ty + 1) * T });
      }
      const hides = (this.level.entities || []).filter((e) => e.type === 'hide').map((e) => w.entPos(e));
      const d = this.door;
      this._pts = pts.filter((q) => !hides.some((h) => Math.abs(h.x - q.x) < 1.6 * T && Math.abs(h.y - q.y) < T) &&
        !(d && Math.abs(d.x - q.x) < 3 * T && Math.abs(d.y - q.y) < 2 * T) &&
        !(this.scroll && Math.abs(this.scroll.x - q.x) < 3 * T && Math.abs(this.scroll.y - q.y) < 2 * T));
      return this._pts;
    }
    _nearCandles(q) {
      if (!this.candles.length) return false;
      const x0 = this.candles[0].x - 4 * T, x1 = this.candles[this.candles.length - 1].x + 4 * T;
      return q.x > x0 && q.x < x1 && Math.abs(q.y - this.candles[0].y) < 3 * T;
    }
    _summon() {
      const gh = this.ghosts, p = this.player;
      if (!gh || !gh.add) return;
      this._summoned = this._summoned.filter((g) => gh.ghosts.indexOf(g) >= 0);
      if (this._summoned.length >= MAX_GHOSTS) gh.remove(this._summoned.shift()); // the 4th summon: the oldest vanishes
      const candleTaken = this._summoned.some((g) => this._nearCandles(g));
      // they appear where the player can see them: between the last portcullis before the door and the door/scroll
      const endX = this.door ? this.door.x - 3 * T : this.world.wpx;
      const gates = this.rocks.map((r) => r.x).filter((x) => x < endX);
      const startX = gates.length ? Math.max(...gates) + T : endX - 30 * T;
      const area = (q) => q.x > startX && q.x < endX;
      let pool = this._summonPoints().filter((q) => area(q) && Math.hypot(q.x - p.x, q.y - p.y) >= 4 * T && !(candleTaken && this._nearCandles(q)) &&
        !this._summoned.some((g) => Math.abs(g.x - q.x) < 3.5 * T && Math.abs(g.y - q.y) < 2 * T));
      if (!pool.length) pool = this._summonPoints().filter((q) => area(q) && Math.hypot(q.x - p.x, q.y - p.y) >= 2 * T && !(candleTaken && this._nearCandles(q)));
      if (!pool.length) pool = this.spawns.filter((s) => Math.hypot(s.x - p.x, s.y - p.y) >= 3 * T);
      if (!pool.length) return;
      const sp = G.util.choice(pool);
      const g = gh.add(sp.x, sp.y);
      g.summoned = true; this._calmT = 0;
      this._summoned.push(g);
      sfx('stir', { vol: 0.7 });
      G.events.emit('ghost_summoned', { x: sp.x, y: sp.y, ghost: g });
    }
    // after CFG.SUMMON_IDLE s without candle activity the summoned ghosts get bored and leave one by one,
    // so a stuck child can simply start the puzzle again
    _idleGhosts(dt) {
      if (!this._summoned.length || !this.ghosts) return;
      this._calmT = (this._calmT || 0) + dt;
      if (this._calmT < (CFG.SUMMON_IDLE ?? 20)) return;
      const g = this._summoned.shift();
      this._calmT -= 1.2; // the next one leaves 1.2 s later
      if (this.ghosts.ghosts.indexOf(g) < 0) return;
      G.events.emit('ghost_leave', { x: g.x, y: g.y });
      this.ghosts.remove(g);
    }
    _dismissSummoned() { // puzzle solved: the summoned ghosts leave
      const gh = this.ghosts; if (!gh) return;
      for (const g of this._summoned) if (gh.ghosts.indexOf(g) >= 0) gh.remove(g);
      this._summoned = [];
    }

    // ---------- drawing ----------
    draw(ctx) {
      const A = G.art || {}, t = G.time;
      for (const w of this.webs) {
        if (A.drawWeb) A.drawWeb(ctx, w.x, w.y, { len: w.len, torn: w.torn, t });
        else this._ph(ctx, 'web', w);
      }
      for (const tc of this.torches) {
        if (A.drawTorch) A.drawTorch(ctx, tc.x, tc.y, { lit: tc.lit, t });
        else this._ph(ctx, 'torch', tc);
      }
      for (const c of this.candles) {
        if (A.drawPuzzleCandle) A.drawPuzzleCandle(ctx, c.x, c.y, { lit: c.lit, t, puff: c.puff > 0 ? 1 - c.puff : 0 });
        else this._ph(ctx, 'candle', c);
      }
      if (this.door) {
        if (A.drawDoor) A.drawDoor(ctx, this.door.x, this.door.y, { open: this.door.open, t });
        else this._ph(ctx, 'door', this.door);
      }
      if (this.scroll) {
        const glow = this.door ? G.util.clamp((this.door.open - 0.3) / 0.7, 0, 1) : 0;
        if (A.drawScroll) A.drawScroll(ctx, this.scroll.x, this.scroll.y, { t, glow });
        else this._ph(ctx, 'scroll', this.scroll, glow);
      }
      for (const r of this.rocks) {
        if (A.drawPortcullis) {
          A.drawPortcullis(ctx, r.x, r.ceilY, r.state === 'hang' || r.state === 'warn' ? r.top - 18 : r.y, { warn: r.state === 'warn', t, state: r.state });
        } else if (A.drawRock) {
          const warn = r.state === 'hang' || r.state === 'warn';
          A.drawRock(ctx, r.x, warn ? r.ceilY : r.y - 15, { state: warn ? 'warn' : r.state, k: warn ? 0 : r.k, t: r.state === 'hang' ? 0 : t });
        }
        else this._ph(ctx, 'rock', r);
      }
      for (const s of this.skeletons) {
        if (A.drawSkeleton) {
          A.drawSkeleton(ctx, s.a.x, s.y, { t, phase: s.phase, facing: s.facing, partner: false });
          A.drawSkeleton(ctx, s.b.x, s.y, { t, phase: s.phase, facing: s.facing, partner: true });
        } else { this._ph(ctx, 'skel', s.a, 0, s); this._ph(ctx, 'skel', s.b, 0, s); }
      }
    }

    _ph(ctx, kind, o, glow, s) {
      ctx.save();
      if (kind === 'skel') { ctx.fillStyle = '#e8e2d0'; ctx.fillRect(o.x - SK_W / 2, s.y - SK_H, SK_W, SK_H); ctx.fillStyle = '#141018'; ctx.fillRect(o.x - 5, s.y - SK_H + 10, 3, 3); ctx.fillRect(o.x + 2, s.y - SK_H + 10, 3, 3); }
      else if (kind === 'rock') {
        ctx.fillStyle = r_col(o.state); ctx.fillRect(o.x - ROCK / 2, o.y - ROCK, ROCK, ROCK);
        if (o.state === 'warn') { ctx.fillStyle = '#c9cfe0'; for (let i = 0; i < 4; i++) ctx.fillRect(o.x - 8 + i * 5, o.y + 4 + ((this.t * 60 + i * 9) % 30), 2, 2); }
      } else if (kind === 'web') { ctx.strokeStyle = o.torn ? '#8d93a8' : '#c9cfe0'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i <= o.len * 2; i++) { ctx.moveTo(o.x + i * T / 2, o.y); ctx.lineTo(o.x + o.len * T / 2, o.y - 14); } ctx.stroke(); }
      else if (kind === 'torch') { ctx.fillStyle = '#5a3b2e'; ctx.fillRect(o.x - 3, o.y - 40, 6, 22); if (o.lit) { ctx.fillStyle = '#f3a03a'; ctx.beginPath(); ctx.arc(o.x, o.y - 46, 9, 0, 7); ctx.fill(); } }
      else if (kind === 'candle') { ctx.fillStyle = '#efe6d0'; ctx.fillRect(o.x - 4, o.y - 22, 8, 22); if (o.lit) { ctx.fillStyle = '#f3a03a'; ctx.beginPath(); ctx.arc(o.x, o.y - 28, 5, 0, 7); ctx.fill(); } }
      else if (kind === 'door') { ctx.fillStyle = '#3f281f'; const h = 3 * T * (1 - o.open); ctx.fillRect(o.x - T, o.y - h, 2 * T, h); }
      else if (kind === 'scroll') { ctx.fillStyle = '#efe6d0'; ctx.fillRect(o.x - 8, o.y - 40, 16, 22); if (glow) { ctx.fillStyle = 'rgba(247,200,115,' + 0.4 * glow + ')'; ctx.beginPath(); ctx.arc(o.x, o.y - 30, 26, 0, 7); ctx.fill(); } }
      ctx.restore();
    }
  }
  function r_col(st) { return st === 'fall' ? '#8e4256' : '#5d5469'; }

  G.Dungeon = Dungeon;
})();
