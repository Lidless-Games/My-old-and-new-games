(function () {
  const G = window.G;
  const CFG = G.CFG;
  const T = CFG.TILE;

  const EYE = 32;            // eye height above the ghost's tail tip
  const HOVER = 0.3 * T;     // tail floats this far above the floor
  const HEAR_PAUSE = 1.5, APPEAR_TIME = 0.8, FADE_OUT = 0.6, SUMMON_RANGE = 3;
  const LOOK_TIME = 1.2, NOTICE_TIME = 0.35, SEE_STILL = 0.2, POINT_MAX = 8;

  function sfx(name, opts) { if (G.sfx && G.sfx.play) G.sfx.play(name, opts); }

  class Ghosts {
    constructor(world, player, level) {
      this.world = world; this.player = player; this.level = level;
      this.paused = false; this.t = 0;
      this.ghosts = [];
      this.fading = [];
      this._noise = (d) => this.hearNoise(d);
      G.events.on('noise', this._noise);
      (level.entities || []).forEach((e) => {
        if (e.type !== 'ghost') return;
        const p = world.entPos(e);
        const a = (e.from == null ? e.tx : e.from), b = (e.to == null ? e.tx : e.to);
        const from = Math.min(a, b) + 0.5, to = Math.max(a, b) + 0.5;
        this.ghosts.push({
          x: p.x, y: p.y - HOVER, floorY: p.y, from: from * T, to: to * T,
          speed: e.speed || 45, view: e.view || 6,
          startX: p.x, startFacing: (e.to == null || e.to >= e.tx) ? 1 : -1,
          facing: 1, dir: 1, state: 'patrol', timer: 0, notice: 0, alert: 0, bob: Math.random() * 6, point: 0,
          appear: 1, hear: 0, summoned: false,
        });
      });
      this.reset();
    }

    // Summoned / scripted ghost. x,y in px (y = floor level under the ghost). Patrols +-3 tiles (clipped by walls),
    // starts facing AWAY from Ivy; fades in and cannot see for APPEAR_TIME so it is fair.
    add(x, y, opts) {
      opts = opts || {};
      const w = this.world, p = this.player;
      const range = opts.range == null ? SUMMON_RANGE : opts.range;
      const col = w.toTile(x), row = w.toTile(y - 8);
      let l = col, r = col;
      while (col - l < range && !w.isSolid(l - 1, row)) l--;
      while (r - col < range && !w.isSolid(r + 1, row)) r++;
      const away = (p && p.x >= x) ? -1 : 1;
      const g = {
        x, y: y - HOVER, floorY: y, from: (l + 0.5) * T, to: (r + 0.5) * T,
        speed: opts.speed || 40, view: opts.view || 6,
        startX: x, startFacing: away, facing: away, dir: away, state: 'patrol', timer: 0, notice: 0, alert: 0,
        bob: Math.random() * 6, point: 0, appear: opts.instant ? 1 : 0, hear: 0, summoned: true, born: this.t,
      };
      if (g.from === g.to) { g.state = 'look'; }
      this.ghosts.push(g);
      return g;
    }

    remove(g) {
      const i = this.ghosts.indexOf(g);
      if (i < 0) return false;
      this.ghosts.splice(i, 1);
      g.fade = 0; this.fading.push(g);
      return true;
    }

    // a noise at (x,y) with radius px: nearby ghosts turn towards it and pause patrol
    hearNoise(d) {
      if (!d) return;
      for (const g of this.ghosts) {
        if (g.state === 'point' || g.state === 'notice' || g.appear < 1) continue;
        if (Math.hypot(d.x - g.x, d.y - g.floorY) > d.radius) continue;
        this._turnTo(g, d.x);
      }
    }

    _turnTo(g, x) {
      g.state = 'hear'; g.hear = HEAR_PAUSE;
      g.facing = x >= g.x ? 1 : -1;
    }

    _hearsPlayer(g, anyDir) {
      const p = this.player;
      if (!p || p.state === 'hidden' || p.control === false) return false;
      if ((p.noise || 0) <= CFG.NOISE_SNEAK * 1.5) return false;
      const R = (CFG.GHOST_HEAR_RADIUS ?? 3.5) * T;
      return Math.abs(p.x - g.x) <= R && Math.abs((p.y - g.floorY)) <= 2.5 * T && (anyDir || (p.x - g.x) * g.facing < 0);
    }

    reset() {
      for (const g of this.ghosts) {
        g.x = g.startX; g.facing = g.startFacing; g.dir = g.startFacing;
        g.state = 'patrol'; g.timer = 0; g.notice = 0; g.alert = 0; g.point = 0; g.hear = 0; g.appear = 1;
        if (g.from === g.to) g.state = 'look';
      }
    }

    eye(g) { return { x: g.x, y: g.y - EYE }; }

    // visible length of the cone (clipped by solid tiles straight ahead)
    coneLength(g) {
      const w = this.world, e = this.eye(g), full = g.view * T;
      for (let d = 6; d <= full; d += 6) if (w.isSolid(w.toTile(e.x + g.facing * d), w.toTile(e.y))) return d - 6;
      return full;
    }

    _sees(g) {
      const p = this.player;
      if (!p || p.state === 'hidden' || p.faded || p.stillTime > SEE_STILL) return false;
      const e = this.eye(g), cx = p.x, cy = p.y - p.h / 2;
      const dx = (cx - e.x) * g.facing, L = g.view * T;
      if (dx < -8 || dx > L) return false;
      const half = 0.6 * T + (1.6 * T - 0.6 * T) * Math.max(0, dx) / L;
      if (Math.abs(cy - e.y) > half) return false;
      const w = this.world, n = Math.ceil(Math.hypot(cx - e.x, cy - e.y) / 6);
      for (let i = 1; i < n; i++) {
        const k = i / n;
        if (w.isSolid(w.toTile(e.x + (cx - e.x) * k), w.toTile(e.y + (cy - e.y) * k))) return false;
      }
      return true;
    }

    update(dt) {
      this.t += dt;
      for (const g of this.fading) g.fade += dt / FADE_OUT;
      this.fading = this.fading.filter((g) => g.fade < 1);
      for (const g of this.ghosts) {
        g.bob += dt;
        if (g.appear < 1) g.appear = Math.min(1, g.appear + dt / APPEAR_TIME);
        g.y = g.floorY - HOVER - 4 - Math.sin(g.bob * 2.1) * 4;
        if (this.paused) continue;
        const p = this.player;
        if (g.state === 'point') {
          g.point += dt;
          if (g.point > POINT_MAX) { g.state = 'patrol'; g.point = 0; g.alert = 0; }
          continue;
        }
        if (g.state === 'hear') {
          g.hear -= dt;
          if (this._hearsPlayer(g, true)) g.hear = HEAR_PAUSE; // still noisy nearby: keep listening
          if (g.appear >= 1 && this._sees(g)) { g.state = 'notice'; g.notice = 0; g.alert = 0; g.facing = p.x >= g.x ? 1 : -1; sfx('stir', { vol: 0.6 }); continue; }
          if (g.hear <= 0) { g.state = 'patrol'; g.facing = g.dir; }
          continue;
        }
        if (g.state === 'notice') {
          g.notice += dt; g.alert = Math.min(1, g.notice / NOTICE_TIME);
          if (!this._sees(g)) { g.state = 'patrol'; g.notice = 0; g.alert = 0; g.facing = g.dir; continue; }
          g.facing = p.x >= g.x ? 1 : -1;
          if (g.notice >= NOTICE_TIME) {
            g.state = 'point'; g.point = 0; g.alert = 1;
            sfx('wake');
            G.events.emit('caught', { by: 'ghost', who: 'ghost', x: g.x, y: g.y });
          }
          continue;
        }
        g.alert = Math.max(0, g.alert - dt * 2);
        if (g.state === 'patrol') {
          const target = g.dir > 0 ? g.to : g.from;
          const step = g.speed * dt;
          if (g.from === g.to || Math.abs(target - g.x) <= step) {
            g.x = target; g.state = 'look'; g.timer = 0; g.facing = g.dir;
          } else { g.x += g.dir * step; g.facing = g.dir; }
        } else if (g.state === 'look') {
          g.timer += dt;
          const tm = g.timer / LOOK_TIME;
          g.facing = tm < 0.25 ? g.dir : tm < 0.5 ? -g.dir : tm < 0.75 ? g.dir : -g.dir;
          if (g.timer >= LOOK_TIME) { g.dir = -g.dir; g.state = 'patrol'; g.facing = g.dir; }
        }
        if ((g.state === 'patrol' || g.state === 'look') && g.appear >= 1 && this._hearsPlayer(g)) this._turnTo(g, p.x);
        if ((g.state === 'patrol' || g.state === 'look' || g.state === 'hear') && g.appear >= 1 && this._sees(g)) {
          g.state = 'notice'; g.notice = 0; g.alert = 0; g.facing = p.x >= g.x ? 1 : -1;
          sfx('stir', { vol: 0.6 });
        }
      }
    }

    draw(ctx) {
      const A = G.art;
      if (!A) return;
      for (const g of this.fading) {
        ctx.save(); ctx.globalAlpha = 1 - g.fade;
        if (A.drawGhost) A.drawGhost(ctx, g.x, g.y - g.fade * 20, { facing: g.facing, state: 'patrol', t: g.bob, alert: 0 });
        ctx.restore();
      }
      for (const g of this.ghosts) {
        ctx.save(); ctx.globalAlpha = g.appear;
        const e = this.eye(g);
        if (A.drawGhostCone && g.state !== 'point') A.drawGhostCone(ctx, e.x, e.y, { facing: g.facing, length: this.coneLength(g), full: g.view * T, t: this.t, alert: g.alert });
        if (A.drawGhost) A.drawGhost(ctx, g.x, g.y, { facing: g.facing, state: g.state, t: g.bob, alert: g.alert });
        ctx.restore();
      }
    }
  }

  G.Ghosts = Ghosts;
})();
