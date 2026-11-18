(function () {
  const G = window.G;
  const CFG = G.CFG;
  const TILE = CFG.TILE;

  const CYCLE = { chandelier: 6, spark: 3, plant: 3, flask: 6 };
  const BOB_W = 48, BOB_UP = 10, BOB_DOWN = 12; // body hitbox around bob point (rope end): x +-24, y -10..+12
  const HEAR = 14 * TILE;

  function sfx(name, opts) { if (G.sfx && G.sfx.play) G.sfx.play(name, opts); }
  function beatNow() { return (G.rhythm && G.rhythm.beat) ? G.rhythm.beat() : G.time * CFG.BPM / 60; }
  function rectCircle(r, cx, cy, rad) {
    const nx = G.util.clamp(cx, r.x, r.x + r.w), ny = G.util.clamp(cy, r.y, r.y + r.h);
    return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) <= rad * rad;
  }

  class Traps {
    constructor(world, player, level) {
      this.world = world; this.player = player; this.level = level;
      this.paused = false;
      this.traps = [];
      (level.entities || []).forEach((e) => {
        if (e.type !== 'trap' || !CYCLE[e.kind]) return;
        const p = world.entPos(e);
        this.traps.push({
          kind: e.kind, x: p.x, y: p.y, offset: e.offset || 0,
          // chandelier anchors at the top of its tile row
          ay: p.y - TILE,
          phase: 0, bm: 0, danger: false, warn: false, angle: 0, contact: false, lastSwingSide: 0,
          hit: null, // {rect} or {circle:{x,y,r}} current hitbox (null = none active)
          rope: 3 * TILE,
        });
        if (e.kind === 'chandelier') {
          const t = this.traps[this.traps.length - 1];
          const col = world.toTile(t.x);
          let r = world.toTile(t.ay) + 1;
          while (r < world.rows && !world.isSolid(col, r) && !world.isOneWay(col, r)) r++;
          const floorY = r * TILE;
          const clear = CFG.CHANDELIER_CLEAR ?? 36;
          t.rope = Math.max(1.5 * TILE, floorY - clear - BOB_DOWN - t.ay);
        }
      });
      this._init();
    }

    _init() { const b = beatNow(); for (const t of this.traps) { this._evaluate(t, b); } }

    reset() { for (const t of this.traps) t.contact = false; }

    _evaluate(t, beat) {
      const len = CYCLE[t.kind];
      const bm = (((beat + t.offset) % len) + len) % len; // beats into the cycle
      t.bm = bm; t.phase = bm / len;
      t.danger = false; t.warn = false; t.hit = null;
      if (t.kind === 'chandelier') {
        const amp = (CFG.CHANDELIER_AMP_DEG ?? 22) * Math.PI / 180;
        t.angle = amp * Math.sin(t.phase * Math.PI * 2);
        const bx = t.x + Math.sin(t.angle) * t.rope, by = t.ay + Math.cos(t.angle) * t.rope;
        t.bob = { x: bx, y: by };
        t.hit = { rect: { x: bx - BOB_W / 2, y: by - BOB_UP, w: BOB_W, h: BOB_UP + BOB_DOWN } };
        t.danger = true;
      } else if (t.kind === 'spark') {
        t.danger = bm < 0.5;
        t.warn = bm >= 2;
        // arc between two coils 3 tiles apart (coils at x +-1.5 tiles), at coil top height
        if (t.danger) t.hit = { rect: { x: t.x - 1.5 * TILE, y: t.y - 2 * TILE, w: 3 * TILE, h: 1.1 * TILE } };
      } else if (t.kind === 'plant') {
        t.danger = bm >= 2 && bm < 2.5;
        t.warn = bm >= 1 && bm < 2;
        if (t.danger) t.hit = { rect: { x: t.x - 0.5 * TILE, y: t.y - 1.5 * TILE, w: TILE, h: 1.5 * TILE } };
      } else if (t.kind === 'flask') {
        t.danger = bm >= 5;
        t.warn = bm >= 4 && bm < 5;
        if (t.danger) t.hit = { circle: { x: t.x, y: t.y - 1.6 * TILE, r: 1.5 * TILE } };
      }
    }

    _overlaps(t, pr) {
      if (!t.hit) return false;
      if (t.hit.rect) return G.util.overlap(pr, t.hit.rect);
      const c = t.hit.circle; return rectCircle(pr, c.x, c.y, c.r);
    }

    update(dt) {
      if (this.paused) return;
      const beat = beatNow();
      const p = this.player;
      const hidden = p.state === 'hidden';
      const pr = p.rect();
      for (const t of this.traps) {
        const wasDanger = t.danger, prevBm = t.bm;
        this._evaluate(t, beat);
        const d = G.util.dist(p.x, p.y, t.x, t.y);
        const vol = G.util.clamp(1 - d / HEAR, 0, 1);
        if (vol > 0) {
          if (t.kind === 'chandelier') {
            // whoosh each time the bob passes the lowest point (twice per cycle)
            const crossed = (prevBm < 3 && t.bm >= 3) || t.bm < prevBm;
            if (crossed) sfx('chandelier', { vol: vol * 0.6 });
          } else if (t.danger && !wasDanger) sfx(t.kind, { vol });
        }
        const hit = !hidden && this._overlaps(t, pr);
        if (hit && !t.contact) {
          t.contact = true;
          G.events.emit('caught', { by: 'trap', kind: t.kind, x: t.x, y: t.y });
        } else if (!hit) t.contact = false;
      }
    }

    draw(ctx) {
      const art = G.art, time = G.time;
      for (const t of this.traps) {
        const isCh = t.kind === 'chandelier';
        const x = t.x, y = isCh ? t.ay : t.y;
        if (art && art.drawTrap) {
          const off = this.paused && !isCh; // switched off while Ivy is carried/runs back
          art.drawTrap(ctx, x, y, { kind: t.kind, phase: off ? 0.1 : t.phase, danger: off ? false : t.danger, warn: off ? false : t.warn, t: time, angle: t.angle, rope: t.rope });
        } else this._placeholder(ctx, t);
      }
    }

    _placeholder(ctx, t) {
      ctx.save();
      if (t.kind === 'chandelier') {
        ctx.strokeStyle = '#c9cfe0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(t.x, t.ay); ctx.lineTo(t.bob.x, t.bob.y); ctx.stroke();
        ctx.fillStyle = '#f3a03a'; ctx.beginPath(); ctx.arc(t.bob.x, t.bob.y, 14, 0, 7); ctx.fill();
      } else if (t.kind === 'spark') {
        ctx.fillStyle = '#6b2e3e';
        ctx.fillRect(t.x - 1.5 * TILE - 6, t.y - 2 * TILE, 12, 2 * TILE);
        ctx.fillRect(t.x + 1.5 * TILE - 6, t.y - 2 * TILE, 12, 2 * TILE);
        if (t.danger) { ctx.strokeStyle = '#c9e8ff'; ctx.lineWidth = 3; ctx.beginPath();
          ctx.moveTo(t.x - 1.5 * TILE, t.y - 2 * TILE); for (let i = 1; i <= 8; i++) ctx.lineTo(t.x - 1.5 * TILE + i * TILE * 3 / 8, t.y - 2 * TILE + (i % 2 ? 10 : -4)); ctx.stroke(); }
        else if (t.warn) { ctx.fillStyle = '#c9e8ff'; ctx.fillRect(t.x - 1.5 * TILE - 3, t.y - 2 * TILE - 6, 6, 6); ctx.fillRect(t.x + 1.5 * TILE - 3, t.y - 2 * TILE - 6, 6, 6); }
      } else if (t.kind === 'plant') {
        ctx.fillStyle = t.danger ? '#a3203a' : t.warn ? '#9bd35a' : '#3b5230';
        ctx.fillRect(t.x - 0.5 * TILE, t.y - (t.danger ? 1.5 : 0.8) * TILE, TILE, (t.danger ? 1.5 : 0.8) * TILE);
      } else if (t.kind === 'flask') {
        ctx.fillStyle = '#5e7d4a'; ctx.fillRect(t.x - 10, t.y - 26, 20, 26);
        if (t.danger) { ctx.fillStyle = 'rgba(155,211,90,0.5)'; ctx.beginPath(); ctx.arc(t.x, t.y - 1.6 * TILE, 1.5 * TILE, 0, 7); ctx.fill(); }
        else if (t.warn) { ctx.fillStyle = 'rgba(155,211,90,0.3)'; ctx.beginPath(); ctx.arc(t.x, t.y - 36, 10, 0, 7); ctx.fill(); }
      }
      ctx.restore();
    }
  }

  G.Traps = Traps;
})();
