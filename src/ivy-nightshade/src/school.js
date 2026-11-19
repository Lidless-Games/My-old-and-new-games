(function () {
  const G = window.G;
  const CFG = G.CFG;
  const T = CFG.TILE;

  const PORTAL_W = 1.6 * T, PORTAL_H = 2.6 * T;   // overlap box (bottom-centre anchored)
  const ITEM_R = 0.7 * T;                          // pickup reach (half box)
  const TRANSIT_T = 0.5, TRANSIT_MID = 0.25;
  const CAW_MIN = 4, CAW_MAX = 7, CAW_RANGE = 40 * T, CAW_MIN_VOL = 0.08;
  const COLORS = { red: '#c0392b', blue: '#3b7dd8', green: '#4f9a4a' };

  function sfx(name, opts) { if (G.sfx && G.sfx.play) G.sfx.play(name, opts); }
  function art(name) { return (G.art && typeof G.art[name] === 'function') ? G.art[name] : null; }
  function boxAround(x, y, r) { return { x: x - r, y: y - 2 * r, w: 2 * r, h: 2 * r }; } // y = feet

  class School {
    constructor(world, player, level) {
      this.world = world; this.player = player; this.level = level;
      this.paused = false; this.t = 0;
      G.inv = { keys: {}, candy: 0 };
      this.rooms = []; this.portals = []; this.keys = []; this.candies = []; this.feathers = [];
      this.starts = []; this.nests = [];
      this.bag = null;
      this.room = null; this.visited = new Set();
      this.transit = null;
      this.nestReached = false;
      this.lastStart = null;
      this._creakKey = null;
      this._pendingTo = null;

      const ents = level.entities || [];
      ents.forEach((e) => {
        const p = world.entPos(e);
        if (e.type === 'room') {
          this.rooms.push({ id: e.id, nameKey: e.nameKey, tx: e.tx, ty: e.ty, w: e.w, h: e.h, theme: e.theme });
        } else if (e.type === 'portal') {
          this.portals.push({ id: e.id, to: e.to, x: p.x, y: p.y, tx: e.tx, ty: e.ty, lock: e.lock || null, style: e.style || 'door', unlocked: false, open: 0 });
        } else if (e.type === 'key') {
          this.keys.push({ x: p.x, y: p.y, color: e.color, taken: false });
        } else if (e.type === 'candy') {
          this.candies.push({ x: p.x, y: p.y, taken: false });
        } else if (e.type === 'start') {
          this.starts.push({ x: p.x, y: p.y });
        } else if (e.type === 'nest') {
          this.nests.push({ x: p.x, y: p.y, index: this.nests.length });
        } else if (e.type === 'feather') {
          this.feathers.push({ x: p.x, y: p.y, nest: e.nest });
        }
      });
      if (!this.starts.length && level.start) this.starts.push(world.entPos(level.start));

      // nest: one per playthrough, persists across catches / re-creation
      let idx = G.school_nestIndex;
      if (!(Number.isInteger(idx) && idx >= 0 && idx < this.nests.length)) {
        idx = this.nests.length ? Math.floor(Math.random() * this.nests.length) : -1;
        if (idx >= 0) G.school_nestIndex = idx;
      }
      this.nestIndex = idx;
      this.nest = idx >= 0 ? this.nests[idx] : null;
      this._cawT = G.util.rand(CAW_MIN, CAW_MAX);
      this.cawCount = 0;
      this._updateRoom();
    }

    // ---------- helpers ----------
    portalRect(p) { return { x: p.x - PORTAL_W / 2, y: p.y - PORTAL_H, w: PORTAL_W, h: PORTAL_H }; }
    _portal(id) { return this.portals.find((p) => p.id === id) || null; }
    isLocked(p) { return !!p.lock && !p.unlocked; }
    _hidden() { return this.player.state === 'hidden'; }
    _playerCentre() { const p = this.player; return { x: p.x, y: p.y - p.h / 2 }; }

    _updateRoom() {
      const c = this._playerCentre();
      let cur = null;
      for (const r of this.rooms) {
        if (c.x >= r.tx * T && c.x < (r.tx + r.w) * T && c.y >= r.ty * T && c.y < (r.ty + r.h) * T) { cur = r; break; }
      }
      if (cur !== this.room) {
        this.room = cur;
        if (cur) { this.visited.add(cur.id); G.events.emit('room', { id: cur.id }); }
      } else if (cur) this.visited.add(cur.id);
    }

    _overlappingPortal() {
      const pr = this.player.rect();
      let best = null, bd = 1e9;
      for (const p of this.portals) {
        if (G.util.overlap(pr, this.portalRect(p))) {
          const d = Math.abs(this.player.x - p.x);
          if (d < bd) { bd = d; best = p; }
        }
      }
      return best;
    }

    // ---------- public API ----------
    transitK() { // 0..1..0 fade amount for the game to draw
      const tr = this.transit; if (!tr) return 0;
      return tr.t < TRANSIT_MID ? tr.t / TRANSIT_MID : Math.max(0, (TRANSIT_T - tr.t) / (TRANSIT_T - TRANSIT_MID));
    }

    nearestAction() {
      if (this._hidden() || this.transit) return null;
      const p = this._overlappingPortal();
      if (!p) return null;
      if (this.isLocked(p) && !G.inv.keys[p.lock]) return 'hint_locked_' + p.lock;
      return 'hint_door';
    }

    chooseStart() {
      const s = this.starts; if (!s.length) return null;
      let pool = s.filter((q) => q !== this.lastStart);
      if (!pool.length) pool = s;
      const c = G.util.choice(pool);
      this.lastStart = c;
      return { x: c.x, y: c.y };
    }

    // after a janitor catch the crow may have flown on: pick a different nest (the explored map is kept)
    moveNest() {
      if (this.nests.length < 2) return;
      let idx = this.nestIndex;
      while (idx === this.nestIndex) idx = Math.floor(Math.random() * this.nests.length);
      G.school_nestIndex = idx; this.nestIndex = idx; this.nest = this.nests[idx];
    }
    dropBag(x, y) {
      const keys = {}; let any = false;
      for (const k in G.inv.keys) if (G.inv.keys[k]) { keys[k] = true; any = true; }
      const candy = G.inv.candy || 0;
      if (this.bag) { // an unclaimed older bag is merged
        for (const k in this.bag.keys) if (this.bag.keys[k]) { keys[k] = true; any = true; }
        if (this.bag.candy) any = true;
      }
      const total = candy + (this.bag ? this.bag.candy : 0);
      if (!any && !total) return;
      this.bag = { x, y, keys, candy: total };
    }

    // after a catch: relock everything, drop the bag, clear inventory, respawn keys. Returns nothing.
    resetForCatch(checkpoint) {
      const at = (checkpoint && typeof checkpoint.x === 'number') ? checkpoint : (this.lastStart || this.starts[0] || { x: this.player.x, y: this.player.y });
      for (const p of this.portals) p.unlocked = false;
      this.dropBag(at.x, at.y);
      G.inv.keys = {}; G.inv.candy = 0;
      for (const k of this.keys) k.taken = false;
      this.transit = null; this._pendingTo = null;
      this._creakKey = null;
    }

    reset() { this.transit = null; this._pendingTo = null; this._creakKey = null; }

    minimap() {
      const cur = this.room ? this.room.id : null;
      return {
        rooms: this.rooms.map((r) => ({ id: r.id, x: r.tx, y: r.ty, w: r.w, h: r.h, visited: this.visited.has(r.id), current: r.id === cur })),
        portals: this.portals.map((p) => ({ x: p.tx, y: p.ty, locked: this.isLocked(p), color: p.lock })),
      };
    }

    // ---------- update ----------
    update(dt) {
      if (this.paused) return;
      this.t += dt;
      const pl = this.player;
      this._updateRoom();

      for (const p of this.portals) p.open = Math.max(0, p.open - dt * 3);

      if (this.transit) {
        const tr = this.transit;
        tr.t += dt;
        if (!tr.moved && tr.t >= TRANSIT_MID) {
          tr.moved = true;
          const dest = this._portal(tr.to);
          if (dest) pl.setPos(dest.x, dest.y);
          dest && (dest.open = 1);
          this._updateRoom();
          G.events.emit('portal', { from: tr.from, to: tr.to });
        }
        if (tr.t >= TRANSIT_T) { this.transit = null; pl.control = true; }
        return;
      }

      this._pickups();
      this._tryPortal();
      this._creak();
      this._nest(dt);
    }

    _tryPortal() {
      const pl = this.player, inp = G.input;
      if (pl.control === false || this._hidden() || !pl.onGround) return;
      if (!(inp.pressed('down') || inp.pressed('action'))) return;
      const p = this._overlappingPortal(); if (!p) return;
      if (this.isLocked(p)) {
        if (!G.inv.keys[p.lock]) { sfx('ui_move'); G.events.emit('locked', { id: p.id, color: p.lock }); return; }
        p.unlocked = true; // key is kept
        const partner = this._portal(p.to); if (partner && partner.lock === p.lock) partner.unlocked = true;
        sfx('ui_ok');
      }
      if (!this._portal(p.to)) return;
      p.open = 1; sfx('door');
      this.transit = { from: p.id, to: p.to, t: 0, moved: false };
      pl.control = false; pl.vx = 0;
    }

    _pickups() {
      const pr = this.player.rect();
      for (const k of this.keys) {
        if (k.taken || !G.util.overlap(pr, boxAround(k.x, k.y, ITEM_R))) continue;
        k.taken = true; G.inv.keys[k.color] = true;
        sfx('checkpoint'); G.events.emit('pickup', { kind: 'key', color: k.color });
      }
      for (const c of this.candies) {
        if (c.taken || !G.util.overlap(pr, boxAround(c.x, c.y, ITEM_R))) continue;
        c.taken = true; G.inv.candy++;
        sfx('ui_ok'); G.events.emit('pickup', { kind: 'candy', color: null });
      }
      const b = this.bag;
      if (b && G.util.overlap(pr, boxAround(b.x, b.y, ITEM_R))) {
        for (const k in b.keys) if (b.keys[k]) G.inv.keys[k] = true;
        G.inv.candy += b.candy || 0;
        this.bag = null;
        sfx('checkpoint'); G.events.emit('pickup', { kind: 'bag', color: null });
      }
    }

    _creak() {
      const p = this.player;
      if (!p.onGround || this._hidden()) { if (!p.onGround) this._creakKey = null; return; }
      const tx = this.world.toTile(p.x), ty = this.world.toTile(p.y + 1);
      const key = tx + ',' + ty;
      if (!this.world.isCreaky(tx, ty)) { this._creakKey = null; return; }
      if (key === this._creakKey) return;
      this._creakKey = key;
      G.events.emit('noise', { x: p.x, y: p.y, radius: 6 * T, src: 'creak' });
    }

    _nest(dt) {
      const n = this.nest; if (!n) return;
      const pl = this.player;
      if (!this.nestReached && G.util.overlap(pl.rect(), { x: n.x - T, y: n.y - 2 * T, w: 2 * T, h: 2 * T })) {
        this.nestReached = true;
        G.events.emit('nest_reached', { x: n.x, y: n.y });
      }
      this._cawT -= dt;
      if (this._cawT <= 0) {
        this._cawT = G.util.rand(CAW_MIN, CAW_MAX);
        const d = G.util.dist(pl.x, pl.y, n.x, n.y);
        const vol = G.util.clamp(1 - d / CAW_RANGE, CAW_MIN_VOL, 1);
        this.cawCount++; this.lastCawVol = vol;
        sfx('crow', { vol });
      }
    }

    // ---------- draw (world space) ----------
    draw(ctx) {
      const t = this.t;
      const aPortal = art('drawPortal');
      for (const p of this.portals) {
        const locked = this.isLocked(p);
        if (aPortal) aPortal(ctx, p.x, p.y, { style: p.style, lock: locked ? p.lock : null, color: p.lock, t, open: p.open });
        else {
          ctx.fillStyle = locked ? '#3a2a2a' : '#5a3b2e';
          ctx.fillRect(p.x - 26, p.y - 90, 52, 90);
          ctx.fillStyle = '#2a1c16'; ctx.fillRect(p.x - 20, p.y - 84, 40, 84);
          if (locked) this._padlock(ctx, p.x, p.y - 46, COLORS[p.lock] || '#ccc');
        }
      }
      const aKey = art('drawKey'), aCandy = art('drawCandy'), aBag = art('drawBag'), aFeather = art('drawFeather'), aNest = art('drawNest');
      for (const k of this.keys) {
        if (k.taken) continue;
        const bob = Math.sin(t * 3 + k.x) * 3;
        if (aKey) aKey(ctx, k.x, k.y + bob, { color: k.color, t });
        else { ctx.fillStyle = COLORS[k.color] || '#ccc'; ctx.beginPath(); ctx.arc(k.x, k.y - 16 + bob, 7, 0, 6.3); ctx.fill(); ctx.fillRect(k.x - 2, k.y - 10 + bob, 4, 12); }
      }
      for (const c of this.candies) {
        if (c.taken) continue;
        const bob = Math.sin(t * 3 + c.x) * 3;
        if (aCandy) aCandy(ctx, c.x, c.y + bob, { t });
        else { ctx.fillStyle = '#e86aa6'; ctx.beginPath(); ctx.arc(c.x, c.y - 12 + bob, 8, 0, 6.3); ctx.fill(); }
      }
      if (this.bag) {
        const b = this.bag;
        if (aBag) aBag(ctx, b.x, b.y, { t });
        else { ctx.fillStyle = '#7a5240'; ctx.fillRect(b.x - 12, b.y - 22, 24, 22); ctx.fillStyle = '#f3a03a'; ctx.fillRect(b.x - 12, b.y - 24, 24, 4); }
      }
      if (this.nest) {
        for (const f of this.feathers) {
          if (f.nest !== this.nestIndex) continue;
          if (aFeather) aFeather(ctx, f.x, f.y, { t });
          else { ctx.fillStyle = '#141018'; ctx.beginPath(); ctx.ellipse(f.x, f.y - 8, 3, 10, 0.5, 0, 6.3); ctx.fill(); }
        }
        const n = this.nest;
        if (aNest) aNest(ctx, n.x, n.y, { t, family: true });
        else { ctx.fillStyle = '#5a3b2e'; ctx.beginPath(); ctx.ellipse(n.x, n.y - 6, 34, 12, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = '#141018'; ctx.beginPath(); ctx.arc(n.x, n.y - 24, 12, 0, 6.3); ctx.fill(); }
      }
    }

    _padlock(ctx, x, y, col) {
      ctx.fillStyle = col; ctx.fillRect(x - 8, y, 16, 12);
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 6, Math.PI, 0); ctx.stroke();
    }
  }

  G.School = School;
})();
